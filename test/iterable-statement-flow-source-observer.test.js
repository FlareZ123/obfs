'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {flattenStatementFlow}=require('../src/statement-flow');

const protectedCode=
  'function f(x){var a=x*3;if(a>50){a-=9;}else{a+=7;}return a;}';

/** @param {string} code @returns {unknown} */
function execute(code) {
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  Function('module',code)(module);
  return module.exports;
}

for(const [name,tail] of [
  ['Set spread source',
    'module.exports=[...new Set([f])].join(",");'],
  ['Map keys source',
    'module.exports=[...new Map([[f,1]]).keys()].join(",");'],
  ['Set union source',
    'module.exports=[...new Set([f]).union(new Set())].join(",");'],
  ['Map forEach second parameter source',
    'const items=[];new Map([[f,1]]).forEach((value,key)=>items.push(key));'+
      'module.exports=items.join(",");'],
  ['Set forEach owner source',
    'let text="";new Set([f]).forEach((v,k,set)=>{text=[...set].join(",");});'+
      'module.exports=text;']
]) {
  test('statement-flow guard declines source-observable '+name,()=>{
    const source=protectedCode+tail;
    assert.ok(String(execute(source)).includes('function f(x)'));
    const generated=flattenStatementFlow(source,'commonjs',{
      seed:'iterable-statement-flow-source/'+name,names:['f']
    });
    assert.equal(generated.functions,0);
    assert.equal(generated.code,source);
  });
}

test('statement-flow still transforms protected function beside primitive Set',()=>{
  const source=protectedCode+
    'module.exports=[f(8),[...new Set([2,3])].join(",")];';
  const output=flattenStatementFlow(source,'commonjs',{
    seed:'iterable-statement-flow-primitive',names:['f']
  });
  assert.equal(output.functions,1);
  assert.deepEqual(execute(output.code),execute(source));
});
