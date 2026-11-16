'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

/** @param {string} privateBody @param {string} [publicBody] */
function source(privateBody,publicBody='return 7;'){
  return 'export async function protectedOp(){'+privateBody+'}\n'+
    'export function visible(){'+publicBody+'}\n';
}

/** @param {string} privateBody @param {string} [publicBody] */
function partition(privateBody,publicBody){
  return partitionScoSelectedAsyncExports(
    {path:'custom-ambient.mjs',code:source(privateBody,publicBody),sourceType:'module'},
    {privateNames:['protectedOp'],seed:'custom-ambient-20261116'});
}

test('Native custom browser-owned global is absent in independent server realm',()=>{
  const browser=vm.createContext({externalBridge:{value:41}});
  const server=vm.createContext({});
  assert.equal(vm.runInContext('globalThis.externalBridge.value',browser),41);
  assert.equal(vm.runInContext('typeof globalThis.externalBridge',server),'undefined');
  assert.throws(()=>vm.runInContext('globalThis.externalBridge.value',server),/Cannot read properties of undefined/);
});

test('SCO private extraction refuses unknown host-global application properties',()=>{
  const bodies=[
    'return globalThis.externalBridge.value;',
    'return globalThis.customConfig;',
    "return globalThis['externalBridge'].value;",
    'const root=globalThis;return root.externalBridge.value;',
    'const root=globalThis;const alias=root;return alias.customConfig;',
    'return globalThis.externalBridge?.value;',
    'return typeof globalThis.externalBridge;',
    "const {externalBridge:bridge}=globalThis;return bridge.value;",
    "const root=globalThis;const key='externalBridge';return root[key].value;"
  ];
  for(const body of bodies){
    assert.throws(()=>partition(body),/Private SCO export uses unproved host-global state|Private SCO export uses browser-only ambient state/,
      body);
  }
});

test('SCO admits deterministic standard global access and lexical local objects',()=>{
  for(const body of [
    'return globalThis.Math.imul(7,9);',
    'return globalThis.Number.isFinite(41);',
    'return Math.PI;',
    'const local={externalBridge:41};return local.externalBridge;',
    'const globalThis={externalBridge:{value:41}};return globalThis.externalBridge.value;'
  ]){
    const emitted=partition(body);
    assert.deepEqual(emitted.privateNames,['protectedOp'],body);
  }
  const emitted=partition('return 7;','return globalThis.externalBridge.value;');
  assert.match(emitted.clientFile.code,/globalThis.externalBridge.value/);
});

test('Cross-boundary ambient access retains the established refusal diagnostic',()=>{
  assert.throws(()=>partition(
    'return globalThis.sharedState;',
    'return globalThis.sharedState;'),/share ambient state/u);
});

test('SCO rejects alternate global-object paths and identity escapes',()=>{
  for(const body of [
    'return globalThis.globalThis.externalBridge.value;',
    'const root=globalThis.globalThis;return root.externalBridge.value;',
    'const {globalThis:root}=globalThis;return root.externalBridge.value;',
    'const {globalThis:{externalBridge:bridge}}=globalThis;return bridge.value;',
    'return globalThis.globalThis;',
    'const root=globalThis;return root.globalThis.externalBridge.value;'
  ]){
    assert.throws(()=>partition(body),
      /unproved host-global state|browser-only ambient state|realm-local intrinsic state/u,body);
  }
});

test('Independent local globalThis bindings in private and public exports are separate',()=>{
  const original=source(
    'const globalThis={privateValue:41};return globalThis.privateValue;',
    'const globalThis={publicValue:7};return globalThis.publicValue;');
  const emitted=partitionScoSelectedAsyncExports(
    {path:'local-shadow.mjs',code:original,sourceType:'module'},
    {privateNames:['protectedOp'],seed:'local-shadow-regression-20261116'});
  assert.deepEqual(emitted.privateNames,['protectedOp']);
  assert.deepEqual(emitted.publicNames,['visible']);
  assert.match(emitted.clientFile.code,/globalThis.publicValue/u);
});

test('Local-window records avoid false shared-ambient refusal, while genuine roots remain guarded',()=>{
  const safe=partitionScoSelectedAsyncExports(
    {path:'local-window.mjs',sourceType:'module',code:source(
      'const window={privateValue:41};return window.privateValue;',
      'const window={publicValue:7};return window.publicValue;')},
    {privateNames:['protectedOp'],seed:'local-window-proof-20261116'});
  assert.deepEqual(safe.privateNames,['protectedOp']);
  assert.match(safe.clientFile.code,/window.publicValue/u);
  assert.throws(()=>partition(
    'return globalThis.Math.PI;',
    'return globalThis.Math.PI;'),/share ambient state/u);
  assert.throws(()=>partition(
    'const globalThis=probe();return globalThis.Math.PI;',
    'return globalThis.Math.PI;'),/share ambient state|unproved host-global state|realm-local/u);
});

