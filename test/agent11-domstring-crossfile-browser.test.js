'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{mime:string,body:string}} Route */

/** @type {{id:string,domSource:string,consumer:string}[]} */
const fixtures=[
  {id:'imported-factory',
    domSource:'export function getTarget(){return document.body;}',
    consumer:"import {getTarget} from './dom.mjs';getTarget().setAttribute('data-source',inspect);"},
  {id:'imported-element',
    domSource:'export const target=document.body;',
    consumer:"import {target} from './dom.mjs';target.setAttribute('data-source',inspect);"}
];

/**
 * @param {string} domSource
 * @param {string} consumer
 * @returns {ModuleFile[]}
 */
function graph(domSource,consumer){
  return [
    {path:'dom.mjs',sourceType:'module',code:domSource},
    {path:'safe.mjs',sourceType:'module',code:
      'export function readSafe(){const safePrivateMarker=29;return safePrivateMarker;}'},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {readSafe} from './safe.mjs';",
      'function inspect(){const privateSourceMarker=17;return privateSourceMarker;}',
      consumer,
      'globalThis.__result={result:inspect(),safe:readSafe(),',
      "source:document.body.getAttribute('data-source')};"
    ].join('\n')}
  ];
}

test('real Chromium preserves function source through imported DOMString receivers',{
  skip:process.platform!=='linux',
  timeout:100000
},async()=>{
  /** @type {Map<string,Route>} */
  const routes=new Map();
  /** @type {{fixture:string,mode:string,nativePath:string,emittedPath:string,safeBindings:number}[]} */
  const pairs=[];
  for(const fixture of fixtures){
    const files=graph(fixture.domSource,fixture.consumer);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const compiled=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'agent11-crossfile-domstring-'+fixture.id,
        identifiers:true,properties:false,strings:false
      });
      const safeSource=files.find(file=>file.path==='safe.mjs');
      assert.ok(safeSource,fixture.id+' safe source module');
      const positive=obfuscateFiles([safeSource],{
        mode,closedWorld:true,seed:'agent11-crossfile-domstring-positive',
        identifiers:true,properties:false,strings:false
      });
      assert.ok(positive.files[0].metrics.bindings>0,
        mode+' '+fixture.id+' isolated source-free positive control');
      /**
       * @param {'native'|'emitted'} variant
       * @param {ReadonlyArray<{path:string,code:string|Buffer}>} items
       */
      function addRoutes(variant,items){
        const base='/'+variant+'/'+fixture.id+'/'+mode;
        routes.set(base+'/index.html',{mime:'text/html',body:
          '<!doctype html><html><body><main id="target"></main>'+
          '<script type="module" src="./entry.mjs"></script></body></html>'});
        for(const item of items){
          routes.set(base+'/'+item.path,{mime:'text/javascript',
            body:String(item.code)});
        }
      }
      addRoutes('native',files);
      addRoutes('emitted',compiled.files);
      pairs.push({fixture:fixture.id,mode,
        nativePath:'/native/'+fixture.id+'/'+mode+'/index.html',
        emittedPath:'/emitted/'+fixture.id+'/'+mode+'/index.html',
        positiveBindings:positive.files[0].metrics.bindings});
    }
  }

  const server=http.createServer((request,response)=>{
    const route=routes.get(request.url??'');
    if(!route){response.writeHead(404);response.end('missing');return;}
    response.writeHead(200,{
      'content-type':route.mime+'; charset=utf-8',
      'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none'; script-src 'self'",
      'cache-control':'no-store'
    });
    response.end(route.body);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN||'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    /** @param {string} route */
    async function load(route){
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      /** @type {string[]} */
      const errors=[];
      page.on('pageerror',error=>errors.push(String(error)));
      try{
        const response=await page.goto('http://127.0.0.1:'+address.port+route,
          {waitUntil:'load'});
        assert.equal(response?.status(),200,route+' HTML response');
        const result=await page.evaluate(()=>/** @type {any} */(globalThis).__result);
        assert.deepEqual(errors,[],route+' page errors');
        assert.ok(result,route+' module completed');
        return /** @type {{result:number,safe:number,source:string}} */(result);
      }finally{await page.close();}
    }
    /** @type {string[]} */
    const mismatches=[];
    for(const pair of pairs){
      const native=await load(pair.nativePath);
      const emitted=await load(pair.emittedPath);
      assert.equal(native.result,17,pair.fixture+' native numeric control');
      assert.equal(emitted.result,17,pair.fixture+' emitted numeric control');
      assert.equal(native.safe,29,pair.fixture+' native sibling control');
      assert.equal(emitted.safe,29,pair.fixture+' emitted sibling control');
      const sourceParity=emitted.source===native.source;
      console.log(JSON.stringify({fixture:pair.fixture,mode:pair.mode,
        positiveBindings:pair.positiveBindings,
        nativeSourceLength:native.source.length,
        emittedSourceLength:emitted.source.length,sourceParity}));
      if(!sourceParity)mismatches.push(pair.fixture+' '+pair.mode);
    }
    assert.deepEqual(mismatches,[],
      'imported DOM factory/element receivers must preserve native function-source bytes');
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});
