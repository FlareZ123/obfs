'use strict';

/**
 * A pinned, independent Chromium differential for source-bearing functions
 * passed from statically imported ESM bindings through immutable local aliases
 * into the *native* Element.id DOMString setter. This is a test-only harness.
 *
 * The reviewer workflow checks out the exact candidate, then executes this
 * file from RUNNER_TEMP, so resolve the candidate's actual source via cwd.
 */
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require(path.join(process.cwd(),'src'));
const run=promisify(execFile);

/** @typedef {'coo'|'sno'|'sco'} Mode */
/** @typedef {{path:string,code:string,sourceType:'module'}} SourceFile */

/**
 * @param {boolean} alias
 * @returns {SourceFile[]}
 */
function graph(alias) {
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'const owner={secretField:57};'+
        'export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',
      code:'const record={privateField:73};'+
        'export const independent=record.privateField;'},
    {path:'observer.mjs',sourceType:'module',
      code:'import {inspect} from "./logic.mjs";'+
        'import {independent} from "./pure.mjs";'+
        (alias?'const indirect=inspect;':'')+
        'const target=document.createElement("div");'+
        'target.id='+(alias?'indirect':'inspect')+';'+
        'export const observed={source:target.id,value:inspect(),independent};'}
  ];
}

/**
 * @returns {string}
 */
function html(){
  return '<!doctype html><html><body><pre id="result">pending</pre>'+
    '<script type="module">'+
    'import {observed} from "./observer.mjs";'+
    'document.getElementById("result").textContent='+
    'btoa(JSON.stringify(observed));'+
    '</script></body></html>';
}

/**
 * @param {string} url
 * @returns {Promise<{source:string,value:number,independent:number}>}
 */
async function browser(url){
  const {stdout,stderr}=await run(process.env.CHROMIUM_BIN||'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2200','--dump-dom',url
  ],{timeout:25000,maxBuffer:3*1024*1024,encoding:'utf8'});
  const matched=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(matched,'Native Chromium ESM did not execute: '+
    stdout.slice(0,500)+'; '+stderr.slice(0,250));
  return JSON.parse(Buffer.from(matched,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  /** @type {Array<{mode:Mode,alias:boolean,code:string,metrics:number,positive:number}>} */
  const cases=[];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    for(const alias of [false,true]){
      const originals=graph(alias);
      const result=obfuscateFiles(originals,{
        mode,seed:'agent42-real-chromium-dom-'+mode+'-'+alias,
        closedWorld:true,properties:true,identifiers:false,strings:false
      });
      const observed=result.files.find(file=>file.path==='logic.mjs');
      const independent=result.files.find(file=>file.path==='pure.mjs');
      assert.ok(observed&&independent);
      assert.ok(independent.metrics.properties>=1,
        mode+' / '+alias+' unrelated primitive control must be rewritten');
      const root='/'+mode+'/'+(alias?'alias':'direct');
      for(const [kind,files] of /** @type {const} */ ([['native',originals],['emitted',result.files]])){
        const prefix=root+'/'+kind;
        routes.set(prefix+'/index.html',{type:'text/html',body:html()});
        for(const file of files){
          routes.set(prefix+'/'+file.path,{type:'text/javascript',body:String(file.code)});
        }
      }
      cases.push({
        mode,alias,code:String(observed.code),metrics:observed.metrics.properties,
        positive:independent.metrics.properties
      });
    }
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const found=routes.get(pathname);
    if(!found){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':found.type+'; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(found.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  /** @type {Array<{mode:Mode,alias:boolean,expected:string,actual:string,producerRewrites:number,positiveRewrites:number}>} */
  const mismatches=[];
  /** @type {Array<{mode:Mode,alias:boolean,passed:boolean,producerRewrites:number,positiveRewrites:number}>} */
  const summaries=[];
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    for(const sample of cases){
      const prefix='/'+sample.mode+'/'+(sample.alias?'alias':'direct');
      const native=await browser(origin+prefix+'/native/index.html');
      const emitted=await browser(origin+prefix+'/emitted/index.html');
      assert.equal(native.value,57,'native value for '+prefix);
      assert.equal(native.independent,73,'native independent control for '+prefix);
      assert.equal(emitted.value,57,'emitted value for '+prefix);
      assert.equal(emitted.independent,73,'emitted independent control for '+prefix);
      assert.equal(native.source,
        'function inspect(){return owner.secretField;}',
        'native function source baseline for '+prefix);
      if(!sample.alias){
        assert.deepEqual(emitted,native,'direct import must preserve source '+prefix);
        assert.equal(sample.metrics,0,'direct producer must not be renamed '+prefix);
      }
      const passed=JSON.stringify(native)===JSON.stringify(emitted);
      summaries.push({
        mode:sample.mode,alias:sample.alias,passed,
        producerRewrites:sample.metrics,positiveRewrites:sample.positive
      });
      if(!passed){
        mismatches.push({
          mode:sample.mode,alias:sample.alias,
          expected:native.source,actual:emitted.source,
          producerRewrites:sample.metrics,positiveRewrites:sample.positive
        });
      }
    }
  }finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
  console.log('DOM_ALIAS_REAL_CHROMIUM '+JSON.stringify({
    originalSourceHead:process.env.CANDIDATE_SHA??null,
    sourceVersion:'2026-11-27-test-only',
    summaries,mismatches
  }));
  assert.deepEqual(mismatches,[],
    'Native Chromium Element.id must not observe transformed function source through an immutable imported alias');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
