'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {recoverRegisterVm}=require('../sims/register-vm-static-recover');
const {virtualizeRegisterChains}=require('../src/register-vm');

/**
 * @param {string} code
 * @returns {(x:unknown)=>unknown}
 */
function load(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:3000});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(x:unknown)=>unknown} */ (context.module.exports);
}

/**
 * @param {(x:unknown)=>unknown} fn
 * @param {unknown} input
 * @returns {unknown}
 */
function outcome(fn,input) {
  try{
    const value=fn(input);
    return typeof value==='number' && Number.isNaN(value)?'NaN':value;
  }catch(error) {
    return 'throws '+/** @type {Error} */(error).name;
  }
}

test('seedless static adversary reconstructs exact emitted register expressions',()=>{
  for(const expression of [
    '((((x+7)*3)^90)-5)',
    '(((x|12)&255)>>>3)',
    '(((x+9)<<2)>>1)',
    '((x-17)^255)'
  ]) {
    const original='function work(x){return '+expression+';}module.exports=work;';
    const native=load(original);
    for(const seed of ['secret-seed-one','unpublished-high-entropy-test-seed-two']) {
      const protectedCode=virtualizeRegisterChains(original,'commonjs',{seed,names:['work']});
      assert.equal(protectedCode.functions,1,expression);
      const recovered=recoverRegisterVm(protectedCode.code);
      assert.equal(recovered.name,'work');
      assert.equal(recovered.param,'x');
      assert.equal(recovered.instructions,protectedCode.instructions);
      const reconstructed=load('function work(x){return '+recovered.expression+';}module.exports=work;');
      for(const input of [0,-1,17,999,1.5,NaN,Infinity,-Infinity,
        true,false,null,undefined,'12','',3n,Symbol('a')]) {
        assert.deepEqual(outcome(reconstructed,input),outcome(native,input),
          expression+'/'+seed+'/'+String(input));
      }
    }
  }
});

test('published before/after register VM sample is fully recoverable without seed',async()=>{
  const file=await fs.readFile(path.join(__dirname,'../examples/register-vm/after.cjs'),'utf8');
  const recovered=recoverRegisterVm(file);
  assert.equal(recovered.name,'mix');
  assert.equal(recovered.instructions,4);
  assert.equal(recovered.expression,'((((x+7)*3)^90)-5)');
  const attack=load('function mix(x){return '+recovered.expression+';}module.exports=mix;');
  const protectedFn=load(file);
  for(const x of [-100,0,17,255,999,NaN,Infinity,'5',3n]) {
    assert.deepEqual(outcome(attack,x),outcome(protectedFn,x));
  }
});
