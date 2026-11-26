'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const http=require('node:http');
const {obfuscateFiles}=require('../src');

const execChrome=promisify(execFile);
const original='const owner={privateField:7,otherField:11};'+
  'class Reader{read(){return owner.privateField;}other(){return owner.otherField;}}'+
  'const reader=new Reader();export const value=reader.read()+reader.other();';

test('private class direct-call owner rewrite preserves real Chromium ESM result',async t=>{
  const browser=process.env.CHROMIUM_BIN??'google-chrome';
  const probe=spawnSync(browser,['--version'],{encoding:'utf8',timeout:10000});
  if(probe.status!==0){
    t.skip('Chromium CLI not installed on this runner');
    return;
  }
  const compiled=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:original
  }],{
    mode:'coo',seed:'agent9-private-class-browser',closedWorld:true,
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.files[0].metrics.properties,2);
  const encoded=/** @type {string} */ (compiled.files[0].code);
  assert.doesNotMatch(encoded,/privateField|otherField/u);
  const html='<!doctype html><html><head><meta charset="utf-8"></head>'+
    '<body><script type="module" src="./runner.mjs"></script></body></html>';
  const runner='import {value} from "./entry.mjs";'+
    'const output=document.createElement("pre");output.id="result";'+
    'output.textContent=btoa(JSON.stringify(value));document.body.appendChild(output);';
  /** @type {Map<string,string>} */
  const files=new Map([
    ['/native/entry.mjs',original],
    ['/emitted/entry.mjs',encoded],
    ['/native/runner.mjs',runner],
    ['/emitted/runner.mjs',runner],
    ['/native/index.html',html],
    ['/emitted/index.html',html]
  ]);
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url??'/', 'http://localhost').pathname;
    const body=files.get(pathname);
    if(req.method!=='GET'||body===undefined){
      res.writeHead(body===undefined?404:405).end();
      return;
    }
    const isHtml=pathname.endsWith('.html');
    res.writeHead(200,{
      'content-type':isHtml?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'content-security-policy':"default-src 'none'; script-src 'self'"
    });
    res.end(body);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No TCP port');
    for(const lane of ['native','emitted']){
      const target='http://127.0.0.1:'+address.port+'/'+lane+'/index.html';
      const {stdout}=await execChrome(browser,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--disable-background-networking','--virtual-time-budget=12000',
        '--dump-dom',target
      ],{encoding:'utf8',maxBuffer:3*1024*1024,timeout:40000});
      const base64=stdout.match(new RegExp('<pre id="result">([A-Za-z0-9+/=]+)</pre>','u'))?.[1];
      assert.ok(base64,lane+' failed ESM/CSP browser parity: '+stdout.slice(0,1200));
      const observed=JSON.parse(Buffer.from(base64,'base64').toString('utf8'));
      assert.equal(observed,18,lane+' native output');
    }
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});
