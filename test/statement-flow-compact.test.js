'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {obfuscateFiles}=require('../src');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

const source=[
  'function f(value,flag,hook){',
  'var a=value|0;',
  'var b=(a^7)|0;',
  'var c=(b*3)|0;',
  'if(flag){',
  'var p=(c+17)|0;',
  'hook("yes");',
  'a=(p^a)|0;',
  'b=(a+11)|0;',
  '}else{',
  'hook("no");',
  'a=(c-13)|0;',
  'b=(a*5)|0;',
  '}',
  'var tail=(a^b)|0;',
  'tail=(tail*7)|0;',
  'return tail|0;',
  '}'
].join('\n');

/** @param {string} code @returns {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} */
function load(code){
  return /** @type {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} */
    (vm.runInNewContext(code+'\n;f;'));
}

/** @param {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} fn @param {number} value @param {boolean} flag */
function capture(fn,value,flag){
  /** @type {string[]} */
  const effects=[];
  const result=fn(value,flag,tag=>effects.push(tag));
  return {result,effects};
}

test('compact switch states preserve native branch semantics and are statically reconstructable',()=>{
  const plain=flattenStatementFlow(source,'commonjs',{seed:'compact-compare',names:['f']});
  const compact=flattenStatementFlow(source,'commonjs',{seed:'compact-compare',names:['f'],compactCases:true});
  assert.equal(plain.functions,1);
  assert.equal(compact.functions,1);
  assert.equal(compact.blocks,plain.blocks);
  const cases=code=>(code.match(/case\s+\d+:/gu)||[]).length;
  assert.ok(cases(compact.code)<cases(plain.code), 'Expected fewer switch cases for linear chains');
  const recovered=recoverStatementFlow(compact.code,'f');
  assert.ok(recovered.blocks>0);
  const native=load(source);
  const variants=[load(plain.code),load(compact.code),load(recovered.code)];
  for(const flag of [false,true]){
    for(let value=-511;value<=511;value+=7){
      const expected=capture(native,value,flag);
      for(const candidate of variants){
        assert.deepEqual(capture(candidate,value,flag),expected);
      }
    }
  }
});

test('compact switch states preserve early return and native atomic loop side effects',()=>{
  const original='function f(x,hook){var a=x|0;var b=a+3;if(b>7){hook("high");return b*2;}else{hook("low");a=b-5;}for(var k=0;k<3;k++){a+=k;}return a;}';
  const encoded=flattenStatementFlow(original,'commonjs',{seed:'compact-early',names:['f'],compactCases:true});
  assert.equal(encoded.functions,1);
  const native=load(original);
  const compiled=load(encoded.code);
  const recovered=load(recoverStatementFlow(encoded.code,'f').code);
  for(let value=-20;value<=20;value++){
    const expected=capture(native,value,/** @type {any} */(tag=>{}));
    // The function's second parameter is the actual hook; pass it explicitly.
    const effectsNative=[];
    const ref=native(value,tag=>effectsNative.push(tag));
    for(const candidate of [compiled,recovered]){
      const effects=[];
      assert.equal(candidate(value,tag=>effects.push(tag)),ref);
      assert.deepEqual(effects,effectsNative);
    }
    assert.equal(typeof expected.result,'number');
  }
});

test('opt-in compiler integration compacts generated COO and SNO function cases',()=>{
  for(const mode of ['coo','sno']){
    const common={mode,seed:'compact-integrated-20261117',
      experimentalStatementFlow:{'app.cjs':['f']},
      strings:false,identifiers:false,properties:false};
    const original=obfuscateFiles([{path:'app.cjs',sourceType:'commonjs',code:source}],common);
    const compact=obfuscateFiles([{path:'app.cjs',sourceType:'commonjs',code:source}],{
      ...common,experimentalStatementFlowCompact:true
    });
    assert.equal(compact.files[0].metrics.statementFlowFunctions,1);
    const count=code=>(String(code).match(/case\s+\d+:/gu)||[]).length;
    assert.ok(count(compact.files[0].code)<count(original.files[0].code));
    const native=load(source);
    const compiled=load(String(compact.files[0].code));
    for(const flag of [false,true]){
      for(let input=-128;input<=128;input+=17){
        assert.deepEqual(capture(compiled,input,flag),capture(native,input,flag));
      }
    }
  }
});
