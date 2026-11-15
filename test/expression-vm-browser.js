'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {'bytecode'|'native'} Backend */

/**
 * Run a real headless browser rather than executing modules under Node's
 * largely overlapping but distinct runtime semantics.
 * @param {string} browser
 * @param {string} url
 * @returns {Promise<string>}
 */
async function dumpDom(browser,url) {
  const {stdout}=await promisify(execFile)(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3500','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
  return stdout;
}

/** @returns {Promise<void>} */
async function main() {
  const binary=process.env.CHROMIUM_BIN??'chromium';
  /** @type {Map<string,{body:string,type:string}>} */
  const content=new Map();
  const input=(backend)=>[
    {path:backend+'-worker.mjs',sourceType:/** @type {const} */ ('module'),
      code:'export function mix(x){return ((x+7)*(x-5))^((x+3)&255);}'},
    {path:backend+'-entry.mjs',sourceType:/** @type {const} */ ('module'),
      code:'import {mix} from "./'+backend+'-worker.mjs";'+
        'window.externalBridge.accept(mix(11));'}
  ];
  for(const backend of /** @type {Backend[]} */ (['bytecode','native'])) {
    const files=input(backend);
    const worker=backend+'-worker.mjs';
    const options={mode:/** @type {const} */ ('coo'),seed:'chrome-graph-'+backend,
      ...(backend==='bytecode'?
        {experimentalExpressionVm:{[worker]:['mix']}}:
        {experimentalNativeGraph:{[worker]:['mix']}})
    };
    const output=obfuscateFiles(files,options);
    const transformed=output.files.find(file=>file.path===worker);
    assert.ok(transformed&&typeof transformed.code==='string');
    if(backend==='bytecode')assert.match(transformed.code,/switch\(/u);
    else assert.doesNotMatch(transformed.code,/switch\(/u);
    for(const file of output.files)content.set('/'+file.path,{
      body:/** @type {string} */ (file.code),type:'text/javascript; charset=utf-8'
    });
    const html='<!doctype html><html><body><div id="answer">initial</div>'+
      '<script>window.externalBridge={accept:function(value){'+
      'document.getElementById("answer").textContent=String(value);}};</script>'+
      '<script type="module" src="/'+backend+'-entry.mjs"></script></body></html>';
    content.set('/'+backend+'.html',{body:html,type:'text/html; charset=utf-8'});
  }
  const server=http.createServer((request,response)=>{
    const found=content.get(request.url??'');
    if(!found) {
      response.writeHead(404,{'Content-Type':'text/plain'});
      response.end('missing');
      return;
    }
    response.writeHead(200,{'Content-Type':found.type,'Cache-Control':'no-store'});
    response.end(found.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const expected=String(((11+7)*(11-5))^((11+3)&255));
    for(const backend of /** @type {Backend[]} */ (['bytecode','native'])) {
      const url='http://127.0.0.1:'+address.port+'/'+backend+'.html';
      const document=await dumpDom(binary,url);
      const answer=/<div id="answer">([^<]*)<\/div>/u.exec(document)?.[1];
      assert.equal(answer,expected,backend+' browser result did not preserve the host API call');
    }
    console.log('Real Chromium COO ESM modules: bytecode and native graphs matched '+expected);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={main};
