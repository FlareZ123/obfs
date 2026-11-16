'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const {build,ROOT,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');

const executeFile=promisify(execFile);
/** @param {unknown} value @returns {unknown} */
function wire(value){return JSON.parse(JSON.stringify(value));}
/** @param {number[]} values @returns {number} */
function median(values){return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];}

test('SCO private application withholds code and permits an online authorized clone',async()=>{
  const graph=await build();
  assert.deepEqual(graph.exposedPaths,[EXPOSED]);
  assert.equal(graph.privatePaths.length,5);
  assert.equal(graph.clientFiles.length,1);
  assert.equal(graph.clientFiles[0].code,
    await fs.readFile(path.join(ROOT,'sco-public',EXPOSED),'utf8'));
  const generated=graph.clientFiles[0].code;
  assert.ok(!generated.includes('0x7feb352d'));
  assert.ok(!generated.includes('externalValue'));
  assert.ok(!generated.includes('secretOffset'));
  assert.ok(!generated.includes('secretSalt'));
  assert.ok(!generated.includes('evaluate(seed,count)'));

  const oldFetch=globalThis.fetch;
  const oldWindow=globalThis.window;
  const started=performance.now();
  /** @type {Awaited<ReturnType<typeof startServer>>|undefined} */
  let service;
  /** @type {string|undefined} */
  let temporary;
  try{
    service=await startServer({token:'public-client-fixture-token-2026'});
    const initializationMs=performance.now()-started;
    const {origin,token,native}=service;
    const authorization={headers:{'x-demo-token':token}};
    assert.equal((await oldFetch(origin+'/obfs/'+EXPOSED)).status,403);
    assert.equal((await oldFetch(origin+'/obfs/before/engine.mjs',authorization)).status,404);
    assert.equal((await oldFetch(origin+'/obfs/before/private.mjs',authorization)).status,404);
    const publicResponse=await oldFetch(origin+'/obfs/'+EXPOSED,authorization);
    assert.equal(publicResponse.status,200);
    assert.equal(await publicResponse.text(),generated);

    const method=graph.partitions[EXPOSED].methodNames.evaluateRemote;
    assert.equal((await oldFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method,args:[17,100]})
    })).status,403);
    const invalid=await oldFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json','x-demo-token':token},
      body:JSON.stringify({method,args:[17,150001]})
    });
    assert.equal(invalid.status,403);

    globalThis.fetch=(input,options)=>oldFetch(new URL(
      /** @type {string} */ (input),origin).href,{
      ...options,headers:{...options?.headers,'x-demo-token':token}
    });
    const client=await import(pathToFileURL(path.join(ROOT,'sco-public',EXPOSED)).href);
    const cases=[
      [0,0],[0,1],[1,1],[4294967295,3000],
      ...Array.from({length:32},(_,i)=>[
        (Math.imul(i+101,0x9e3779b1)^i)>>>0,(i*137)%4000
      ])
    ];
    for(const [seed,count] of cases){
      assert.deepEqual(await client.evaluateRemote(seed,count),wire(await native(seed,count)));
    }

    // A separate child process has only a copied public facade and its
    // legitimate session token. It can relay new requests to the real server.
    temporary=await fs.mkdtemp(path.join(os.tmpdir(),'sco-app-attacker-'));
    const isolatedFacade=path.join(temporary,'facade.mjs');
    await fs.writeFile(isolatedFacade,generated,'utf8');
    const heldout=Array.from({length:40},(_,i)=>[
      (Math.imul(i+30203,0x85ebca6b)^(i<<9))>>>0,1000+i*59
    ]);
    const {stdout}=await executeFile(process.execPath,[
      path.join(__dirname,'../sims/application-challenge-sco-relay-child.cjs'),
      isolatedFacade,origin,token,JSON.stringify(heldout)
    ],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
    const onlineClone=JSON.parse(stdout);
    assert.deepEqual(onlineClone,await Promise.all(heldout.map(
      async ([seed,count])=>wire(await native(seed,count)))));

    /** @type {Record<'heavy'|'light',{native:number[],remote:number[]}>} */
    const timings={heavy:{native:[],remote:[]},light:{native:[],remote:[]}};
    for(const [label,count] of [['heavy',120000],['light',1]]){
      const group=timings[/** @type {'heavy'|'light'} */(label)];
      for(let warm=0;warm<3;warm++){
        await native(0x12345678,count);
        await client.evaluateRemote(0x12345678,count);
      }
      for(let trial=0;trial<9;trial++){
        const sequence=trial%2===0?['native','remote']:['remote','native'];
        for(const kind of sequence){
          const before=performance.now();
          const actual=kind==='native'?
            await native(0x12345678,count):
            await client.evaluateRemote(0x12345678,count);
          const duration=performance.now()-before;
          assert.ok(actual&&typeof actual==='object');
          group[/** @type {'native'|'remote'} */(kind)].push(duration);
        }
      }
    }
    process.stdout.write('APPLICATION_SCO_PROFILE '+JSON.stringify({
      platform:process.platform,node:process.version,
      initializationMs,
      privateModules:graph.privatePaths.length,
      distributedModules:graph.clientFiles.length,
      clientBytes:Buffer.byteLength(generated),
      nativeAndRemoteCases:cases.length,
      authorizedRelayHeldouts:heldout.length,
      sourceDenied:true,unauthorizedRpcDenied:true,
      heavy:{
        count:120000,
        nativeMs:median(timings.heavy.native),
        remoteMs:median(timings.heavy.remote),
        ratio:median(timings.heavy.remote)/median(timings.heavy.native),
        samples:timings.heavy
      },
      light:{
        count:1,
        nativeMs:median(timings.light.native),
        remoteMs:median(timings.light.remote),
        ratio:median(timings.light.remote)/median(timings.light.native),
        samples:timings.light
      },
      scope:'Loopback HTTP/1.1, warmed calls, authorized local relay, no TLS or WAN RTT'
    })+'\n');
  }finally{
    globalThis.fetch=oldFetch;
    if(oldWindow===undefined)delete globalThis.window;
    else globalThis.window=oldWindow;
    if(service)await new Promise((resolve,reject)=>service.server.close(
      error=>error?reject(error):resolve()));
    if(temporary)await fs.rm(temporary,{recursive:true,force:true});
  }
});
