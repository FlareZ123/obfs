'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @returns {string} */
function chain() {
  let value='(input|0)';
  for(const step of [17,-8,213,-55,64,-2,34,-10]) {
    value='('+value+(step>=0?'+':'')+step+')';
  }
  return '('+value+'|0)';
}

/** @param {string} observer @returns {string} */
function source(observer) {
  return 'function protectedSum(input){return '+chain()+';}\n'+
    observer+'\n';
}

/** @param {string} code @returns {unknown} */
function evaluateCommonjs(code) {
  /** @type {{exports:unknown}} */
  const module={exports:undefined};
  Function('module','exports',code)(module,module.exports);
  return module.exports;
}

/** @param {string} code @returns {import('../src/core').OutputFile} */
function transformCommonjs(code) {
  const result=obfuscateFiles([{path:'entry.cjs',code,sourceType:'commonjs'}],{
    mode:'coo',seed:'function-sort-source-observer',
    strings:false,identifiers:false,properties:false,
    experimentalPolyvariantAffine:{'entry.cjs':['protectedSum']},
    experimentalPolyvariantCount:2
  });
  return result.files[0];
}

test('default Array sorting must block body rewrites that alter function source',()=>{
  for(const name of ['sort','toSorted']) {
    for(const container of [
      'const list=[protectedSum,"function protectedSum(input){m"];',
      'const list=[protectedSum,"function protectedSum(input){m"];const alias=list;'
    ]) {
      const variable=container.includes('alias=list')?'alias':'list';
      const code=source(container+'module.exports='+variable+'.'+name+
        '().map(x=>typeof x==="function"?"fn":"str").join(",");');
      assert.equal(evaluateCommonjs(code),'str,fn');
      assert.throws(()=>transformCommonjs(code),/source observation/i,
        name+' should decline when a locally tracked function is sorted');
    }
  }
});

test('Array stringification observes the exact function body source',()=>{
  for(const name of ['toString','toLocaleString']) {
    const code=source('const functions=[protectedSum];module.exports=functions.'+
      name+'();');
    assert.match(String(evaluateCommonjs(code)),/function protectedSum\(input\)\{return /);
    assert.throws(()=>transformCommonjs(code),/source observation/i,name);
  }
});

test('cross-module imported function sorting must block distributed body rewrites',()=>{
  const producer='export function protectedSum(input){return '+chain()+';}';
  for(const name of ['sort','toSorted']) {
    const consumer='import {protectedSum} from "./math.mjs";\n'+
      'const xs=[protectedSum,"function protectedSum(input){m"];\n'+
      'export const order=xs.'+name+'().map(x=>typeof x==="function"?"fn":"str").join(",");';
    assert.throws(()=>obfuscateFiles([
      {path:'math.mjs',code:producer,sourceType:'module'},
      {path:'entry.mjs',code:consumer,sourceType:'module'}
    ],{
      mode:'coo',seed:'cross-file-sort-source',closedWorld:true,
      properties:false,strings:false,identifiers:false,
      experimentalPolyvariantAffine:{'math.mjs':['protectedSum']},
      experimentalPolyvariantCount:2
    }),/source observation/i,name);
  }
});

test('sorting and stringifying primitive-only arrays preserve eligible transformed work',()=>{
  const code=source(
    'const digits=[3,1,2];const words=["c","a","b"];'+
    'module.exports={a:digits.sort().join(","),b:words.toSorted().join(","),'+
    'c:words.toString(),d:digits.toLocaleString(),n:protectedSum(-9)};'
  );
  const output=transformCommonjs(code);
  assert.equal(output.metrics.polyvariantFunctions,1);
  assert.deepEqual(evaluateCommonjs(/** @type {string} */ (output.code)),
    evaluateCommonjs(code));
});
