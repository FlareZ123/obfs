'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');
const exec=promisify(execFile);

test('host preloader can recover decoded string units by intercepting String.fromCharCode',async()=>{
  const original='This sufficiently long string literal is recovered by hostile instrumentation.';
  const source='const message='+JSON.stringify(original)+';const value=message.length;export {value};';
  const output=obfuscateFiles([{path:'generated.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent10-string-helper-instrumentation',
    identifiers:false,strings:true,properties:false
  }).files[0];
  assert.ok(output.metrics.literals>0);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent10-string-instrument-'));
  const preloadPath=path.join(directory,'preload.cjs');
  const generatedPath=path.join(directory,'generated.mjs');
  const runnerPath=path.join(directory,'runner.mjs');
  const preload=[
    'const native=String.fromCharCode;',
    'globalThis.__decodedUnits=[];',
    'String.fromCharCode=function(...units){',
    '  const stack=new Error("string decoder probe").stack||"";',
    '  if(stack.includes("generated.mjs"))globalThis.__decodedUnits.push(...units);',
    '  return Reflect.apply(native,this,units);',
    '};'
  ].join('\\n');
  const runner=[
    'const generated=await import("./generated.mjs");',
    'const decoded=Reflect.apply(String.fromCharCode,String,globalThis.__decodedUnits);',
    'process.stdout.write(JSON.stringify({value:generated.value,decoded}));'
  ].join('\\n');
  fs.writeFileSync(preloadPath,preload);
  fs.writeFileSync(generatedPath,String(output.code));
  fs.writeFileSync(runnerPath,runner);
  try {
    const {stdout}=await exec(process.execPath,['-r',preloadPath,runnerPath],{
      timeout:15000,encoding:'utf8',maxBuffer:4*1024*1024
    });
    const payload=/** @type {{value:number,decoded:string}} */ (JSON.parse(stdout));
    assert.equal(payload.value,original.length);
    assert.equal(payload.decoded,original,
      'instrumented String.fromCharCode arguments should reveal the decoded literal');
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
