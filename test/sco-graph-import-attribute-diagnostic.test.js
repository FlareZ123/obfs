'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {partitionScoAsyncGraph}=require('../src');

test('SCO private graph import-attribute admission is source-preserving or fails closed',()=>{
  const entry='import source from "./secret.mjs" with {type:"text"}; export async function sign(){return source.length;}';
  const secret='export const PRIVATE_GRAPH_SOURCE_CANARY_913725=1;';
  let graph;
  let failure;
  try{
    graph=partitionScoAsyncGraph([
      {path:'api.mjs',sourceType:'module',code:entry},
      {path:'secret.mjs',sourceType:'module',code:secret}
    ],{seed:'sco-text-import-private-graph-diagnostic',exposedPaths:['api.mjs']});
  }catch(error){
    failure=error;
  }
  if(failure){
    assert.ok(failure instanceof TypeError);
    console.log('SCO graph rejects attributed default import:',failure.message);
    return;
  }
  assert.ok(graph);
  assert.deepEqual(graph.exposedPaths,['api.mjs']);
  assert.deepEqual(graph.privatePaths,['secret.mjs']);
  assert.equal(graph.privateSourceDigests.find(item=>item.path==='secret.mjs').sha256,
    createHash('sha256').update(secret,'utf8').digest('hex'));
  assert.equal(graph.privateSourceDigests.find(item=>item.path==='api.mjs').sha256,
    createHash('sha256').update(entry,'utf8').digest('hex'));
  assert.equal(graph.clientFiles.length,1);
  assert.ok(!graph.clientFiles[0].code.includes('PRIVATE_GRAPH_SOURCE_CANARY_913725'));
  assert.ok(!graph.clientFiles[0].code.includes('import source'));
  console.log('SCO graph accepts attributed default import but preserves both private source digests and publishes only an RPC facade');
});
