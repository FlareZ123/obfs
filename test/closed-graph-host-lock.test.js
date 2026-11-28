'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const vm=require('node:vm');
const {obfuscateFiles,createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Module */

/**
 * Execute an actual native ESM graph from a fresh process. A promise rejection
 * captures the guard error and the module-body effects that ran before it.
 * @param {Module[]} files
 * @param {string} hostname
 * @returns {Promise<{events:string[],result?:string|number,error?:string}>}
 */
async function execute(files,hostname) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-graph-host-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const runner='globalThis.location={hostname:'+JSON.stringify(hostname)+'};'+
      'globalThis.events=[];'+
      'import("./entry.mjs").then(()=>{'+
      'process.stdout.write(JSON.stringify({events:globalThis.events,result:globalThis.result}));'+
      '},error=>{process.stdout.write(JSON.stringify({events:globalThis.events,error:error.message}));});';
    await atomicWrite(path.join(dir,'runner.mjs'),runner);
    const child=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {Module[]} files @param {string[]} orderedEvents @param {string|number} result */
async function verify(files,orderedEvents,result) {
  const original=await execute(files,'allowed.example');
  assert.deepEqual(original,{events:orderedEvents,result});
  const transformed=obfuscateFiles(files,{
    mode:'coo',seed:'closed-graph-host-gate',closedWorld:true,
    allowedHosts:['allowed.example'],strings:false,identifiers:false,properties:false
  });
  for(const file of transformed.files) {
    assert.match(/** @type {string} */ (file.code),/Unauthorized execution host/u,
      'Every module body needs its own guard: '+file.path);
  }
  assert.deepEqual(await execute(/** @type {Module[]} */ (transformed.files),'allowed.example'),
    original,'Authorized module graph must preserve native effects');
  const denied=await execute(/** @type {Module[]} */ (transformed.files),'denied.example');
  assert.deepEqual(denied.events,[],'No guarded module body may run on a denied host');
  assert.match(denied.error??'',/Unauthorized execution host/u);
}

test('complete ESM import chain guards every body before side effects',async()=>{
  await verify([
    {path:'entry.mjs',sourceType:'module',code:
      'import {answer} from "./logic.mjs";'+
      'globalThis.events.push("entry");globalThis.result=answer;'},
    {path:'logic.mjs',sourceType:'module',code:
      'import {value} from "./state.mjs";'+
      'globalThis.events.push("logic");export const answer=value;'},
    {path:'state.mjs',sourceType:'module',code:
      'globalThis.events.push("state");export const value=13;'}
  ],['state','logic','entry'],13);
});

test('static named reexports and side-effect dependencies also receive guards',async()=>{
  await verify([
    {path:'entry.mjs',sourceType:'module',code:
      'import "./side.mjs";import {answer} from "./barrel.mjs";'+
      'globalThis.events.push("entry");globalThis.result=answer;'},
    {path:'side.mjs',sourceType:'module',code:'globalThis.events.push("side");'},
    {path:'barrel.mjs',sourceType:'module',code:
      'export {answer} from "./source.mjs";'},
    {path:'source.mjs',sourceType:'module',code:
      'globalThis.events.push("source");export const answer=42;'}
  ],['side','source','entry'],42);
});

test('cyclic ESM module graph still guards the first evaluated module body',async()=>{
  await verify([
    {path:'entry.mjs',sourceType:'module',code:
      'import {read} from "./a.mjs";globalThis.events.push("entry");globalThis.result=read();'},
    {path:'a.mjs',sourceType:'module',code:
      'import {suffix} from "./b.mjs";globalThis.events.push("a");'+
      'export function read(){return suffix();}'},
    {path:'b.mjs',sourceType:'module',code:
      'import {read} from "./a.mjs";globalThis.events.push("b");'+
      'export function suffix(){return "b";}'}
  ],['b','a','entry'],'b');
});

test('top-level await across static module dependencies still guards every body',async()=>{
  await verify([
    {path:'entry.mjs',sourceType:'module',code:
      'import {answer} from "./logic.mjs";await Promise.resolve();'+
      'globalThis.events.push("entry");globalThis.result=answer;'},
    {path:'logic.mjs',sourceType:'module',code:
      'import {value} from "./state.mjs";await Promise.resolve();'+
      'globalThis.events.push("logic");export const answer=value;'},
    {path:'state.mjs',sourceType:'module',code:
      'await Promise.resolve();globalThis.events.push("state");export const value=32;'}
  ],['state','logic','entry'],32);
});

test('undeclared, imported external, ambiguous and mixed graphs decline',()=>{
  const entry=(/** @type {string} */ code)=>({path:'entry.mjs',sourceType:/** @type {'module'} */('module'),code});
  const dep={path:'dep.mjs',sourceType:/** @type {'module'} */('module'),code:'export const n=4;'};
  for(const code of [
    'import "./missing.mjs";',
    'import "node:fs";',
    'import "./dep.mjs?cache=1";',
    'import "./dep.mjs#fragment";',
    'import "./dep%2emjs";',
    'import "./a//../dep.mjs";',
    'import "https://example.test/dep.mjs";',
    'export {n} from "./missing.mjs";',
    'export * from "./missing.mjs";'
  ]) {
    assert.throws(()=>obfuscateFiles([entry(code),dep],{
      mode:'coo',seed:'host-negative',closedWorld:true,
      allowedHosts:['allowed.example'],strings:false,identifiers:false
    }),/Host locking ESM static imports|Host locking cannot preserve observable source bytes/u,code);
  }
  assert.throws(()=>obfuscateFiles([entry('import "./dep.mjs";'),dep],{
    mode:'coo',seed:'host-negative',allowedHosts:['allowed.example']
  }),/Host locking ESM static imports/u,'Explicit closedWorld is mandatory');
  assert.throws(()=>obfuscateFiles([
    entry('import "./dep.mjs";'),dep,
    {path:'other.js',sourceType:'script',code:'globalThis.sideEffect=1;'}
  ],{mode:'coo',seed:'host-negative',closedWorld:true,
    allowedHosts:['allowed.example']
  }),/Host locking ESM static imports/u,'Mixed script/module group must decline');
  assert.throws(()=>obfuscateFiles([
    entry('import "./dep.mjs";'),dep,
    {path:'opaque.css',sourceType:'asset',code:'body {color:red}'}
  ],{mode:'coo',seed:'host-negative',closedWorld:true,
    allowedHosts:['allowed.example']
  }),/Host locking ESM static imports/u,'Opaque assets are outside proof');
});


test('closed ESM dependency chain accepts canonical IPv6 and rejects denied hosts',async()=>{
  /** @type {Module[]} */
  const files=[
    {path:'entry.mjs',sourceType:'module',
      code:'import {value} from "./dep.mjs";globalThis.events.push("entry");globalThis.result=value;'},
    {path:'dep.mjs',sourceType:'module',
      code:'globalThis.events.push("dep");export const value=61;'}
  ];
  const original=await execute(files,'[::1]');
  assert.deepEqual(original,{events:['dep','entry'],result:61});
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'ipv6-static-graph',closedWorld:true,
    allowedHosts:['[0:0:0:0:0:0:0:1]'],
    strings:false,identifiers:false,properties:false
  });
  assert.equal(output.files.length,2);
  for(const generated of output.files){
    assert.match(String(generated.code),/Unauthorized execution host/u);
  }
  assert.deepEqual(await execute(/** @type {Module[]} */ (output.files),'[::1]'),original);
  const denied=await execute(/** @type {Module[]} */ (output.files),'[::2]');
  assert.deepEqual(denied.events,[]);
  assert.match(denied.error??'',/Unauthorized execution host/u);
});


