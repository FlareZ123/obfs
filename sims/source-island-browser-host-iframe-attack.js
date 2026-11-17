'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @type {SourceFile[]} */
const original=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={privateA:17};const v=a.privateA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(watched.toString());',
    'addEventListener("load",()=>{',
    '  const view=frames["sourceView"];',
    '  const page=view["doc"+"ument"];',
    '  const text=page["body"]["textContent"];',
    '  console.log("ISLAND_FRAME_SOURCE:"+String(text.includes("privateB")));',
    '});',
    'console.log(unrelated());'
  ].join('\n')}
];

/** @returns {string} */
function page(){
  return '<!doctype html><html><body>'+
    '<iframe name="sourceView" src="./independent.mjs?plain=1"></iframe>'+
    '<script type="module" src="./entry.mjs"></script></body></html>';
}

/**
 * In a same-origin real-browser page, host HTML can expose selected module
 * bytes through a named iframe. Module AST omits direct document/fetch/URL
 * spelling; the host HTML is outside the compiler's ESM-only file list.
 * @returns {Promise<void>}
 */
async function main(){
  const standard={mode:'coo',closedWorld:true,seed:'island-iframe-20261117',
    strings:false,identifiers:false};
  const defaultOutput=obfuscateFiles(original,standard);
  assert.equal(defaultOutput.files.reduce((n,f)=>n+f.metrics.properties,0),0);
  let island;
  try{
    island=obfuscateFiles(original,{...standard,
      experimentalSourceObserverIslands:['independent.mjs']});
  }catch(error){
    console.log('SOURCE_ISLAND_IFRAME '+JSON.stringify({status:'rejected',reason:String(error)}));
    return;
  }
  const emittedLeaf=island.files.find(f=>f.path==='independent.mjs');
  assert.ok(emittedLeaf);
  const assets=new Map();
  for(const [mode,files] of /** @type {Array<[string, SourceFile[]]>} */
      ([['native',original],['emitted',island.files]])){
    for(const file of files)assets.set('/'+mode+'/'+file.path,file.code);
    assets.set('/'+mode+'/index.html',page());
  }
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/','http://127.0.0.1');
    const body=assets.get(url.pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':url.searchParams.get('plain')==='1'?'text/plain; charset=utf-8':
        url.pathname.endsWith('.html')?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
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
      headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    /** @type {Record<string,string|null>} */
    const observations={};
    for(const mode of ['native','emitted']){
      const tab=await browser.newPage();
      /** @type {string|null} */
      let observation=null;
      tab.on('console',message=>{
        if(message.text().startsWith('ISLAND_FRAME_SOURCE:')){
          observation=message.text().slice('ISLAND_FRAME_SOURCE:'.length);
        }
      });
      await tab.goto('http://127.0.0.1:'+address.port+'/'+mode+'/index.html',{
        waitUntil:'load',timeout:45000
      });
      observations[mode]=observation;
      await tab.close();
    }
    assert.equal(observations.native,'true','Original browser iframe must expose source');
    const mismatch=observations.native!==observations.emitted;
    console.log('SOURCE_ISLAND_IFRAME '+JSON.stringify({
      status:mismatch?'host-source-observation-changed':'parity',
      observations,renamed:emittedLeaf.metrics.properties,
      chromium:await browser.version()
    }));
    if(emittedLeaf.metrics.properties>0)assert.equal(observations.emitted,'false');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
