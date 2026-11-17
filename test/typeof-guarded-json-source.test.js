'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const positive="const raw=process.argv[2];"+
  "const cases=JSON.parse(typeof raw==='string'?raw:'[]');"+
  "const owned={longPrivateField:23};"+
  "console.log(owned.longPrivateField,cases.length);";

/** @param {string} code @returns {boolean} */
function observes(code) {
  return observesFunctionSource(parse(code,'commonjs'));
}

/** @param {string} file @param {boolean} hostile @returns {string} */
function run(file,hostile) {
  const args=hostile?[
    '-e','process.argv[2]=function hostFunctionSource(){return 1;};require('+JSON.stringify(file)+')'
  ]:[file,'[4,5]'];
  const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

test('captured unique const typeof string guard admits a genuine property rewrite',async()=>{
  assert.equal(observes(positive),false,'guarded JSON.parse operand is primitive');
  const emitted=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:positive
  }],{mode:'sno',seed:'agent50-typeof-snapshot',strings:false,identifiers:false});
  assert.ok(emitted.files[0].metrics.objects>0,emitted.files[0].code);
  assert.notEqual(emitted.files[0].code,positive);
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-typeof-snapshot-'));
  try {
    const nativeFile=path.join(base,'native.cjs');
    const emittedFile=path.join(base,'emitted.cjs');
    await atomicWrite(nativeFile,positive);
    await atomicWrite(emittedFile,emitted.files[0].code);
    assert.equal(run(nativeFile,false),'23 2\n');
    assert.equal(run(emittedFile,false),run(nativeFile,false));
    assert.equal(run(nativeFile,true),'23 0\n');
    assert.equal(run(emittedFile,true),run(nativeFile,true));
  }finally{await fs.rm(base,{recursive:true,force:true});}
});

test('actual Node host getter exposes second-read implicit JSON function coercion',()=>{
  const setup=[
    "let reads=0,coercions=0;",
    "const injected=function sensitiveHostCanary(){};",
    "injected.toString=()=>{coercions++;return '[23]';};",
    "Object.defineProperty(process.argv,2,{configurable:true,get(){",
    "return ++reads===1?'[7]':injected;}});"
  ].join('');
  const unsafe=setup+
    "const result=JSON.parse(typeof process.argv[2]==='string'?process.argv[2]:'[]');"+
    "console.log(JSON.stringify({result,reads,coercions}));";
  const guarded=setup+
    "const inputValue=process.argv[2];"+
    "const result=JSON.parse(typeof inputValue==='string'?inputValue:'[]');"+
    "console.log(JSON.stringify({result,reads,coercions}));";
  /** @param {string} source @returns {{result:number[],reads:number,coercions:number}} */
  function executeSource(source) {
    const child=spawnSync(process.execPath,['-e',source],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.error,undefined);
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  }
  assert.deepEqual(executeSource(unsafe),{result:[23],reads:2,coercions:1});
  assert.deepEqual(executeSource(guarded),{result:[7],reads:1,coercions:0});
  assert.equal(observes(unsafe),true);
  assert.equal(observes(guarded),false);
});

const negative=[
  ['unrestricted argv read',
    "const raw=process.argv[2];JSON.parse(raw||'[]');"],
  ['two mutable host reads',
    "JSON.parse(typeof process.argv[2]==='string'?process.argv[2]:'[]');"],
  ['mutable let binding',
    "let raw=process.argv[2];JSON.parse(typeof raw==='string'?raw:'[]');"],
  ['function branch',
    "const raw=process.argv[2];JSON.parse(typeof raw==='function'?raw:'[]');"],
  ['object branch',
    "const raw=process.argv[2];JSON.parse(typeof raw==='object'?raw:'[]');"],
  ['non-strict operator',
    "const raw=process.argv[2];JSON.parse(typeof raw=='string'?raw:'[]');"],
  ['unproved consequent',
    "const raw=process.argv[2];JSON.parse(typeof raw==='string'?globalThis.raw:'[]');"],
  ['dynamically scoped capture',
    "const raw=process.argv[2];eval('0');JSON.parse(typeof raw==='string'?raw:'[]');"],
  ['shadowed capture',
    "const raw=process.argv[2];function f(raw){JSON.parse(typeof raw==='string'?raw:'[]');}"],
  ['later binding in temporal dead zone',
    "JSON.parse(typeof raw==='string'?raw:'[]');const raw=process.argv[2];"]
];
for(const [name,code] of /** @type {[string,string][]} */ (negative)) {
  test('type guard refuses '+name,()=>{
    assert.equal(observes(code),true,name);
  });
}
