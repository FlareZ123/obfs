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
    ['unique immutable key alias','const key="n";const table={n:41};'+
      'export function next(){return table[key]+1;}'],
    ['record numeric','const table={0:41};export function next(){return table[0]+1;}'],
    ['array indexes','const table=[40,2];export function next(){return table[0]+table[1];}'],
    ['array length','const table=[41];export function next(){return table.length+table[0];}'],
    ['unused literal','const table={};export function next(){return 42;}'],
    ['string scalar','const table={n:"x"};export function next(){return table.n+"y";}'],
    ['boolean scalar','const table={n:true};export function next(){return table.n?1:0;}'],
    ['null scalar','const table={n:null};export function next(){return table.n===null;}']
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
    ['key shadowed by parameter','const key="n";const table={n:41};'+
      'export function next(key){return table[key];}'],
    ['key shadowed by local','const key="n";const table={n:41};'+
      'export function next(){const key="x";return table[key];}'],
    ['key key mutation','const key="n";const table={n:41};'+
      'export function next(){key="x";return table[key];}'],
    ['nested member','const table={n:41};export function next(){return table.n.toString();}'],
    ['call property','const table={n:41};export function next(){return table.n();}'],
    ['array mutation','const table=[41];export function next(){return table.push(1);}'],
    ['getter','const table={get n(){return 41;}};export function next(){return table.n;}'],
    ['nested value','const table={n:{value:41}};export function next(){return table.n.value;}'],
    ['computed key','const table={["n"]:41};export function next(){return table.n;}'],
    ['proto setter','const table={__proto__:null,n:41};export function next(){return table.n;}'],
    ['direct exported owner','export const table={n:41};export function next(){return table.n;}'],
    ['reexported owner','const table={n:41};export {table};export function next(){return table.n;}'],
    ['bigint value','const table={n:41n};export function next(){return Number(table.n);}'],
    ['nonfinite value','const table={n:1e400};export function next(){return table.n;}']
  ];
  for(const [label,source] of cases){
    assert.throws(()=>compile(source),
      /unproved shared module object state|realm-local prototype access/u,label);
  }
});

test('SCO child scalar table proof refuses destructuring assignment targets',()=>{
  const mutableOwner='const table={n:0};';
  const bodies=[
    '({n:table.n}={n:table.n+1});return table.n;',
    '[table.n]=[table.n+1];return table.n;',
    '({x:[table.n]}={x:[table.n+1]});return table.n;',
    '({x:{y:table.n}}={x:{y:42}});return table.n;',
    'for({n:table.n} of [{n:table.n+1}]){}return table.n;',
    'for([table.n] of [[table.n+1]]){}return table.n;',
    'for(table.n of [table.n+1]){}return table.n;',
    'for(table.n in {a:1}){}return table.n;'
  ];
  for(const body of bodies){
    assert.throws(()=>compile(mutableOwner+
      'export function next(){'+body+'}'),
      /unproved shared module object state/u,body);
  }
});

test('SCO child scalar table proof preserves RHS-only destructuring reads',()=>{
  const source='const table={n:41};'+
    'export function next(){let value=0;({x:value}={x:table.n});'+
    'for(const x of [table.n]){value=x;}return value+1;}';
  assert.doesNotThrow(()=>compile(source));
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
