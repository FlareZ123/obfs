'use strict';

const assert=require('node:assert/strict');
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
