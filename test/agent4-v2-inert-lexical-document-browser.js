'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const launch=promisify(execFile);
/** @typedef {{name:string,source:string,observed:boolean,expectedHit:boolean}} Case */
const preface='function protectedFn(secretArg){return secretArg+1;}';
/** @type {Case[]} */
const cases=[
  {name:'own-title-data-with-hostile-inherited-setter',
    source:'const document={title:"ready"};'+preface+
      'document.title=protectedFn;export function sample(){return protectedFn(41);}',
    observed:false,expectedHit:false},
  {name:'null-prototype-local-document',
    source:'const document={__proto__:null};'+preface+
      'document.title=protectedFn;export function sample(){return protectedFn(41);}',
    observed:false,expectedHit:false},
  {name:'local-record-and-real-host-document',
    source:'const document={title:"ready"};'+preface+
      'document.title=protectedFn;globalThis.document.title=protectedFn;'+
      'export function sample(){return protectedFn(41);}',
    observed:true,expectedHit:false},
  {name:'ordinary-object-inherited-hostile-setter',
    source:'const document={};'+preface+
      'document.title=protectedFn;export function sample(){return protectedFn(41);}',
    observed:true,expectedHit:true}
];

/** @returns {string} */
function html(){
  return '<!doctype html><html><head><meta charset="utf-8">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; connect-src \'self\'; object-src \'none\'">'+
    '<title>browser-host-title</title></head><body>'+
    '<pre id="result">pending</pre><script type="module" src="/runner.mjs"></script></body></html>';
}
const runner=[
  'try {',
  '  globalThis.__prototypeHit="";',
  '  Object.defineProperty(Object.prototype,"title",{configurable:true,',
  '    set(value){globalThis.__prototypeHit=String(value);}});',
  '  const args=new URL(location.href).searchParams;',
  '  const module=await import("/"+args.get("variant")+".mjs");',
  '  const answer={value:module.sample(),title:document.title,',
  '    inheritedSetter:globalThis.__prototypeHit};',
  '  document.getElementById("result").textContent=btoa(JSON.stringify(answer));',
  '} catch(error) {',
  '  document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
  '}'
].join('\n');

/**
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Map<string,string>} */
  const resources=new Map([['/',html()],['/runner.mjs',runner]]);
  /** @type {Map<string,{bindings:number,expectedSource:Case}>} */
  const outputs=new Map();
  for(const item of cases) {
    resources.set('/'+item.name+'-native.mjs',item.source);
    const result=obfuscateFiles([{
      path:'case.mjs',sourceType:'module',code:item.source
    }],{
      mode:'coo',seed:'agent4-v2-document-browser-'+item.name,
      closedWorld:true,identifiers:true,properties:false,strings:false
    }).files[0];
    if(item.observed)assert.equal(result.metrics.bindings,0,
      item.name+' must still refuse native Function source observers');
    else assert.ok(result.metrics.bindings>0,
      item.name+' inert lexical record should retain obfuscation');
    resources.set('/'+item.name+'-compiled.mjs',String(result.code));
    outputs.set(item.name,{bindings:result.metrics.bindings,expectedSource:item});
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname==='/'?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing server port');
    const origin='http://127.0.0.1:'+address.port;
    const chrome=process.env.CHROMIUM_BIN??'google-chrome';
    let casesMatched=0;
    for(const item of cases) {
      /** @type {{value:number,title:string,inheritedSetter:string}|null} */
      let native=null;
      for(const variant of ['native','compiled']) {
        const url=origin+'/?variant='+item.name+'-'+variant;
        const {stdout}=await launch(chrome,[
          '--headless','--no-sandbox','--disable-gpu',
          '--disable-dev-shm-usage','--no-first-run','--virtual-time-budget=7000',
          '--dump-dom',url
        ],{timeout:45000,maxBuffer:6*1024*1024,encoding:'utf8'});
        const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
        assert.ok(encoded,'Browser failed '+item.name+'/'+variant+': '+stdout.slice(0,1500));
        const result=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
        if(variant==='native')native=result;
        else assert.deepEqual(result,native,item.name+' source/native browser mismatch');
      }
      assert.equal(native?.value,42,item.name);
      assert.equal(native?.inheritedSetter.length>0,item.expectedHit,item.name);
      assert.equal(native?.title==='browser-host-title',!item.observed,item.name);
      if(item.observed)assert.match(
        item.expectedHit?native?.inheritedSetter??'':native?.title??'',
        /function protectedFn\(secretArg\)/u,item.name);
      console.log('LEXICAL_DOCUMENT_CHROMIUM '+JSON.stringify({
        case:item.name,bindings:outputs.get(item.name)?.bindings,native,parity:true
      }));
      casesMatched++;
    }
    console.log('LEXICAL_DOCUMENT_CHROMIUM_SUMMARY '+
      JSON.stringify({casesMatched,strictCsp:true,sourceProof:'bounded'}));
  }finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
