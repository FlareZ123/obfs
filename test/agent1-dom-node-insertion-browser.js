'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const exec=promisify(execFile);
/** @typedef {{path:string,sourceType:'script'|'asset',code:string|Buffer}} SourceFile */

/**
 * Native browser Node insertion uses the Node branch of
 * (Node or DOMString)...; a function returned by a replaced factory takes
 * the string branch, exposing exact Function#toString through textContent.
 * The host-side inline reporter is deliberately outside distributed code.
 *
 * @param {'native'|'replaced'|'integrity'} variant
 * @returns {SourceFile[]}
 */
function graph(variant) {
  const original='globalThis.nodeMountAnswer="unmodified behavior despite transformed client payload";';
  const digest=createHash('sha256').update(original).digest('base64');
  const source=[
    'const script=document.createElement("script");',
    'script.src="./client.js";',
    variant==='integrity'?'script.integrity="sha256-'+digest+'";':'',
    'document.head.append(script);'
  ].join('');
  const poison='document.createElement=function nativeLookingFactory(){'+
    'return function inspect(){const privateLocal=29;return privateLocal;};};';
  const host='<html><head></head><body>'+
    '<pre id="result"></pre>'+
    (variant==='replaced'?'<script src="./poison.js"></script>':'')+
    '<script src="./bootstrap.js"></script>'+
    '<script>window.addEventListener("load",()=>{'+
    'const result={answer:window.nodeMountAnswer??null,'+
    'observed:document.head.lastChild?.textContent??""};'+
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));'+
    '});</script></body></html>';
  const out=[
    {path:'client.js',sourceType:'script',code:original},
    {path:'bootstrap.js',sourceType:'script',code:source}
  ];
  if(variant==='replaced')out.push({path:'poison.js',sourceType:'script',code:poison});
  out.push({path:'index.html',sourceType:'asset',code:Buffer.from(host)});
  return out;
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,string|Buffer>} */
  const files=new Map();
  /** @type {Record<string,{rewritten:boolean,parity:boolean,observed:string}>} */
  const report={};
  const variants=/** @type {const} */(['native','replaced','integrity']);
  for(const variant of variants) {
    const original=graph(variant);
    const output=obfuscateFiles(original,{
      mode:'coo',seed:'agent1-real-native-dom-node/'+variant,
      strings:true,identifiers:false,properties:false
    });
    const control=original.find(file=>file.path==='client.js');
    const changed=output.files.find(file=>file.path==='client.js');
    assert.ok(control&&changed);
    if(variant==='native')assert.notEqual(changed.code,control.code,
      'No-integrity native Node mount must transform delivered client source');
    else assert.equal(changed.code,control.code,
      'A source-observing or SRI-pinned graph must preserve source bytes');
    for(const [type,source] of /** @type {const} */([
      ['native',original],['emitted',output.files]
    ])) {
      for(const file of source)files.set('/'+variant+'/'+type+'/'+file.path,
        /** @type {string|Buffer} */ (file.code));
    }
  }
  const server=http.createServer((request,response)=>{
    const path=new URL(request.url??'/','http://localhost').pathname;
    const file=files.get(path);
    if(request.method!=='GET') {response.writeHead(405).end();return;}
    if(file===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':path.endsWith('index.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(file);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    for(const variant of variants) {
      /** @type {{answer:string|null,observed:string}|null} */
      let native=null;
      for(const type of ['native','emitted']) {
        const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=12000','--dump-dom',
          origin+'/'+variant+'/'+type+'/index.html'
        ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
        const match=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u);
        assert.ok(match,'Chromium '+variant+'/'+type+' missing host result: '+
          stdout.slice(0,1500));
        const value=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));
        if(type==='native')native=value;
        else assert.deepEqual(value,native,'Chromium source parity '+variant);
      }
      assert.ok(native);
      if(variant==='replaced') {
        assert.ok(native.observed.includes('privateLocal'),
          'Real browser DOMString branch exposes original callable body');
        assert.equal(native.answer,null);
      } else {
        assert.equal(native.answer,
          'unmodified behavior despite transformed client payload');
        assert.equal(native.observed,'',
          'Real browser Node branch must not stringify an element');
      }
      report[variant]={rewritten:variant==='native',parity:true,
        observed:native.observed};
    }
    process.stdout.write('DOM_NODE_INSERTION_REAL_CHROMIUM '+
      JSON.stringify(report)+'\n');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve(undefined)));
  }
}
if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={main,graph};
