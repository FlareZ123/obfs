'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
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


test('SCO graph snapshots the approved exposedPaths getter before facade selection',async()=>{
  const files=[
    {path:'public.mjs',code:'export async function allowed(){return 7;}'},
    {path:'admin.mjs',code:'export async function adminOnly(){return 31337;}'}
  ];
  let reads=0;
  const graph=partitionScoAsyncGraph(files,{
    seed:'sco-graph-exposure-options-20261118',
    get exposedPaths(){
      reads++;
      return reads<=3?['public.mjs']:['admin.mjs'];
    }
  });
  assert.equal(reads,1,'The public export authorization list must be captured once');
  assert.deepEqual(graph.exposedPaths,['public.mjs']);
  assert.deepEqual(graph.privatePaths,['admin.mjs']);
  const server=http.createServer(createScoGraphHandler(graph,{
    'public.mjs':{allowed:async()=>7},
    'admin.mjs':{adminOnly:async()=>31337}
  },{authorizeRpc:()=>true}));
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await fetch(origin+'/obfs/public.mjs')).status,200);
    assert.equal((await fetch(origin+'/obfs/admin.mjs')).status,404);
    const rpc=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:graph.partitions['public.mjs'].methodNames.allowed,args:[]})
    });
    assert.equal(rpc.status,200);
    assert.deepEqual(await rpc.json(),{ok:true,value:7});
    assert.equal(reads,1,'Serving requests must not revisit caller-owned publication getters');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('SCO graph ignores a caller-owned exposedPaths iterator that changes authorized modules',()=>{
  const files=[
    {path:'public.mjs',code:'export async function allowed(){return 7;}'},
    {path:'admin.mjs',code:'export async function adminOnly(){return 31337;}'}
  ];
  const exposedPaths=['public.mjs'];
  exposedPaths[Symbol.iterator]=function*(){yield 'admin.mjs';};
  const graph=partitionScoAsyncGraph(files,{
    seed:'sco-graph-exposure-iterator-20261118',exposedPaths
  });
  assert.deepEqual(graph.exposedPaths,['public.mjs']);
  assert.deepEqual(graph.privatePaths,['admin.mjs']);
});

test('SCO graph ignores a forged file-array iterator and captures source once',()=>{
  let sourceReads=0;
  const approved={
    path:'public.mjs',
    get code(){
      sourceReads++;
      return sourceReads===1?
        'export async function allowed(){return 7;}':
        'export async function replaced(){return 31337;}';
    }
  };
  const files=[approved];
  files[Symbol.iterator]=function*(){
    yield {path:'admin.mjs',code:'export async function adminOnly(){return 31337;}'};
  };
  const graph=partitionScoAsyncGraph(files,{
    seed:'sco-graph-file-inventory-20261118',exposedPaths:['public.mjs']
  });
  assert.equal(sourceReads,1,'Compiler must use the same source bytes it validated');
  assert.deepEqual(graph.exposedPaths,['public.mjs']);
  assert.deepEqual(graph.privatePaths,[]);
  assert.ok(Object.hasOwn(graph.partitions['public.mjs'].methodNames,'allowed'));
});

