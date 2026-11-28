'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {ordinaryFacade}=require('../sims/agent18-equaltrust-facade.cjs');
const {build,ROOT,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');

const runFile=promisify(execFile);

/** @param {number[]} observations @returns {number} */
function median(observations){
  const ordered=[...observations].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/** @param {unknown} value @returns {unknown} */
function wire(value){return JSON.parse(JSON.stringify(value));}

/**
 * Use caller+server **process CPU** in one Node process. This boundary is
 * comparable for three local invocation methods, but is not browser CPU,
 * wall time over a WAN, a proof of a universal 2.5x bound, or an isolated
 * client-side compute measurement.
 *
 * @param {()=>Promise<unknown>} execute
 * @returns {Promise<{ms:number,result:unknown}>}
 */
async function processCpu(execute){
  const before=process.cpuUsage();
  const result=await execute();
  const cpu=process.cpuUsage(before);
  return {ms:(cpu.user+cpu.system)/1000,result:wire(result)};
}

/**
 * Rotate a 1,024-value deterministic input corpus between paired trials.
 * Native's longer repetitions replay this same corpus rather than using a
 * constant seed whose JIT specialization could bias the comparison.
 * @param {number} base
 * @param {number} index
 * @returns {number}
 */
function varyingSeed(base,index){
  return (base^Math.imul(index%1024,0x9e3779b1))>>>0;
}

/**
 * Aggregate many independent API calls *without* batching them into a
 * single RPC. This only overcomes coarse Windows CPU timer quantization;
 * every generated/ordinary invocation still incurs its own HTTP request.
 * Divide process-wide CPU by repetitions. Different repetition counts are
 * recorded explicitly because the very thin native operation needs many
 * more repetitions to cross the 15–16 ms Windows CPU clock quantum.
 *
 * @param {(seed:number)=>Promise<unknown>} execute
 * @param {number} repetitions
 * @param {unknown} expectedFirst
 * @param {unknown} expectedLast
 * @param {number} trialSeed
 * @returns {Promise<{cpuMsTotal:number,cpuMsPerCall:number,
 *   wallMsPerCall:number,repetitions:number}>}
 */
async function repeatedProcessCpu(execute,repetitions,expectedFirst,expectedLast,trialSeed){
  const start=process.cpuUsage();
  const wallStart=performance.now();
  for(let i=0;i<repetitions;i++){
    const value=await execute(varyingSeed(trialSeed,i));
    if(i===0)assert.deepEqual(wire(value),expectedFirst);
    if(i===repetitions-1)assert.deepEqual(wire(value),expectedLast);
  }
  const wallMsTotal=performance.now()-wallStart;
  const usage=process.cpuUsage(start);
  const cpuMsTotal=(usage.user+usage.system)/1000;
  return {cpuMsTotal,cpuMsPerCall:cpuMsTotal/repetitions,
    wallMsPerCall:wallMsTotal/repetitions,repetitions};
}

test('frozen six-module SCO app and equal-trust minified RPC client have identical authenticated online relay',{
  timeout:90000
},async()=>{
  const oldFetch=globalThis.fetch;
  const oldWindow=globalThis.window;
  const token=randomBytes(24).toString('hex');
  /** @type {Awaited<ReturnType<typeof startServer>>|undefined} */
  let service;
  /** @type {string|undefined} */
  let temp;
  try{
    const graph=await build();
    assert.deepEqual(graph.exposedPaths,[EXPOSED]);
    assert.equal(graph.privatePaths.length,5);
    const method=graph.partitions[EXPOSED].methodNames.evaluateRemote;
    const source=graph.clientFiles[0].code;
    assert.equal(source,await fs.readFile(
      path.join(ROOT,'sco-public',EXPOSED),'utf8'));
    const control=ordinaryFacade(method);
    assert.ok(source.length>0&&control.length>0);
    for(const published of [source,control]){
      assert.equal(published.includes('0x7feb352d'),false);
      assert.equal(published.includes('secretOffset'),false);
      assert.equal(published.includes('secretSalt'),false);
      assert.equal(published.includes('externalValue'),false);
    }
    // Both clients use one actual server/authorization implementation, so a
    // distinct server implementation cannot explain any protection advantage.
    const startup=performance.now();
    service=await startServer({token});
    const initializationMs=performance.now()-startup;
    const {origin,native}=service;
    const anonRead=await oldFetch(origin+'/obfs/'+EXPOSED);
    assert.equal(anonRead.status,403);
    const authorizedRead=await oldFetch(origin+'/obfs/'+EXPOSED,{
      headers:{'x-demo-token':token}
    });
    assert.equal(authorizedRead.status,200);
    assert.equal(await authorizedRead.text(),source);
    const anonRpc=await oldFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method,args:[5,100]})
    });
    assert.equal(anonRpc.status,403);
    for(const [invalid,expectedStatus] of [
      [{method:'forged-extra-operation',args:[5,100]},400],
      [{method,args:[5,150001]},403],
      [{method,args:['5',100]},403]
    ]){
      const forged=await oldFetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-demo-token':token},
        body:JSON.stringify(invalid)
      });
      assert.equal(forged.status,expectedStatus,
        'The server, not the copied public facade, must reject tampering');
    }

    const emitted=await import('data:text/javascript;base64,'+
      Buffer.from(source).toString('base64'));
    const ordinary=await import('data:text/javascript;base64,'+
      Buffer.from(control).toString('base64'));
    /** @type {{method:string,args:number[]}|undefined} */
    let lastWire;
    let record=false;
    globalThis.fetch=/** @type {typeof fetch} */ ((url,options)=>{
      if(record&&options?.method==='POST'&&typeof options.body==='string'){
        lastWire=JSON.parse(options.body);
      }
      return oldFetch(new URL(String(url),origin),{
        ...options,headers:{...options?.headers,'x-demo-token':token}
      });
    });

    /** @param {(seed:number,count:number)=>Promise<unknown>} invoke
      * @param {number} seed @param {number} count
      * @returns {Promise<{value:unknown,call:{method:string,args:number[]}}>}
      */
    async function capture(invoke,seed,count){
      lastWire=undefined;
      record=true;
      try{
        const value=await invoke(seed,count);
        assert.ok(lastWire,'Expected a visible RPC wire request');
        return {value:wire(value),call:lastWire};
      }finally{
        record=false;
      }
    }
    const firstSco=await capture(emitted.evaluateRemote,17,400);
    const firstOrdinary=await capture(ordinary.evaluateRemote,17,400);
    assert.deepEqual(firstSco.value,firstOrdinary.value);
    assert.deepEqual(firstSco.call,{method,args:[17,400]});
    assert.deepEqual(firstOrdinary.call,{method,args:[17,400]});

    // The independent attacker receives only the public facade, host and a
    // legitimate account token in a fresh process; never native source.
    temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-equal-trust-app-'));
    const scoFile=path.join(temp,'generated.mjs');
    const ordinaryFile=path.join(temp,'ordinary.mjs');
    await fs.writeFile(scoFile,source,'utf8');
    await fs.writeFile(ordinaryFile,control,'utf8');
    const heldouts=Array.from({length:40},(_,i)=>[
      (Math.imul(i+24551,0x85ebca6b)^(i<<7))>>>0,
      500+((i*137)%3000)
    ]);
    const expected=await Promise.all(heldouts.map(
      async ([seed,count])=>wire(await native(seed,count))));
    const worker=path.join(__dirname,
      '../sims/application-challenge-sco-relay-child.cjs');
    /** @param {string} facade @returns {Promise<unknown[]>} */
    async function relay(facade){
      const output=await runFile(process.execPath,[
        worker,facade,origin,token,JSON.stringify(heldouts)
      ],{encoding:'utf8',timeout:40000,maxBuffer:1024*1024});
      return /** @type {unknown[]} */ (JSON.parse(output.stdout));
    }
    assert.deepEqual(await relay(scoFile),expected);
    assert.deepEqual(await relay(ordinaryFile),expected);
    // A second attacker does not even copy or import either public facade.
    // One intercepted method ID suffices to replay held-out operations from
    // a fresh process under the same legitimate account credentials.
    const traceWorker=path.join(__dirname,
      '../sims/agent18-application-rpc-wire-relay.cjs');
    for(const observed of [firstSco.call,firstOrdinary.call]){
      const replay=await runFile(process.execPath,[
        traceWorker,origin,token,observed.method,JSON.stringify(heldouts)
      ],{encoding:'utf8',timeout:40000,maxBuffer:1024*1024});
      assert.deepEqual(JSON.parse(replay.stdout),expected);
    }
    // Stronger *static* clone: one independent child receives only a
    // published facade file, service origin and legitimate account token.
    // It discovers the literal method/endpoint without ever importing or
    // evaluating either public module (and without the private source).
    const staticWorker=path.join(__dirname,
      '../sims/agent18-application-static-rpc-relay.cjs');
    for(const facade of [scoFile,ordinaryFile]){
      const copy=await runFile(process.execPath,[
        staticWorker,facade,origin,token,JSON.stringify(heldouts)
      ],{encoding:'utf8',timeout:40000,maxBuffer:1024*1024});
      assert.deepEqual(JSON.parse(copy.stdout),expected);
    }

    /** @type {Record<'light'|'heavy',{
      native:number[],generated:number[],ordinary:number[]}>} */
    const samples={
      light:{native:[],generated:[],ordinary:[]},
      heavy:{native:[],generated:[],ordinary:[]}
    };
    for(const [label,count] of /** @type {const} */ ([
      ['light',1],['heavy',120000]
    ])){
      const results=samples[label];
      for(let warm=0;warm<3;warm++){
        await native(0x12345678,count);
        await emitted.evaluateRemote(0x12345678,count);
        await ordinary.evaluateRemote(0x12345678,count);
      }
      const expectedResult=wire(await native(0x12345678,count));
      const methods={
        native:()=>native(0x12345678,count),
        generated:()=>emitted.evaluateRemote(0x12345678,count),
        ordinary:()=>ordinary.evaluateRemote(0x12345678,count)
      };
      for(let i=0;i<9;i++){
        const order=/** @type {('native'|'generated'|'ordinary')[]} */ (
          i%2?['ordinary','generated','native']:
            ['native','generated','ordinary']);
        for(const kind of order){
          const measurement=await processCpu(methods[kind]);
          assert.deepEqual(measurement.result,expectedResult);
          results[kind].push(measurement.ms);
        }
      }
    }
    /** @type {Record<string,unknown>} */
    const paired={};
    for(const [name,group] of Object.entries(samples)){
      const ratios=group.native.map((n,i)=>({
        generatedOverNative:group.generated[i]/n,
        ordinaryOverNative:group.ordinary[i]/n,
        generatedOverOrdinary:group.generated[i]/group.ordinary[i]
      }));
      paired[name]={
        rawMs:group,
        medianGeneratedOverNative:median(ratios.map(x=>x.generatedOverNative)),
        medianOrdinaryOverNative:median(ratios.map(x=>x.ordinaryOverNative)),
        medianGeneratedOverOrdinary:median(ratios.map(x=>x.generatedOverOrdinary)),
        generatedBreaches:ratios.filter(x=>x.generatedOverNative>2.5).length,
        ordinaryBreaches:ratios.filter(x=>x.ordinaryOverNative>2.5).length
      };
    }
    /** @type {Record<string,unknown>} */
    const batchedCpu={};
    for(const [label,count,repetitions] of /** @type {const} */ ([
      ['light',1,{native:32768,generated:1024,ordinary:1024}],
      ['heavy',120000,{native:128,generated:128,ordinary:128}]
    ])){
      const methods={
        native:(/** @type {number} */ seed)=>native(seed,count),
        generated:(/** @type {number} */ seed)=>emitted.evaluateRemote(seed,count),
        ordinary:(/** @type {number} */ seed)=>ordinary.evaluateRemote(seed,count)
      };
      /** @type {{native:number[],generated:number[],ordinary:number[]}} */
      const cpuMsPerCall={native:[],generated:[],ordinary:[]};
      /** @type {{native:number[],generated:number[],ordinary:number[]}} */
      const wallMsPerCall={native:[],generated:[],ordinary:[]};
      /** @type {{native:number[],generated:number[],ordinary:number[]}} */
      const cpuMsTotal={native:[],generated:[],ordinary:[]};
      for(let index=0;index<7;index++){
        const order=/** @type {('native'|'generated'|'ordinary')[]} */ (
          index%2?['ordinary','generated','native']:
            ['native','generated','ordinary']);
        const trialSeed=(0x12345678^Math.imul(index+1,0x85ebca6b))>>>0;
        for(const kind of order){
          const n=repetitions[kind];
          const expectedFirst=wire(await native(varyingSeed(trialSeed,0),count));
          const expectedLast=wire(await native(varyingSeed(trialSeed,n-1),count));
          const measurement=await repeatedProcessCpu(
            methods[kind],n,expectedFirst,expectedLast,trialSeed);
          cpuMsPerCall[kind].push(measurement.cpuMsPerCall);
          wallMsPerCall[kind].push(measurement.wallMsPerCall);
          cpuMsTotal[kind].push(measurement.cpuMsTotal);
        }
      }
      const valid=cpuMsPerCall.native.map((n,i)=>(
        n>0&&cpuMsPerCall.generated[i]>0&&cpuMsPerCall.ordinary[i]>0?
          {generatedOverNative:cpuMsPerCall.generated[i]/n,
            ordinaryOverNative:cpuMsPerCall.ordinary[i]/n,
            generatedOverOrdinary:cpuMsPerCall.generated[i]/cpuMsPerCall.ordinary[i]}
          :null
      )).filter((ratio)=>ratio!==null);
      batchedCpu[label]={
        repetitions,rawCpuMsTotal:cpuMsTotal,perCallCpuMs:cpuMsPerCall,
        perCallWallMs:wallMsPerCall,validCpuPairs:valid.length,
        invalidCpuPairs:7-valid.length,
        medianGeneratedOverNative:valid.length?
          median(valid.map(x=>x.generatedOverNative)):null,
        medianOrdinaryOverNative:valid.length?
          median(valid.map(x=>x.ordinaryOverNative)):null,
        medianGeneratedOverOrdinary:valid.length?
          median(valid.map(x=>x.generatedOverOrdinary)):null,
        generatedStrictBreaches:valid.filter(x=>x.generatedOverNative>2.5).length,
        ordinaryStrictBreaches:valid.filter(x=>x.ordinaryOverNative>2.5).length
      };
    }
    process.stdout.write('APPLICATION_EQUAL_TRUST_SCO '+JSON.stringify({
      node:process.version,os:process.platform,
      originalPrivateModules:5,distributedFacades:1,
      originalPublicBytes:Buffer.byteLength(source),
      ordinaryPublicBytes:Buffer.byteLength(control),
      ordinaryMinifier:'esbuild',
      authorization:403,heldoutOnlineRelays:heldouts.length,
      facadeFreeWireReplayHeldouts:heldouts.length,
      staticSourceOnlyReplayHeldouts:heldouts.length,
      identicalAuthenticatedWire:firstSco.call,
      initializationMs,paired,batchedCpu,
      cpuCaveat:'Unbatched Windows CPU timers can quantize sub-16ms work to zero; compare only valid batched pairs',
      batchedInput:'1024 varying seeded inputs per trial; rotated across seven paired trials',
      scope:'Same private server; loopback HTTP; caller+server process CPU after startup; independently repeated RPCs'
    })+'\n');
  }finally{
    globalThis.fetch=oldFetch;
    if(oldWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=oldWindow;
    if(service){
      const server=service.server;
      await new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve(undefined)));
    }
    if(temp)await fs.rm(temp,{recursive:true,force:true});
  }
});
