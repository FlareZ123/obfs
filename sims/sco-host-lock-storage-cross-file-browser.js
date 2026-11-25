'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {parse,observesFunctionSource}=require('../src/ast');

const exec=promisify(execFile);
const logic=[
  'export function inspect(){const privateLocal=31;return privateLocal;}'
].join('\n');
const entry=[
  'import {inspect} from "./logic.mjs";',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  localStorage.clear();',
  '  localStorage.setItem("sco-cross-file-storage-source",inspect);',
  '  return {value:inspect(),independent:independent(),',
  '    stored:localStorage.getItem("sco-cross-file-storage-source"),host:location.hostname};',
  '}'
].join('\n');

/**
 * @param {string} value
 * @returns {{length:number,sha256:string,containsPrivateName:boolean}}
 */
function fingerprint(value){
  return {
    length:value.length,
    sha256:crypto.createHash('sha256').update(value,'utf8').digest('hex'),
    containsPrivateName:value.includes('privateLocal')
  };
}

/**
 * @param {string} indexUrl
 * @returns {Promise<{kind:'PASS',result:{value:number,independent:number,stored:string,host:string}}|{kind:'ERROR',message:string}>}
 */
async function executeChromium(indexUrl){
  const {stdout,stderr}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3000','--dump-dom',
    indexUrl
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  const pass=stdout.match(/<pre id="result">PASS:([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  if(pass){
    return {kind:'PASS',result:/** @type {{value:number,independent:number,stored:string,host:string}} */(
      JSON.parse(Buffer.from(pass,'base64').toString('utf8'))
    )};
  }
  const error=stdout.match(/<pre id="result">ERROR:([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  if(error)return {kind:'ERROR',message:Buffer.from(error,'base64').toString('utf8')};
  throw new Error('Chromium did not publish a module result: '+String(stderr)+' '+stdout.slice(0,1200));
}

async function main(){
  assert.equal(observesFunctionSource(parse(logic,'module')),false,
    'producer has no explicit source observer');
  assert.equal(observesFunctionSource(parse(entry,'module')),false,
    'consumer Storage WebIDL sink is currently missed');

  const files=[
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
  let output;
  try{
    output=obfuscateFiles(files,{
      mode:'sco',
      seed:'sco-cross-file-storage-source-browser',
      closedWorld:true,
      allowedHosts:['127.0.0.1'],
      strings:false,
      properties:false,
      identifiers:true
    });
  }catch(error){
    process.stdout.write('SCO_CROSS_FILE_STORAGE_SOURCE_BROWSER '+JSON.stringify({
      sourceObserver:{producer:observesFunctionSource(parse(logic,'module')),
        consumer:observesFunctionSource(parse(entry,'module'))},
      compilationRejected:true,
      rejection:String(error)
    })+'\n');
    return;
  }
  const producer=output.files.find(file=>file.path==='logic.mjs');
  const consumer=output.files.find(file=>file.path==='entry.mjs');
  assert.ok(producer&&consumer,'expected both modules in the output graph');
  const producerCode=String(producer.code);
  const consumerCode=String(consumer.code);
  assert.ok(producerCode.includes('127.0.0.1')&&consumerCode.includes('127.0.0.1'),
    'expected a complete graph to receive host guards');
  assert.ok(producerCode.includes('Unauthorized execution host')&&
    consumerCode.includes('Unauthorized execution host'),
    'expected each guarded module to reject an unauthorized hostname');

  const bodies=new Map([
    ['/native/index.html','native'],
    ['/native/entry.mjs',entry],
    ['/native/logic.mjs',logic],
    ['/generated/index.html','generated'],
    ['/generated/entry.mjs',consumerCode],
    ['/generated/logic.mjs',producerCode],
    ['/denied/index.html','denied'],
    ['/denied/entry.mjs',consumerCode],
    ['/denied/logic.mjs',producerCode]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=(request.url??'/').split('?')[0];
    const body=bodies.get(pathname);
    if(body===undefined){response.writeHead(404);response.end();return;}
    if(pathname.endsWith('.mjs')){
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(body);
      return;
    }
    const html=[
      '<!doctype html><html><body><pre id="result">PENDING</pre>',
      '<script type="module">',
      'try {',
      '  const {sample}=await import("./entry.mjs");',
      '  const result=sample();',
      '  document.getElementById("result").textContent="PASS:"+btoa(JSON.stringify(result));',
      '} catch(error) {',
      '  document.getElementById("result").textContent="ERROR:"+btoa(String(error.message||error));',
      '}',
      '</script></body></html>'
    ].join('\n');
    response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    response.end(html);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen({port:0,host:'0.0.0.0'},()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing browser fixture port');
    const port=address.port;
    const native=await executeChromium('http://127.0.0.1:'+port+'/native/index.html');
    const emitted=await executeChromium('http://127.0.0.1:'+port+'/generated/index.html');
    const denied=await executeChromium('http://127.0.0.2:'+port+'/denied/index.html');

    assert.equal(native.kind,'PASS','native two-file module graph must execute');
    assert.equal(emitted.kind,'PASS','allowed SCO two-file graph must execute');
    assert.equal(denied.kind,'ERROR','generated graph must reject a different hostname');
    assert.match(denied.message,/Unauthorized execution host/u);
    if(native.kind!=='PASS'||emitted.kind!=='PASS')throw new Error('Expected native and emitted graph results');

    assert.equal(native.result.host,'127.0.0.1');
    assert.equal(emitted.result.host,'127.0.0.1');
    assert.equal(native.result.value,31);
    assert.equal(emitted.result.value,31);
    assert.equal(native.result.independent,7);
    assert.equal(emitted.result.independent,7);
    assert.ok(native.result.stored.includes('privateLocal'));
    const sourceParity=native.result.stored===emitted.result.stored;
    const producerBindings=producer.metrics.bindings;
    const consumerBindings=consumer.metrics.bindings;
    if(producerBindings>0){
      assert.ok(!emitted.result.stored.includes('privateLocal'),
        'a rewritten exported producer should be visible through Storage source conversion');
    }
    process.stdout.write('SCO_CROSS_FILE_STORAGE_SOURCE_BROWSER '+JSON.stringify({
      browser:'Chromium',
      sourceObserver:{producer:observesFunctionSource(parse(logic,'module')),
        consumer:observesFunctionSource(parse(entry,'module'))},
      metrics:{producer:producer.metrics,consumer:consumer.metrics},
      nativeSource:fingerprint(native.result.stored),
      emittedSource:fingerprint(emitted.result.stored),
      sourceParity,
      runtimeValuesPreserved:true,
      hostLockPositive:true,
      hostLockNegative:true
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={main};