test('hostname guard declines files with a local globalThis binding',()=>{
  const native='const globalThis={value:7};globalThis.value;';
  const allowedHost=()=>({location:{hostname:'allowed.example'}});
  assert.equal(vm.runInNewContext(native,allowedHost()),7);
  // This is the pre-fix output's guard position: the original lexical
  // globalThis is still uninitialized when the guard reads it.
  const guard=';(()=>{const h=globalThis.location?.hostname?.toLowerCase();})();\n';
  assert.throws(()=>vm.runInNewContext(guard+native,allowedHost()),
    /Cannot access 'globalThis' before initialization/);

  const inputs=/** @type {const} */ ([
    {path:'entry.js',sourceType:'script',code:native},
    {path:'entry.mjs',sourceType:'module',code:'const globalThis={value:8};export const result=globalThis.value;'},
    {path:'entry.mjs',sourceType:'module',code:'class globalThis {} export const value=1;'},
    {path:'entry.mjs',sourceType:'module',code:'function nested(globalThis){return globalThis;}export const value=nested(9);'}
  ]);
  for(const file of inputs){
    assert.throws(()=>obfuscateFiles([file],{
      mode:'coo',seed:'host-global-shadow-gate',allowedHosts:['allowed.example'],
      strings:false,properties:false,identifiers:false
    }),/Host locking cannot preserve a shadowed globalThis binding/,
    file.sourceType+' '+file.code);
  }
  // The existing CommonJS refusal takes precedence over host-guard injection.
  assert.throws(()=>obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',
    code:'var globalThis=4;module.exports=globalThis;'
  }],{mode:'coo',allowedHosts:['allowed.example']}),
  /Host lock unavailable for CommonJS file/);
  const safe=obfuscateFiles([{
    path:'ordinary.js',sourceType:'script',
    code:'globalThis.allowedValue=29;'
  }],{mode:'coo',seed:'host-global-shadow-positive',
    allowedHosts:['allowed.example'],strings:false,properties:false,identifiers:false});
  assert.match(String(safe.files[0].code),/Unauthorized execution host/);
});


test('SCO handler refuses shadowed host-global at startup before route publication',()=>{
  const source=[{
    path:'client.js',sourceType:/** @type {const} */('script'),
    code:'const globalThis={value:7};globalThis.value;'
  }];
  assert.throws(()=>createScoHandler(source,{
    allowedHosts:['allowed.example']
  }),/Host locking cannot preserve a shadowed globalThis binding in SCO file client\.js/);
  // The lexical binding is valid and may run without the optional host guard.
  assert.doesNotThrow(()=>createScoHandler(source));
  // Literal asset payloads are served verbatim, so a JavaScript-looking byte
  // sequence in an asset must never be misclassified as a lexical declaration.
  assert.doesNotThrow(()=>createScoHandler([{
    path:'ordinary.txt',sourceType:'asset',code:'const globalThis=1;'
  }],{allowedHosts:['allowed.example']}));
});
