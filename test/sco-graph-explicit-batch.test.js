'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src');

const SOURCES=[
  {path:'public.mjs',code:'import "./secret.mjs";export async function write(value){return value;}'},
  {path:'check.mjs',code:'export async function peek(){return "checked";}'},
  {path:'secret.mjs',code:'export const marker=137;'}
];

/**
 * Post a JSON operation to the real SCO graph HTTP handler.
 * @param {string} origin
 * @param {string} method
 * @param {unknown[]} args
 * @returns {Promise<Response>}
 */
function rpc(origin,method,args){
  return fetch(origin+'/obfs/rpc',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args})
  });
}

test('SCO graph batching is explicit, path-bounded, and immune to caller iteration changes',()=>{
  const batchPaths=['public.mjs'];
  batchPaths[Symbol.iterator]=function*(){yield 'secret.mjs';};
  const graph=partitionScoAsyncGraph(SOURCES,{
    seed:'agent31-sco-graph-batch-20261123',
    exposedPaths:['public.mjs','check.mjs'],
    batchPaths,maxBatchCalls:2
  });
  assert.deepEqual(graph.exposedPaths,['public.mjs','check.mjs']);
  assert.deepEqual(graph.privatePaths,['secret.mjs']);
  assert.equal(graph.clientFiles.length,2);
  assert.match(graph.clientFiles[0].code,/export async function batch/u);
  assert.doesNotMatch(graph.clientFiles[1].code,/export async function batch/u);
  assert.match(graph.partitions['public.mjs'].batchMethod,/^m[0-9a-f]{24}$/u);
  assert.equal(graph.partitions['check.mjs'].batchMethod,undefined);

  const build=/** @param {string[]} paths */ (paths)=>
    partitionScoAsyncGraph(SOURCES,{
      seed:'agent31-sco-graph-batch-negative',exposedPaths:['public.mjs','check.mjs'],
      batchPaths:paths
    });
  assert.throws(()=>build(['secret.mjs']),/batchPaths must be distinct exposed/u);
  assert.throws(()=>build(['public.mjs','public.mjs']),/batchPaths must be distinct exposed/u);
  assert.throws(()=>build(['missing.mjs']),/batchPaths must be distinct exposed/u);
  assert.throws(()=>partitionScoAsyncGraph(SOURCES,{
    seed:'agent31-sco-graph-batch-negative',exposedPaths:['public.mjs'],
    batchPaths:['public.mjs'],maxBatchCalls:1025
  }),/maxBatchCalls/u);
  assert.throws(()=>partitionScoAsyncGraph(SOURCES,{
    seed:'agent31-sco-graph-batch-negative',exposedPaths:['public.mjs'],
    maxBatchCalls:2
  }),/maxBatchCalls/u);
  assert.throws(()=>partitionScoAsyncGraph(SOURCES,{
    seed:'agent31-sco-graph-batch-negative',exposedPaths:['public.mjs'],
    batchPaths:/** @type {any} */ ('public.mjs')
  }),/batchPaths must be an array/u);
});

test('composed SCO graph requires and enforces authorization for every inner batch operation',async()=>{
  const graph=partitionScoAsyncGraph(SOURCES,{
    seed:'agent31-sco-graph-preflight-20261123',
    exposedPaths:['public.mjs','check.mjs'],
    batchPaths:['public.mjs'],maxBatchCalls:2
  });
  /** @type {string[]} */
  const performed=[];
  const namespaces={
    'public.mjs':{write:async(/** @type {string} */ value)=>{
      performed.push(value);return value.toUpperCase();
    }},
    'check.mjs':{peek:async()=> 'checked'}
  };
  const writeMethod=graph.partitions['public.mjs'].methodNames.write;
  const batchMethod=graph.partitions['public.mjs'].batchMethod;
  assert.ok(batchMethod);
  const policy={
    authorizeRpc:()=>true,
    authorizeOperation:(/** @type {http.IncomingMessage} */ _request,
      /** @type {string} */ method,/** @type {unknown[]} */ args)=>
      method!==writeMethod||args[0]!=='blocked'
  };
  assert.throws(()=>createScoGraphHandler(graph,namespaces,{
    authorizeRpc:()=>true
  }),/require authorizeOperation/u);
  assert.throws(()=>createScoGraphHandler(graph,namespaces,{
    ...policy,batchPreflightRoutes:[]
  }),/requires graph and separately authorized server options/u);

  const server=http.createServer(createScoGraphHandler(graph,namespaces,policy));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing server address');
    const origin='http://127.0.0.1:'+address.port;

    // Reject the entire batch before its first side effect, even though
    // the outer method and first inner method pass authorization.
    const refused=await rpc(origin,batchMethod,[[{
      method:writeMethod,args:['allowed']
    },{method:writeMethod,args:['blocked']}]]);
    assert.equal(refused.status,403);
    assert.deepEqual(performed,[]);

    const accepted=await rpc(origin,batchMethod,[[{
      method:writeMethod,args:['first']
    },{method:writeMethod,args:['second']}]]);
    assert.equal(accepted.status,200);
    assert.deepEqual(await accepted.json(),{ok:true,value:[
      {ok:true,value:'FIRST'},{ok:true,value:'SECOND'}
    ]});
    assert.deepEqual(performed,['first','second']);

    const oversized=await rpc(origin,batchMethod,[[{
      method:writeMethod,args:['one']
    },{method:writeMethod,args:['two']},{method:writeMethod,args:['three']}]]);
    assert.notEqual(oversized.status,200);
    assert.deepEqual(performed,['first','second']);

    // Ordinary nonbatch exports still dispatch through the same handler.
    const ordinary=await rpc(origin,graph.partitions['check.mjs'].methodNames.peek,[]);
    assert.equal(ordinary.status,200);
    assert.deepEqual(await ordinary.json(),{ok:true,value:'checked'});
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
