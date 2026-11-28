'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {test}=require('node:test');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

const fn='function inspect(){const privateSourceMarker=17;return privateSourceMarker;}\n';
/**
 * Native Chrome coerces a function to DOMString for token list methods,
 * and embeds that exact function source inside InvalidCharacterError.message.
 * A value assignment is also reflected verbatim as className.
 * @type {{id:string,statement:string}[]}
 */
const cases=[
  {id:'classList-add',statement:'try{target.classList.add(inspect)}catch(error){globalThis._seen=error.message;}'},
  {id:'classList-remove',statement:'try{target.classList.remove(inspect)}catch(error){globalThis._seen=error.message;}'},
  {id:'classList-toggle',statement:'try{target.classList.toggle(inspect)}catch(error){globalThis._seen=error.message;}'},
  {id:'classList-replace',statement:'try{target.classList.replace("safe",inspect)}catch(error){globalThis._seen=error.message;}'},
  {id:'classList-value',statement:'target.classList.value=inspect;globalThis._seen=target.className;'},
  {id:'part-add',statement:'try{target.part.add(inspect)}catch(error){globalThis._seen=error.message;}'}
];

test('DOMTokenList native error messages preserve function source across COO/SCO/SNO',{
  skip:process.platform!=='linux',timeout:90000
},async()=>{
  /** @type {Map<string,string>} */
  const pages=new Map();
  /** @type {{id:string,mode:string,bindings:number,base:string}[]} */
  const inventory=[];
  for(const item of cases){
    const source=fn+'const target=document.getElementById("target");\n'+
      item.statement+'\nglobalThis._answer=inspect();';
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const result=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],
        {mode,seed:'agent7-domtokenlist-'+item.id,
         strings:false,properties:false,identifiers:true});
      const base='/'+item.id+'/'+mode;
      const doc='<!doctype html><html><body><main id="target" class="safe"></main>'+
        '<script src="./entry.js"></script></body></html>';
      for(const variant of ['native','emitted']){
        pages.set(base+'/'+variant+'/index.html',doc);
        pages.set(base+'/'+variant+'/entry.js',variant==='native'?source:
          String(result.files[0].code));
      }
      inventory.push({id:item.id,mode,bindings:result.files[0].metrics.bindings,base});
    }
  }
  const server=http.createServer((req,res)=>{
    const pathname=req.url??'';
    const content=pages.get(pathname);
    if(content===undefined){res.writeHead(404);res.end('not found');return;}
    res.writeHead(200,{
      'content-type':pathname.endsWith('.html')?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none';script-src 'self'"
    });
    res.end(content);
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
      try{
        const response=await page.goto('http://127.0.0.1:'+address.port+route,
          {waitUntil:'load'});
        assert.equal(response?.status(),200);
        return await page.evaluate(()=>({
          answer:globalThis._answer,seen:globalThis._seen
        }));
      }finally{await page.close();}
    }
    /** @type {string[]} */
    const mismatches=[];
    for(const item of inventory){
      const native=await load(item.base+'/native/index.html');
      const emitted=await load(item.base+'/emitted/index.html');
      const parity=native.seen===emitted.seen;
      console.log(JSON.stringify({
        case:item.id,mode:item.mode,bindings:item.bindings,
        nativeLength:typeof native.seen==='string'?native.seen.length:null,
        emittedLength:typeof emitted.seen==='string'?emitted.seen.length:null,
        sourceParity:parity
      }));
      assert.equal(native.answer,17);
      assert.equal(emitted.answer,17);
      assert.match(native.seen,/privateSourceMarker/,
        item.id+' native source included in DOMString or exception');
      if(!parity)mismatches.push(item.mode+' '+item.id+
        ' bindings='+item.bindings);
    }
    assert.deepEqual(mismatches,[],'DOMTokenList string/error source parity');
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});

test('source-free standalone function still transforms across all modes',()=>{
  const source=fn+'globalThis._answer=inspect();';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const out=obfuscateFiles([{path:'source.js',sourceType:'script',code:source}],
      {mode,seed:'agent7-domtokenlist-pure-positive',
       strings:false,properties:false,identifiers:true});
    assert.ok(out.files[0].metrics.bindings>0,mode);
  }
});
