'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} source
 * @param {string} seed
 * @returns {import('../src/core').ObfuscatedFile}
 */
function compile(source,seed){
  const result=obfuscateFiles([{
    path:'app.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',closedWorld:true,seed,properties:true,identifiers:false,strings:false
  });
  const app=result.files.find(file=>file.path==='app.mjs');
  assert.ok(app);
  return app;
}

const tail=[
  'const owner={secretField:7};',
  'export function outer(){',
  '  const internal=()=>{',
  '    const x=owner.secretField;',
  '    localStorage.setItem("k",new.target);',
  '    return x;',
  '  };',
  '  return internal();',
  '}'
].join('\\n');

test('private unmodified WeakMap-backed Storage override is a reference-only positive control',()=>{
  const source=[
    'const values=new WeakMap();',
    'Storage.prototype.setItem=function(key,value){values.set(this,value);};',
    tail
  ].join('\\n');
  const app=compile(source,'agent1-weakmap-reference-only-positive');
  assert.equal(app.metrics.properties,1,
    JSON.stringify({metrics:app.metrics,code:app.code}));
});

test('WeakMap.prototype.set string coercion invalidates reference-only Storage override',()=>{
  const source=[
    'const values=new WeakMap();',
    'const nativeSet=WeakMap.prototype.set;',
    'WeakMap.prototype.set=function(key,value){return nativeSet.call(this,key,String(value));};',
    'Storage.prototype.setItem=function(key,value){values.set(this,value);};',
    tail
  ].join('\\n');
  const app=compile(source,'agent1-weakmap-prototype-set-negative');
  assert.equal(app.metrics.properties,0,
    JSON.stringify({metrics:app.metrics,code:app.code}));
});

test('exported WeakMap backing store invalidates reference-only Storage override',()=>{
  const source=[
    'export const values=new WeakMap();',
    'Storage.prototype.setItem=function(key,value){values.set(this,value);};',
    tail
  ].join('\\n');
  const app=compile(source,'agent1-weakmap-exported-instance-negative');
  assert.equal(app.metrics.properties,0,
    JSON.stringify({metrics:app.metrics,code:app.code}));
});
