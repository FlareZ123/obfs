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

test('SCO graph snapshots batch options once and supports two distinct batched modules',()=>{
  let pathReads=0;
  let limitReads=0;
  const graph=partitionScoAsyncGraph(SOURCES,{
    seed:'agent31-sco-graph-batch-snapshot-20261123',
    exposedPaths:['public.mjs','check.mjs'],
    get batchPaths(){
      pathReads++;
      return pathReads===1?['public.mjs','check.mjs']:['secret.mjs'];
    },
    get maxBatchCalls(){
      limitReads++;
      return limitReads===1?2:1;
    }
  });
  assert.equal(pathReads,1);
  assert.equal(limitReads,1);
  const first=graph.partitions['public.mjs'];
  const second=graph.partitions['check.mjs'];
  assert.equal(first.maxBatchCalls,2);
  assert.equal(second.maxBatchCalls,2);
  assert.ok(first.batchMethod);
  assert.ok(second.batchMethod);
  assert.notEqual(first.batchMethod,second.batchMethod);
  assert.match(graph.clientFiles[0].code,/export async function batch/u);
  assert.match(graph.clientFiles[1].code,/export async function batch/u);

  graph.partitions['public.mjs'].batchMethod='m'+'0'.repeat(24);
  assert.throws(()=>createScoGraphHandler(graph,{
    'public.mjs':{write:async()=> 'allowed'},
    'check.mjs':{peek:async()=> 'checked'}
  },{
    authorizeRpc:()=>true,authorizeOperation:()=>true
  }),/manifest was modified after partitioning/u);
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

    // Graph composition must inherit the lower-level exact-arity fix (#340).
    // Invalid outer arity cannot skip the inner policy and execute a child.
    const invalidArity=await rpc(origin,batchMethod,[[{
      method:writeMethod,args:['blocked']
    }],0]);
    assert.notEqual(invalidArity.status,200);
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

    // A batch is scoped to its selected source module. It must not accept a
    // method belonging to a different exposed module, even when that method
    // is valid as an ordinary top-level RPC route.
    const otherMethod=graph.partitions['check.mjs'].methodNames.peek;
    const crossModule=await rpc(origin,batchMethod,[[{
      method:otherMethod,args:[]
    }]]);
    assert.notEqual(crossModule.status,200);
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


test('whole SCO graph without batchPaths retains the ordinary RPC contract',async()=>{
  const graph=partitionScoAsyncGraph(SOURCES,{
    seed:'agent31-sco-graph-unbatched-20261127',
    exposedPaths:['public.mjs','check.mjs']
  });
  for(const file of graph.clientFiles){
    assert.doesNotMatch(file.code,/export async function batch/u);
  }
  assert.equal(graph.partitions['public.mjs'].batchMethod,undefined);
  assert.equal(graph.partitions['check.mjs'].batchMethod,undefined);
  const server=http.createServer(createScoGraphHandler(graph,{
    'public.mjs':{write:async(/** @type {string} */ value)=>value.toUpperCase()},
    'check.mjs':{peek:async()=> 'checked'}
  },{authorizeRpc:()=>true}));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing server address');
    const origin='http://127.0.0.1:'+address.port;
    const written=await rpc(origin,graph.partitions['public.mjs'].methodNames.write,['plain']);
    assert.equal(written.status,200);
    assert.deepEqual(await written.json(),{ok:true,value:'PLAIN'});
    const checked=await rpc(origin,graph.partitions['check.mjs'].methodNames.peek,[]);
    assert.equal(checked.status,200);
    assert.deepEqual(await checked.json(),{ok:true,value:'checked'});
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
