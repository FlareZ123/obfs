'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const http=require('node:http');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module'|'commonjs',code:string}} ModuleFile */

/**
 * Execute the exact input files from a fresh ESM graph, so a source reader
 * resolves the same relative file URL that the original application uses.
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-bytes-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const entry=files.some(file=>file.path==='main.cjs')?'main.cjs':'main.mjs';
    const child=spawnSync(process.execPath,[path.join(dir,entry)],{
      encoding:'utf8',timeout:20000
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/**
 * @param {string} observer
 * @returns {ModuleFile[]}
 */
function graph(observer) {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:23};\n'},
    {path:'main.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";\n'+observer}
  ];
}

test('closed-world property rewriting remains enabled when no source reader exists',async()=>{
  const files=graph('console.log(state.secretField);');
  const baseline=await execute(files);
  assert.equal(baseline.status,0,baseline.stderr);
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'source-reader-positive',strings:false,identifiers:false
  });
  assert.equal(output.crossFile.properties,1);
  assert.deepEqual(await execute(output.files),baseline);
});

for(const [label,observer] of [
  ['node:fs readFileSync',
    'import {readFileSync} from "node:fs";\n'+
    'const code=readFileSync(new URL("./state.mjs",import.meta.url),"utf8");\n'+
    'console.log(state.secretField,code.includes("secretField"));'],
  ['node:fs/promises readFile',
    'import {readFile} from "node:fs/promises";\n'+
    'const code=await readFile(new URL("./state.mjs",import.meta.url),"utf8");\n'+
    'console.log(state.secretField,code.includes("secretField"));']
]) {
  test('native ESM source inspection preserves original file spelling: '+label,async()=>{
    const files=graph(observer);
    const baseline=await execute(files);
    assert.equal(baseline.status,0,baseline.stderr);
    assert.equal(baseline.stdout,'23 true\n');
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'source-reader/'+label,strings:false,identifiers:true
    });
    assert.equal(output.crossFile.properties,0,
      'Reading distributed source must disable whole-graph property renames');
    assert.deepEqual(await execute(output.files),baseline);
  });
}

test('a single module reading its own bytes declines local rewrites',async()=>{
  /** @type {ModuleFile[]} */
  const files=[{path:'main.mjs',sourceType:'module',code:
    'import {readFileSync} from "node:fs";\n'+
    'const localObject={secretField:31};\n'+
    'const bytes=readFileSync(new URL(import.meta.url),"utf8");\n'+
    'console.log(localObject.secretField,bytes.includes("localObject"));\n'}];
  const native=await execute(files);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'31 true\n');
  const output=obfuscateFiles(files,{
    mode:'sno',seed:'self-source-read',strings:true,identifiers:true,properties:true
  });
  assert.equal(output.files[0].code,files[0].code);
  assert.deepEqual(await execute(output.files),native);
});

for(const observer of [
  'fetch("./state.mjs").then(response=>response.text());',
  'globalThis["fetch"]("./state.mjs");',
  'const method="fetch";globalThis[method]("./state.mjs");',
  'const root=globalThis;const name="fetch";root[name]("./state.mjs");',
  'Reflect.get(globalThis,"fetch")("./state.mjs");',
  'const X=XMLHttpRequest;new X();'
]) {
  test('browser source-fetch API conservatively declines distributed rewrites: '+observer,()=>{
    const files=graph(observer+'console.log(state.secretField);');
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'browser-source-read/'+observer,
      strings:false,identifiers:true
    });
    assert.equal(output.crossFile.properties,0);
    assert.deepEqual(output.files.map(file=>file.code),files.map(file=>file.code));
  });
}

test('source-readable scripts reject requested host guards instead of changing bytes',()=>{
  const files=[{path:'client.js',sourceType:/** @type {const} */('script'),
    code:'fetch("./client.js");globalThis.output=8;'}];
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'source-fetch-host-guard',allowedHosts:['allowed.example'],
    strings:false,identifiers:true
  }),/Host locking cannot preserve observable source bytes/u);
  assert.throws(()=>createScoHandler(files,{
    allowedHosts:['allowed.example']
  }),/Host locking cannot preserve observable source bytes/u);
});

test('SCO delivers byte-exact source when its browser client can fetch that source',async()=>{
  const source='const sourceRequest=fetch("./client.js");'+
    'const message="source-byte-observable";globalThis.result=message;';
  const server=http.createServer(createScoHandler([
    {path:'client.js',sourceType:'script',code:source}
  ]));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const url='http://127.0.0.1:'+address.port+'/obfs/client.js';
    const first=await fetch(url);
    const second=await fetch(url);
    assert.equal(first.status,200);
    assert.equal(second.status,200);
    assert.equal(await first.text(),source);
    assert.equal(await second.text(),source);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

for(const [label,observer] of [
  ['variable-based dynamic import',
    'const name="node:fs";const io=await import(name);'+
    'const code=io.readFileSync(new URL("./state.mjs",import.meta.url),"utf8");'+
    'console.log(state.secretField,code.includes("secretField"));'],
  ['createRequire from node:module',
    'import {createRequire} from "node:module";'+
    'const load=createRequire(import.meta.url);const io=load("node:fs");'+
    'const code=io.readFileSync(new URL("./state.mjs",import.meta.url),"utf8");'+
    'console.log(state.secretField,code.includes("secretField"));']
]) {
  test('dynamic Node source-loader aliases preserve original ESM source: '+label,async()=>{
    const files=graph(observer);
    const baseline=await execute(files);
    assert.equal(baseline.status,0,baseline.stderr);
    assert.equal(baseline.stdout,'23 true\n');
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'dynamic-loader/'+label,
      strings:false,identifiers:true
    });
    assert.equal(output.crossFile.properties,0);
    assert.deepEqual(await execute(output.files),baseline);
  });
}

test('CommonJS dynamic require indirection cannot expose renamed self bytes',async()=>{
  /** @type {ModuleFile[]} */
  const files=[{path:'main.cjs',sourceType:'commonjs',code:
    'const builtin="node:fs";const loader=require;const io=loader(builtin);'+
    'const object={secretField:31};'+
    'const bytes=io.readFileSync(__filename,"utf8");'+
    'console.log(object.secretField,bytes.includes("secretField"));'}];
  const native=await execute(files);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,'31 true\n');
  const output=obfuscateFiles(files,{
    mode:'sno',seed:'dynamic-require-source-read',
    strings:true,identifiers:true,properties:true
  });
  assert.equal(output.files[0].code,files[0].code);
  assert.deepEqual(await execute(output.files),native);
});
