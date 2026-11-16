'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {partitionScoAsyncGraph,createScoHandler}=require('../src');

const originals=[
  {path:'api.mjs',
    code:'import {privateValue} from "./secret.mjs";export async function calculate(x){return privateValue+x;}'},
  {path:'audit.mjs',
    code:'import {calculate} from "./api.mjs";export async function inspect(x){return calculate(x);}'},
  {path:'secret.mjs',
    code:'export const privateValue=41; // SERVER_PRIVATE_GRAPH_CANARY_78341'}
];

test('every generated SCO graph facade refuses accidental publication of a private dependency',()=>{
  const graph=partitionScoAsyncGraph(originals,{
    seed:'sco-graph-private-path-20261116',exposedPaths:['api.mjs','audit.mjs']
  });
  assert.deepEqual(graph.privatePaths,['secret.mjs']);
  assert.equal(graph.clientFiles.length,2);
  const originalSecret=originals[2];
  for(const facade of graph.clientFiles){
    assert.deepEqual(facade.privateModulePaths,['secret.mjs']);
    assert.ok(!facade.code.includes('SERVER_PRIVATE_GRAPH_CANARY_78341'));
    // Either order must fail before constructing an HTTP handler. The
    // generated facade carries the private path proof independently.
    assert.throws(()=>createScoHandler([
      facade,{...originalSecret,sourceType:'module'}
    ]),/must not serve private source: secret\.mjs/);
    assert.throws(()=>createScoHandler([
      {...originalSecret,sourceType:'module'},facade
    ]),/must not serve private source: secret\.mjs/);
    assert.doesNotThrow(()=>createScoHandler([facade]));
  }
  assert.doesNotThrow(()=>createScoHandler(graph.clientFiles));
});

test('an explicitly empty private graph marker does not suppress intentional public facade delivery',()=>{
  const graph=partitionScoAsyncGraph([
    {path:'public.mjs',code:'export async function answer(){return 42;}'}
  ],{seed:'graph-only-public-20261116',exposedPaths:['public.mjs']});
  assert.deepEqual(graph.privatePaths,[]);
  assert.deepEqual(graph.clientFiles[0].privateModulePaths,[]);
  assert.doesNotThrow(()=>createScoHandler(graph.clientFiles));
});

test('unmarked accidental SCO graph publication is an observable HTTP source leak',async()=>{
  const graph=partitionScoAsyncGraph(originals,{
    seed:'sco-graph-private-path-20261116',exposedPaths:['api.mjs','audit.mjs']
  });
  // Negative control models a caller that lost the graph's private-path
  // metadata. The same API formerly returned these unmarked facade objects.
  const unmarked=graph.clientFiles.map(({path,code,sourceType})=>({path,code,sourceType}));
  const handler=createScoHandler([
    ...unmarked,{...originals[2],sourceType:'module'}
  ]);
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/secret.mjs');
    assert.equal(response.status,200);
    assert.match(await response.text(),/SERVER_PRIVATE_GRAPH_CANARY_78341/);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
  // Preserving the generated metadata instead makes the exact same
  // publication mistake fail at handler construction, before any GET.
  assert.throws(()=>createScoHandler([
    ...graph.clientFiles,{...originals[2],sourceType:'module'}
  ]),/must not serve private source: secret\.mjs/);
});


test('SCO graph fingerprints block exact original source copies and original exposed modules',async()=>{
  const graph=partitionScoAsyncGraph(originals,{
    seed:'sco-graph-original-source-20261116',exposedPaths:['api.mjs','audit.mjs']
  });
  const fingerprints=graph.clientFiles[0].privateOriginalDigests;
  assert.ok(Array.isArray(fingerprints));
  assert.equal(fingerprints.length,3);
  assert.deepEqual(graph.clientFiles[1].privateOriginalDigests,fingerprints);
  assert.notStrictEqual(graph.clientFiles[1].privateOriginalDigests,fingerprints);
  assert.doesNotThrow(()=>createScoHandler(graph.clientFiles));

  // The original api.mjs is explicitly exposed in the graph, but ONLY its
  // generated RPC facade may be served. A private-path-only guard misses it.
  assert.throws(()=>createScoHandler([
    graph.clientFiles[1],{...originals[0],sourceType:'module'}
  ]),/original private graph source: api\.mjs/);

  // Copying the exact server-only secret to a new filename bypasses the
  // known private pathname set. The content fingerprint still rejects it.
  const alias={...originals[2],path:'shadow.mjs',sourceType:'module'};
  assert.throws(()=>createScoHandler([
    ...graph.clientFiles,alias
  ]),/original private graph source: shadow\.mjs/);
  assert.throws(()=>createScoHandler([
    {...graph.clientFiles[0],privateOriginalDigests:['invalid']}
  ]),/privateOriginalDigests must be SHA-256/);

  // Negative control: omit *only* digest metadata, keeping the existing path
  // marker. The alias is then served with the original source canary intact.
  const withoutDigests=graph.clientFiles.map(
    ({privateOriginalDigests,...clientFile})=>clientFile);
  const server=http.createServer(createScoHandler([...withoutDigests,alias]));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/shadow.mjs');
    assert.equal(response.status,200);
    assert.match(await response.text(),/SERVER_PRIVATE_GRAPH_CANARY_78341/);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }

  // A changed source byte changes the fingerprint. This guard is deployment
  // mistake prevention for exact copies, not semantic source similarity.
  assert.doesNotThrow(()=>createScoHandler([
    graph.clientFiles[0],{...alias,code:alias.code+'\n'}
  ]));
});
