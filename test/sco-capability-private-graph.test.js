'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {createHash,createHmac,randomBytes}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {
  partitionScoAsyncGraph,createScoGraphHandler,verifyScoPrivateSourceDigests,
  createScoCapabilityScope,createScoPrivateHandles
}=require('../src');

/**
 * Cross-module integration: a generated public API ESM imports private state
 * and private keyed crypto through two nested original .mjs files. The
 * compiler must serve only its reviewed API facade, while keeping both
 * imported modules and all handle records on the trusted server.
 */
test('SCO closed three-file graph preserves principal-scoped private handle behavior',{
  timeout:30000
},async()=>{
  const key=randomBytes(32);
  const keyHex=key.toString('hex');
  const canary='SCO_GRAPH_PRIVATE_KEY_MUST_NOT_PUBLISH';
  /** @type {import('../src/sco-graph').ScoPrivateModule[]} */
  const sources=[
    {
      path:'secrets.mjs',sourceType:/** @type {'module'} */('module'),
      code:[
        "import {createHmac} from 'node:crypto';",
        'const secret=Buffer.from('+JSON.stringify(keyHex)+",'hex');",
        'export const canary='+JSON.stringify(canary)+';',
        'export function digest(position,input){',
        " return createHmac('sha256',secret).update(String(position)).update(':').update(input).digest('hex');",
        '}'
      ].join('\n')
    },
    {
      path:'state.mjs',sourceType:/** @type {'module'} */('module'),
      code:[
        "import {digest} from './secrets.mjs';",
        'const handles=globalThis.__SCO_GRAPH_PRIVATE_HANDLES__;',
        'export function issue(){return handles.issue({position:0});}',
        'export function run(token,values){',
        ' return handles.use(token,state=>values.map(v=>digest(state.position++,v)));',
        '}',
        'export function revoke(token){return handles.revoke(token);}'
      ].join('\n')
    },
    {
      path:'api.mjs',sourceType:/** @type {'module'} */('module'),
      code:[
        "import {issue,run,revoke} from './state.mjs';",
        'export async function begin(){return issue();}',
        'export async function batch(token,values){return run(token,values);}',
        'export async function close(token){return revoke(token);}'
      ].join('\n')
    }
  ];
  const graph=partitionScoAsyncGraph(sources,{
    exposedPaths:['api.mjs'],seed:'capability-graph-2026-11-17'
  });
  assert.deepEqual(graph.exposedPaths,['api.mjs']);
  assert.deepEqual([...graph.privatePaths].sort(),['secrets.mjs','state.mjs']);
  assert.equal(graph.clientFiles.length,1);
  const publicCode=graph.clientFiles[0].code;
  const publicSha256=createHash('sha256').update(publicCode).digest('hex');
  assert.equal(publicCode.includes(keyHex),false);
  assert.equal(publicCode.includes(canary),false);
  assert.equal(publicCode.includes('createHmac'),false);
  assert.equal(publicCode.includes('./state.mjs'),false);
  assert.equal(publicCode.includes('./secrets.mjs'),false);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-graph-capability-'));
  const globals=/** @type {Record<string,unknown>} */(/** @type {unknown} */(globalThis));
  const nativeFetch=globalThis.fetch;
  /** @type {http.Server|undefined} */let server;
  try{
    for(const item of sources){
      await atomicWrite(path.join(root,item.path),item.code);
    }
    await verifyScoPrivateSourceDigests(graph,root);
    // Even a non-exposed import must fail the reviewed-source digest check.
    const secretPath=path.join(root,'secrets.mjs');
    await atomicWrite(secretPath,sources[0].code.replace('String(position)','String(position+1)'));
    await assert.rejects(verifyScoPrivateSourceDigests(graph,root));
    await atomicWrite(secretPath,sources[0].code);
    await verifyScoPrivateSourceDigests(graph,root);

    const scope=createScoCapabilityScope(request=>{
      if(request.headers['x-verified-account']==='verified-A')return 'account-A';
      if(request.headers['x-verified-account']==='verified-B')return 'account-B';
      return 'unauthenticated';
    });
    const handles=createScoPrivateHandles(scope.currentPrincipal);
    globals.__SCO_GRAPH_PRIVATE_HANDLES__=handles;
    const api=await import(pathToFileURL(path.join(root,'api.mjs')).href);
    delete globals.__SCO_GRAPH_PRIVATE_HANDLES__;
    const ids=graph.partitions['api.mjs'].methodNames;
    server=http.createServer(createScoGraphHandler(graph,{'api.mjs':api},{
      authorizeRead:()=>true,
      authorizeRpc:request=>request.headers['x-verified-account']==='verified-A'||
        request.headers['x-verified-account']==='verified-B',
      authorizeOperation:(request,method,args)=>{
        const valid=request.headers['x-verified-account']==='verified-A'||
          request.headers['x-verified-account']==='verified-B';
        if(!valid)return false;
        if(method===ids.begin)return args.length===0;
        if(method===ids.close)return args.length===1&&typeof args[0]==='string';
        return method===ids.batch&&args.length===2&&
          typeof args[0]==='string'&&Array.isArray(args[1])&&
          args[1].length>=1&&args[1].length<=16&&
          args[1].every(v=>typeof v==='string'&&/^[0-9a-f]{32}$/u.test(v));
      },
      runRpcIsolated:scope.runRpcIsolated
    }));
    const running=server;
    await new Promise(resolve=>running.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=running.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    for(const file of ['secrets.mjs','state.mjs']){
      const denied=await nativeFetch(origin+'/obfs/'+file);
      assert.equal(denied.status,404);
    }
    const deniedRpc=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:ids.begin,args:[]})
    });
    assert.equal(deniedRpc.status,403);
    const publicResponse=await nativeFetch(origin+'/obfs/api.mjs');
    assert.equal(publicResponse.status,200);
    const served=await publicResponse.text();
    assert.equal(served,publicCode);
    const servedPath=path.join(root,'served.mjs');
    await atomicWrite(servedPath,served);
    let account='verified-A';
    globalThis.fetch=/** @type {typeof fetch} */(async(input,options)=>{
      const headers=new Headers(options?.headers);
      headers.set('x-verified-account',account);
      return nativeFetch(new URL(String(input),origin),{...options,headers});
    });
    /** @type {{
     * begin:()=>Promise<string>,
     * batch:(token:string,values:string[])=>Promise<string[]>,
     * close:(token:string)=>Promise<boolean>
     * }} */
    const facade=await import(pathToFileURL(servedPath).href);
    const token=await facade.begin();
    const inputs=Array.from({length:8},(_,index)=>
      createHash('sha256').update('graph-input-'+index).digest('hex').slice(0,32));
    const first=await facade.batch(token,inputs.slice(0,3));
    let counter=0;
    const expected=inputs.map(v=>createHmac('sha256',key)
      .update(String(counter++)).update(':').update(v).digest('hex'));
    assert.deepEqual(first,expected.slice(0,3));
    account='verified-B';
    await assert.rejects(facade.batch(token,inputs.slice(3,4)),
      /Remote operation failed/);
    account='verified-A';
    assert.deepEqual(await facade.batch(token,inputs.slice(3)),expected.slice(3));
    assert.equal(await facade.close(token),true);
    await assert.rejects(facade.batch(token,inputs.slice(0,1)),
      /Remote operation failed/);

    // Exercise the actual HTTP principal resolver with concurrent requests
    // through distinct, server-private graph handles. Each principal should
    // have an independent state counter, even while promises interleave.
    /** @param {'verified-A'|'verified-B'} principal
     *  @param {string} method
     *  @param {unknown[]} args
     *  @returns {Promise<any>}
     */
    async function invoke(principal,method,args){
      const result=await nativeFetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json',
          'x-verified-account':principal},
        body:JSON.stringify({method,args})
      });
      assert.equal(result.status,200);
      const envelope=/** @type {{ok:boolean,value:any}} */(await result.json());
      assert.equal(envelope.ok,true);
      return envelope.value;
    }
    const [tokenA,tokenB]=await Promise.all([
      invoke('verified-A',ids.begin,[]),
      invoke('verified-B',ids.begin,[])
    ]);
    assert.match(tokenA,/^[A-Za-z0-9_-]{43}$/u);
    assert.match(tokenB,/^[A-Za-z0-9_-]{43}$/u);
    assert.notEqual(tokenA,tokenB);
    const sameInputA='a'.repeat(32),sameInputB='b'.repeat(32);
    const invoked=await Promise.all([
      ...Array.from({length:8},()=>invoke('verified-A',ids.batch,[tokenA,[sameInputA]])),
      ...Array.from({length:8},()=>invoke('verified-B',ids.batch,[tokenB,[sameInputB]]))
    ]);
    const expectedA=Array.from({length:8},(_,counter)=>
      createHmac('sha256',key).update(String(counter)).update(':')
        .update(sameInputA).digest('hex')).sort();
    const expectedB=Array.from({length:8},(_,counter)=>
      createHmac('sha256',key).update(String(counter)).update(':')
        .update(sameInputB).digest('hex')).sort();
    assert.deepEqual(invoked.slice(0,8).map(value=>value[0]).sort(),expectedA);
    assert.deepEqual(invoked.slice(8).map(value=>value[0]).sort(),expectedB);
    assert.equal(await invoke('verified-A',ids.close,[tokenA]),true);
    assert.equal(await invoke('verified-B',ids.close,[tokenB]),true);
    console.log(JSON.stringify({privateModules:3,publicFiles:1,
      privateDependencyPathsDenied:2,unauthenticatedRpcStatus:403,
      crossAccountReplayDenied:true,revokedTokenDenied:true,
      outputsMatched:inputs.length,concurrentPrincipals:2,
      concurrentOutputsMatched:16,verifiedSecretDigestSeal:true,
      generatedPublicSha256:publicSha256}));
  }finally{
    globalThis.fetch=nativeFetch;
    delete globals.__SCO_GRAPH_PRIVATE_HANDLES__;
    if(server){
      const running=server;
      await new Promise((resolve,reject)=>
        running.close(error=>error?reject(error):resolve(undefined)));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
});