test('SCO graph captures seed and endpoint accessor configuration once',()=>{
  let seedReads=0;
  let endpointReads=0;
  const graph=partitionScoAsyncGraph([
    {path:'first.mjs',code:'export async function first(){return 1;}'},
    {path:'second.mjs',code:'export async function second(){return 2;}'}
  ],{
    exposedPaths:['first.mjs','second.mjs'],
    get seed(){seedReads++;return seedReads===1?'graph-seed-20261118':'changed-seed';},
    get endpoint(){
      endpointReads++;
      return endpointReads===1?'/private/rpc':'/moved/rpc';
    }
  });
  assert.equal(seedReads,1);
  assert.equal(endpointReads,1);
  assert.equal(graph.partitions['first.mjs'].endpoint,'/private/rpc');
  assert.equal(graph.partitions['second.mjs'].endpoint,'/private/rpc');
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


test('composed SCO graph snapshots an accessor-backed route prefix for HTTP routing',async()=>{
  const graph=partitionScoAsyncGraph([{
    path:'remote.mjs',code:'export async function evaluate(x){return x+5;}'
  }],{
    seed:'sco-graph-routeprefix-options-20261118',
    exposedPaths:['remote.mjs']
  });
  let reads=0;
  const options={
    authorizeRpc:()=>true,
    get routePrefix(){
      reads++;
      return reads===1?'/obfs/':'/moved/';
    }
  };
  const handler=createScoGraphHandler(graph,{
    'remote.mjs':{evaluate:async (/** @type {number} */ x)=>x+5}
  },options);
  assert.equal(reads,1,'Endpoint admission and handler routing must share one option snapshot');
  const server=http.createServer(handler);
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await fetch(origin+'/obfs/remote.mjs')).status,200);
    const response=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        method:graph.partitions['remote.mjs'].methodNames.evaluate,args:[7]
      })
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,value:12});
    assert.equal(reads,1,'Runtime requests must not re-read untrusted options');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('SCO graph handler inherits a non-enumerable custom route prefix consistently',async()=>{
  const graph=partitionScoAsyncGraph([{
    path:'remote.mjs',code:'export async function evaluate(x){return x+5;}'
  }],{
    seed:'sco-graph-nonenumerable-routeprefix-20261118',
    exposedPaths:['remote.mjs'],
    endpoint:'/private/rpc'
  });
  for(const inherited of [false,true]){
    let reads=0;
    const options={authorizeRpc:()=>true};
    const holder=inherited?Object.create(null):options;
    Object.defineProperty(holder,'routePrefix',{
      configurable:true,enumerable:false,
      get(){reads++;return '/private/';}
    });
    if(inherited)Object.setPrototypeOf(options,holder);
    const handler=createScoGraphHandler(graph,{
      'remote.mjs':{evaluate:async (/** @type {number} */ x)=>x+5}
    },options);
    assert.equal(reads,1,'One route-prefix read is required for each option shape');
    const server=http.createServer(handler);
    try{
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const address=server.address();
      assert.ok(address&&typeof address==='object');
      const origin='http://127.0.0.1:'+address.port;
      assert.equal((await fetch(origin+'/private/remote.mjs')).status,200);
      assert.equal((await fetch(origin+'/obfs/remote.mjs')).status,404);
      const response=await fetch(origin+'/private/rpc',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({
          method:graph.partitions['remote.mjs'].methodNames.evaluate,args:[7]
        })
      });
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{ok:true,value:12});
      assert.equal(reads,1);
    }finally{
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    }
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


test('real Node ESM dynamic code evaluators can reach imports omitted from a static graph',async()=>{
  const original=
    'export async function inspect(){return (await eval(\'import("./hidden.mjs")\')).secret;}';
  const aliased=
    'const make=Function;export async function inspect(){return (await make(\'return import("./hidden.mjs")\')()).secret;}';
  const nodeLoader=
    'import {createRequire} from "node:module";const require=createRequire(import.meta.url);export async function inspect(){return require("./hidden.cjs").secret;}';
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-graph-dynamic-import-'));
  try{
    await atomicWrite(path.join(root,'api.mjs'),original);
    await atomicWrite(path.join(root,'alias.mjs'),aliased);
    await atomicWrite(path.join(root,'api-require.mjs'),nodeLoader);
    await atomicWrite(path.join(root,'hidden.mjs'),'export const secret=137;');
    await atomicWrite(path.join(root,'hidden.cjs'),'module.exports={secret:137};');
    const originalNamespace=await import(pathToFileURL(path.join(root,'api.mjs')).href);
    const aliasNamespace=await import(pathToFileURL(path.join(root,'alias.mjs')).href);
    const requiredNamespace=await import(pathToFileURL(path.join(root,'api-require.mjs')).href);
    assert.equal(await originalNamespace.inspect(),137);
    assert.equal(await aliasNamespace.inspect(),137);
    assert.equal(await requiredNamespace.inspect(),137);
    assert.throws(()=>partitionScoAsyncGraph([
      {path:'api-require.mjs',code:nodeLoader}
    ],{seed:'sco-graph-node-loader-20261116',exposedPaths:['api-require.mjs']}),
    /Private SCO graph cannot certify imports from runtime loader builtin/u);

    for(const file of [{path:'api.mjs',code:original},
      {path:'alias.mjs',code:aliased}]){
      // Compiler input intentionally lacks hidden.mjs. Native source resolves
      // it at runtime through a string the ordinary import walker cannot see.
      assert.throws(()=>partitionScoAsyncGraph([file],{
        seed:'sco-graph-hidden-native-loader-20261116',exposedPaths:[file.path]
      }),/Private SCO graph cannot prove imports through eval or Function/u);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});


test('SCO graph refuses inspector protocol evaluation that loads undeclared server modules',async()=>{
  const inspectorSource=[
    "import inspector from \"node:inspector\";",
    "export async function inspect(){",
    "  const session=new inspector.Session();",
    "  session.connect();",
    "  const expression='process.getBuiltinModule(\"module\").createRequire('+JSON.stringify(import.meta.url)+')(\"./hidden.cjs\").secret';",
    "  return await new Promise((resolve,reject)=>{",
    "    session.post(\"Runtime.evaluate\",{expression,returnByValue:true},(error,result)=>{",
    "      session.disconnect();",
    "      if(error||result.exceptionDetails){reject(error??new Error(\"Inspector evaluation failed\"));return;}",
    "      resolve(result.result.value);",
    "    });",
    "  });",
    "}"
  ].join('\n');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-inspector-loader-'));
  try{
    await atomicWrite(path.join(root,'inspector.mjs'),inspectorSource);
    await atomicWrite(path.join(root,'hidden.cjs'),'module.exports={secret:137};');
    const original=await import(pathToFileURL(path.join(root,'inspector.mjs')).href);
    assert.equal(await original.inspect(),137,'Native Inspector can execute hidden CommonJS loader code');
    for(const specifier of ['node:inspector','node:inspector/promises']){
      const candidate=inspectorSource.replace('node:inspector',specifier);
      assert.throws(()=>partitionScoAsyncGraph([{
        path:'inspector.mjs',code:candidate
      }],{seed:'sco-inspector-dynamic-loader-20261118',
        exposedPaths:['inspector.mjs']}),
      /Private SCO graph cannot certify imports from runtime loader builtin/u);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
