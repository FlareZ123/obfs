'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const ownerPrefix='const owner={secretField:7,otherField:11};';
const target='const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;';
function properties(source){
  return obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'bound-function-proof-prototype',
    properties:true,identifiers:false,strings:false
  }).files[0].metrics.properties;
}

test('narrow bound-only arrow target can support private owner renaming',()=>{
  assert.equal(properties(ownerPrefix+target+'export const hot=internal.bind(null);'),2);
});

test('directly exported target remains outside the bound-only proof',()=>{
  assert.equal(properties(ownerPrefix+
    'export const hot=(a,b)=>((a+owner.secretField)^owner.otherField)+b;'),0);
});

test('aliased bound target remains outside the bound-only proof',()=>{
  assert.equal(properties(ownerPrefix+target+
    'const alias=internal;export const hot=alias.bind(null);'),0);
});

test('computed bind access remains outside the bound-only proof',()=>{
  assert.equal(properties(ownerPrefix+target+
    'export const hot=internal["bind"](null);'),0);
});

test('nonliteral bound arguments remain outside the bound-only proof',()=>{
  assert.equal(properties(ownerPrefix+target+
    'export const hot=internal.bind(null,owner);'),0);
});

test('in-program bind source observation remains outside the bound-only proof',()=>{
  const observer='const nativeBind=Function.prototype.bind;'+
    'Function.prototype.bind=function(...args){'+
    'const source=Function.prototype.toString.call(this);'+
    'globalThis.captured=source;return Reflect.apply(nativeBind,this,args);};';
  assert.equal(properties(observer+ownerPrefix+target+
    'export const hot=internal.bind(null);'),0);
});

test('custom Function.prototype.bind replacement remains outside the bound-only proof',()=>{
  const customBind='Function.prototype.bind=function(){'+
    'const target=this;return function(){return target().secretField;};};';
  assert.equal(properties(customBind+ownerPrefix+
    'const internal=()=>owner;export const hot=internal.bind(null);'),0);
});

test('own bind property on the target function remains outside the bound-only proof',()=>{
  const ownBind='const internal=()=>owner;'+
    'Object.defineProperty(internal,"bind",{value:function(){'+
    'const target=this;return function(){return target().secretField;};}});';
  assert.equal(properties(ownerPrefix+ownBind+
    'export const hot=internal.bind(null);'),0);
});
test('aliased Function.prototype mutation remains outside the bound-only proof',()=>{
  const customBind='const functionPrototype=Function.prototype;'+
    'functionPrototype.bind=function(){const target=this;'+
    'return function(){return target().secretField;};};';
  assert.equal(properties(customBind+ownerPrefix+
    'const internal=()=>owner;export const hot=internal.bind(null);'),0);
});

function runEsm(source){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bound-bind-'));
  try{
    const file=path.join(root,'entry.mjs');
    fs.writeFileSync(file,source);
    const child=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:8000});
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}

test('custom bind replacement preserves native/emitted execution and prevents owner rewrite',()=>{
  const customBind='const nativeBind=Function.prototype.bind;'+
    'Function.prototype.bind=function(){'+
    'const target=this;return function(){return target().secretField;};};';
  const source=customBind+ownerPrefix+
    'const internal=()=>owner;const hot=internal.bind(null);'+
    'const result=hot();Function.prototype.bind=nativeBind;'+
    'process.stdout.write(String(result)+"\\n");';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'bound-function-proof-prototype',
    properties:true,identifiers:false,strings:false
  });
  assert.equal(output.files[0].metrics.properties,0);
  assert.deepEqual(runEsm(output.files[0].code),runEsm(source));
});
