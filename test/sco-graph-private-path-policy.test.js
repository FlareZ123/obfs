'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncGraph,createScoHandler,createScoGraphHandler,
  verifyScoPrivateSourceDigests}=require('../src');

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


test('composed SCO graph handler binds only original exports and permits only generated facades',async()=>{
  const graph=partitionScoAsyncGraph(originals,{
    seed:'sco-graph-composed-handler-20261116',exposedPaths:['api.mjs','audit.mjs']
  });
  const namespaces={
    'api.mjs':{calculate:async x=>41+x},
    'audit.mjs':{inspect:async x=>41+x}
  };
  const options={
    authorizeRpc:()=>true,
    authorizeRead:()=>true,
    authorizeOperation:()=>true
  };
  const make=(g=graph,opts=options)=>createScoGraphHandler(g,namespaces,opts);
  assert.doesNotThrow(()=>make());
  assert.throws(()=>make(graph,{...options,routePrefix:'/wrong/'}),/endpoint does not match/);
  assert.throws(()=>make(graph,{...options,publicPaths:['secret.mjs']}),/graph handler requires/);
  assert.throws(()=>make(graph,{...options,remoteMethods:{unexpected:()=>0}}),/graph handler requires/);
  assert.throws(()=>make({
    ...graph,clientFiles:[...graph.clientFiles,
      {...originals[2],path:'shadow.mjs',sourceType:'module'}]
  }),/requires a graph generated in this process/);
  assert.throws(()=>make({
    ...graph,clientFiles:[graph.clientFiles[1],
      {...originals[0],sourceType:'module'}]
  }),/requires a graph generated in this process/);

  const server=http.createServer(make());
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const publicResult=await fetch(origin+'/obfs/api.mjs');
    assert.equal(publicResult.status,200);
    const publicSource=await publicResult.text();
    assert.ok(publicSource.includes('export async function calculate'));
    assert.ok(!publicSource.includes('SERVER_PRIVATE_GRAPH_CANARY_78341'));
    assert.equal((await fetch(origin+'/obfs/secret.mjs')).status,404);
    assert.equal((await fetch(origin+'/obfs/shadow.mjs')).status,404);
    const response=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        method:graph.partitions['api.mjs'].methodNames.calculate,args:[7]
      })
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,value:48});
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


test('SCO graph source fingerprints compare the same single-read bytes as served',async()=>{
  const graph=partitionScoAsyncGraph(originals,{
    seed:'sco-graph-immutable-source-20261116',exposedPaths:['api.mjs']
  });
  let reads=0;
  const published='export const approved=11; // REVIEWED_PUBLIC_SOURCE_345';
  const source={
    path:'shadow.mjs',sourceType:'module',
    get code(){
      reads++;
      return reads===1?published:originals[2].code;
    }
  };
  const handler=createScoHandler([graph.clientFiles[0],source],{
    publicPaths:['api.mjs','shadow.mjs']
  });
  assert.equal(reads,1,'Source content must be snapshotted once before digest and parse');
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/shadow.mjs');
    assert.equal(response.status,200);
    const body=await response.text();
    assert.ok(!body.includes('SERVER_PRIVATE_GRAPH_CANARY_78341'));
    assert.equal(reads,1,'Runtime GET must use the handler-owned source snapshot');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }

  let deniedReads=0;
  const unauthorized={
    path:'shadow.mjs',sourceType:'module',
    get code(){
      deniedReads++;
      return deniedReads===1?originals[2].code:published;
    }
  };
  assert.throws(()=>createScoHandler([graph.clientFiles[0],unauthorized]),
    /original private graph source: shadow.mjs/);
  assert.equal(deniedReads,1);
});


test('SCO graph helper accepts matching custom RPC route and denies default route',async()=>{
  const graph=partitionScoAsyncGraph([{
    path:'remote.mjs',code:'export async function evaluate(x){return x+5;}'
  }],{
    seed:'sco-graph-custom-route-20261116',
    exposedPaths:['remote.mjs'],
    endpoint:'/private/rpc'
  });
  const handler=createScoGraphHandler(graph,{
    'remote.mjs':{evaluate:async x=>x+5}
  },{
    routePrefix:'/private/',authorizeRpc:()=>true
  });
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await fetch(origin+'/obfs/remote.mjs')).status,404);
    assert.equal((await fetch(origin+'/private/remote.mjs')).status,200);
    const response=await fetch(origin+'/private/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        method:graph.partitions['remote.mjs'].methodNames.evaluate,args:[7]
      })
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,value:12});
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


