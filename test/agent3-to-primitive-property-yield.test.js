'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const patcher=[
  'const original=Function.prototype.toString;',
  'globalThis.__functionSources=[];',
  'Function.prototype.toString=function(){',
  '  const source=original.call(this);',
  '  globalThis.__functionSources.push(source);',
  '  return source;',
  '};',
  'export function install(){globalThis.__functionSources.length=0;}'
].join('\n');

/** @param {string} code @returns {Promise<{capturedSource:string,result:number,observedValue:number}>} */
async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-to-primitive-property-'));
  try{
    const packageDir=path.join(root,'node_modules','patcher');
    await fs.mkdir(packageDir,{recursive:true});
    await fs.writeFile(path.join(packageDir,'package.json'),
      JSON.stringify({type:'module',exports:'./index.mjs'}));
    await fs.writeFile(path.join(packageDir,'index.mjs'),patcher);
    await atomicWrite(path.join(root,'app.mjs'),code);
    const entryUrl=pathToFileURL(path.join(root,'app.mjs')).href;
    const command='import('+JSON.stringify(entryUrl)+').then(m=>console.log(JSON.stringify({capturedSource:m.capturedSource,result:m.result,observedValue:m.observedValue}))).catch(e=>{console.error(e);process.exitCode=1});';
    const child=spawnSync(process.execPath,['--input-type=module','-e',command],{
      cwd:root,encoding:'utf8'
    });
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('numeric source observer currently vetoes unrelated private property yield',async()=>{
  const observed=[
    "import {install} from 'patcher';",
    "const observedOwner={observedKey:23};",
    "function reader(){return observedOwner.observedKey;}",
    "const unrelatedOwner={unrelatedPrivate:17};",
    "install();",
    "export const numericIsNaN=Number.isNaN(+reader);",
    "export const capturedSource=globalThis.__functionSources[0]??'';",
    "export const observedValue=observedOwner.observedKey;",
    "export const result=unrelatedOwner.unrelatedPrivate;"
  ].join('\n');
  const positive=observed.replace(
    'Number.isNaN(+reader)','Boolean(reader)'
  );
  const compile=code=>obfuscateFiles([{path:'app.mjs',code}],{
    mode:'coo',seed:'to-primitive-property-yield',properties:true,
    identifiers:false,strings:false
  }).files[0];
  const observedOut=compile(observed);
  const positiveOut=compile(positive);
  assert.equal(observedOut.metrics.properties,0);
  assert.ok(observedOut.code.includes('unrelatedPrivate'));
  assert.ok(positiveOut.metrics.properties>=1);
  assert.ok(!positiveOut.code.includes('unrelatedPrivate'));
  const before=await run(observed);
  const after=await run(observedOut.code);
  const positiveBefore=await run(positive);
  const positiveAfter=await run(positiveOut.code);
  assert.equal(before.result,17);
  assert.equal(after.result,before.result);
  assert.equal(after.observedValue,before.observedValue);
  assert.equal(after.capturedSource,before.capturedSource);
  assert.ok(before.capturedSource.includes('function reader'));
  assert.ok(before.capturedSource.includes('observedKey'));
  assert.equal(positiveBefore.capturedSource,'');
  assert.equal(positiveAfter.capturedSource,'');
  assert.equal(positiveAfter.result,positiveBefore.result);
  assert.equal(positiveAfter.observedValue,positiveBefore.observedValue);
});
