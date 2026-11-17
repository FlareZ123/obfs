'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

/** @returns {()=>number} */
function rng(){
  let state=0x1f7a35b9;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
}

/**
 * Build a deterministic, admitted native-JavaScript branch graph. Every
 * generated program has typed int32 arithmetic, callbacks, nested tests,
 * a native loop and mixed return/throw paths. The obfuscator's source is
 * never involved in generating the random program.
 * @param {number} seed
 * @param {()=>number} random
 * @returns {string}
 */
function graph(seed,random){
  const k=[...Array(11)].map(()=>random()%157+1);
  return [
    'function f(input,flag,hook){',
    'var a=input|0;',
    'var b=(a^'+k[0]+')|0;',
    'var c=(a+b)|0;',
    'if(flag){',
    "hook('flag');",
    'a=(a+'+k[1]+')|0;',
    'b=(b^'+k[2]+')|0;',
    'if(a>'+k[3]+'){',
    'c=(c-b)|0;',
    '}else{',
    'c=(c^a)|0;',
    '}',
    '}else{',
    "hook('other');",
    'a=(a-'+k[4]+')|0;',
    'b=(b+'+k[5]+')|0;',
    'c=(c+a)|0;',
    '}',
    'if((a&7)==='+k[6]%8+'){',
    "hook('rare');",
    'a=(a^'+k[7]+')|0;',
    '}else{',
    'c=(c+'+k[8]+')|0;',
    '}',
    'for(var i=0;i<'+(k[9]%4+1)+';i++){c=(c+i)|0;}',
    'if((a&15)==='+k[10]%16+'){throw Error("fault-'+seed+'");}',
    'if(c>'+((seed%3)*101-50)+'){',
    "hook('high');",
    'return (Math.imul(c,3)^a)|0;',
    '}else{',
    "hook('low');",
    'b=(b+11)|0;',
    '}',
    'return (b^c)|0;',
    '}'
  ].join('\n');
}

/** @param {string} code @returns {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} */
function load(code){
  const result=vm.runInNewContext(code+'\n;f;');
  return /** @type {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} */ (result);
}

/**
 * Compare observable return/throw type, values, and callback sequence. Stack
 * spelling and source-toString are known excluded observation contracts.
 * @param {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} fn
 * @param {number} value
 * @param {boolean} flag
 * @returns {{kind:string,value:unknown,effects:string[]}}
 */
function observe(fn,value,flag){
  /** @type {string[]} */
  const effects=[];
  try{return {kind:'return',value:fn(value,flag,tag=>effects.push(tag)),effects};}
  catch(error){
    const thrown=/** @type {Error} */ (error);
    return {kind:'throw',value:thrown.name+': '+thrown.message,effects};
  }
}

test('seeded 96-program compact CFG differential, exceptions and seedless static recovery',()=>{
  const random=rng();
  let checked=0,compressed=0;
  const input=[-2147483648,-1024,-127,-1,0,1,7,31,127,1024,2147483647,
    NaN,Infinity,-Infinity];
  for(let seed=0;seed<96;seed++){
    const source=graph(seed,random);
    const plain=flattenStatementFlow(source,'commonjs',{seed:'fuzz-'+seed,names:['f']});
    const compact=flattenStatementFlow(source,'commonjs',{seed:'fuzz-'+seed,names:['f'],compactCases:true});
    assert.equal(plain.functions,1);
    assert.equal(compact.functions,1);
    const caseCount=/** @param {string} src */ src=>(src.match(/case\s+\d+:/gu)||[]).length;
    assert.ok(caseCount(compact.code)<=caseCount(plain.code));
    if(caseCount(compact.code)<caseCount(plain.code))compressed++;
    const recovered=recoverStatementFlow(compact.code,'f');
    const reference=load(source);
    const implementations=[load(plain.code),load(compact.code),load(recovered.code)];
    for(const flag of [true,false]){
      for(const value of input){
        const expected=observe(reference,value,flag);
        for(const candidate of implementations){
          assert.deepEqual(observe(candidate,value,flag),expected,
            'Seeded graph behavior mismatch at seed '+seed);
          checked++;
        }
      }
    }
  }
  assert.equal(compressed,96,'Every constructed graph contains a fusible linear chain');
  assert.equal(checked,96*2*input.length*3);
});
