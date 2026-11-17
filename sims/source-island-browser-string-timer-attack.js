'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const sources=[
  {path:'watched.mjs',sourceType:'module',
    code:'const r={privateA:17};const v=r.privateA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const record={privateB:23};const v=record.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(watched.toString());',
    'setTimeout("fetch(\'./independent.mjs\').then(r=>r.text()).then(s=>{document.getElementById(\'state\').textContent=String(s.includes(\'privateB\'))})",0);',
    'console.log(unrelated());'
  ].join('\n')}
];

/** @returns {string} */
function page(){
  return '<!doctype html><html><meta charset="utf-8"><body><pre id="state">pending</pre>' +
    '<script type="module" src="./entry.mjs"></script></body></html>';
}

/**
 * Probe browser string-timer code as an indirect source reader of a selected
 * pure ESM leaf. The literal function body is compiled by the browser at
 * timer dispatch, beyond the ordinary ESM AST module-closure scan.
 * @returns {Promise<void>}
 */
async function main(){
  const base={mode:'coo',closedWorld:true,seed:'source-island-timer-20261117',
    strings:false,identifiers:false};
  const baseline=obfuscateFiles(sources,base);
  assert.equal(baseline.files.reduce((count,file)=>count+file.metrics.properties,0),0,
    'Group observer must preserve source under the standard conservative policy');
  let island;
  try{
    island=obfuscateFiles(sources,{...base,
      experimentalSourceObserverIslands:['independent.mjs']});
  }catch(error){
    console.log('SOURCE_ISLAND_TIMER '+JSON.stringify({status:'rejected',reason:String(error)}));
    return;
  }
  const modified=island.files.find(file=>file.path==='independent.mjs');
  assert.ok(modified);
  const renamed=modified.metrics.properties;
  const assets=new Map();
  for(const [variant,files] of [['native',sources],['emitted',island.files]]){
    for(const file of files)assets.set('/'+variant+'/'+file.path,file.code);
    assets.set('/'+variant+'/index.html',page());
  }
  const server=http.createServer((request,response)=>{
    const pathname=(request.url??'').split('?')[0];
    const value=assets.get(pathname);
    if(value===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(value);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const observations={};
    for(const variant of ['native','emitted']){
      const tab=await browser.newPage();
      await tab.goto('http://127.0.0.1:'+address.port+'/'+variant+'/index.html',{
        waitUntil:'domcontentloaded',timeout:45000
      });
      await tab.waitForFunction(()=>{
        const content=document.querySelector('#state')?.textContent;
        return content==='true' || content==='false';
      },{timeout:45000,polling:40});
      observations[variant]=await tab.$eval('#state',node=>node.textContent);
      await tab.close();
    }
    assert.equal(observations.native,'true');
    console.log('SOURCE_ISLAND_TIMER '+JSON.stringify({
      status:observations.native!==observations.emitted?
        'source-byte-observation-changed':'parity',
      renamed,observations,chromium:await browser.version(),
      emittedLeaf:modified.code
    }));
    if(renamed>0)assert.equal(observations.emitted,'false',
      'A rewritten field must be externally observable by the timer source reader');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
