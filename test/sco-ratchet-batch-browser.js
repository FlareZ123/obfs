'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createHash,randomBytes}=require('node:crypto');
const {makeServer}=require('../sims/sco-ratchet-batch-candidate');
const {createPrivateMachine}=require('../sims/sco-ratchet-boundary');

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('batch-event/'+index).digest('hex');
}

/**
 * Real headless Chromium executes the generated ESM RPC facade from the
 * trusted origin. Authentication uses a server-set HttpOnly SameSite cookie;
 * the page is subject to a self-only script and fetch CSP. The test compares
 * original server-state output, exact replay refusal, and private-work count.
 * Browser virtual time is used for deterministic completion only, never
 * accepted as a CPU benchmark.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const root=randomBytes(32);
  const browserToken=randomBytes(32).toString('hex');
  const backend=makeServer(root,0);
  backend.grant(browserToken,'browser-A');
  const inputs=[challenge(0),challenge(1)];
  const last=challenge(2);
  const app=[
    'import api from "/obfs/batch.mjs";',
    'const out=document.getElementById("out");',
    'try{',
    'const first=await api.batch(0,'+JSON.stringify(inputs)+');',
    'let replay="unexpected";',
    'try{await api.batch(0,'+JSON.stringify(inputs)+');}catch{replay="denied";}',
    'const next=await api.batch(2,['+JSON.stringify(last)+']);',
    'out.textContent=first.join("|")+"|"+next.join("|")+"|"+replay;',
    '}catch(error){out.textContent="FAIL:"+String(error);}'
  ].join('\n');
  const html='<!doctype html><html><body><pre id="out">pending</pre>'+
    '<script type="module" src="/app.mjs"></script></body></html>';
  const csp="default-src 'none'; script-src 'self'; connect-src 'self'";
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'set-cookie':'session='+browserToken+'; Path=/; HttpOnly; SameSite=Strict',
        'content-security-policy':csp,
        'cache-control':'no-store','x-content-type-options':'nosniff'
      });
      res.end(html);return;
    }
    if(req.url==='/app.mjs'){
      res.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
        'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(app);return;
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
    assert.equal((await fetch(origin+'/obfs/batch.mjs')).status,403);
    const authorized=await fetch(origin+'/obfs/batch.mjs',{
      headers:{cookie:'session='+browserToken}
    });
    assert.equal(authorized.status,200);
    const source=await authorized.text();
    const publicSha256=createHash('sha256').update(source).digest('hex');
    assert.doesNotMatch(source,/createPrivateMachine|ratchet-step-v1|createHmac/u);
    assert.doesNotMatch(source,new RegExp(root.toString('hex'),'u'));
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    const original=createPrivateMachine(root);
    const expected=[
      original.advance('browser-A',0,inputs[0]),
      original.advance('browser-A',1,inputs[1]),
      original.advance('browser-A',2,last),'denied'
    ].join('|');
    assert.equal(observed,expected,
      'Real Chromium private ratchet output or CSP failed: '+stdout.slice(-1800));
    assert.equal(backend.calls(),3);
    console.log('SCO_RATCHET_CHROMIUM_RESULT '+JSON.stringify({
      node:process.version,publicSha256,
      generatedFacadeBrowserExecuted:true,
      sameOriginHttpOnlyCookie:true,cspSelfOnly:true,
      successfulPrivateEvents:backend.calls(),staleReplayRefused:true,
      expectedResultSha256:createHash('sha256').update(expected).digest('hex'),
      limitation:'Virtual time only gates completion; no browser CPU budget asserted.'
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
