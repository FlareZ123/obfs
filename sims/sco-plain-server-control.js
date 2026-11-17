'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AsyncLocalStorage}=require('node:async_hooks');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createHash,randomBytes}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {hrtime,cpuUsage}=require('node:process');
const {atomicWrite}=require('../src/atomic');
const {createScoHandler,createScoKeyedIsolation,partitionScoAsyncModule,bindScoModuleExports}=
  require('../src');

/** @typedef {'native'|'generated'|'manual'} Mode */
/** @typedef {{mode:Mode,wallMs:number,cpuMs:number,values:string[]}} Sample */

/** @param {string} tag @param {number} index @returns {string} */
function challenge(tag,index) {
  return createHash('sha256').update(tag+':'+index).digest('hex');
}

/** @param {http.Server} server @returns {Promise<number>} */
async function listen(server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const bound=server.address();
  if(!bound||typeof bound==='string')throw Error('Missing TCP address');
  return bound.port;
}

/** @param {http.Server} server @returns {Promise<void>} */
async function close(server) {
  await new Promise((resolve,reject)=>
    server.close(error=>error?reject(error):resolve(undefined)));
}

/** @param {number[]} values @returns {number} */
function median(values) {
  return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
}

/**
 * A same-private-code comparison of the actual SCO partition facade with
 * a manually written, conventional authenticated HTTP RPC facade. Both
 * use the same handler and trusted private HMAC implementation. This is a
 * trust-boundary experiment, not a private-token capability-store test.
 *
 * @param {number} [repeats]
 * @returns {Promise<Record<string,unknown>>}
 */
