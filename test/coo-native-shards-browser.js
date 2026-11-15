'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function dumpDom(binary,url) {
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * Exercise three independent browser ESM files and a page-owned host API.
 * This is a behavioral check, not a source-confidentiality assertion.
 * @returns {Promise<void>}
 */
async function main() {
  const topology=process.argv.includes('--paired')?'paired':'split';
  const root=path.join(__dirname,'..','examples','coo-native-shards');
  /** @type {Map<string,{type:string,body:string}>} */
  const assets=new Map();
  const original=await fs.readFile(path.join(root,'before','main.mjs'),'utf8');
  assets.set('/original.mjs',{type:'text/javascript; charset=utf-8',body:original});
  const folder=topology==='paired'?'after-paired':'after';
  const names=(await fs.readdir(path.join(root,folder))).filter(x=>x.endsWith('.mjs'));
  assert.equal(names.length,topology==='paired'?2:3);
  for(const name of names) {
    const body=await fs.readFile(path.join(root,folder,name),'utf8');
    assets.set('/after/'+name,{type:'text/javascript; charset=utf-8',body});
  }
  const html='<!doctype html><html><body><div id="answer">pending</div>'+
    '<script>window.externalBridge={accept:function(x){'+
      'document.getElementById("answer").textContent=x;}};</script>'+
    '<script type="module">'+
    'import {scramble as original} from "/original.mjs";'+
    'import {scramble as encoded} from "/after/main.mjs";'+
    'let n=0;for(let i=-2048;i<=2048;i++){'+
      'if(!Object.is(original(i),encoded(i)))throw Error("Mismatch: "+i);n++;}'+
    'function work(fn){let checksum=0;for(let i=0;i<200000;i++)'+
      'checksum^=fn((i*1664525)|0);return checksum;}'+
    'for(let k=0;k<6;k++)if(work(original)!==work(encoded))throw Error("Hot mismatch");'+
    'let t=performance.now();const a=work(original),nativeMs=performance.now()-t;'+
    't=performance.now();const b=work(encoded),encodedMs=performance.now()-t;'+
    'if(a!==b)throw Error("Checksum mismatch");'+
    'window.externalBridge.accept("pass:"+n+":"+nativeMs+":"+encodedMs);'+
    '</script></body></html>';
  assets.set('/index.html',{type:'text/html; charset=utf-8',body:html});
  const server=http.createServer((request,response)=>{
    const asset=assets.get(request.url??'');
    if(!asset){response.writeHead(404).end();return;}
    response.writeHead(200,{'Content-Type':asset.type,'Cache-Control':'no-store'});
    response.end(asset.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(null)));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const dom=await dumpDom(process.env.CHROMIUM_BIN??'chromium',
      'http://127.0.0.1:'+address.port+'/index.html');
    const match=dom.match(/id="answer">pass:(\d+):([0-9.]+):([0-9.]+)/u);
    assert.ok(match,'Chromium native sharding failed: '+dom.slice(-1800));
    assert.equal(Number(match[1]),4097);
    console.log(JSON.stringify({browser:'chromium',topology,typedInputs:4097,
      nativeMs:Number(match[2]),shardMs:Number(match[3]),
      hotRatio:Number(match[3])/Number(match[2])}));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
