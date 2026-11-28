'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {test}=require('node:test');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

const fn='function inspect(){const privateSourceMarker=17;return privateSourceMarker;}\n';
/**
 * Independent Chrome 144 witness: each ordinary native binding implicitly
 * coerces inspect through Web IDL; measureText exposes a numerical length
 * side channel where the other four preserve exact original source text.
 * @type {{id:string,body:string,kind:'source'|'width'}[]}
 */
const cases=[
  {id:'input-setCustomValidity',kind:'source',
    body:'const x=document.createElement("input");x.setCustomValidity(inspect);globalThis._seen=x.validationMessage;'},
  {id:'input-setRangeText',kind:'source',
    body:'const x=document.createElement("input");x.setRangeText(inspect);globalThis._seen=x.value;'},
  {id:'element-setHTMLUnsafe',kind:'source',
    body:'const x=document.createElement("div");x.setHTMLUnsafe(inspect);globalThis._seen=x.textContent;'},
  {id:'document-createProcessingInstruction',kind:'source',
    body:'globalThis._seen=document.createProcessingInstruction("safe",inspect).data;'},
  {id:'canvas-measureText',kind:'width',
    body:'const x=document.createElement("canvas").getContext("2d");x.font="14px monospace";globalThis._seen=x.measureText(inspect).width;'}
];

test('real Chrome native text and canvas implicit function-source coercions preserve exact observations',{
  skip:process.platform!=='linux',timeout:90000
},async()=>{
  /** @type {Map<string,string>} */
  const routes=new Map();
  /** @type {{id:string,mode:string,kind:'source'|'width',bindings:number,base:string}[]} */
  const inventory=[];
  for(const item of cases) {
    const source=fn+item.body+'\nglobalThis._answer=inspect();';
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const output=obfuscateFiles([
        {path:'entry.js',sourceType:'script',code:source}
      ],{mode,seed:'agent7-more-native-'+item.id,
        identifiers:true,strings:false,properties:false});
      const base='/'+item.id+'/'+mode;
      const html='<!doctype html><html><body><script src="./entry.js"></script></body></html>';
      for(const variant of ['native','emitted']){
        routes.set(base+'/'+variant+'/index.html',html);
        routes.set(base+'/'+variant+'/entry.js',
          variant==='native'?source:String(output.files[0].code));
      }
      inventory.push({id:item.id,kind:item.kind,mode,
        bindings:output.files[0].metrics.bindings,base});
    }
  }
  const server=http.createServer((req,res)=>{
    const pathname=req.url??'';
    const value=routes.get(pathname);
    if(value===undefined){res.writeHead(404);res.end('absent');return;}
    res.writeHead(200,{
      'content-type':pathname.endsWith('.html')?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none';script-src 'self'"
    });
    res.end(value);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try {
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN||'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    /** @param {string} path */
    async function load(path){
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      try{
        const response=await page.goto('http://127.0.0.1:'+address.port+path,
          {waitUntil:'load'});
        assert.equal(response?.status(),200);
        return await page.evaluate(()=>({
          answer:globalThis._answer,seen:globalThis._seen
        }));
      }finally{await page.close();}
    }
    /** @type {string[]} */
    const misses=[];
    for(const item of inventory){
      const native=await load(item.base+'/native/index.html');
      const emitted=await load(item.base+'/emitted/index.html');
      const parity=native.seen===emitted.seen;
      console.log(JSON.stringify({
        id:item.id,mode:item.mode,bindings:item.bindings,
        kind:item.kind,nativeSeen:native.seen,emittedSeen:emitted.seen,
        parity
      }));
      assert.equal(native.answer,17);
      assert.equal(emitted.answer,17);
      if(item.kind==='source'){
        assert.equal(typeof native.seen,'string');
        assert.match(native.seen,/privateSourceMarker/);
      }else{
        assert.equal(typeof native.seen,'number');
        assert.ok(native.seen>100,'canvas text metric is a real nonzero observation');
      }
      if(!parity)misses.push(item.mode+' '+item.id);
    }
    assert.deepEqual(misses,[],'all native text/canvas source observations must match');
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});

test('independent source-free local remains rewrite-eligible',()=>{
  const source=fn+'globalThis._answer=inspect();';
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const out=obfuscateFiles([{path:'private.js',sourceType:'script',code:source}],
      {mode,seed:'agent7-new-native-pure-positive',
       identifiers:true,strings:false,properties:false});
    assert.ok(out.files[0].metrics.bindings>0,mode);
  }
});
