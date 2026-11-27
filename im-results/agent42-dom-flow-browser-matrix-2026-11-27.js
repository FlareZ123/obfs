'use strict';

/**
 * An independently deployable real-Chromium HTML/ESM graph differential.
 * Executes a 16-carrier × 3-mode valid import matrix in a SINGLE native
 * browser session. Checks both exact Element.id DOMString function sources
 * and genuinely unrelated private-property rewrite metrics.
 *
 * Run via the existing source-observer-direct-validator.yml with an exact
 * compiler candidate SHA and an independently pinned test-only harness SHA.
 */
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require(path.join(process.cwd(),'src'));
const run=promisify(execFile);

/** @typedef {'coo'|'sno'|'sco'} Mode */
/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/** @typedef {{label:string,setup:string,expression:string,imports?:string,callable?:string,assigned?:boolean,extra?:SourceFile[]}} Case */
/** @type {Case[]} */
const samples=[
  {label:'direct',setup:'',expression:'inspect'},
  {label:'immutable-alias',setup:'const forwarded=inspect;',expression:'forwarded'},
  {label:'immutable-chain',setup:'const a=inspect;const forwarded=a;',expression:'forwarded'},
  {label:'mutable-assignment',setup:'let forwarded;forwarded=inspect;',expression:'forwarded'},
  {label:'object-property',setup:'const holder={fn:inspect};',expression:'holder.fn'},
  {label:'array-index',setup:'const holder=[inspect];',expression:'holder[0]'},
  {label:'object-assignment',setup:'const holder={};holder.fn=inspect;',expression:'holder.fn'},
  {label:'object-alias',setup:'const a={fn:inspect};const holder=a;',expression:'holder.fn'},
  {label:'destructure',setup:'const {fn:forwarded}={fn:inspect};',expression:'forwarded'},
  {label:'conditional',setup:'const forwarded=true?inspect:undefined;',expression:'forwarded'},
  {label:'local-return',setup:'function identity(x){return x;}',expression:'identity(inspect)'},
  {label:'closure-return',setup:'function identity(){return inspect;}',expression:'identity()'},
  {label:'arrow-return',setup:'const identity=()=>inspect;',expression:'identity()'},
  {label:'callback-parameter',setup:'function publish(x){target.id=x;}publish(inspect);',
    expression:'',assigned:true},
  {label:'namespace-import',setup:'',imports:'import * as api from "./logic.mjs";',
    expression:'api.inspect',callable:'api.inspect()'},
  {label:'barrel-reexport',setup:'',imports:'import {inspect} from "./barrel.mjs";',
    expression:'inspect',extra:[
      {path:'barrel.mjs',sourceType:'module',code:'export {inspect} from "./logic.mjs";'}]}
];

/** @param {Case} sample @returns {SourceFile[]} */
function graph(sample){
  return [
    {path:'logic.mjs',sourceType:'module',code:
      'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',code:
      'const record={privateField:73};export const independent=record.privateField;'},
    ...(sample.extra??[]),
    {path:'observer.mjs',sourceType:'module',code:[
      sample.imports??'import {inspect} from "./logic.mjs";',
      'import {independent} from "./pure.mjs";',
      'const target=document.createElement("div");',sample.setup,
      sample.assigned?'':'target.id='+sample.expression+';',
      'export const observed={source:target.id,value:'+(sample.callable??'inspect()')+
        ',independent};'
    ].filter(Boolean).join('\n')}
  ];
}

/** @param {string[]} urls @returns {string} */
function html(urls){
  const runModule='const paths='+JSON.stringify(urls)+';'+
    'try{const output=await Promise.all(paths.map(async x=>({path:x,'+
    'data:(await import(x)).observed})));'+
    'document.getElementById("result").textContent='+
    'btoa(JSON.stringify({output}));}catch(error){'+
    'document.getElementById("result").textContent='+
    'btoa(JSON.stringify({error:String(error),stack:String(error?.stack||"")}));}';
  return '<!doctype html><html><body><pre id="result">pending</pre>'+
    '<script type="module">'+runModule+'</script></body></html>';
}

