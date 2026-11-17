'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * @param {string} privateBody
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function partition(privateBody){
  const code='export async function privateOp(){'+privateBody+'}\\n'+
    'export function publicRead(){return 7;}\\n';
  return partitionScoSelectedAsyncExports(
    {path:'catch-stack-realm.mjs',sourceType:'module',code},
    {privateNames:['privateOp'],seed:'catch-stack-realm-20261117'});
}

test('SCO refuses direct catch-parameter stack destructuring',()=>{
  const bodies=[
    "try{throw new Error('tag')}catch({stack:trace}){return trace;}",
    "try{throw new Error('tag')}catch({['sta'+'ck']:trace}){return trace;}",
    "try{throw new Error('tag')}catch({stack:{length}}){return length;}",
    "const key='stack';try{throw new Error('tag')}catch({[key]:trace}){return trace;}"
  ];
  for(const body of bodies){
    const expression='(()=>{'+body+'})()';
    const client=vm.runInNewContext(expression,{}, {filename:'client.mjs'});
    const server=vm.runInNewContext(expression,{}, {filename:'server-private-long.mjs'});
    assert.notEqual(client,server,body);
    assert.throws(()=>partition(body),/realm-local error stack/i,body);
  }
});

test('SCO still accepts a stable caught message and a plain local stack field',()=>{
  const bodies=[
    "try{throw new Error('tag')}catch({message}){return message;}",
    "try{throw {message:'safe'}}catch({message:label}){return label;}",
    "const record={stack:'local'};return record.stack;"
  ];
  for(const body of bodies){
    const result=partition(body);
    assert.deepEqual(result.privateNames,['privateOp'],body);
  }
});
