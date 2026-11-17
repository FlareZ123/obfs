'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createHmac,randomBytes,createHash}=require('node:crypto');
const {
  createScoHandler,createScoCapabilityScope,createScoPrivateHandles,
  createScoRpcClientSource
}=require('../src');

/** @typedef {{counter:number,key:Buffer}} PrivateState */
/** @typedef {{ok:boolean,value?:string,error?:string}} Reply */

/** @param {Buffer} root @param {number} counter @param {string} input @returns {string} */
function originalStep(root,counter,input){
  return createHmac('sha256',root).update(String(counter)).update(':')
    .update(input).digest('hex');
}

/**
 * Headless real Chromium imports the actual served generated COO-visible SCO
 * ESM facade with a server-set, HttpOnly, SameSite=Strict account-A cookie.
 * A B-owned handle is deliberately disclosed to its code to prove principal
 * binding even after handle theft, while native B remains independently usable.
 * The original secret, counter and key never enter browser-delivered source.
 *
 * Virtual time is only a script-completion gate, not a CPU measurement.
 * @returns {Promise<void>}
 */
async function main(){
  const key=randomBytes(32);
  const tokenA=randomBytes(32).toString('hex');
  const tokenB=randomBytes(32).toString('hex');
  const sessions=new Map([[tokenA,'account-A'],[tokenB,'account-B']]);
  /** @param {http.IncomingMessage} req @returns {string|null} */
  function principalOf(req){
    const match=/^session=([a-f0-9]{64})$/u.exec(String(req.headers.cookie??''));
    return match?sessions.get(match[1])??null:null;
  }
  const scope=createScoCapabilityScope(req=>principalOf(req)??'unverified',{
    maxPendingPerPrincipal:16,maxPendingTotal:32
  });
  const handles=createScoPrivateHandles(scope.currentPrincipal,{
    maxHandles:8,maxHandlesPerPrincipal:4,ttlMs:120000
  });
  let completedSteps=0;
  const privateMethods={
    issue:()=>handles.issue({counter:0,key}),
    /** @param {string} handle @param {string} input @returns {string} */
    step:(handle,input)=>handles.use(handle,value=>{
      const state=/** @type {PrivateState} */ (value);
      state.counter++;
      completedSteps++;
      return originalStep(state.key,state.counter,input);
    }),
    /** @param {string} handle @returns {boolean} */
    revoke:handle=>handles.revoke(handle)
  };
  const publicSource=createScoRpcClientSource(['issue','step','revoke']);
  const sourceSha256=createHash('sha256').update(publicSource).digest('hex');
  const backend=createScoHandler([{
    path:'public.mjs',sourceType:'module',code:publicSource
  }],{
    publicPaths:['public.mjs'],
    remoteMethods:privateMethods,
    authorizeRead:req=>principalOf(req)!==null,
    authorizeRpc:req=>principalOf(req)!==null,
    authorizeOperation:(req,method,args)=>{
      if(principalOf(req)===null)return false;
      if(method==='issue')return args.length===0;
      if(method==='step')return args.length===2&&
        typeof args[0]==='string'&&typeof args[1]==='string';
      if(method==='revoke')return args.length===1&&typeof args[0]==='string';
      return false;
    },
    runRpcIsolated:scope.runRpcIsolated
  });
  /** @type {string} */
  let stolenBHandle='';
  /** @type {string} */
  let app='';
  const page='<!doctype html><html><body><pre id="out">pending</pre>'+
    '<script type="module" src="/app.mjs"></script></body></html>';
  const csp="default-src 'none'; script-src 'self'; connect-src 'self'";
  const server=http.createServer((request,response)=>{
    if(request.url==='/'){
      response.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'set-cookie':'session='+tokenA+'; Path=/; HttpOnly; SameSite=Strict',
        'content-security-policy':csp,
        'cache-control':'no-store','x-content-type-options':'nosniff'
      });
      response.end(page);return;
    }
    if(request.url==='/app.mjs'){
      response.writeHead(200,{
        'content-type':'text/javascript; charset=utf-8',
        'cache-control':'no-store','x-content-type-options':'nosniff'
      });
      response.end(app);return;
    }
    backend(request,response);
  });
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    /**
     * @param {string|null} token
     * @param {string} method
     * @param {unknown[]} args
     * @returns {Promise<{status:number,reply:Reply}>}
     */
    async function rpc(token,method,args){
      const response=await fetch(origin+'/obfs/rpc',{
        method:'POST',headers:{
          'content-type':'application/json',
          ...(token?{cookie:'session='+token}:{})
        },
        body:JSON.stringify({method,args})
      });
      return {status:response.status,reply:/** @type {Reply} */ (await response.json())};
    }
    assert.equal((await fetch(origin+'/obfs/public.mjs')).status,403);
    assert.equal((await rpc(null,'issue',[])).status,403);
    const sourceResponse=await fetch(origin+'/obfs/public.mjs',{
      headers:{cookie:'session='+tokenA}
    });
    assert.equal(sourceResponse.status,200);
    const served=await sourceResponse.text();
    assert.equal(served,publicSource);
    assert.doesNotMatch(served,/createHmac|PrivateState|counter|account-A/u);
    assert.doesNotMatch(served,new RegExp(key.toString('hex'),'u'));
    const issuedB=await rpc(tokenB,'issue',[]);
    assert.equal(issuedB.status,200);
    stolenBHandle=String(issuedB.reply.value);
    assert.match(stolenBHandle,/^[A-Za-z0-9_-]{43}$/u);
    app=[
      'import api from "/obfs/public.mjs";',
      'const out=document.getElementById("out");',
      'try{',
      'const own=await api.issue();',
      'const first=await api.step(own,"alpha");',
      'const second=await api.step(own,"beta");',
      'let stolen="unexpected";',
      'try{await api.step('+JSON.stringify(stolenBHandle)+',"cross-account");}',
      'catch{stolen="denied";}',
      'const revoked=await api.revoke(own);',
      'let after="unexpected";',
      'try{await api.step(own,"after-revoke");}catch{after="denied";}',
      'out.textContent=[first,second,stolen,String(revoked),after].join("|");',
      '}catch(error){out.textContent="FAIL:"+String(error);}'
    ].join('\n');
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    const expected=[
      originalStep(key,1,'alpha'),originalStep(key,2,'beta'),
      'denied','true','denied'
    ].join('|');
    assert.equal(observed,expected,
      'Real Chromium private handle or CSP behavior mismatched: '+stdout.slice(-2000));
    assert.equal(completedSteps,2);
    const independentB=await rpc(tokenB,'step',[stolenBHandle,'B-native']);
    assert.equal(independentB.status,200);
    assert.equal(independentB.reply.value,originalStep(key,1,'B-native'));
    assert.equal(completedSteps,3);
    console.log('SCO_CAPABILITY_CHROMIUM '+JSON.stringify({
      platform:process.platform,node:process.version,
      publicSha256:sourceSha256,
      facadeBytes:Buffer.byteLength(served),
      nativeOutputParity:true,
      cookie:'HttpOnly SameSite Strict',csp,
      authorizedBrowserPrivateSteps:2,
      stolenCrossPrincipalHandleDenied:true,
      revokeDenial:true,
      independentBStillValid:true,
      caveat:'Same-account online relay remains viable; virtual time is completion-only, not CPU budget.'
    }));
  }finally {
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}
module.exports={main};
