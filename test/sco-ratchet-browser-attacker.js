'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {randomBytes,createHash}=require('node:crypto');
const {makeServer}=require('../sims/sco-ratchet-batch-candidate');
const {createPrivateMachine}=require('../sims/sco-ratchet-boundary');

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('batch-event/'+index).digest('hex');
}

/**
 * Hostile-but-authenticated Chromium instrumentation of generated SCO ESM
 * RPC under an HttpOnly, SameSite=Strict cookie and a self-only CSP. A browser
 * attacker has no access to the HttpOnly cookie string, yet can exercise the
 * same-origin API using the browser's automatic credentials and inspect every
 * response. Virtual time only gates asynchronous completion, never CPU.
 *
 * @param {string} [publicFacadeSource] Optional equal-trust public control.
 * @param {Buffer} [root] Reusable private root for fair side-by-side comparison.
 * @returns {Promise<void>}
 */
async function main(publicFacadeSource,root=randomBytes(32)){
  const token=randomBytes(32).toString('hex');
  const backend=makeServer(root,0,publicFacadeSource);
  backend.grant(token,'browser-A');
  const inputs=[challenge(0),challenge(1),challenge(2)];
  const attackerApp=[
    'const captured=[];',
    'let requests=0;',
    'const savedFetch=globalThis.fetch.bind(globalThis);',
    'globalThis.fetch=async function(input,options){',
    '  const response=await savedFetch(input,options);',
    '  if(String(input).includes("/obfs/rpc")){',
    '    requests++;',
    '    const transcript=await response.clone().json();',
    '    if(transcript.ok===true && Array.isArray(transcript.value))',
    '      captured.push(...transcript.value);',
    '  }',
    '  return response;',
    '};',
    'const out=document.getElementById("out");',
    'try{',
    '  const module=await import("/obfs/batch.mjs");',
    '  const api=module.default;',
    '  const first=await api.batch(0,'+JSON.stringify(inputs.slice(0,2))+');',
    '  const second=await api.batch(2,'+JSON.stringify(inputs.slice(2))+');',
    '  out.textContent="COOKIE="+document.cookie.length+',
    '    "|CAPTURED="+captured.join(",")+',
    '    "|OUTPUTS="+first.concat(second).join(",")+',
    '    "|REQUESTS="+requests;',
    '}catch(error){out.textContent="FAIL:"+String(error);}'
  ].join('\n');
  assert.ok(!attackerApp.includes(token));
  const html='<!doctype html><html><body><pre id="out">pending</pre>'+
    '<script type="module" src="/attacker.mjs"></script></body></html>';
  const csp="default-src 'none'; script-src 'self'; connect-src 'self'";
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'set-cookie':'session='+token+'; Path=/; HttpOnly; SameSite=Strict',
        'content-security-policy':csp,
        'cache-control':'no-store','x-content-type-options':'nosniff'
      });
      res.end(html);return;
    }
    if(req.url==='/attacker.mjs'){
      res.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
        'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(attackerApp);return;
    }
    backend.handler(req,res);
  });
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await ready;
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const unauthorizedSource=await fetch(origin+'/obfs/batch.mjs');
    assert.equal(unauthorizedSource.status,403);
    const unauthorizedRpc=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'batch',args:[0,inputs]})
    });
    assert.equal(unauthorizedRpc.status,403);
    assert.equal(backend.calls(),0);
    const authorized=await fetch(origin+'/obfs/batch.mjs',{
      headers:{cookie:'session='+token}
    });
    assert.equal(authorized.status,200);
    const source=await authorized.text();
    assert.doesNotMatch(source,/ratchet-step-v1|createHmac|createPrivateMachine/u);
    assert.doesNotMatch(source,new RegExp(root.toString('hex'),'u'));
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    const original=createPrivateMachine(root);
    const results=inputs.map((value,index)=>original.advance('browser-A',index,value));
    const expected='COOKIE=0|CAPTURED='+results.join(',')+
      '|OUTPUTS='+results.join(',')+'|REQUESTS=2';
    assert.equal(observed,expected,
      'Real Chromium hostile fetch observation did not match native: '+stdout.slice(-1800));
    assert.equal(backend.calls(),3);
    console.log('SCO_RATCHET_BROWSER_ATTACK '+JSON.stringify({
      node:process.version,platform:process.platform,
      publicSha256:createHash('sha256').update(source).digest('hex'),
      privateEvents:backend.calls(),observedEventOutputs:3,
      documentCookieLength:0,interceptedRpcResponses:2,
      cspSelfOnly:true,originalParity:true,
      limitation:'A-only active same-origin page sees its own RPC outputs. No B credential, no production network or browser CPU proof.'
    }));
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
