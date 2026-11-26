'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {createScoHandler}=require('../src');
const {obfuscateFiles}=require('../src/core');
const {hasPathnameControlCharacter}=require('../src/esm-url-paths');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @param {string} path @param {string} code @returns {ModuleFile} */
function moduleFile(path,code) {
  return {path,sourceType:'module',code};
}

const options=/** @type {const} */ ({
  mode:'coo',seed:'c0-url-identity-guard',
  closedWorld:true,strings:false,identifiers:false
});

test('pathname C0 and DEL are rejected while query/fragment controls and ordinary spaces remain outside the predicate',()=>{
  const controls=Array.from({length:32},(_,index)=>String.fromCharCode(index)).concat('\x7f');
  for(const control of controls) {
    assert.equal(hasPathnameControlCharacter('./dir/x'+control+'/secret.mjs'),true,
      'pathname control U+'+control.charCodeAt(0).toString(16).padStart(4,'0'));
    assert.equal(hasPathnameControlCharacter('./dir/secret.mjs?value='+control),false,
      'query control must not be classified as pathname data');
    assert.equal(hasPathnameControlCharacter('./dir/secret.mjs#fragment'+control),false,
      'fragment control must not be classified as pathname data');
  }
  assert.equal(hasPathnameControlCharacter('./dir/hello world.mjs'),false);
  assert.equal(hasPathnameControlCharacter('./dir/hello%20world.mjs'),false);
});

test('C0 URL identity mismatch refuses cross-file owner proof instead of renaming the POSIX decoy',()=>{
  const files=[
    moduleFile('dir/secret.mjs','export const state={secretField:23};'),
    moduleFile('dir/a/secret.mjs','export const state={secretField:41};'),
    moduleFile('dir/entry.mjs',
      'import {state} from '+JSON.stringify('./a/.\t/../secret.mjs')+';console.log(state.secretField);')
  ];
  const output=obfuscateFiles(files,options);
  assert.equal(output.crossFile.properties,0);
});

test('C0 URL identity mismatch prevents an incomplete ESM host-lock graph',()=>{
  const files=[
    moduleFile('dir/a/secret.mjs','export const state={secretField:23};'),
    moduleFile('dir/entry.mjs',
      'import {state} from '+JSON.stringify('./a/.\t/../secret.mjs')+';console.log(state.secretField);')
  ];
  assert.throws(()=>obfuscateFiles(files,{
    ...options,allowedHosts:['allowed.example']
  }),/Host locking ESM static imports or reexports requires a complete closed-world module group/u);
});

test('C0 URL identity mismatch disables unproved static ESM string decoding',()=>{
  const files=[
    moduleFile('state.mjs','export const state={label:"private-literal"};'),
    moduleFile('a/state.mjs','export const state={label:"decoy-literal"};'),
    moduleFile('entry.mjs',
      'import {state} from '+JSON.stringify('./a/.\t/../state.mjs')+';export const value=state.label;')
  ];
  const output=obfuscateFiles(files,{
    mode:'sno',seed:'c0-url-identity-decoder',
    closedWorld:true,strings:true,properties:false,identifiers:false
  });
  assert.equal(output.files.reduce((sum,file)=>sum+file.metrics.literals,0),0);
});

test('C0 URL identity mismatch refuses source-observer island proof before a wrong leaf is selected',()=>{
  const selected=moduleFile('independent.mjs',
    'const recordB={privateB:23};const valueB=recordB.privateB;export function unrelated(){return valueB;}');
  const decoy=moduleFile('a/independent.mjs',
    'const recordB={privateB:41};const valueB=recordB.privateB;export function unrelated(){return valueB;}');
  const entry=moduleFile('entry.mjs',
    'import {unrelated} from '+JSON.stringify('./a/.\t/../independent.mjs')+
    ';console.log(unrelated.toString(),unrelated());');
  assert.throws(()=>obfuscateFiles([selected,decoy,entry],{
    mode:'coo',seed:'c0-url-identity-island',
    closedWorld:true,strings:false,identifiers:false,
    experimentalSourceObserverIslands:['independent.mjs']
  }),/Source observer islands require closed static ESM imports/u);
});


test('SCO request-path decoder rejects percent-encoded C0 and DEL before lookup',async()=>{
  const server=createServer(createScoHandler([{
    path:'safe.mjs',sourceType:'module',code:'export const value=23;'
  }]));
  await new Promise(resolve=>server.listen(
    {port:0,host:'127.0.0.1'},()=>resolve(null)));
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP address');
  try {
    for(const encoded of ['%09','%7F']) {
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+encoded+'safe.mjs');
      assert.equal(response.status,400,encoded);
    }
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(null)));
  }
});
