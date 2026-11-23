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

/** @param {string} code @returns {Promise<{capturedSource:string,result:string}>} */
async function run(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-to-primitive-string-'));
  try{
    const patcherPath=path.join(root,'patcher.mjs');
    await fs.writeFile(patcherPath,patcher);
    await atomicWrite(path.join(root,'app.mjs'),code);
    const entryUrl=pathToFileURL(path.join(root,'app.mjs')).href;
    const patcherUrl=pathToFileURL(patcherPath).href;
    const command='import('+JSON.stringify(entryUrl)+').then(m=>console.log(JSON.stringify({capturedSource:m.capturedSource,result:m.result}))).catch(e=>{console.error(e);process.exitCode=1});';
    const child=spawnSync(process.execPath,['--import',patcherUrl,'--input-type=module','-e',command],{
      cwd:root,encoding:'utf8'
    });
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('numeric source observer currently vetoes unrelated string-literal yield',async()=>{
  const literal='independent-string-value-that-is-not-inside-reader';
  const observed=[
    "function reader(){return 1;}",
    `const unrelatedString=${JSON.stringify(literal)};`,
    "globalThis.__functionSources.length=0;",
    "export const coercionIsNaN=Number.isNaN(+reader);",
    "export const capturedSource=globalThis.__functionSources[0]??'';",
    "export const result=unrelatedString;"
  ].join('\n');
  const positive=observed.replace(
    'Number.isNaN(+reader)','Boolean(reader)'
  );
  const compile=code=>obfuscateFiles([{path:'app.mjs',code}],{
    mode:'coo',seed:'to-primitive-string-yield',properties:false,
    identifiers:false,strings:true
  }).files[0];
  const observedOut=compile(observed);
  const positiveOut=compile(positive);
  assert.equal(observedOut.metrics.literals,0);
  assert.equal(observedOut.code,observed);
  assert.ok(positiveOut.metrics.literals>=1);
  assert.ok(!positiveOut.code.includes(literal));
  const before=await run(observed);
  const after=await run(observedOut.code);
  const positiveBefore=await run(positive);
  const positiveAfter=await run(positiveOut.code);
  assert.equal(before.result,literal);
  assert.equal(after.result,before.result);
  assert.equal(after.capturedSource,before.capturedSource);
  assert.ok(before.capturedSource.includes('function reader'));
  assert.equal(positiveBefore.capturedSource,'');
  assert.equal(positiveAfter.capturedSource,'');
  assert.equal(positiveAfter.result,positiveBefore.result);
});
