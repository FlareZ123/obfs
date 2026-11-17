'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

let state=0x90c2ffed;
/** @returns {number} */
function random(){
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}
/** @param {number} n @returns {number} */
function pick(n){return random()%n;}

const updates=['y=(y+2)|0;','y=(y-13)|0;','y=(y^7)|0;',
  'y=(y*3)|0;','y=(y+1)|0;'];
const tests=['(y&1)!==0','y>15','y<0','(y^x)>3',
  'y===x','(y%3)===1'];

/**
 * Deliberately include unreachable statements, early returns, throws,
 * and nested joins. This is a seeded source generator, separate from both
 * the compiler's source rewriting and the static attacker's CFG traversal.
 * @param {number} depth
 * @param {number} count
 * @returns {string}
 */
function statements(depth,count){
  let out='';
  for(let i=0;i<count;i++){
    const variant=pick(10);
    if(variant===0&&depth<3){
      out+='if('+tests[pick(tests.length)]+'){' +
        statements(depth+1,1+pick(3)) +
        '}else{' + statements(depth+1,1+pick(3)) + '}';
    }else if(variant===1){
      out+='return y+'+(1+pick(7))+';';
    }else if(variant===2){
      out+='throw new TypeError("bad"+y);';
    }else{
      out+=updates[pick(updates.length)];
    }
  }
  return out;
}
/** @param {string} source @returns {(value:number)=>number} */
function load(source){
  return /** @type {(value:number)=>number} */(
    vm.runInNewContext(source+'\n;f;')
  );
}
/** @param {(value:number)=>number} fn @param {number} value */
function outcome(fn,value){
  try{return ['return',fn(value)];}
  catch(error){
    const item=/** @type {Error} */(error);
    return ['throw',item.name,item.message];
  }
}

test('seeded nested CFG source-only reconstruction preserves returns and throws',()=>{
  let checked=0;
  let transformed=0;
  let earlyTerminals=0;
  for(let index=0;index<160;index++){
    const source='function f(x){var y=x|0;' +
      'if((y&1)!==0){y=(y+1)|0;}else{y=(y-2)|0;}' +
      statements(0,1+pick(12)) + 'return y|0;}';
    if(source.includes('throw new TypeError'))earlyTerminals++;
    const original=load(source);
    for(const compactCases of [false,true]){
      const encoded=flattenStatementFlow(source,'commonjs',{
        seed:'join-random-'+index+'-'+compactCases,names:['f'],compactCases
      });
      assert.equal(encoded.functions,1,'Seeded case declined: '+index);
      const recovered=recoverStatementFlow(encoded.code,'f');
      assert.ok(recovered.code.length<source.length*16,
        'Static clone expanded shared suffix excessively: '+index);
      const emitted=load(encoded.code);
      const clone=load(recovered.code);
      for(let input=-28;input<=28;input+=2){
        const expected=outcome(original,input);
        assert.deepEqual(outcome(emitted,input),expected,
          'Compiler semantics changed at '+index+'/'+input);
        assert.deepEqual(outcome(clone,input),expected,
          'Static clone semantics changed at '+index+'/'+input);
        checked++;
      }
      transformed++;
    }
  }
  assert.equal(transformed,320);
  assert.equal(checked,9280);
  assert.ok(earlyTerminals>=50,'Generated corpus omitted early termination');
});
