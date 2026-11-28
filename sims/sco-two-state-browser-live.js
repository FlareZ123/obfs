'use strict';

const assert=require('node:assert/strict');
const {fork,execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const os=require('node:os');
const {promisify}=require('node:util');
const {equivalent}=require('./sco-two-state-optimal-network-policy');

/** @typedef {{kind:string,[key:string]:any}} Message */

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} kind
 * @returns {Promise<Message>}
 */
function receive(child,kind){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for '+kind));},90000);
    /** @param {unknown} raw */
    const onMessage=raw=>{
      const value=/** @type {Message|null} */(raw);
      if(value?.kind===kind){cleanup();resolve(value);}
    };
    /** @param {Error} error */
    const onError=error=>{cleanup();reject(error);};
    /** @param {number|null} code */
    const onExit=code=>{cleanup();reject(new Error('Trusted server exited '+code));};
    function cleanup(){
      clearTimeout(timeout);child.off('message',onMessage);
      child.off('error',onError);child.off('exit',onExit);
    }
    child.on('message',onMessage);child.once('error',onError);child.once('exit',onExit);
  });
}

/**
 * Serve a public page in the same browser origin as a transparent proxy to
 * either trusted target service. Only the server child owns the true table.
 * @param {string} upstream
 * @param {string} cookie
 * @param {string} attackSource
 * @returns {Promise<{server:http.Server,origin:string,
 *   records:{path:string,body:string,status:number,response:string}[]}>}
 */
async function makeBrowserOrigin(upstream,cookie,attackSource){
  /** @type {{path:string,body:string,status:number,response:string}[]} */
  const records=[];
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method==='GET'&&req.url==='/attack.html'){
        res.writeHead(200,{'content-type':'text/html; charset=utf-8',
          'cache-control':'no-store',
          'set-cookie':cookie+'; HttpOnly; Path=/; SameSite=Lax'});
        res.end('<!doctype html><html><body><pre id="out">pending</pre>'+
          '<script type="module" src="/attacker.mjs"></script></body></html>');
        return;
      }
      if(req.method==='GET'&&req.url==='/attacker.mjs'){
        res.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
          'cache-control':'no-store','x-content-type-options':'nosniff'});
        res.end(attackSource);return;
      }
      /** @type {Buffer[]} */
      const chunks=[];
      for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=Buffer.concat(chunks);
      const target=new URL(req.url??'/',upstream);
      const requestHeaders={'content-type':String(req.headers['content-type']||''),
        'cookie':String(req.headers.cookie||'')};
      const upstreamReply=await fetch(target,{method:req.method??'GET',
        headers:requestHeaders,
        ...(req.method==='POST'?{body}:{}),redirect:'manual'});
      const response=Buffer.from(await upstreamReply.arrayBuffer());
      if(req.method==='POST'&&target.pathname==='/obfs/rpc'){
        records.push({path:target.pathname,body:body.toString('utf8'),
          status:upstreamReply.status,response:response.toString('utf8')});
      }
      /** @type {Record<string,string>} */
      const forwarded={};
      for(const header of ['content-type','cache-control','x-content-type-options']){
        const value=upstreamReply.headers.get(header);
        if(value!==null)forwarded[header]=value;
      }
      res.writeHead(upstreamReply.status,forwarded);
      res.end(response);
    }catch(error){
      res.writeHead(502);res.end(String(error));
    }
  });
  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve());
  });
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address==='object');
  return {server,origin:'http://127.0.0.1:'+address.port,records};
}

/**
 * @param {string} origin
 * @param {string} chromium
 * @param {string} profile
 * @returns {Promise<{queries:number,inputs:number[],outputs:number[],
 *   clone:{next:number[][],output:number[][]},currentState:number,
 *   followupOutputs:number[],resetExport:boolean}>}
 */
async function runChromium(origin,chromium,profile){
  const {stdout}=await promisify(execFile)(chromium,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--user-data-dir='+profile,
    '--virtual-time-budget=20000','--dump-dom',origin+'/attack.html'
  ],{timeout:90000,maxBuffer:8*1024*1024,encoding:'utf8'});
  const shown=stdout.match(/<pre id="out">([^<]*)<\/pre>/u)?.[1];
  assert.ok(shown&&shown!=='pending','Chromium did not finish public ESM: '+stdout.slice(-1500));
  assert.ok(!shown.startsWith('ERROR:'),'Chromium public attack error: '+shown);
  return JSON.parse(shown);
}

/**
 * Actual headless Chromium loads generated SCO and ordinary minified facades
 * as same-origin browser ESM. The trusted table resides in another process;
 * evaluator snapshots it only after both browser tabs have exited.
 * The reverse proxy grants no reset or private-source capability.
 *
 * @returns {Promise<{modelId:number,queries:number,wireCalls:number,
 *   browserMatched:boolean,continuationMatched:boolean,resetExport:boolean}>}
 */