/** @param {string} url @returns {Promise<{output?:Array<{path:string,data:{source:string,value:number,independent:number}}>,error?:string,stack?:string}>} */
async function browser(url){
  const {stdout,stderr}=await run(process.env.CHROMIUM_BIN||'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=6500','--dump-dom',url
  ],{timeout:35000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const b64=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(b64,'Chromium did not resolve 96 ESM modules: '+
    stdout.slice(0,500)+'; '+stderr.slice(0,250));
  return JSON.parse(Buffer.from(b64,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main(){
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  /** @type {Array<{mode:Mode,flow:string,metrics:number,positive:number}>} */
  const summaries=[];
  /** @type {string[]} */
  const urls=[];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    for(const sample of samples){
      const originals=graph(sample);
      const result=obfuscateFiles(originals,{
        mode,seed:'dom-real-chromium-flow-matrix/'+mode+'/'+sample.label,
        closedWorld:true,identifiers:false,strings:false,properties:true
      });
      const producer=result.files.find(f=>f.path==='logic.mjs');
      const independent=result.files.find(f=>f.path==='pure.mjs');
      assert.ok(producer&&independent);
      assert.ok(independent.metrics.properties>=1,
        mode+'/'+sample.label+' independently protected primitive rewrite');
      summaries.push({mode,flow:sample.label,metrics:producer.metrics.properties,
        positive:independent.metrics.properties});
      for(const [kind,files] of /** @type {const} */ ([['native',originals],['emitted',result.files]])){
        const prefix='/'+mode+'/'+sample.label+'/'+kind+'/';
        for(const file of files)
          routes.set(prefix+file.path,{type:'text/javascript',body:String(file.code)});
        urls.push(prefix+'observer.mjs');
      }
    }
  }
  routes.set('/index.html',{type:'text/html',body:html(urls)});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url??'/', 'http://127.0.0.1').pathname;
    const matched=routes.get(url);
    if(!matched){res.writeHead(404).end('not found');return;}
    res.writeHead(200,{'content-type':matched.type+'; charset=utf-8',
      'cache-control':'no-store'});
    res.end(matched.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  /** @type {Array<{mode:Mode,flow:string,expected:string,actual:string,producerRewrites:number,independentRewrites:number}>} */
  const mismatches=[];
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const observed=await browser('http://127.0.0.1:'+address.port+'/index.html');
    assert.equal(observed.error,undefined,observed.stack||observed.error);
    assert.equal(observed.output?.length,96,'every original and emitted ESM graph must execute');
    /** @type {Map<string,{source:string,value:number,independent:number}>} */
    const outputs=new Map((observed.output??[]).map(x=>[x.path,x.data]));
    for(const summary of summaries){
      const prefix='/'+summary.mode+'/'+summary.flow+'/';
      const native=outputs.get(prefix+'native/observer.mjs');
      const emitted=outputs.get(prefix+'emitted/observer.mjs');
      assert.ok(native&&emitted,summary.mode+'/'+summary.flow+' must execute');
      assert.equal(native.source,'function inspect(){return owner.secretField;}');
      assert.equal(native.value,57);
      assert.equal(native.independent,73);
      assert.equal(emitted.value,57);
      assert.equal(emitted.independent,73);
      if(native.source!==emitted.source) mismatches.push({
        mode:summary.mode,flow:summary.flow,
        expected:native.source,actual:emitted.source,
        producerRewrites:summary.metrics,independentRewrites:summary.positive
      });
    }
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
  console.log('DOM_FLOW_REAL_CHROMIUM '+JSON.stringify({cases:summaries,mismatches}));
  assert.deepEqual(mismatches,[],
    'Imported function stringified by real Element.id must remain source-identical');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
