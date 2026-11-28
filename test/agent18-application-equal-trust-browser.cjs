'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');
const {build,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');
const {ordinaryFacade}=require('../sims/agent18-equaltrust-facade.cjs');

const run=promisify(execFile);
const CASES=[
  [17,0],[0x11223344,300],[0xffffffff,8000],[0,12000],
  [42,1],[0x7fffffff,1300]
];

/** @param {http.Server} server @returns {Promise<string>} */
async function listen(server){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Missing TCP address');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {http.Server} server @returns {Promise<void>} */
async function close(server){
  await new Promise((resolve,reject)=>server.close(
    error=>error?reject(error):resolve(undefined)));
}

/** @param {unknown} value @returns {unknown} */
function wire(value){return JSON.parse(JSON.stringify(value));}

/**
 * Exercise the actual generated SCO ESM and an ordinary esbuild-minified ESM
 * control inside the same Chromium realm with identical service, method ID,
 * authorization, trusted original private functions, and inputs.
 *
 * The test-only same-origin proxy injects a fixed account token server-side;
 * it is NOT a production credentials or integrity deployment. Capturing
 * request bodies proves the attacker can observe both clients' actual method
 * and input vectors at the browser boundary.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const previousWindow=globalThis.window;
  const token='agent18-browser-equaltrust-fixture-20261128';
  const graph=await build();
  const method=graph.partitions[EXPOSED].methodNames.evaluateRemote;
  const ordinary=ordinaryFacade(method);
  const publicSCO=graph.clientFiles[0].code;
  const html=[
    '<!doctype html><meta charset="utf-8"><body>',
    '<script type="module">',
    'import {evaluateRemote as protectedCall} from "/obfs/'+EXPOSED+'";',
    'import {evaluateRemote as ordinaryCall} from "/ordinary.mjs";',
    'const cases='+JSON.stringify(CASES)+';',
    'const results=[];',
    'for(const [seed,count] of cases){',
    'const protectedResult=await protectedCall(seed,count);',
    'const ordinaryResult=await ordinaryCall(seed,count);',
    'results.push({protectedResult,ordinaryResult});',
    '}',
    'const pre=document.createElement("pre");',
    'pre.id="out";pre.textContent=btoa(JSON.stringify(results));',
    'document.body.append(pre);',
    '</script></body>'
  ].join('');
  /** @type {{method:string,args:number[]}[]} */
  const trace=[];
  /** @type {Awaited<ReturnType<typeof startServer>>|undefined} */
  let backend;
  const proxy=http.createServer(async(request,response)=>{
    try{
      if(request.method==='GET'&&request.url==='/'){
        response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
        response.end(html);return;
      }
      if(request.method==='GET'&&request.url==='/ordinary.mjs'){
        response.writeHead(200,{
          'content-type':'text/javascript; charset=utf-8',
          'cache-control':'no-store'
        });
        response.end(ordinary);return;
      }
      if(!backend||!['/obfs/'+EXPOSED,'/obfs/rpc'].includes(request.url??'')){
        response.writeHead(404);response.end();return;
      }
      /** @type {Buffer[]} */
      const chunks=[];
      for await(const chunk of request)chunks.push(Buffer.from(chunk));
      const body=Buffer.concat(chunks);
      if(request.url==='/obfs/rpc'&&request.method==='POST'){
        trace.push(JSON.parse(body.toString('utf8')));
      }
      const upstream=await fetch(backend.origin+request.url,{
        method:request.method,
        headers:{
          'x-demo-token':token,
          'content-type':request.headers['content-type']??'application/json'
        },
        body:request.method==='POST'?body:undefined
      });
      response.writeHead(upstream.status,{
        'content-type':upstream.headers.get('content-type')??'application/json',
        'cache-control':'no-store'
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    }catch(error){
      response.writeHead(502).end('Equal-trust browser proxy failure: '+String(error));
    }
  });
  let active=false;
  try{
    backend=await startServer({token});
    const browserOrigin=await listen(proxy);
    active=true;
    const chromium=process.env.CHROMIUM_BIN??'google-chrome';
    const {stdout}=await run(chromium,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=20000','--dump-dom',browserOrigin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="out">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium did not complete matched SCO RPC comparison: '+
      stdout.slice(0,1800));
    const actual=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    assert.equal(actual.length,CASES.length);
    const expected=await Promise.all(CASES.map(async ([seed,count])=>
      wire(await backend.native(seed,count))));
    for(let i=0;i<CASES.length;i++){
      assert.deepEqual(actual[i].protectedResult,expected[i]);
      assert.deepEqual(actual[i].ordinaryResult,expected[i]);
    }
    assert.equal(trace.length,CASES.length*2);
    for(let i=0;i<CASES.length;i++){
      const expectedWire={method,args:CASES[i]};
      assert.deepEqual(trace[2*i],expectedWire);
      assert.deepEqual(trace[2*i+1],expectedWire);
    }
    assert.ok(!publicSCO.includes('secretOffset'));
    assert.ok(!ordinary.includes('secretOffset'));
    process.stdout.write('APPLICATION_EQUAL_TRUST_CHROMIUM '+JSON.stringify({
      os:process.platform,browser:chromium,realBrowserCases:CASES.length,
      nativeMatched:CASES.length,identicalRpcTraces:CASES.length,
      distributedSCOBytes:Buffer.byteLength(publicSCO),
      ordinaryMinifiedBytes:Buffer.byteLength(ordinary),
      accountProxySuppliesToken:true,
      serverOriginalCodeNeverDistributed:true,
      attackBoundary:'instrumentable public RPC in actual Chromium'
    })+'\n');
  }finally{
    if(active)await close(proxy);
    if(backend)await close(backend.server);
    if(previousWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=previousWindow;
  }
}
if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
