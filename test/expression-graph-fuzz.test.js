'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {virtualizeExpressionGraphs}=require('../src/expression-vm');

/** Deterministic xorshift32 source for an independently reproducible corpus. */
let state=0x39a2cf51;
/** @returns {number} */
function next() {
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

const operators=['+','-','*','/','%','^','&','|','<<','>>','>>>'];

/** @param {number} depth @returns {string} */
function tree(depth) {
  if(depth===0)return next()%3===0?'x':String(next()%256);
  const left=tree(depth-1),right=tree(depth-1);
  return '('+left+operators[next()%operators.length]+right+')';
}

/** @param {string} code @returns {(x:unknown)=>unknown} */
function load(code) {
  const module={exports:null};
  vm.runInNewContext(code,{module},{timeout:2000});
  return /** @type {(x:unknown)=>unknown} */ (module.exports);
}

/** @param {(x:unknown)=>unknown} fn @param {unknown} input @returns {{value?:unknown,error?:string,message?:string}} */
function observed(fn,input) {
  try{return {value:fn(input)};}
  catch(error) {
    const e=/** @type {Error} */ (error);
    return {error:e.name,message:e.message};
  }
}

/** @param {(x:unknown)=>unknown} fn @returns {{result:{value?:unknown,error?:string,message?:string},hints:string[]}} */
function stateful(fn) {
  /** @type {string[]} */
  const hints=[];
  const object={
    [Symbol.toPrimitive](hint) {
      hints.push(hint);
      return hints.length%2===0?hints.length:String(hints.length);
    }
  };
  return {result:observed(fn,object),hints};
}

test('deterministic nested-graph differential fuzz across native and interpreted backends',()=>{
  /** @type {string[]} */
  const generated=[];
  for(let index=0;index<80;index++)generated.push(tree(2+index%3));
  const inputs=[0,-0,1,-1,255,1024,12.4,Infinity,-Infinity,NaN,'3','',true,false,
    null,undefined,3n,Symbol('s')];
  let verified=0,operations=0;
  for(let index=0;index<generated.length;index++) {
    const expression=generated[index];
    const source='function sample(x){return '+expression+';}module.exports=sample;';
    const native=load(source);
    for(const backend of /** @type {('bytecode'|'native')[]} */ (['bytecode','native'])) {
      const output=virtualizeExpressionGraphs(source,'commonjs',{
        seed:'fuzz-expr-'+index,backend,names:['sample']
      });
      assert.equal(output.functions,1,backend+' '+expression);
      operations+=output.instructions;
      const compiled=load(output.code);
      for(const input of inputs) {
        assert.deepEqual(observed(compiled,input),observed(native,input),
          backend+'/'+index+'/'+expression+'/'+String(input));
        verified++;
      }
      assert.deepEqual(stateful(compiled),stateful(native),backend+'/'+index+'/'+expression);
      verified++;
    }
  }
  assert.equal(verified,80*2*(inputs.length+1));
  assert.ok(operations>1000);
  console.log('Nested expression differential fuzz: '+verified+
    ' typed/stateful input pairs, '+operations+' emitted operations; seed 0x39a2cf51');
});
