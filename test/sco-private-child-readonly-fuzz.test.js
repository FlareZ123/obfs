'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {number} seed @returns {()=>number} */
function rng(seed){
  let x=seed>>>0;
  return ()=>{
    x=(Math.imul(x,1664525)+1013904223)>>>0;
    return x/0x100000000;
  };
}

/**
 * @param {string} source
 * @param {number} salt
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(source,salt){
  return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',
    code:'import {next} from "./private/next.mjs";'+
      'export async function privateAnswer(){return next();}'+
      'export function publicAnswer(){return 1;}'
  },{
    seed:'sco-owned-literal-fuzz-'+salt,
    privateNames:['privateAnswer'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code:source}]
  });
}

test('seeded scalar-owned private record admission and mutation rejection',()=>{
  const rand=rng(0x5c0e2026);
  const keys=[
    'a','one','count','toString','constructor','length','valueOf',
    '0','1','42','a-b','λ','snow☃','quote"test','back\\slash',
    'a b','empty','NaN','Infinity','undefined','true','false'
  ];
  let positive=0;
  let negative=0;
  for(let index=0;index<128;index++){
    const key=keys[Math.floor(rand()*keys.length)];
    const value=1+Math.floor(rand()*65536);
    const object='const table={'+JSON.stringify(key)+':'+value+'};';
    const access='table['+JSON.stringify(key)+']';
    const safe=object+'export function next(){return '+access+'+1;}';
    const unsafe=object+'export function next(){return ++'+access+';}';
    assert.doesNotThrow(()=>compile(safe,index),
      'stateless scalar own-key read should admit: '+safe);
    positive++;
    assert.throws(()=>compile(unsafe,index),
      /unproved shared module object state/u,
      'mutable scalar own-key write should be refused: '+unsafe);
    negative++;
  }
  assert.equal(positive,128);
  assert.equal(negative,128);
});

test('seeded array reads preserve positive coverage but mutable methods decline',()=>{
  const rand=rng(0x41a2c026);
  for(let i=0;i<48;i++){
    const a=Math.floor(rand()*1000),b=Math.floor(rand()*1000);
    const src='const table=['+a+','+b+'];';
    const safe=src+'export function next(){return table[0]+table[1];}';
    const unsafe=src+'export function next(){return table.push(3);}';
    assert.doesNotThrow(()=>compile(safe,1000+i),safe);
    assert.throws(()=>compile(unsafe,1000+i),
      /unproved shared module object state/u,unsafe);
  }
});
