'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @param {string} source */
function compile(source){
  return partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',
    code:[
      'import {next} from "./private/next.mjs";',
      'export async function secret(){return next();}',
      'export function local(){return 1;}'
    ].join('\n')
  },{
    seed:'sco-private-child-readonly-literal-20261128',
    privateNames:['secret'],
    privateModuleImports:['./private/next.mjs'],
    privateModuleSources:[{path:'private/next.mjs',code:source}]
  });
}

test('SCO child read-only literal proof retains static primitive property reads',()=>{
  /** @type {[string,string][]} */
  const cases=[
    ['record dot','const table={n:41};export function next(){return table.n+1;}'],
    ['record bracket','const table={n:41};export function next(){return table["n"]+1;}'],
    ['record numeric','const table={0:41};export function next(){return table[0]+1;}'],
    ['array indexes','const table=[40,2];export function next(){return table[0]+table[1];}'],
    ['array length','const table=[41];export function next(){return table.length+table[0];}'],
    ['unused literal','const table={};export function next(){return 42;}']
  ];
  for(const [label,source] of cases){
    assert.doesNotThrow(()=>compile(source),label);
  }
});

test('SCO child read-only literal proof refuses mutations and first-class escapes',()=>{
  /** @type {[string,string][]} */
  const cases=[
    ['write','const table={n:41};export function next(){table.n=4;return table.n;}'],
    ['update','const table={n:41};export function next(){return ++table.n;}'],
    ['delete','const table={n:41};export function next(){return delete table.n;}'],
    ['alias','const table={n:41};export function next(){const other=table;return other.n;}'],
    ['destructure','const table={n:41};export function next(){const {n}=table;return n;}'],
    ['reflect','const table={n:41};export function next(){return Reflect.get(table,"n");}'],
    ['opaque call','const table={n:41};export function next(){return Object.keys(table).length;}'],
    ['dynamic key','const table={n:41};export function next(k){return table[k];}'],
    ['nested member','const table={n:41};export function next(){return table.n.toString();}'],
    ['call property','const table={n:41};export function next(){return table.n();}'],
    ['array mutation','const table=[41];export function next(){return table.push(1);}'],
    ['getter','const table={get n(){return 41;}};export function next(){return table.n;}'],
    ['nested value','const table={n:{value:41}};export function next(){return table.n.value;}'],
    ['computed key','const table={["n"]:41};export function next(){return table.n;}'],
    ['proto setter','const table={__proto__:null,n:41};export function next(){return table.n;}'],
    ['direct exported owner','export const table={n:41};export function next(){return table.n;}'],
    ['reexported owner','const table={n:41};export {table};export function next(){return table.n;}']
  ];
  for(const [label,source] of cases){
    assert.throws(()=>compile(source),/unproved shared module object state/u,label);
  }
});

test('SCO child scalar table audit retains byte-identical emitted RPC facade',()=>{
  const source='const table={n:41};export function next(){return table.n+1;}';
  const reviewed=compile(source);
  const shallow=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',
    code:[
      'import {next} from "./private/next.mjs";',
      'export async function secret(){return next();}',
      'export function local(){return 1;}'
    ].join('\n')
  },{
    seed:'sco-private-child-readonly-literal-20261128',
    privateNames:['secret'],privateModuleImports:['./private/next.mjs']
  });
  assert.equal(reviewed.clientFile.code,shallow.clientFile.code);
});
