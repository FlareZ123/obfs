'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const test=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

test('Chromium executes tuple-lowered source-observer islands with exact exported callable source',{
  skip:process.platform==='win32'?'Real Chromium is exercised on the Ubuntu runner':false
},async()=>{
  const chromium=process.env.CHROMIUM_BIN??'google-chrome';
  /** @type {SourceFile[]} */
  const sources=[
    {path:'watched.mjs',sourceType:'module',
      code:'const recordA={privateA:17};const valueA=recordA.privateA;'+
        'export function watched(){return valueA;}'},
    {path:'independent.mjs',sourceType:'module',
      code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;'+
        'export function unrelated(){return valueB;}'},
    {path:'another.mjs',sourceType:'module',
      code:'const recordC={privateC:43};const valueC=recordC.privateC;'+
        'export function third(){return valueC;}'},
    {path:'observer.mjs',sourceType:'module',
      code:'import {watched} from "./watched.mjs";'+
        'import {unrelated} from "./independent.mjs";'+
        'import {third} from "./another.mjs";'+
        'const source=watched.toString();const values=[unrelated(),third()];'}
  ];
  const result=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'chrome-source-island-tuples',
    strings:false,
    experimentalSourceObserverIslands:['independent.mjs','another.mjs'],
    experimentalSourceObserverIslandRecordsToArrays:true
  });
  assert.equal(result.crossFile.properties,0);
  for(const [path,recordName,fnName,captured,value] of [
    ['independent.mjs','recordB','unrelated','valueB',23],
    ['another.mjs','recordC','third','valueC',43]
  ]) {
    const emitted=result.files.find(file=>file.path===path);
    assert.ok(emitted);
    assert.equal(emitted.metrics.objects,1);
    assert.ok(emitted.metrics.properties>=1);
    assert.match(String(emitted.code),new RegExp('const '+recordName+'=\\\\[\\\\d+(?:,\\\\d+)*\\\\];'));
    assert.match(String(emitted.code),new RegExp('const value'+(recordName==='recordB'?'B':'C')+'='+recordName+'\\\\[\\\\d+\\\\];'));
    assert.ok(String(emitted.code).includes(
      'export function '+fnName+'(){return '+captured+';}'));
    assert.doesNotMatch(String(emitted.code),/privateB|otherB|privateC/);
  }

  const probe='import "./observer.mjs";'+
    'import {watched} from "./watched.mjs";'+
    'import {unrelated} from "./independent.mjs";'+
    'import {third} from "./another.mjs";'+
    'const ok=watched.toString()==="function watched(){return valueA;}"&&'+
      'unrelated.toString()==="function unrelated(){return valueB;}"&&'+
      'third.toString()==="function third(){return valueC;}"&&'+
      'watched.name==="watched"&&watched.length===0&&'+
      'unrelated.name==="unrelated"&&unrelated.length===0&&'+
      'third.name==="third"&&third.length===0&&'+
      'unrelated()===23&&third()===43;'+
    'document.getElementById("answer").textContent=ok?"tuple-ok":"tuple-fail";';
  const content=new Map(result.files.map(file=>['/'+file.path,String(file.code)]));
  content.set('/entry.mjs',probe);
  content.set('/index.html','<!doctype html><html><body><div id="answer">initial</div>'+
    '<script type="module" src="/entry.mjs"></script></body></html>');

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
    assert.match(stdout,/id="answer">tuple-ok</,stdout);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
