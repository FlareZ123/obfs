'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const {transformSync}=require('esbuild');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src');

const secretCode='export const seed=0x9e3779b9;';
const apiCode=[
  "import {seed} from './secret.mjs';",
  'export async function compute(text){',
  '  let state=seed;',
  '  for(let i=0;i<250000;i++){',
  '    state=(Math.imul(state^(text.charCodeAt(i%text.length)+i),1664525)+1013904223)|0;',
  '  }',
  '  return state>>>0;',
  '}'
].join('\n');

/** @returns {string} */
function chromeBinary(){
  if(process.env.CHROMIUM_BIN)return process.env.CHROMIUM_BIN;
  if(process.platform==='win32')return path.join(
    process.env.PROGRAMFILES??'C:\\Program Files',
    'Google','Chrome','Application','chrome.exe');
  return 'google-chrome';
}

/** @param {string} url @returns {Promise<string>} */
async function render(url){
  const {stdout}=await promisify(execFile)(chromeBinary(),[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=30000','--dump-dom',url
  ],{timeout:90000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * A conventional handwritten RPC batch transport compiled with esbuild.
 * Both clients intentionally call the same trusted server, using the same
 * method ID, private source, authorization and JSON response protocol.
 * @param {string} method
 * @param {string} batchMethod
 * @returns {string}
 */
function ordinarySource(method,batchMethod){
  const source='export async function batch(calls){'+
    'const wire=calls.map(item=>({method:'+JSON.stringify(method)+
    ',args:item.args}));'+
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",'+
    'cache:"no-store",headers:{"content-type":"application/json"},'+
    'body:JSON.stringify({method:'+JSON.stringify(batchMethod)+
    ',args:[wire]})});'+
    'const payload=await response.json();'+
    'if(!response.ok||payload.ok!==true)throw Error("Batch failed");'+
    'return payload.value;}';
  return transformSync(source,{format:'esm',target:'es2022',minify:true}).code;
}

/**
 * This is a hot browser wall-time diagnostic, not a source-secrecy test.
 * Serving original JavaScript under /native solely creates a legitimate
 * unprotected-browser reference for the same semantics. The actual SCO
 * generated transport and ordinary minified transport both share one
 * trusted server and one privileged implementation.
 */
test('real Chromium native-browser versus protected and ordinary SCO graph batch hot-wall cost',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-graph-browser-wall-'));
  /** @type {http.Server|undefined} */
  let server;
  try{
    await fs.writeFile(path.join(temp,'secret.mjs'),secretCode);
    await fs.writeFile(path.join(temp,'api.mjs'),apiCode);
    const original=await import(pathToFileURL(path.join(temp,'api.mjs')).href);
    const graph=partitionScoAsyncGraph([
      {path:'api.mjs',code:apiCode,sourceType:'module'},
      {path:'secret.mjs',code:secretCode,sourceType:'module'}
    ],{
      seed:'agent31-browser-native-paired-20261128',
      exposedPaths:['api.mjs'],batchPaths:['api.mjs'],maxBatchCalls:8
    });
    const partition=graph.partitions['api.mjs'];
    if(!partition.batchMethod)throw Error('Missing batch method');
    const minified=ordinarySource(partition.methodNames.compute,partition.batchMethod);
    const sourceFiles=new Map([['/native/api.mjs',apiCode],
      ['/native/secret.mjs',secretCode],
      ['/ordinary/api.mjs',minified]]);
    /** @type {string[][]} */
    const inputs=Array.from({length:6},(_,trial)=>
      Array.from({length:8},(_,index)=>
        'abcdef0123456789'+String(trial).padStart(2,'0')+String(index).padStart(2,'0')));
    /** @type {number[][]} */
    const expected=[];
    for(const values of inputs){
      const row=[];
      for(const value of values)row.push(await original.compute(value));
      expected.push(row);
    }
    const browserScript=[
      "import {compute} from '/native/api.mjs';",
      "import {batch as generated} from '/obfs/api.mjs';",
      "import {batch as ordinary} from '/ordinary/api.mjs';",
      'const cases='+JSON.stringify(inputs)+';',
      'const expected='+JSON.stringify(expected)+';',
      'const impl={',
      '  native:async calls=>{const output=[];for(const call of calls)',
      '    output.push({ok:true,value:await compute(...call.args)});return output;},',
      '  generated,ordinary',
      '};',
      'const stats={native:[],generated:[],ordinary:[]};',
      'try{',
      '  for(let warm=0;warm<2;warm++){',
      '    const calls=cases[warm].map(text=>({name:"compute",args:[text]}));',
      '    for(const name of ["native","generated","ordinary"])await impl[name](calls);',
      '  }',
      '  for(let trial=0;trial<cases.length;trial++){',
      '    const calls=cases[trial].map(text=>({name:"compute",args:[text]}));',
      '    const desired=expected[trial].map(value=>({ok:true,value}));',
      '    const order=trial%2===0?["native","generated","ordinary"]:',
      '      ["ordinary","generated","native"];',
      '    for(const name of order){',
      '      const begin=performance.now();',
      '      const value=await impl[name](calls);',
      '      const elapsed=performance.now()-begin;',
      '      if(JSON.stringify(value)!==JSON.stringify(desired))',
      '        throw Error("parity "+name+" trial "+trial);',
      '      stats[name].push(elapsed);',
      '    }',
      '  }',
      '  document.getElementById("answer").textContent=',
      '    JSON.stringify({ok:true,stats});',
      '}catch(error){document.getElementById("answer").textContent=',
      '  JSON.stringify({ok:false,error:String(error),stats});}'
    ].join('\n');
    const handler=createScoGraphHandler(graph,{'api.mjs':original},{
      authorizeRpc:()=>true,authorizeOperation:()=>true
    });
    server=http.createServer((request,response)=>{
      const url=request.url??'/';
      if(url.startsWith('/obfs/')){handler(request,response);return;}
      response.setHeader('content-security-policy',
        "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'");
      response.setHeader('cache-control','no-store');
      if(url==='/'){
        response.writeHead(200,{'content-type':'text/html; charset=utf-8'})
          .end('<!doctype html><html><body><pre id="answer">pending</pre>'+
            '<script type="module" src="/app.mjs"></script></body></html>');
        return;
      }
      const code=url==='/app.mjs'?browserScript:sourceFiles.get(url);
      if(code!==undefined){
        response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'}).end(code);
      }else response.writeHead(404).end();
    });
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing socket');
    const html=await render('http://127.0.0.1:'+address.port+'/');
    const match=html.match(/<pre id="answer">([^<]+)<\/pre>/u);
    assert.ok(match,'No browser result: '+html.slice(-2200));
    const result=JSON.parse(match[1]);
    assert.equal(result.ok,true,'Browser parity failure: '+JSON.stringify(result));
    const stats=/** @type {{native:number[],generated:number[],ordinary:number[]}} */ (result.stats);
    for(const arm of ['native','generated','ordinary']){
      const times=stats[/** @type {keyof typeof stats} */ (arm)];
      assert.equal(times.length,6);
      assert.ok(times.every(value=>Number.isFinite(value)&&value>0));
    }
    const rows=stats.native.map((duration,index)=>({
      generatedOverNative:stats.generated[index]/duration,
      ordinaryOverNative:stats.ordinary[index]/duration,
      generatedOverOrdinary:stats.generated[index]/stats.ordinary[index]
    }));
    console.log(JSON.stringify({
      experiment:'sco-graph-browser-native-versus-generated-and-ordinary',
      boundary:'real headless Chrome, hot browser wall time including HTTP loopback',
      trialCount:6,batchSize:8,roundsPerCall:250000,
      originalPrivateModules:2,protectedModules:1,
      trustControl:'ordinary minified client uses same server/secret/policy/method IDs',
      nativeBrowserControl:'original source served separately for measurement only',
      initialization:'ESM load and two warm calls excluded; no client-startup compliance claim',
      ms:stats,ratios:rows,
      strictGeneratedNativeBreaches:rows.filter(item=>item.generatedOverNative>2.5).length,
      strictOrdinaryNativeBreaches:rows.filter(item=>item.ordinaryOverNative>2.5).length,
      securityClaim:'none: controls intentionally publish original JS'
    }));
  }finally{
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await fs.rm(temp,{recursive:true,force:true});
  }
});