test('composed SCO graph seals facades and method metadata against post-partition mutation',async()=>{
  const make=()=>partitionScoAsyncGraph(originals,{
    seed:'sco-graph-postpartition-seal-20261116',
    exposedPaths:['api.mjs','audit.mjs']
  });
  const namespaces={
    'api.mjs':{calculate:async x=>41+x},
    'audit.mjs':{inspect:async x=>41+x}
  };
  const options={authorizeRpc:()=>true,authorizeRead:()=>true};
  const privateCopy=originals[2].code+'\n';
  const intact=make();
  assert.doesNotThrow(()=>createScoGraphHandler(intact,namespaces,options));

  // Before the new manifest seal, a deployment could overwrite the expected
  // facade with a byte-modified original under an approved public pathname.
  // The positive path allowlist and exact-original digest both permit it.
  const legacy=http.createServer(createScoHandler([
    {path:'api.mjs',sourceType:'module',code:privateCopy},
    intact.clientFiles[1]
  ],{publicPaths:['api.mjs','audit.mjs']}));
  await new Promise(resolve=>legacy.listen(0,'127.0.0.1',resolve));
  try{
    const address=legacy.address();
    assert.ok(address&&typeof address==='object');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/api.mjs');
    assert.equal(response.status,200);
    assert.match(await response.text(),/SERVER_PRIVATE_GRAPH_CANARY_78341/);
  }finally{
    await new Promise((resolve,reject)=>legacy.close(error=>error?reject(error):resolve()));
  }

  /** @type {Array<(g:ReturnType<typeof partitionScoAsyncGraph>)=>void>} */
  const mutate=[
    g=>{g.clientFiles[0].code=privateCopy;},
    g=>{g.clientFiles[0].privateOriginalDigests=[];},
    g=>{g.partitions['api.mjs'].methodNames.calculate='mForgedMethod';},
    g=>{g.partitions['api.mjs'].names[0]='inspect';},
    g=>{g.privatePaths.push('unreviewed.mjs');},
    g=>{g.privateSourceDigests[0].sha256='0'.repeat(64);}
  ];
  for(const alter of mutate){
    const graph=make();
    alter(graph);
    assert.throws(()=>createScoGraphHandler(graph,namespaces,options),
      /SCO graph manifest was modified after partitioning/u);
  }

  // This getter returns the approved bytes to the validation serializer
  // twice, then would switch to a server-only file on the next read. The
  // composed HTTP handler must serve only its compiler-owned snapshot.
  const switching=make();
  const approved=switching.clientFiles[0].code;
  let reads=0;
  Object.defineProperty(switching.clientFiles[0],'code',{
    enumerable:true,configurable:true,
    get(){return ++reads<=2?approved:privateCopy;}
  });
  const safe=http.createServer(createScoGraphHandler(switching,namespaces,options));
  assert.equal(reads,2);
  await new Promise(resolve=>safe.listen(0,'127.0.0.1',resolve));
  try{
    const address=safe.address();
    assert.ok(address&&typeof address==='object');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/api.mjs');
    assert.equal(response.status,200);
    assert.doesNotMatch(await response.text(),/SERVER_PRIVATE_GRAPH_CANARY_78341/);
    assert.equal(reads,2,'Serving a request must not reread the mutable facade');
  }finally{
    await new Promise((resolve,reject)=>safe.close(error=>error?reject(error):resolve()));
  }

  // A JSON-roundtripped or shallow-copied manifest lacks the private
  // in-process seal, even when its public fields happen to be identical.
  assert.throws(()=>createScoGraphHandler(
    /** @type {ReturnType<typeof partitionScoAsyncGraph>} */ (JSON.parse(JSON.stringify(intact))),
    namespaces,options
  ),/requires a graph generated in this process/u);
});


test('SCO graph audits deployed source bytes for both exposed and private original ESM modules',async()=>{
  const files=[
    {path:'api.mjs',
      code:'import {secret} from "./private/engine.mjs";export async function evaluate(value){return secret+value;}'},
    {path:'private/engine.mjs',code:'export const secret=137;'}
  ];
  const graph=partitionScoAsyncGraph(files,{
    seed:'sco-graph-source-digests-20261116',exposedPaths:['api.mjs']
  });
  assert.deepEqual(graph.privateSourceDigests.map(item=>item.path),
    ['api.mjs','private/engine.mjs']);
  for(const item of graph.privateSourceDigests){
    assert.match(item.sha256,/^[0-9a-f]{64}$/u);
  }
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-graph-integrity-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    await assert.doesNotReject(()=>verifyScoPrivateSourceDigests(graph,root));

    await atomicWrite(path.join(root,'private/engine.mjs'),files[1].code+'\n');
    await assert.rejects(()=>verifyScoPrivateSourceDigests(graph,root),
      /SCO private source bytes changed since partition: private\/engine\.mjs/u);
    await atomicWrite(path.join(root,'private/engine.mjs'),files[1].code);

    await atomicWrite(path.join(root,'api.mjs'),files[0].code+' // accidentally changed');
    await assert.rejects(()=>verifyScoPrivateSourceDigests(graph,root),
      /SCO private source bytes changed since partition: api\.mjs/u);
    await atomicWrite(path.join(root,'api.mjs'),files[0].code);
    await assert.doesNotReject(()=>verifyScoPrivateSourceDigests(graph,root));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
