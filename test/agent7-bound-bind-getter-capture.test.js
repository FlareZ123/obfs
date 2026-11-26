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
