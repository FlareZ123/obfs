'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function dumpDom(binary,url) {
  const args=[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=4000','--dump-dom',url
  ];
  const {stdout}=await promisify(execFile)(binary,args,{timeout:15000,maxBuffer:4*1024*1024,encoding:'utf8'});
  return stdout;
}

async function main(){
  const chromium=process.env.CHROMIUM_BIN ?? 'chromium';
  const sources=[
    {path:'state.mjs',code:'export const state={privateValue:41};'},
    {path:'entry.mjs',code:'import {state} from "./state.mjs";document.getElementById("answer").textContent=state.privateValue;'}
  ];
  const moduleSet=obfuscateFiles(sources,{mode:'coo',closedWorld:true,seed:'chrome-modules'});
  assert.equal(moduleSet.crossFile.properties,1);
  const namedJsSet=obfuscateFiles([
    {path:'js-state.js',sourceType:'module',code:'export const state={internalValue:23};'},
    {path:'js-entry.js',sourceType:'module',
      code:'import {state} from "./js-state.js";document.getElementById("answer").textContent=state.internalValue;'}
  ],{mode:'coo',closedWorld:true,seed:'chrome-js-modules'});
  assert.equal(namedJsSet.crossFile.properties,1);
  const cycleSet=obfuscateFiles([
    {path:'cycle-a.mjs',sourceType:'module',
      code:'import "./cycle-b.mjs";export function get(){return "browser-cycle-ok";}'},
    {path:'cycle-b.mjs',sourceType:'module',
      code:'import {get} from "./cycle-a.mjs";document.getElementById("answer").textContent=get();'}
  ],{mode:'coo',strings:true,properties:false,identifiers:false,seed:'chrome-esm-cycle'});
  assert.equal(cycleSet.files[0].metrics.literals,0);
  const good=obfuscateFiles([{
    path:'good.js',sourceType:'script',code:'document.getElementById("answer").textContent="permitted";'
  }],{mode:'coo',seed:'chrome-good',allowedHosts:['127.0.0.1']}).files[0].code;
  const bad=obfuscateFiles([{
    path:'blocked.js',sourceType:'script',code:'document.getElementById("answer").textContent="unauthorized";'
  }],{mode:'coo',seed:'chrome-blocked',allowedHosts:['forbidden.example']}).files[0].code;
  const content=new Map([...moduleSet.files,...namedJsSet.files,...cycleSet.files].map(x=>['/'+x.path,x.code]));
  content.set('/good.js',good);
  content.set('/blocked.js',bad);
  content.set('/module.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/entry.mjs"></script></body></html>');
  content.set('/js-module.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/js-entry.js"></script></body></html>');
  content.set('/cycle.html','<!doctype html><html><body><div id="answer">initial</div><script type="module" src="/cycle-a.mjs"></script></body></html>');
  content.set('/good.html','<!doctype html><html><body><div id="answer">initial</div><script src="/good.js"></script></body></html>');
  content.set('/blocked.html','<!doctype html><html><body><div id="answer">initial</div><script src="/blocked.js"></script></body></html>');
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/', 'http://127.0.0.1');
    const body=content.get(url.pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.setHeader('content-type',url.pathname.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const addr=server.address();
    if(typeof addr==='string'||!addr)throw Error('Missing TCP address');
    const base=`http://127.0.0.1:${addr.port}`;
    for(const [path,result] of [
      ['/module.html','41'],['/js-module.html','23'],['/cycle.html','browser-cycle-ok'],
      ['/good.html','permitted'],['/blocked.html','initial']
    ]){
      const html=await dumpDom(chromium,base+path);
      assert.match(html,new RegExp(`id="answer">${result}<`),`Browser ${path}: ${html}`);
      process.stdout.write(`Chromium PASS: ${path}: ${result}\n`);
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
}

main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
