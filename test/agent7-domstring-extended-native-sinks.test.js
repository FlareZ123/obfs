'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

const functionSource='function inspect(){const privateSourceMarker=17;return privateSourceMarker;}\n';
/**
 * Every listed sink was independently observed in local Chromium 144 to
 * stringify a real callable without an explicit String()/toString() call.
 * These are native browser byte readbacks, not a mocked host conversion.
 * @type {{id:string,code:string}[]}
 */
const sinks=[
  {id:'element-append',code:'target.append(inspect);globalThis._seen=target.textContent;'},
  {id:'element-prepend',code:'target.prepend(inspect);globalThis._seen=target.textContent;'},
  {id:'element-replaceChildren',code:'target.replaceChildren(inspect);globalThis._seen=target.textContent;'},
  {id:'element-before',code:'document.getElementById("inner").before(inspect);globalThis._seen=target.textContent;'},
  {id:'element-after',code:'document.getElementById("inner").after(inspect);globalThis._seen=target.textContent;'},
  {id:'element-replaceWith',code:'document.getElementById("inner").replaceWith(inspect);globalThis._seen=target.textContent;'},
  {id:'element-insertAdjacentText',code:'target.insertAdjacentText("beforeend",inspect);globalThis._seen=target.textContent;'},
  {id:'anchor-href',code:'const x=document.createElement("a");x.href=inspect;globalThis._seen=x.getAttribute("href");'},
  {id:'image-src',code:'const x=document.createElement("img");x.src=inspect;globalThis._seen=x.getAttribute("src");'},
  {id:'form-action',code:'const x=document.createElement("form");x.action=inspect;globalThis._seen=x.getAttribute("action");'},
  {id:'input-value',code:'const x=document.createElement("input");x.value=inspect;globalThis._seen=x.value;'},
  {id:'input-placeholder',code:'const x=document.createElement("input");x.placeholder=inspect;globalThis._seen=x.placeholder;'},
  {id:'image-alt',code:'const x=document.createElement("img");x.alt=inspect;globalThis._seen=x.alt;'},
  {id:'anchor-download',code:'const x=document.createElement("a");x.download=inspect;globalThis._seen=x.download;'},
  {id:'iframe-srcdoc',code:'const x=document.createElement("iframe");x.srcdoc=inspect;globalThis._seen=x.srcdoc;'},
  {id:'new-Text',code:'globalThis._seen=new Text(inspect).data;'},
  {id:'new-Option',code:'globalThis._seen=new Option(inspect).text;'},
  {id:'range-createContextualFragment',code:'const r=document.createRange();globalThis._seen=r.createContextualFragment(inspect).textContent;'}
];

test('native DOMString source sinks preserve exact function bytes across COO/SCO/SNO',{
  skip:process.platform!=='linux',
  timeout:120000
},async()=>{
  /** @type {Map<string,string>} */
  const pages=new Map();
  /** @type {{id:string,mode:string,bindings:number,base:string}[]} */
  const inventory=[];
  for(const fixture of sinks) {
    const original=functionSource+'const target=document.getElementById("target");\n'+
      fixture.code+'\nglobalThis._answer=inspect();';
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const result=obfuscateFiles([{path:'test.js',sourceType:'script',code:original}],{
        mode,seed:'agent7-native-extended-'+fixture.id,
        identifiers:true,strings:false,properties:false
      });
      const base='/'+fixture.id+'/'+mode;
      const html='<!doctype html><html><body><main id="target"><b id="inner"></b></main>'+
        '<script src="./test.js"></script></body></html>';
      for(const variant of ['native','emitted']) {
        pages.set(base+'/'+variant+'/index.html',html);
        pages.set(base+'/'+variant+'/test.js',variant==='native'?original:
          String(result.files[0].code));
      }
      inventory.push({id:fixture.id,mode,bindings:result.files[0].metrics.bindings,base});
    }
  }
  const server=http.createServer((req,res)=>{
    const path=req.url??'';
    const payload=pages.get(path);
    if(payload===undefined){res.writeHead(404);res.end('no route');return;}
    res.writeHead(200,{
      'content-type':path.endsWith('.html')?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none';script-src 'self'",
      'cache-control':'no-store'
    });
    res.end(payload);
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
    async function load(route) {
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      try {
        const result=await page.goto('http://127.0.0.1:'+address.port+route,
          {waitUntil:'load'});
        assert.equal(result?.status(),200,route+' status');
        return await page.evaluate(()=>({
          value:globalThis._answer,
          seen:globalThis._seen
        }));
      } finally {await page.close();}
    }
    /** @type {string[]} */
    const misses=[];
    for(const fixture of inventory){
      const native=await load(fixture.base+'/native/index.html');
      const emitted=await load(fixture.base+'/emitted/index.html');
      const sourceParity=native.seen===emitted.seen;
      const valueParity=native.value===emitted.value;
      const observation={
        id:fixture.id,mode:fixture.mode,bindings:fixture.bindings,
        nativeSeenLength:typeof native.seen==='string'?native.seen.length:null,
        emittedSeenLength:typeof emitted.seen==='string'?emitted.seen.length:null,
        sourceParity,valueParity
      };
      console.log(JSON.stringify(observation));
      assert.equal(native.value,17,fixture.id+' native control');
      assert.equal(emitted.value,17,fixture.id+' emitted numeric control');
      assert.equal(typeof native.seen,'string',fixture.id+' native string readback');
      assert.match(native.seen,/privateSourceMarker/,
        fixture.id+' original function source exposed');
      if(!sourceParity)misses.push(fixture.mode+' '+fixture.id+
        ' bindings='+fixture.bindings);
    }
    assert.deepEqual(misses,[], 'all proven native WebIDL source readbacks must match');
  } finally {
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});

test('source-free private function remains rename-eligible',()=>{
  const source=functionSource+'globalThis._answer=inspect();';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const compiled=obfuscateFiles([
      {path:'private.js',sourceType:'script',code:source}
    ],{mode,seed:'agent7-extended-native-positive',
       identifiers:true,strings:false,properties:false});
    assert.ok(compiled.files[0].metrics.bindings>0,
      mode+' private source not observed by native DOMString setters');
  }
});
