'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedGraph}=require('../src');

/**
 * Exercise the actual transitive private ESM admission boundary. The public
 * entry imports the leaf and selects only privateOp for server execution.
 * @param {string} leafBody
 * @returns {ReturnType<typeof partitionScoSelectedGraph>}
 */
function graph(leafBody){
  return partitionScoSelectedGraph([{
    file:{
      path:'mixed.mjs',
      sourceType:'module',
      code:"import {leaf} from './private/leaf.mjs';"+
        "export async function privateOp(){return leaf();}"+
        "export function visible(){return 7;}"
    },
    options:{
      seed:'sco-private-graph-url-host-20261123',
      privateNames:['privateOp'],
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:'export function leaf(){'+leafBody+'}'
      }]
    }
  }]);
}

test('selected SCO private ESM leaf refuses URL constructors with unproved native failure paths',()=>{
  for(const body of [
    "try{return new URL(':').hostname;}catch(e){return e.name+':'+e.message;}",
    "const candidate=':';return new URL(candidate).hostname;",
    "return new URL('/relative','https://example.org').hostname;"
  ])assert.throws(()=>graph(body),/unproved cross-realm object URL API/,body);
});

test('selected SCO private ESM leaf keeps fixed valid URL scalar and arithmetic positives',()=>{
  const fixed=graph("return new URL('https://example.org/a?b=1').hostname;");
  assert.deepEqual(fixed.exposedPaths,['mixed.mjs']);
  const math=graph('return Math.imul(13,23);');
  assert.deepEqual(math.exposedPaths,['mixed.mjs']);
});

test('selected SCO private ESM leaf already refuses ambient base64 host function',()=>{
  assert.throws(
    ()=>graph("try{atob('%');return 'ok';}catch(e){return e.message;}"),
    /unproved cross-realm host API/
  );
});
