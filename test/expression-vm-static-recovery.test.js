'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const {virtualizeExpressionGraphs}=require('../src/expression-vm');
const {recoverExpressionVm}=require('../sims/expression-vm-static-recover');
const {recoverBundledExpressionVm}=require('../sims/expression-vm-ast-recover');
const {obfuscateFiles}=require('../src');

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

test('AST attacker recovers the VM after ordinary COO and SNO compiler passes',()=>{
  const original=load(before);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
    for(let i=0;i<20;i++) {
      const transformed=obfuscateFiles([{path:'app.cjs',code:before,sourceType:'commonjs'}],{
        mode,seed:'integrated-attacker-'+mode+'-'+i,
        experimentalExpressionVm:{'app.cjs':['mix']}
      });
      assert.equal(transformed.files[0].metrics.expressionVmFunctions,1);
      const published=/** @type {string} */ (transformed.files[0].code);
      const recovered=recoverBundledExpressionVm(published);
      assert.equal(recovered.instructions,6);
      const clone=load('function '+recovered.name+'('+recovered.parameter+'){return '+
        recovered.expression+';}module.exports='+recovered.name+';');
      for(const x of [-100,0,2,99,1000,5n,'4']) {
        /** @param {(x:unknown)=>unknown} fn @returns {{value?:unknown,error?:string}} */
        const outcome=fn=>{
          try{return {value:fn(x)};}
          catch(error){return {error:/** @type {Error} */ (error).name};}
        };
        assert.deepEqual(outcome(clone),outcome(original),mode+'/'+i+'/'+String(x));
      }
    }
  }
});
