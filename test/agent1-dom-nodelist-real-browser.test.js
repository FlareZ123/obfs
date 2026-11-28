'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {test}=require('node:test');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

/** @type {readonly {name:string,receiver:string}[]} */
const cases=[
  {name:'querySelectorAll-index',receiver:'document.querySelectorAll("div.locked")[0]'},
  {name:'querySelectorAll-item',receiver:'document.querySelectorAll("div.locked").item(0)'},
  {name:'getElementsByName-index',receiver:'document.getElementsByName("locked")[0]'},
  {name:'getElementsByClassName-index',receiver:'document.getElementsByClassName("locked")[0]'},
  {name:'getElementsByTagName-item',receiver:'document.getElementsByTagName("div").item(0)'},
  {name:'aliased-NodeList-item',receiver:'document.querySelectorAll("div.locked").item(0)'},
  {name:'named-HTMLCollection-item',receiver:'document.getElementsByClassName("locked").namedItem("target")'}
];

/** @param {typeof cases[number]} fixture @returns {string} */
function source(fixture){
  return [
    'const owner={secretRecord:17};',
    'function inspect(){return owner.secretRecord;}',
    fixture.name==='aliased-NodeList-item' ?
      'const collection=document.querySelectorAll("div.locked");'+
        'const element=collection.item(0);' :
      'const element='+fixture.receiver+';',
    'element.setAttribute("data-fn",inspect);',
    'globalThis._seen=element.getAttribute("data-fn");',
    'globalThis._answer=inspect();'
  ].join('\n');
}

test('real Chromium preserves Function#toString through native indexed DOMString setters',{
  skip:process.platform!=='linux',timeout:120000
},async()=>{
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  /** @type {{id:string,base:string,mode:string,properties:number,bindings:number}[]} */
  const inventory=[];
  for(const fixture of cases)for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const native=source(fixture);
    const transformed=obfuscateFiles([
      {path:'entry.mjs',sourceType:'module',code:native}
    ],{mode,seed:'agent1-dom-nodelist-real-'+fixture.name,
      properties:true,identifiers:true,strings:false,closedWorld:true});
    const emitted=String(transformed.files[0].code);
    const stem='/'+fixture.name+'/'+mode;
    for(const variant of /** @type {const} */(['native','emitted'])){
      const root=stem+'/'+variant;
      routes.set(root+'/entry.mjs',{type:'text/javascript',
        body:variant==='native'?native:emitted});
      routes.set(root+'/index.html',{type:'text/html',
        body:'<!doctype html><html><head></head><body>'+
          '<div class="locked" id="target">test</div><input name="locked">'+
          '<script type="module" src="./entry.mjs"></script></body></html>'});
    }
    inventory.push({id:fixture.name,base:stem,mode,
      properties:transformed.files[0].metrics.properties,
      bindings:transformed.files[0].metrics.bindings});
  }

  const server=http.createServer((req,res)=>{
    const item=routes.get(req.url??'');
    if(!item){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{
      'content-type':item.type+'; charset=utf-8',
      'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none';script-src 'self'",
      'cache-control':'no-store'
    });
    res.end(item.body);
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
      const page=await /** @type {import('puppeteer-core').Browser} */ (browser).newPage();
      try{
        await page.goto('http://127.0.0.1:'+address.port+route,{waitUntil:'load'});
        await page.waitForFunction('globalThis._answer===17',{timeout:6000});
        return page.evaluate(()=>({answer:globalThis._answer,seen:globalThis._seen}));
      }finally{await page.close();}
    }
    for(const item of inventory){
      const native=await load(item.base+'/native/index.html');
      const emitted=await load(item.base+'/emitted/index.html');
      process.stdout.write('DOM_NODELIST_BROWSER '+JSON.stringify({
        id:item.id,mode:item.mode,properties:item.properties,bindings:item.bindings,
        nativeLength:typeof native.seen==='string'?native.seen.length:null,
        emittedLength:typeof emitted.seen==='string'?emitted.seen.length:null,
        parity:JSON.stringify(native)===JSON.stringify(emitted)
      })+'\n');
      assert.equal(native.answer,17,'native computation '+item.id);
      assert.equal(typeof native.seen,'string','native DOMString '+item.id);
      assert.deepEqual(emitted,native,
        'real Web IDL DOMString coerced Function text changed after '+item.id);
    }
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});
