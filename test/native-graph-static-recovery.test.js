'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const {recoverNativeGraph}=require('../sims/native-graph-static-recover');
const {obfuscateFiles}=require('../src');

const before='function mix(x){return ((x+7)*(x-5))^((x+3)&255);}module.exports=mix;';

/** @param {string} code @returns {(x:unknown)=>unknown} */
function load(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2500});
  return /** @type {(x:unknown)=>unknown} */ (context.module.exports);
}

/** @param {(x:unknown)=>unknown} fn @param {unknown} input @returns {{value?:unknown,error?:string}} */
function observe(fn,input) {
  try{return {value:fn(input)};}
  catch(error){return {error:/** @type {Error} */ (error).name};}
}

test('attacker reconstructs the exact checked-in native graph from source alone',async()=>{
  const code=await fs.readFile(path.join(__dirname,'../examples/native-graph/after.cjs'),'utf8');
  const graph=recoverNativeGraph(code);
  assert.equal(graph.name,'mix');
  assert.equal(graph.parameter,'x');
  assert.equal(graph.operations,6);
  assert.equal(graph.expression,'(((x+7)*(x-5))^((x+3)&255))');
  const clone=load('function '+graph.name+'('+graph.parameter+'){return '+
    graph.expression+';}module.exports='+graph.name+';');
  const native=load(before);
  for(const x of [-111,-1,0,3,255,10000,NaN,'4',4n,Symbol('x')]) {
    assert.deepEqual(observe(clone,x),observe(native,x));
  }
});

test('attacker independently recovers native graph after complete COO and SNO passes',()=>{
  const original=load(before);
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
    for(let index=0;index<32;index++) {
      const output=obfuscateFiles([{path:'mix.cjs',code:before,sourceType:'commonjs'}],{
        mode,seed:'native-graph-attacker-'+mode+'-'+index,
        experimentalNativeGraph:{'mix.cjs':['mix']}
      });
      assert.equal(output.files[0].metrics.nativeGraphFunctions,1);
      const graph=recoverNativeGraph(/** @type {string} */ (output.files[0].code));
      assert.equal(graph.operations,6);
      const clone=load('function '+graph.name+'('+graph.parameter+'){return '+
        graph.expression+';}module.exports='+graph.name+';');
      for(const x of [-100,0,1,5,66,300,NaN,Infinity,'4',null]) {
        assert.deepEqual(observe(clone,x),observe(original,x),mode+'/'+index+'/'+String(x));
      }
    }
  }
});
