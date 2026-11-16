'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse,observesFunctionSource}=require('../src/ast');

test('SCO source observer proves immutable primitive addition cannot stringify functions',()=>{
  const safe=[
    'const first="alpha"; const second="beta"; globalThis.out=first+second;',
    'const first="alpha"; const second=first+"beta"; globalThis.out=second+"gamma";',
    'const first=4; const second=7; globalThis.out="safe"+(first+second);',
    'const first="alpha"; globalThis.out=first+2;',
    'const first="alpha"; const second=true; globalThis.out=first+second;'
  ];
  for(const source of safe){
    assert.equal(observesFunctionSource(parse(source,'script')),false,source);
  }
});

test('SCO source observer still refuses function and unknown coercion through addition',()=>{
  const unsafe=[
    'const prefix="alpha"; const fn=function observed(){return 1;}; globalThis.out=prefix+fn;',
    'const prefix="alpha"; globalThis.out=prefix+globalThis.untrusted;',
    'const prefix="alpha"; let unknown="beta"; globalThis.out=prefix+unknown;',
    'const prefix="alpha"; const unknown=(()=>true)(); globalThis.out=prefix+unknown;',
    'const prefix="alpha"; const fn=()=>9; globalThis.out=prefix+fn;'
  ];
  for(const source of unsafe){
    assert.equal(observesFunctionSource(parse(source,'script')),true,source);
  }
});
