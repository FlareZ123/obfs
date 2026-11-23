'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const runBrowser=promisify(execFile);
const source=[
  'function secretI32(x){return (((x^137)&(x>>>3))|(x<<7));}',
  'export function published(value){return secretI32(value);}',
  'export const primitive=published(3);'
].join('\n');

/** @returns {string} */
function observerPage(){
  return '<!doctype html><meta charset="utf-8"><body><script type="module">'+
    'try{const api=await import("./public.mjs");'+
    'const result={source:Function.prototype.toString.call(api.published),'+
      'value:api.published(7),primitive:api.primitive};'+
    'const node=document.createElement("pre");node.id="result";'+
    'node.textContent=btoa(JSON.stringify(result));document.body.appendChild(node);'+
    '}catch(error){const node=document.createElement("pre");node.id="failure";'+
    'node.textContent=String(error.stack||error);document.body.appendChild(node);}'+
    '</script></body>';
}

/**
 * An unknown external browser importer is served AFTER private-helper
 * virtualization. The public facade is left byte-for-byte source-compatible;
 * Chrome's native Function#toString remains unmodified.
 *
 * @returns {Promise<void>}
 */
async function browserPrivateWasmDifferential(){
  /** @type {Map<string,string>} */
  const pages=new Map();
  pages.set('/native/public.mjs',source);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const out=obfuscateFiles([{path:'public.mjs',sourceType:'module',code:source}],{
      mode,strings:false,identifiers:false,properties:false,
      experimentalWasmI32:{'public.mjs':['secretI32']},
      seed:'agent38-chrome-private-wasm/'+mode
    }).files[0];
    assert.equal(out.metrics.wasmI32Functions,1);
    assert.equal(typeof out.code,'string');
    pages.set('/'+mode+'/public.mjs',out.code);
  }
  for(const name of ['native','coo','sno','sco'])
    pages.set('/'+name+'/index.html',observerPage());
  const server=http.createServer((req,res)=>{
    if(req.method!=='GET'){res.writeHead(405).end();return;}
    const pathname=new URL(req.url??'/', 'http://localhost').pathname;
    const value=pages.get(pathname);
    if(value===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':pathname.endsWith('.mjs')?
      'text/javascript; charset=utf-8':'text/html; charset=utf-8'});
    res.end(value);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('No localhost bound address');
    const base='http://127.0.0.1:'+addr.port;
    /** @type {{source:string,value:number,primitive:number}|null} */
    let baseline=null;
    /** @type {{variant:string,sourceEqual:boolean,valueEqual:boolean,source:string}[]} */
    const rows=[];
    for(const name of ['native','coo','sno','sco']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',
        base+'/'+name+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      const encoded=/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u.exec(stdout)?.[1];
      assert.ok(encoded,name+' browser failed: '+stdout.slice(0,1500));
      /** @type {{source:string,value:number,primitive:number}} */
      const observation=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
      if(!baseline)baseline=observation;
      rows.push({variant:name,sourceEqual:observation.source===baseline.source,
        valueEqual:observation.value===baseline.value&&
          observation.primitive===baseline.primitive,source:observation.source});
    }
    console.log('CHROME_PRIVATE_WASM_PUBLIC_SOURCE_PARITY '+JSON.stringify(rows));
    assert.ok(rows.every(row=>row.valueEqual),'Functional JavaScript remains equal');
    assert.ok(rows.every(row=>row.sourceEqual),
      'Unknown external Chromium import can observe source of an exported callable');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

test('real Chromium sees unchanged public facade with private Wasm transformation',{
  skip:process.platform==='win32'?'Chromium source harness runs on Linux CI':false
},browserPrivateWasmDifferential);
