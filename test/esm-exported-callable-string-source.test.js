'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Execute an importer that is deliberately not supplied to obfuscateFiles.
 * @param {SourceFile[]} files
 * @param {string} observer
 * @returns {Promise<string>}
 */
async function observe(files,observer) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-callable-string-'));
  try {
    for(const file of files) {
      const target=path.join(root,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,String(file.code),'utf8');
    }
    const observerPath=path.join(root,'observer.mjs');
    await fs.writeFile(observerPath,observer,'utf8');
    const child=spawnSync(process.execPath,[observerPath],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('string encoding preserves external exported callable source: '+mode,async()=>{
    /** @type {SourceFile[]} */
    /** @type {SourceFile[]} */
    const files=[{path:'private.mjs',sourceType:'module',code:
      'export function read(){return "source-visible-secret-value";}'}];
    const observer='import {read} from "./private.mjs";console.log(JSON.stringify([read.toString(),read()]));';
    const native=await observe(files,observer);
    const transformed=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'exported-callable-string-source-'+mode,
      strings:true,minimumStringLength:1,properties:false,identifiers:false
    });
    const literals=transformed.files.reduce((sum,file)=>sum+file.metrics.literals,0);
    const emitted=await observe(transformed.files,observer);
    const sourceEqual=emitted===native;
    const valueEqual=JSON.parse(emitted)[1]===JSON.parse(native)[1];
    console.log('EXPORTED_CALLABLE_STRING '+JSON.stringify({mode,literals,sourceEqual,valueEqual}));
    assert.equal(literals,0,'the source-visible function literal must remain unencoded');
    assert.equal(valueEqual,true,'ordinary returned string must remain equal');
    assert.equal(sourceEqual,true,
      'an external ESM importer can inspect the encoded callable source');
  });

  test('string encoding preserves externally observed exported class source: '+mode,async()=>{
    /** @type {SourceFile[]} */
    const files=[{path:'private.mjs',sourceType:'module',code:
      'export class Api{static label="source-visible-class-field";}'}];
    const observer='import {Api} from "./private.mjs";console.log(JSON.stringify([Function.prototype.toString.call(Api),Api.label]));';
    const native=await observe(files,observer);
    const transformed=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'exported-class-string-source-'+mode,
      strings:true,minimumStringLength:1,properties:false,identifiers:false
    });
    const literals=transformed.files.reduce((sum,file)=>sum+file.metrics.literals,0);
    const emitted=await observe(transformed.files,observer);
    const sourceEqual=emitted===native;
    const valueEqual=JSON.parse(emitted)[1]===JSON.parse(native)[1];
    console.log('EXPORTED_CLASS_STRING '+JSON.stringify({mode,literals,sourceEqual,valueEqual}));
    assert.equal(literals,0,'the source-visible class field literal must remain unencoded');
    assert.equal(valueEqual,true,'ordinary static field value must remain equal');
    assert.equal(sourceEqual,true,
      'an external ESM importer can inspect the exported class constructor source');
  });

  test('private nonescaping function retains string-encoding yield: '+mode,async()=>{
    /** @type {SourceFile[]} */
    const files=[{path:'private.mjs',sourceType:'module',code:
      'function privateRead(){return "private-only-value";}const value=privateRead();export {value};'}];
    const observer='import {value} from "./private.mjs";console.log(String(value));';
    const native=await observe(files,observer);
    const transformed=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'private-callable-string-source-'+mode,
      strings:true,minimumStringLength:1,properties:false,identifiers:false
    });
    const literals=transformed.files.reduce((sum,file)=>sum+file.metrics.literals,0);
    assert.ok(literals>0,'private nonescaping function should retain string encoding');
    assert.equal(await observe(transformed.files,observer),native);
  });
}

module.exports={observe};
