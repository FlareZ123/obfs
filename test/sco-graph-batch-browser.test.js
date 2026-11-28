'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src');

/**
 * Chrome's normal installation location on the Windows 11/Actions runner,
 * or the Chrome executable installed on Ubuntu runner images.
 * @returns {string}
 */
function chromeBinary(){
  if(process.env.CHROMIUM_BIN)return process.env.CHROMIUM_BIN;
  if(process.platform==='win32'){
    return path.join(process.env.PROGRAMFILES??'C:\\Program Files',
      'Google','Chrome','Application','chrome.exe');
  }
  return 'google-chrome';
}

/**
 * Run actual Chromium and return the post-module-execution HTML.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function render(url){
  const bin=chromeBinary();
  const args=['--headless','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run',
    '--virtual-time-budget=12000','--dump-dom',url];
  const {stdout}=await promisify(execFile)(bin,args,{
    timeout:60000,maxBuffer:8*1024*1024,encoding:'utf8'
  });
  return stdout;
}

test('real Chromium CSP batch parity, nested denial, and instrumented authorized relay',async()=>{
  const previous=process.env.OBFS_SCO_GRAPH_KEY;
  process.env.OBFS_SCO_GRAPH_KEY=randomBytes(32).toString('hex');
  /** @type {http.Server|undefined} */
  let server;
  try{
    const root=path.join(__dirname,'../examples/sco-graph/before');
    const files=await Promise.all(['api.mjs','audit.mjs','secret.mjs'].map(async filename=>({
      path:filename,sourceType:/** @type {const} */ ('module'),
      code:await fs.readFile(path.join(root,filename),'utf8')
    })));
    const graph=partitionScoAsyncGraph(files,{
      seed:'agent31-sco-graph-real-chromium-20261123',
      exposedPaths:['api.mjs','audit.mjs'],
      batchPaths:['api.mjs'],maxBatchCalls:2
    });
    const api=await import(pathToFileURL(path.join(root,'api.mjs')).href);
    const audit=await import(pathToFileURL(path.join(root,'audit.mjs')).href);
    const allowed1='0123456789abcdef0123456789abcdef';
    const allowed2='fedcba9876543210fedcba9876543210';
    const allowed3='11223344556677889900aabbccddeeff';
    const blocked='00000000000000000000000000000000';
    const expected=(await api.derive(allowed1))+':'+
      (await api.derive(allowed2))+':DENIED:'+
      (await api.derive(allowed3));
    const deriveMethod=graph.partitions['api.mjs'].methodNames.derive;
    const handler=createScoGraphHandler(graph,{
      'api.mjs':api,'audit.mjs':audit
    },{
      authorizeRead:()=>true,
      authorizeRpc:()=>true,
      authorizeOperation:(_request,method,args)=>
        method!==deriveMethod||args[0]!==blocked
    });

    const script='import {batch} from "/obfs/api.mjs";'+
      'const target=document.getElementById("answer");'+
      'const fetchOriginal=globalThis.fetch;let intercepted=null;'+
      'globalThis.fetch=(url,opts)=>{intercepted=JSON.parse(opts.body);'+
      'return fetchOriginal(url,opts);};'+
      'try{'+
      'const responses=await batch(['+
      '{name:"derive",args:['+JSON.stringify(allowed1)+']},'+
      '{name:"derive",args:['+JSON.stringify(allowed2)+']}]);'+
      'if(responses.length!==2||responses.some(r=>r.ok!==true)||!intercepted)throw Error("bad results");'+
      'const captured=intercepted;'+
      'let denied="NOT_DENIED";'+
      'try{await batch([{name:"derive",args:['+JSON.stringify(allowed1)+']},'+
      '{name:"derive",args:['+JSON.stringify(blocked)+']}]);}'+
      'catch{denied="DENIED";}'+
      'const wire={method:captured.method,args:[['+
      '{method:captured.args[0][0].method,args:['+JSON.stringify(allowed3)+']},'+
      '{method:captured.args[0][1].method,args:['+JSON.stringify(allowed1)+']}]]};'+
      'const relay=await fetchOriginal("/obfs/rpc",{method:"POST",'+
      'headers:{"content-type":"application/json"},body:JSON.stringify(wire)});'+
      'const replay=await relay.json();'+
      'if(!relay.ok||replay.value[1].value!==responses[0].value)throw Error("relay mismatch");'+
      'target.textContent=responses[0].value+":"+responses[1].value+":"+denied+":"+replay.value[0].value;'+
      '}catch(error){target.textContent="ERROR:"+String(error);}';
    const page='<!doctype html><html><head><meta charset="utf-8"></head>'+
      '<body><pre id="answer">initial</pre><script type="module" src="/app.mjs"></script></body></html>';
    server=http.createServer((request,response)=>{
      if(request.url?.startsWith('/obfs/')){handler(request,response);return;}
      response.setHeader('content-security-policy',
        "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'");
      if(request.url==='/'){
        response.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(page);
      }else if(request.url==='/app.mjs'){
        response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'}).end(script);
      }else{
        response.writeHead(404).end();
      }
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const socket=server.address();
    if(!socket||typeof socket==='string')throw new Error('Missing TCP address');
    const html=await render('http://127.0.0.1:'+socket.port+'/');
    assert.ok(html.includes('id="answer">'+expected+'</pre>'),
      'Real Chromium CSP batch parity/denial failed: '+html.slice(-2400));
    console.log(JSON.stringify({
      experiment:'sco-graph-batch-real-chromium',
      originalPrivateModules:3,generatedBatchExports:1,
      protectedHmacCalls:2,deniedMixedBatch:true,
      sourceOnlyCsp:true,fullHmacDigestsMatched:true,
      instrumentedBrowserFetch:true,authorizedOfflineSourceRelayInputs:1,
      admittedBudget:'not-measured'
    }));
  }finally{
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    if(previous===undefined)delete process.env.OBFS_SCO_GRAPH_KEY;
    else process.env.OBFS_SCO_GRAPH_KEY=previous;
  }
});
