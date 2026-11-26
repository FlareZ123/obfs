'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const ownerPrefix='const owner={secretField:7,otherField:11};';
function propertyCount(source){
  return obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent7-bind-getter-capture',
    properties:true,identifiers:false,strings:false
  }).files[0].metrics.properties;
}

test('bound-only arrow returning the owner cannot make its properties private',()=>{
  const source=ownerPrefix+
    'const probe=owner.secretField;const internal=()=>owner;export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

test('inherited bind getter capturing the target cannot make its owner private',()=>{
  const source=ownerPrefix+
    'const probe=owner.secretField;const internal=()=>owner;'+
    'const nativeBind=Function.prototype.bind;'+
    'Object.defineProperty(Function.prototype,"bind",{configurable:true,'+
    'get(){globalThis.leaked=this;return nativeBind;}});'+
    'export const hot=internal.bind(null);'+
    'Object.defineProperty(Function.prototype,"bind",{value:nativeBind,writable:true,configurable:true});';
  assert.equal(propertyCount(source),0);
});

test('inherited bind getter cannot leak a bound-only target while owner reads are renamed',()=>{
  const target='const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;';
  const getter='const nativeBind=Function.prototype.bind;'+
    'Object.defineProperty(Function.prototype,"bind",{configurable:true,'+
    'get(){globalThis.leaked=this;return nativeBind;}});';
  const restore='Object.defineProperty(Function.prototype,"bind",{value:nativeBind,writable:true,configurable:true});';
  assert.equal(propertyCount(ownerPrefix+target+getter+
    'export const hot=internal.bind(null);'+restore),0);
});

test('cross-file Function.prototype.bind getter mutation invalidates the bound-only proof',()=>{
  const setup='const nativeBind=Function.prototype.bind;'+
    'Object.defineProperty(Function.prototype,"bind",{configurable:true,'+
    'get(){globalThis.leaked=this;return nativeBind;}});';
  const entry='import "./setup.mjs";'+ownerPrefix+
    'const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;'+
    'export const hot=internal.bind(null);';
  const output=obfuscateFiles([
    {path:'setup.mjs',sourceType:'module',code:setup},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ],{mode:'coo',closedWorld:true,seed:'agent7-cross-file-bind-getter',
    properties:true,identifiers:false,strings:false});
  assert.equal(output.files.find(file=>file.path==='entry.mjs').metrics.properties,0);
});

test('direct Function.prototype.bind replacement is refused when owner reads are present',()=>{
  const replacement='Function.prototype.bind=function(){const target=this;'+
    'return function(){return target().secretField;};};';
  const target='const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;';
  assert.equal(propertyCount(ownerPrefix+replacement+target+
    'export const hot=internal.bind(null);'),0);
});

test('aliased Function.prototype.bind replacement is refused when owner reads are present',()=>{
  const replacement='const fp=Function.prototype;fp.bind=function(){const target=this;'+
    'return function(){return target().secretField;};};';
  const target='const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;';
  assert.equal(propertyCount(ownerPrefix+replacement+target+
    'export const hot=internal.bind(null);'),0);
});

test('Object.defineProperty bind replacement is refused when owner reads are present',()=>{
  const replacement='Object.defineProperty(Function.prototype,"bind",{configurable:true,'+
    'value:function(){const target=this;return function(){return target().secretField;};}});';
  const target='const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;';
  assert.equal(propertyCount(ownerPrefix+replacement+target+
    'export const hot=internal.bind(null);'),0);
});

test('bound-only arrow returning owner inside an array cannot make owner properties private',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;const internal=()=>[owner];export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

test('bound-only arrow returning owner inside an object cannot make owner properties private',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;const internal=()=>({owner});export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

test('bind getter cannot observe target source through a this alias',()=>{
  const getter='const nativeBind=Function.prototype.bind;'+
    'Object.defineProperty(Function.prototype,"bind",{configurable:true,'+
    'get(){const target=this;globalThis.source=target.toString();return nativeBind;}});';
  const target='const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;';
  assert.equal(propertyCount(ownerPrefix+getter+target+
    'export const hot=internal.bind(null);'+
    'Object.defineProperty(Function.prototype,"bind",{value:nativeBind,writable:true,configurable:true});'),0);
});

test('cross-file source observation of getter-captured target blocks owner renaming',()=>{
  const setup='const nativeBind=Function.prototype.bind;'+
    'Object.defineProperty(Function.prototype,"bind",{configurable:true,'+
    'get(){globalThis.leaked=this;return nativeBind;}});';
  const entry='import "./setup.mjs";'+ownerPrefix+
    'const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;'+
    'export const hot=internal.bind(null);';
  const observer='import "./entry.mjs";'+
    'globalThis.source=Function.prototype.toString.call(globalThis.leaked);';
  const main='import "./entry.mjs";import "./observer.mjs";';
  const output=obfuscateFiles([
    {path:'setup.mjs',sourceType:'module',code:setup},
    {path:'entry.mjs',sourceType:'module',code:entry},
    {path:'observer.mjs',sourceType:'module',code:observer},
    {path:'main.mjs',sourceType:'module',code:main}
  ],{mode:'coo',closedWorld:true,seed:'agent7-cross-file-bind-observer',
    properties:true,identifiers:false,strings:false});
  assert.equal(output.files.find(file=>file.path==='entry.mjs').metrics.properties,0);
});

test('bound-only arrow cannot hide owner escape through Promise.resolve',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;const internal=()=>Promise.resolve(owner);export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

test('bound-only arrow cannot hide owner escape through Object.create',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;const internal=()=>Object.create(owner);export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

test('bound-only arrow cannot hide owner escape through Proxy',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;const internal=()=>new Proxy(owner,{});export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

test('bound-only arrow cannot hide owner escape through Map',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;const internal=()=>new Map([["owner",owner]]);export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

test('bound-only arrow cannot hide owner escape through object spread',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;const internal=()=>({...owner});export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

function runModulePair(root,entryCode,runnerCode){
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'entry.mjs'),entryCode);
  fs.writeFileSync(path.join(root,'runner.mjs'),runnerCode);
  const child=spawnSync(process.execPath,[path.join(root,'runner.mjs')],{cwd:root,encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout.trim());
}

test('hostile pre-load bind getter captures the bound target after property obfuscation',()=>{
  const entry='const owner={secretField:7,otherField:11};'+
    'const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;'+
    'export const hot=internal.bind(null);';
  const runner='const nativeBind=Function.prototype.bind;'+
    'Object.defineProperty(Function.prototype,"bind",{configurable:true,'+
    'get(){if(this.name==="internal")globalThis.leaked=this;return nativeBind;}});'+
    'const {hot}=await import("./entry.mjs");'+
    'const leaked=globalThis.leaked;'+
    'const leakedSource=Function.prototype.toString.call(leaked);'+
    'Object.defineProperty(Function.prototype,"bind",{value:nativeBind,writable:true,configurable:true});'+
    'process.stdout.write(JSON.stringify({leakedType:typeof leaked,leakedSource,hot:hot(1,2),leakedCall:leaked(1,2)})+"\\n");';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:entry}],{
    mode:'coo',closedWorld:true,seed:'agent7-bind-preload-capture',
    properties:true,identifiers:false,strings:false
  });
  const emitted=output.files[0].code;
  assert.equal(output.files[0].metrics.properties,2);
  const nativeRoot=fs.mkdtempSync(path.join(os.tmpdir(),'agent7-bind-preload-native-'));
  const emittedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'agent7-bind-preload-emitted-'));
  try{
    const nativeResult=runModulePair(nativeRoot,entry,runner);
    const emittedResult=runModulePair(emittedRoot,emitted,runner);
    assert.equal(nativeResult.leakedType,'function');
    assert.equal(emittedResult.leakedType,'function');
    assert.equal(nativeResult.hot,emittedResult.hot);
    assert.equal(nativeResult.leakedCall,emittedResult.leakedCall);
    assert.match(nativeResult.leakedSource,/secretField/u);
    assert.doesNotMatch(emittedResult.leakedSource,/secretField|otherField/u);
  }finally{
    fs.rmSync(nativeRoot,{recursive:true,force:true});
    fs.rmSync(emittedRoot,{recursive:true,force:true});
  }
});

test('bound-only arrow cannot leak the owner through a global side effect',()=>{
  const source=ownerPrefix+'const probe=owner.secretField;'+
    'const internal=()=>{globalThis.leaked=owner;return 1;};'+
    'export const hot=internal.bind(null);';
  assert.equal(propertyCount(source),0);
});
