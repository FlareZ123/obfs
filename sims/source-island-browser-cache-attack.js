'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const sources=[
  {path:'watched.mjs',sourceType:'module',
    code:'const record={privateA:17};const v=record.privateA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const record={privateB:23};const v=record.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(watched.toString());',
    'const store=await caches.open("obfs-island-source-reader");',
    'await store.add("./independent.mjs");',
    'const response=await store.match("./independent.mjs");',
    'const source=await response.text();',
    'console.log("ISLAND_CACHE_SOURCE:"+JSON.stringify({visible:source.includes("privateB"),value:unrelated()}));'
  ].join('\n')}
];

/** @returns {string} */
function page(){
  return '<!doctype html><html><meta charset="utf-8"><body>'+
    '<script type="module" src="./entry.mjs"></script></body></html>';
}

/**
 * Cache.add fetches a same-origin module without a visible fetch() call.
 * The browser's CacheStorage API then exposes its original response bytes
 * through Cache.match().text(). This is an independent source-observation
 * channel omitted by the ESM-only source-island proof's original blacklist.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const options={
    mode:/** @type {const} */ ('coo'),
    closedWorld:true,seed:'island-cache-source-20261117',
    strings:false,identifiers:false
  };
  const baseline=obfuscateFiles(sources,options);
  assert.equal(baseline.files.reduce((n,file)=>n+file.metrics.properties,0),0,
    'The default source-observer policy must preserve the entire graph');
  let protectedGraph;
  try{
    protectedGraph=obfuscateFiles(sources,{
      ...options,experimentalSourceObserverIslands:['independent.mjs']
    });
  }catch(error){
    console.log('SOURCE_ISLAND_CACHE '+JSON.stringify({
      status:'rejected',reason:String(error)
    }));
    return;
  }
  const modified=protectedGraph.files.find(file=>file.path==='independent.mjs');
  assert.ok(modified && typeof modified.code==='string');
  assert.ok(modified.metrics.properties>0,'Red control must genuinely rewrite a field');

  /** @type {Map<string,string>} */
  const assets=new Map();
  for(const [variant,files] of /** @type {Array<[string,SourceFile[]]>} */
      ([['native',sources],['emitted',protectedGraph.files]])){
    for(const file of files)assets.set('/'+variant+'/'+file.path,String(file.code));
    assets.set('/'+variant+'/index.html',page());
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=assets.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
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
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });

    /** @type {Record<string,{visible:boolean,value:number}>} */
    const observations={};
    for(const variant of ['native','emitted']){
      const tab=await browser.newPage();
      const reported=new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Cache source observation timed out')),20000);
        tab.on('console',message=>{
          const line=message.text();
          if(line.startsWith('ISLAND_CACHE_SOURCE:')){
            clearTimeout(timeout);
            resolve(line.slice('ISLAND_CACHE_SOURCE:'.length));
          }
        });
        tab.on('pageerror',error=>{
          clearTimeout(timeout);
          reject(error);
        });
      });
      try{
        await tab.goto('http://127.0.0.1:'+address.port+'/'+variant+'/index.html',{
          waitUntil:'domcontentloaded',timeout:45000
        });
        observations[variant]=JSON.parse(/** @type {string} */ (await reported));
      }finally{
        await tab.close();
      }
    }
    assert.deepEqual(observations.native,{visible:true,value:23});
    assert.deepEqual(observations.emitted,{visible:false,value:23},
      'Current proof must be falsified by actual browser source bytes');
    console.log('SOURCE_ISLAND_CACHE '+JSON.stringify({
      status:'source-observation-changed',
      observations,renamed:modified.metrics.properties,
      chromium:await browser.version()
    }));
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
