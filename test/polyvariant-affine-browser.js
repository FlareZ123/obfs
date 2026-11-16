'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @param {string} bin @param {string} url @returns {Promise<string>} */
async function inspectChrome(bin,url) {
  const {stdout}=await promisify(execFile)(bin,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=6500','--dump-dom',url
  ],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:45000});
  return stdout;
}

/** @returns {Promise<void>} */
async function main() {
  const original=(await fs.readFile(path.join(__dirname,
    '../examples/polyvariant-affine/original.cjs'),'utf8'))
    .replace(/\r\n/g,'\n').replace('function guardedTotal',
    'export function guardedTotal').replace('module.exports=guardedTotal;','');
  /** @type {Map<string,string>} */
  const assets=new Map([['/native.mjs',original]]);
  for(const variants of [2,4,8]) {
    const output=obfuscateFiles([{
      path:'value.mjs',sourceType:'module',code:original
    }],{
      mode:'coo',seed:'polyvariant-chrome-'+variants,
      strings:false,properties:false,identifiers:false,
      experimentalPolyvariantAffine:{'value.mjs':['guardedTotal']},
      experimentalPolyvariantCount:/** @type {2|4|8} */ (variants)
    });
    assert.equal(output.files[0].metrics.polyvariantPaths,variants);
    assets.set('/v'+variants+'.mjs',
      /** @type {string} */ (output.files[0].code));
  }
  const page='<!doctype html><html><body><div id="answer">pending</div>'+
    '<script type="module">'+
    'import {guardedTotal as native} from "/native.mjs";'+
    'import {guardedTotal as v2} from "/v2.mjs";'+
    'import {guardedTotal as v4} from "/v4.mjs";'+
    'import {guardedTotal as v8} from "/v8.mjs";'+
    'function result(fn,input){try{return ["ok",fn(input)];}catch(error){return ["throw",error.name,error.message];}}'+
    'let count=0;'+
    'const sample=[0,-0,1,-1,NaN,Infinity,-Infinity,-2147483649,2147483648,'+
      '"47","",false,true,null,undefined,Symbol("tag"),0n,3n,{}];'+
    'for(let i=-4096;i<4096;i++)sample.push(i);'+
    'for(const value of sample){const expected=result(native,value);'+
      'for(const fn of [v2,v4,v8]){const actual=result(fn,value);'+
      'if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error("mismatch "+String(value));}count++;}'+
    'function work(fn){let checksum=0;for(let i=0;i<2000000;i++)checksum^=fn((Math.imul(i,1103515245)^12345)|0);return checksum;}'+
    'for(let i=0;i<8;i++){const n=work(native);'+
      'if(n!==work(v2)||n!==work(v4)||n!==work(v8))throw Error("checksum");}'+
    'function timed(fn){const start=performance.now();const checksum=work(fn);return [performance.now()-start,checksum];}'+
    'const resultMap={};const baseline=[];'+
    'for(let k=0;k<11;k++)baseline.push(timed(native)[0]);'+
    'baseline.sort((a,b)=>a-b);const nativeMs=baseline[5];'+
    'for(const entry of [[2,v2],[4,v4],[8,v8]]){'+
      'const trials=[];for(let k=0;k<11;k++)trials.push(timed(entry[1])[0]);'+
      'trials.sort((a,b)=>a-b);resultMap[entry[0]]=(trials[5]/nativeMs).toFixed(3);}'+
    'document.getElementById("answer").textContent="pass:"+count+":"+JSON.stringify(resultMap);'+
    '</script></body></html>';
  assets.set('/index.html',page);
  const server=http.createServer((req,res)=>{
    const body=assets.get(req.url??'');
    if(body===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':(req.url??'').endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'Cache-Control':'no-store'});
    res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const dom=await inspectChrome(process.env.CHROMIUM_BIN??'chromium',
      'http://127.0.0.1:'+address.port+'/index.html');
    const match=dom.match(/id="answer">pass:(\d+):(\{[^<]+\})<\/div>/u);
    assert.ok(match,'Browser did not complete: '+dom.slice(-1500));
    assert.equal(Number(match[1]),8211);
    const ratios=/** @type {Record<string,string>} */ (JSON.parse(match[2]));
    for(const key of ['2','4','8'])assert.ok(Number.isFinite(Number(ratios[key])));
    console.log(JSON.stringify({browser:'chromium',inputs:Number(match[1]),ratios}));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