test('Nested shadowing of an owned local ambient name does not bypass shared-state refusal',()=>{
  assert.throws(()=>partition(
    'const globalThis={privateValue:41};{const globalThis=process;return globalThis.version;}',
    'const globalThis={publicValue:7};return globalThis.publicValue;'),
    /share ambient state|browser-only ambient state|unproved host-global state|realm-local/u);
});

test('Native and real-HTTP SCO emitted modules preserve owned local-root behavior',{
  timeout:30000
},async()=>{
  const original=source(
    'const globalThis={privateValue:41};return globalThis.privateValue+value;',
    'const globalThis={publicValue:7};return globalThis.publicValue+value;')
    .replace('protectedOp(){','protectedOp(value){')
    .replace('visible(){','visible(value){');
  const generated=partitionScoSelectedAsyncExports(
    {path:'local-roots.mjs',code:original,sourceType:'module'},
    {privateNames:['protectedOp'],seed:'local-owned-http-parity-20261116'});
  assert.doesNotMatch(generated.clientFile.code,/privateValue/u);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sco-owned-global-'));
  await atomicWrite(path.join(directory,'original.mjs'),original);
  await atomicWrite(path.join(directory,'emitted.mjs'),generated.clientFile.code);
  const native=await import(pathToFileURL(path.join(directory,'original.mjs')).href);
  const server=http.createServer(createScoHandler([generated.clientFile],{
    remoteMethods:bindScoModuleExports(generated,native),
    authorizeRpc:()=>true
  }));
  const previousFetch=globalThis.fetch;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    globalThis.fetch=(input,init)=>previousFetch(new URL(String(input),origin),init);
    const emitted=await import(pathToFileURL(path.join(directory,'emitted.mjs')).href);
    for(let value=0;value<16;value++){
      assert.equal(emitted.visible(value),native.visible(value),'public '+value);
      assert.equal(await emitted.protectedOp(value),await native.protectedOp(value),
        'protected '+value);
    }
  }finally{
    globalThis.fetch=previousFetch;
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('Owned local ambient records in private and retained public helpers remain independent',()=>{
  const moduleCode=[
    'function internalHelper(){const globalThis={value:41};return globalThis.value;}',
    'function browserHelper(){const globalThis={value:7};return globalThis.value;}',
    'export async function protectedOp(){return internalHelper();}',
    'export function visible(){return browserHelper();}'
  ].join('\n');
  const result=partitionScoSelectedAsyncExports(
    {path:'local-helpers.mjs',code:moduleCode,sourceType:'module'},
    {privateNames:['protectedOp'],publicHelperNames:['browserHelper'],
      seed:'owned-local-helper-20261116'});
  assert.deepEqual(result.privateNames,['protectedOp']);
  assert.deepEqual(result.publicHelperNames,['browserHelper']);
  assert.doesNotMatch(result.clientFile.code,/internalHelper|value:41/u);
  assert.match(result.clientFile.code,/browserHelper/u);
});

test('SCO preserves distinct inert lexical shadows of common browser roots',()=>{
  for(const root of ['window','document','navigator','location','self']){
    const body=(value)=>'const '+root+'={value:'+value+'};return '+root+'.value;';
    const result=partition(body(41),body(7));
    assert.deepEqual(result.privateNames,['protectedOp'],root);
    assert.match(result.clientFile.code,new RegExp('const '+root+'=\\{value:7\\}'),root);
  }
});

test('Owned local-root proof refuses subsequent host-derived property mutation',()=>{
  assert.throws(()=>partition(
    'const globalThis={privateValue:41};globalThis.privateValue=process.version;return globalThis.privateValue;',
    'const globalThis={publicValue:7};return globalThis.publicValue;'),
    /share ambient state|unproved host-global state|realm-local/u);
});

test('Owned-local record proof does not admit unproved inherited realm properties',()=>{
  assert.throws(()=>partition(
    'const globalThis={privateValue:41};return globalThis.toString();',
    'const globalThis={publicValue:7};return globalThis.publicValue;'),
    /share ambient state|unproved host-global state|realm-local/u);
});
