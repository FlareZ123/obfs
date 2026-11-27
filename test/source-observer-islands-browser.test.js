'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const test=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * The source-observer island proof is compiler-side, while this probe is an
 * external browser consumer deliberately omitted from the declared graph.
 */
test('Chromium preserves exported callable source for transformed source-observer islands',{
  skip:process.platform==='win32'?'Real Chromium is exercised on the Ubuntu runner':false
},async()=>{
  const chromium=process.env.CHROMIUM_BIN??'google-chrome';
  /** @type {import('../src/core').SourceFile[]} */
  const sources=[
    {path:'island-watched.mjs',sourceType:'module',
      code:'const recordA={privateA:17};const valueA=recordA.privateA;'+
        'export function watched(){return valueA;}'},
    {path:'island-independent.mjs',sourceType:'module',
      code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;'+
        'export function unrelated(){return valueB;}'},
    {path:'island-another.mjs',sourceType:'module',
      code:'const recordC={privateC:43};const valueC=recordC.privateC;'+
        'export function third(){return valueC;}'},
    {path:'island-entry.mjs',sourceType:'module',
      code:'import {watched} from "./island-watched.mjs";'+
        'import {unrelated} from "./island-independent.mjs";'+
        'import {third} from "./island-another.mjs";'+
        'console.log(JSON.stringify({source:watched.toString(),'+
          'values:[unrelated(),third()]}));'}
  ];
  const result=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'chrome-source-island-identifiers',
    strings:false,
    experimentalSourceObserverIslands:['island-independent.mjs','island-another.mjs']
  });
  assert.equal(result.crossFile.properties,0);
  for(const [path,outer,captured,fn] of [
    ['island-independent.mjs','recordB','valueB','unrelated'],
    ['island-another.mjs','recordC','valueC','third']
  ]) {
    const emitted=result.files.find(file=>file.path===path);
    assert.ok(emitted);
    assert.ok(emitted.metrics.properties>=1);
    assert.equal(emitted.metrics.bindings,1);
    assert.equal(String(emitted.code).includes(outer),false);
    assert.ok(String(emitted.code).includes(
      'export function '+fn+'(){return '+captured+';}'));
  }

  const probe='import {watched} from "./island-watched.mjs";'+
    'import {unrelated} from "./island-independent.mjs";'+
    'import {third} from "./island-another.mjs";'+
    'const ok=watched.toString()==="function watched(){return valueA;}"&&'+
      'unrelated.toString()==="function unrelated(){return valueB;}"&&'+
      'third.toString()==="function third(){return valueC;}"&&'+
      'watched.name==="watched"&&watched.length===0&&'+
      'unrelated.name==="unrelated"&&unrelated.length===0&&'+
      'third.name==="third"&&third.length===0&&'+
      'unrelated()===23&&third()===43;'+
    'document.getElementById("answer").textContent=ok?"island-ok":"island-fail";';
  const content=new Map(result.files.map(file=>['/'+file.path,String(file.code)]));
  content.set('/island-probe.mjs',probe);
  content.set('/index.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script type="module" src="/island-entry.mjs"></script>'+
    '<script type="module" src="/island-probe.mjs"></script></body></html>');

  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/', 'http://127.0.0.1');
    const body=content.get(url.pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.setHeader('content-type',url.pathname.endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8');
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(typeof address==='string'||!address)throw new Error('Missing TCP address');
    const url='http://127.0.0.1:'+address.port+'/index.html';
    const {stdout}=await promisify(execFile)(chromium,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=4000','--dump-dom',url
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,/id="answer">island-ok</,stdout);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});


test('canonical browser integration harness passes with source-observer island fixture',{
  skip:process.platform==='win32'?'Real Chromium is exercised on the Ubuntu runner':false
},async()=>{
  const chromium=process.env.CHROMIUM_BIN??'google-chrome';
  const {stdout}=await promisify(execFile)(process.execPath,['test/browser-integration.js'],{
    env:{...process.env,CHROMIUM_BIN:chromium},
    timeout:120000,maxBuffer:8*1024*1024,encoding:'utf8'
  });
  assert.ok(typeof stdout==='string');
});
