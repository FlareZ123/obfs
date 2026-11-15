'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {virtualizeExpressionGraphs}=require('../src/expression-vm');
const {recoverExpressionVm}=require('../sims/expression-vm-static-recover');

/** @param {string} source @returns {(x:unknown)=>unknown} */
function load(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2500});
  return /** @type {(x:unknown)=>unknown} */ (context.module.exports);
}

const before='function mix(x){return ((x+7)*(x-5))^((x+3)&255);}module.exports=mix;';

test('seedless independent parser reconstructs the full published expression graph',async()=>{
  const committed=await fs.readFile(path.join(__dirname,'../examples/expression-vm/after.cjs'),'utf8');
  const recovered=recoverExpressionVm(committed);
  assert.equal(recovered.name,'mix');
  assert.equal(recovered.parameter,'x');
  assert.equal(recovered.instructions,6);
  assert.equal(recovered.expression,'(((x+7)*(x-5))^((x+3)&255))');
  const reconstructed=load('function mix(x){return '+recovered.expression+';}module.exports=mix;');
  const original=load(before);
  for(const x of [-100,-1,0,1,19,100,100000,NaN,Infinity,'12',true,false,null,3n]) {
    /** @param {(x:unknown)=>unknown} fn */
    const check=fn=>{try{return {result:fn(x)};}catch(error){return {error:/** @type {Error} */ (error).name};}};
    assert.deepEqual(check(reconstructed),check(original),String(x));
  }
});

test('attacker recovers each diversified unknown-seed public program',()=>{
  const original=load(before);
  for(let i=0;i<48;i++) {
    const compiled=virtualizeExpressionGraphs(before,'commonjs',{
      seed:'adversarial-seed-'+i,names:['mix']
    });
    assert.equal(compiled.functions,1);
    const recovered=recoverExpressionVm(compiled.code);
    const cloned=load('function mix(x){return '+recovered.expression+';}module.exports=mix;');
    for(let j=0;j<120;j++) {
      const x=(i*1907+j*977)/41-880;
      assert.equal(cloned(x),original(x));
    }
  }
});