async function runBrowserBoundary(){
  const server=fork(path.join(__dirname,'sco-two-state-process-boundary.js'),
    ['--server'],{execArgv:[],stdio:['ignore','ignore','pipe','ipc']});
  const readyPromise=receive(server,'ready');
  /** @type {Awaited<ReturnType<typeof makeBrowserOrigin>>[]} */
  const bridges=[];
  const workdir=await fs.mkdtemp(path.join(os.tmpdir(),'sco-two-state-browser-'));
  try{
    const ready=await readyPromise;
    const policySource=await fs.readFile(path.join(__dirname,
      'sco-two-state-optimal-network-policy.js'),'utf8');
    const followup=[0,1,1,0,1,0,0,1,1,1,0,0,1,0,1,1];
    // All algorithm source is public; the true table and canary are absent.
    const attackSource=[
      'import * as api from "/obfs/client.mjs";',
      'const module={exports:{}};',policySource,
      '(async()=>{',
      'const policy=module.exports.createPolicy();',
      'const learned=await module.exports.learnExpected(api,policy);',
      'const followup='+JSON.stringify(followup)+';',
      'const predicted=module.exports.continuation(learned.clone,learned.currentState,followup).outputs;',
      'const observed=[];',
      'for(const input of followup)observed.push(await api.step(input));',
      'if(JSON.stringify(observed)!==JSON.stringify(predicted))throw Error("Unmatched clone");',
      'document.getElementById("out").textContent=JSON.stringify({',
      'queries:learned.queries,inputs:learned.inputs,outputs:learned.outputs,',
      'clone:learned.clone,currentState:learned.currentState,',
      'followupOutputs:observed,resetExport:Object.hasOwn(api,"reset")});',
      '})().catch(error=>{document.getElementById("out").textContent="ERROR:"+error.message;});'
    ].join('\n');
    const sco=await makeBrowserOrigin(ready.scoOrigin,ready.cookie,attackSource);
    bridges.push(sco);
    const ordinary=await makeBrowserOrigin(ready.ordinaryOrigin,ready.cookie,attackSource);
    bridges.push(ordinary);
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const scoObserved=await runChromium(sco.origin,browser,path.join(workdir,'chromium-sco'));
    const ordinaryObserved=await runChromium(ordinary.origin,browser,
      path.join(workdir,'chromium-ordinary'));
    assert.equal(scoObserved.resetExport,false);
    assert.equal(ordinaryObserved.resetExport,false);
    assert.deepEqual(scoObserved.inputs,ordinaryObserved.inputs);
    assert.deepEqual(scoObserved.outputs,ordinaryObserved.outputs);
    assert.deepEqual(scoObserved.followupOutputs,ordinaryObserved.followupOutputs);
    assert.ok(scoObserved.queries>=0&&scoObserved.queries<=9);
    // Compare browser RPC bodies and JSON replies observed by the two public
    // reverse proxies. These are actual browser requests, not Node fetch shims.
    assert.deepEqual(sco.records,ordinary.records);
    assert.equal(sco.records.length,scoObserved.queries+followup.length);
    for(const bridge of bridges){
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>bridge.server.close(
        error=>error?reject(error):resolve()));
      await closed;
    }
    bridges.length=0;
    const snapshotReady=receive(server,'snapshot');
    server.send({kind:'snapshot'});
    const snapshot=await snapshotReady;
    assert.ok(Number.isInteger(snapshot.modelId)&&snapshot.modelId>=0&&snapshot.modelId<260);
    assert.equal(snapshot.scoTrace.length,sco.records.length);
    assert.deepEqual(snapshot.scoTrace,snapshot.ordinaryTrace);
    const fullInputs=scoObserved.inputs.concat(followup);
    const fullOutputs=scoObserved.outputs.concat(scoObserved.followupOutputs);
    assert.deepEqual(snapshot.scoTrace,
      fullInputs.map((input,index)=>({input,output:fullOutputs[index]})));
    let state=0;
    for(const input of scoObserved.inputs)state=snapshot.machine.next[state][input];
    assert.equal(equivalent([scoObserved.clone,snapshot.machine],scoObserved.currentState,
      2+state),true);
    assert.equal(equivalent([ordinaryObserved.clone,snapshot.machine],ordinaryObserved.currentState,
      2+state),true);
    return {modelId:snapshot.modelId,queries:scoObserved.queries,
      wireCalls:sco.records.length,browserMatched:true,continuationMatched:true,
      resetExport:false};
  }finally{
    for(const bridge of bridges){
      /** @type {Promise<void>} */
      const closed=new Promise(resolve=>bridge.server.close(()=>resolve()));
      await closed;
    }
    if(server.connected)server.send({kind:'stop'});
    setTimeout(()=>{if(server.exitCode===null)server.kill();},3000).unref();
    await fs.rm(workdir,{recursive:true,force:true});
  }
}

if(require.main===module){
  runBrowserBoundary().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runBrowserBoundary};