async function compare(repeats=8) {
  assert.ok(Number.isSafeInteger(repeats)&&repeats>=1&&repeats<=12);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sco-plain-control-'));
  const originalFetch=globalThis.fetch;
  const globals=/** @type {Record<string,unknown>} */ (/** @type {unknown} */ (globalThis));
  const keyHex=randomBytes(32).toString('hex');
  const canary='sco-only-private-hmac-conventional-control-canary';
  const privateSource=[
    "import {createHmac} from 'node:crypto';",
    'const key=Buffer.from('+JSON.stringify(keyHex)+',"hex");',
    'const canary='+JSON.stringify(canary)+';',
    'const work=Buffer.alloc(8*1024*1024,0x5a);',
    'const principalContext=globalThis.__SCO_MATCHED_AUDIENCE_CONTEXT__;',
    'export async function derive(input){',
    ' if(typeof input!=="string"||!/^[a-f0-9]{64}$/.test(input))throw TypeError("input");',
    ' const principal=principalContext.getStore();',
    ' if(principal!=="account-A"&&principal!=="account-B")throw Error("audience");',
    ' return createHmac("sha256",key).update(canary).update("|").update(principal)',
    '  .update("|").update(input).update(work).digest("hex");',
    '}'
  ].join('\n');
  const conventionalSource=[
    'const send=async(method,args)=>{',
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",',
    'headers:{"content-type":"application/json"},body:JSON.stringify({method,args})});',
    'const payload=await response.json();',
    'if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");',
    'return payload.value;};',
    'export async function derive(input){return await send("plain-digest",[...arguments]);}'
  ].join('\n');
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const accounts=new Map([[tokenA,'account-A'],[tokenB,'account-B']]);
  /** @type {AsyncLocalStorage<string>} */
  const context=new AsyncLocalStorage();
  /** @param {http.IncomingMessage} request @returns {string} */
  const principalOf=request=>{
    const header=request.headers['x-test-session'];
    const cookie=request.headers.cookie;
    const token=typeof header==='string'?header:
      typeof cookie==='string'&&cookie.startsWith('session=')?cookie.slice(8):undefined;
    return typeof token==='string' ? accounts.get(token)??'unverified' : 'unverified';
  };
  const isolation=createScoKeyedIsolation(principalOf,{
    maxPendingTotal:64,maxPendingPerPrincipal:8
  });
  /** @type {http.Server|undefined} */
  let server;
  try {
    const privatePath=path.join(root,'private.mjs');
    await atomicWrite(privatePath,privateSource);
    globals.__SCO_MATCHED_AUDIENCE_CONTEXT__=context;
    const native=/** @type {{derive:(input:string)=>Promise<string>}} */(
      await import(pathToFileURL(privatePath).href));
    delete globals.__SCO_MATCHED_AUDIENCE_CONTEXT__;
    const partition=partitionScoAsyncModule({
      path:'generated.mjs',sourceType:'module',code:privateSource
    },{seed:'sco-conventional-control-2026-11-17',serverOnlyInitialization:true});
    const generatedMethod=partition.methodNames.derive;
    const methods=bindScoModuleExports(partition,native);
    methods['plain-digest']=native.derive;
    let privateCalls=0;
    for(const [id,task] of Object.entries(methods)) {
      methods[id]=(...args)=>{
        privateCalls++;
        return task(...args);
      };
    }
    /** @type {import('../src/core').SourceFile[]} */
    const publicFiles=[
      partition.clientFile,
      {path:'manual.mjs',sourceType:'module',code:conventionalSource}
    ];
    const privateHandler=createScoHandler(publicFiles,{
      publicPaths:['generated.mjs','manual.mjs'],
      remoteMethods:methods,authorizeRead:()=>true,
      authorizeRpc:request=>principalOf(request)!=='unverified',
      authorizeOperation:(request,method,args)=>principalOf(request)!=='unverified' &&
        (method===generatedMethod||method==='plain-digest') &&
        args.length===1 && typeof args[0]==='string' &&
        /^[a-f0-9]{64}$/u.test(args[0]),
      runRpcIsolated:(request,execute)=>
        isolation(request,()=>context.run(principalOf(request),execute))
    });
    const browserInput=challenge('browser',0);
    const page='<!doctype html><html><body><pre id="out">pending</pre>'+
      '<script type="module">'+
      'import{derive as generated}from"/obfs/generated.mjs";'+
      'import{derive as manual}from"/obfs/manual.mjs";'+
      'try{const input='+JSON.stringify(browserInput)+';'+
      'const a=await generated(input);const b=await manual(input);'+
      'document.getElementById("out").textContent=a+"|"+b;}'+
      'catch(error){document.getElementById("out").textContent="failed:"+String(error);}' +
      '</script></body></html>';
    server=http.createServer((request,response)=>{
      if(request.url==='/'){
        response.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'set-cookie':'session='+tokenA+'; Path=/; HttpOnly; SameSite=Strict',
          'cache-control':'no-store'
        });
        response.end(page);
        return;
      }
      privateHandler(request,response);
    });
    const origin='http://127.0.0.1:'+await listen(server);
    const publicGenerated=await originalFetch(origin+'/obfs/generated.mjs');
    const publicManual=await originalFetch(origin+'/obfs/manual.mjs');
    assert.equal(publicGenerated.status,200);
    assert.equal(publicManual.status,200);
    const generatedText=await publicGenerated.text();
    const manualText=await publicManual.text();
    assert.equal(generatedText,partition.clientFile.code);
    assert.equal(manualText,conventionalSource);
    for(const publicText of [generatedText,manualText]) {
      assert.equal(publicText.includes(keyHex),false);
      assert.equal(publicText.includes(canary),false);
      assert.equal(publicText.includes('createHmac'),false);
      assert.equal(publicText.includes('Buffer.alloc'),false);
      assert.equal(publicText.includes('principalContext'),false);
    }
    assert.equal((await originalFetch(origin+'/obfs/private.mjs')).status,404);
    await atomicWrite(path.join(root,'served-generated.mjs'),generatedText);
    await atomicWrite(path.join(root,'served-manual.mjs'),manualText);
    let activeToken=tokenA;
    globalThis.fetch=/** @type {typeof fetch} */(async(input,options)=>{
      const headers=new Headers(options?.headers);
      headers.set('x-test-session',activeToken);
      return originalFetch(new URL(String(input),origin),{...options,headers});
    });
    const generated=/** @type {{derive:(input:string)=>Promise<string>}} */(
      await import(pathToFileURL(path.join(root,'served-generated.mjs')).href));
    const manual=/** @type {{derive:(input:string)=>Promise<string>}} */(
      await import(pathToFileURL(path.join(root,'served-manual.mjs')).href));
    /** @param {string} principal @param {string} input @returns {Promise<string>} */
    const direct=(principal,input)=>context.run(principal,()=>native.derive(input));
    /** @param {string} method @param {string} token @param {string} input @returns {Promise<{status:number,value:string|undefined}>} */
    async function directRpc(method,token,input){
      const reply=await originalFetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-test-session':token},
        body:JSON.stringify({method,args:[input]})
      });
      const result=/** @type {{value?:string}} */ (await reply.json());
      return {status:reply.status,value:result.value};
    }
    const denied=await originalFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:generatedMethod,args:[challenge('denied',0)]})
    });
    assert.equal(denied.status,403);
    const extractedMethod=generatedText.match(/"m[a-f0-9]{24}"/u);
    assert.ok(extractedMethod,'A public-only attacker can read the method ID');
    const attackerMethod=JSON.parse(extractedMethod[0]);
    assert.equal(attackerMethod,generatedMethod);
    let generatedRelayMatches=0;
    let manualRelayMatches=0;
    let mistakenCrossAccountMatches=0;
    const heldout=Array.from({length:32},(_,i)=>challenge('heldout',i));
    for(const input of heldout){
      activeToken=tokenA;
      const original=await direct('account-A',input);
      const fromGenerated=await generated.derive(input);
      const fromManual=await manual.derive(input);
      assert.equal(fromGenerated,original);
      assert.equal(fromManual,original);
      // The attacker needs only a published method ID and its own session.
      const forgedGenerated=await directRpc(attackerMethod,tokenA,input);
      const forgedManual=await directRpc('plain-digest',tokenA,input);
      const targetB=await directRpc(generatedMethod,tokenB,input);
      assert.equal(forgedGenerated.status,200);
      assert.equal(forgedManual.status,200);
      assert.equal(targetB.status,200);
      if(forgedGenerated.value===original)generatedRelayMatches++;
      if(forgedManual.value===original)manualRelayMatches++;
      if(forgedGenerated.value===targetB.value)mistakenCrossAccountMatches++;
    }
    assert.equal(generatedRelayMatches,32);
    assert.equal(manualRelayMatches,32);
    assert.equal(mistakenCrossAccountMatches,0);

    const inputs=Array.from({length:16},(_,i)=>challenge('performance',i));
    /** @type {string[]} */
    const expected=[];
    for(const input of inputs)expected.push(await direct('account-A',input));
    /** @param {Mode} mode @returns {Promise<Sample>} */
    async function sample(mode) {
      activeToken=tokenA;
      /** @type {string[]} */
      const values=[];
      const before=cpuUsage();
      const started=hrtime.bigint();
      if(mode==='native') {
        const fake=/** @type {http.IncomingMessage} */(
          /** @type {unknown} */({headers:{'x-test-session':tokenA}}));
        await isolation(fake,()=>
          context.run('account-A',async()=>{
            for(const input of inputs)values.push(await native.derive(input));
          }));
      }else{
        const client=mode==='generated'?generated:manual;
        for(const input of inputs)values.push(await client.derive(input));
      }
      const wallMs=Number(hrtime.bigint()-started)/1e6;
      const delta=cpuUsage(before);
      const cpuMs=(delta.user+delta.system)/1000;
      assert.deepEqual(values,expected);
      return {mode,wallMs,cpuMs,values};
    }
    const modes=/** @type {Mode[]} */ (['native','generated','manual']);
    for(const mode of modes)await sample(mode);
    /** @type {Record<string,unknown>[]} */
    const trials=[];
    let generatedCpuBreaches=0,manualCpuBreaches=0;
    let generatedCpuUnresolved=0,manualCpuUnresolved=0;
    let generatedWallBreaches=0,manualWallBreaches=0;
    for(let round=0;round<repeats;round++){
      const order=[modes[round%3],modes[(round+1)%3],modes[(round+2)%3]];
      /** @type {Partial<Record<Mode,Sample>>} */
      const observed={};
      for(const mode of order)observed[mode]=await sample(mode);
      const native=/** @type {Sample} */ (observed.native);
      const generated=/** @type {Sample} */ (observed.generated);
      const manual=/** @type {Sample} */ (observed.manual);
      const generatedCpuRatio=native.cpuMs>0&&generated.cpuMs>0?
        generated.cpuMs/native.cpuMs:null;
      const manualCpuRatio=native.cpuMs>0&&manual.cpuMs>0?
        manual.cpuMs/native.cpuMs:null;
      if(generatedCpuRatio===null)generatedCpuUnresolved++;
      else if(generatedCpuRatio>2.5)generatedCpuBreaches++;
      if(manualCpuRatio===null)manualCpuUnresolved++;
      else if(manualCpuRatio>2.5)manualCpuBreaches++;
      const generatedWallRatio=generated.wallMs/native.wallMs;
      const manualWallRatio=manual.wallMs/native.wallMs;
      if(generatedWallRatio>2.5)generatedWallBreaches++;
      if(manualWallRatio>2.5)manualWallBreaches++;
      const row={round,order,nativeCpuMs:native.cpuMs,
        generatedCpuMs:generated.cpuMs,manualCpuMs:manual.cpuMs,
        nativeWallMs:native.wallMs,generatedWallMs:generated.wallMs,
        manualWallMs:manual.wallMs,generatedCpuRatio,manualCpuRatio,
        generatedWallRatio,manualWallRatio};
      trials.push(row);
      console.log(JSON.stringify({trial:row}));
    }
    let chromiumParity='not-run';
    let chromiumPrivateCalls=0;
    if(process.env.CHROMIUM_BIN){
      const expectedBrowser=await direct('account-A',browserInput);
      const beforeBrowserCalls=privateCalls;
      const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
      ],{timeout:60000,maxBuffer:4*1024*1024,encoding:'utf8'});
      const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
      assert.equal(observed,expectedBrowser+'|'+expectedBrowser,
        'Real Chromium generated/manual mismatch: '+stdout.slice(-1800));
      chromiumPrivateCalls=privateCalls-beforeBrowserCalls;
      assert.equal(chromiumPrivateCalls,2);
      chromiumParity='passed';
    }
    return {node:process.version,platform:process.platform,repeats,
      publicGeneratedSha256:createHash('sha256').update(generatedText).digest('hex'),
      publicManualSha256:createHash('sha256').update(manualText).digest('hex'),
      generatedPublicBytes:Buffer.byteLength(generatedText),
      manualPublicBytes:Buffer.byteLength(manualText),
      privateKeyBits:256,workBytes:8*1024*1024,sessionRequests:inputs.length,
      generatedRequestBodyBytes:inputs.reduce((sum,input)=>sum+
        Buffer.byteLength(JSON.stringify({method:generatedMethod,args:[input]})),0),
      manualRequestBodyBytes:inputs.reduce((sum,input)=>sum+
        Buffer.byteLength(JSON.stringify({method:'plain-digest',args:[input]})),0),
      authenticatedNegativeStatus:denied.status,privateFileStatus:404,
      heldoutQueries:heldout.length,generatedRelayMatches,manualRelayMatches,
      mistakenCrossAccountMatches,privateCalls,chromiumParity,chromiumPrivateCalls,
      generatedCpuBreaches,manualCpuBreaches,generatedCpuUnresolved,manualCpuUnresolved,
      generatedWallBreaches,manualWallBreaches,
      medianGeneratedOverManualCpu:median(trials.map(x=>
        /** @type {number} */(x.generatedCpuMs)/
        /** @type {number} */(x.manualCpuMs))),
      medianGeneratedOverManualWall:median(trials.map(x=>
        /** @type {number} */(x.generatedWallMs)/
        /** @type {number} */(x.manualWallMs))),
      trials};
  }finally{
    globalThis.fetch=originalFetch;
    delete globals.__SCO_MATCHED_AUDIENCE_CONTEXT__;
    if(server)await close(server);
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  compare().then(result=>{
    process.stdout.write(JSON.stringify({summary:result},null,2)+'\n');
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={compare,challenge};
