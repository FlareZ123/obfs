'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

/**
 * Execute real Node ESM from an independent filesystem root, not a fake
 * VM loader. The module cache cannot conflate native and emitted modules.
 * @param {ESMFile[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent19-timing-'));
  try {
    for(const file of files)await fs.writeFile(path.join(root,file.path),file.code,'utf8');
    const observer=await import(pathToFileURL(path.join(root,'observer.mjs')).href);
    return observer.view;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {boolean} primitive @param {string} expression @returns {ESMFile[]} */
function fixture(primitive,expression) {
  const logic=primitive?
    'const state={secretField:61};const result=state.secretField;'+
      'export function inspect(){return result;}':
    'export function inspect(){const state={secretField:61};return state.secretField;}';
  return [
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'export const view={text:'+expression+',value:inspect()};'}
  ];
}

/** @param {ESMFile[]} source @param {'coo'|'sco'|'sno'} mode */
function compile(source,mode) {
  return obfuscateFiles(source,{
    mode,seed:'agent19-timing-interfile/'+mode,closedWorld:true,
    strings:true,identifiers:true,properties:true
  });
}

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test(mode+' ESM producer retains exact imported callable source under User Timing',async()=>{
    const nativeFiles=fixture(false,'performance.mark(inspect).name');
    const native=await execute(nativeFiles);
    assert.match(native.text,/secretField/u,'Native Node must expose original source');
    assert.equal(native.value,61);
    const altered=fixture(false,'performance.mark(inspect).name');
    altered[0].code=altered[0].code.replaceAll('secretField','mutatedLabel');
    const counterfactual=await execute(altered);
    assert.equal(counterfactual.value,native.value);
    assert.notEqual(counterfactual.text,native.text,
      'Exact native source is observable independently of arithmetic parity');
    const result=compile(nativeFiles,mode);
    const emitted=result.files.map(file=>({
      path:file.path,sourceType:/** @type {const} */('module'),
      code:String(file.code)
    }));
    assert.deepEqual(await execute(emitted),native,
      'Imported callable source spelling changed after compiler rewrite');
    assert.equal(emitted[0].code,nativeFiles[0].code,
      'A source-observed producer must not be rewritten out of band');
  });
  test(mode+' ESM primitive User Timing input preserves private rewrite yield',async()=>{
    const source=fixture(true,'performance.mark("independent fixed mark").name');
    const original=await execute(source);
    const result=compile(source,mode);
    const emitted=result.files.map(file=>({
      path:file.path,sourceType:/** @type {const} */('module'),
      code:String(file.code)
    }));
    assert.deepEqual(await execute(emitted),original);
    assert.ok(!emitted[0].code.includes('secretField'),
      'Primitive mark is not a source observation of another module owner');
  });
}
