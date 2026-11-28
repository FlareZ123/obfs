'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

const functionSource='function inspect(){const privateSourceMarker=17;return privateSourceMarker;}\n';
/** @type {{id:string,assignment:string,readback:string}[]} */
const observations=[
  {id:'setAttribute',
    assignment:'target.setAttribute("data-probe",inspect);',
    readback:'target.getAttribute("data-probe")'},
  {id:'setAttributeNS',
    assignment:'target.setAttributeNS(null,"data-probe",inspect);',
    readback:'target.getAttribute("data-probe")'},
  {id:'dataset',
    assignment:'target.dataset.probe=inspect;',
    readback:'target.dataset.probe'},
  {id:'css-custom-property',
    assignment:'target.style.setProperty("--probe",inspect);',
    readback:'target.style.getPropertyValue("--probe")'},
  {id:'textContent',
    assignment:'target.textContent=inspect;',
    readback:'target.textContent'},
  {id:'innerText',
    assignment:'target.innerText=inspect;',
    readback:'target.innerText'}
];

test('real HTTP Chrome native-vs-emitted DOMString function-source readbacks are exact',{
  skip:process.platform!=='linux',
  timeout:100000
},async()=>{
  /** @type {Map<string,{mime:string,body:string}>} */
  const routes=new Map();
  /** @type {{id:string,mode:string,bindings:number,originalPath:string,emittedPath:string}[]} */
  const pairs=[];
  for(const observation of observations){
    const source=functionSource+
      'const target=document.getElementById("target");\n'+
      observation.assignment+'\n'+
      'globalThis._seen='+observation.readback+';\n'+
      'globalThis._value=inspect();\n';
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const out=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],
        {mode,seed:'agent7-real-domstring-'+observation.id,
         identifiers:true,properties:false,strings:false});
      const generated=String(out.files[0].code);
      const key=observation.id+'/'+mode;
      routes.set('/script/'+key+'/native.js',{mime:'text/javascript',body:source});
      routes.set('/script/'+key+'/emitted.js',{mime:'text/javascript',body:generated});
      for(const variant of ['native','emitted']){
        routes.set('/page/'+key+'/'+variant,{mime:'text/html',body:
          '<!doctype html><html><body><main id="target"></main>'+
          '<script src="/script/'+key+'/'+variant+'.js"></script></body></html>'});
      }
      pairs.push({id:observation.id,mode,bindings:out.files[0].metrics.bindings,
        originalPath:'/page/'+key+'/native',emittedPath:'/page/'+key+'/emitted'});
    }
  }
  const server=http.createServer((req,res)=>{
    const file=routes.get(req.url??'');
    if(!file){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{
      'content-type':file.mime+'; charset=utf-8',
      'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none'; script-src 'self'",
      'cache-control':'no-store'
    });
    res.end(file.body);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN || '/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    /** @param {string} path */
    async function load(path){
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      try{
        const result=await page.goto('http://127.0.0.1:'+address.port+path,{waitUntil:'load'});
        assert.equal(result?.status(),200,path+' HTML response');
        return await page.evaluate(()=>({
          seen:globalThis._seen,
          value:globalThis._value
        }));
      }finally{await page.close();}
    }
    /** @type {string[]} */
    const mismatches=[];
    for(const pair of pairs){
      const native=await load(pair.originalPath);
      const emitted=await load(pair.emittedPath);
      const sourceParity=emitted.seen===native.seen;
      const valueParity=emitted.value===native.value;
      const report={
        case:pair.id,mode:pair.mode,bindings:pair.bindings,
        nativeSeenLength:typeof native.seen==='string'?native.seen.length:null,
        emittedSeenLength:typeof emitted.seen==='string'?emitted.seen.length:null,
        sourceParity,valueParity
      };
      console.log(JSON.stringify(report));
      assert.equal(native.value,17,pair.id+' native numeric control');
      assert.equal(emitted.value,17,pair.id+' emitted numeric control');
      assert.equal(typeof native.seen,'string',pair.id+' native DOMString');
      if(!sourceParity)mismatches.push(pair.mode+' '+pair.id+' bindings='+pair.bindings);
    }
    const pureSource='function purePrivate(){const privateLocal=19;return privateLocal;}\n'+
      'module.exports=purePrivate();';
    const pure=obfuscateFiles([
      {path:'private.cjs',sourceType:'commonjs',code:pureSource}
    ],{mode:'coo',seed:'agent7-domstring-browser-positive',
      identifiers:true,properties:false,strings:false});
    assert.ok(pure.files[0].metrics.bindings>0,
      'independent unobserved private identifier still transforms');
    assert.deepEqual(mismatches,[],'Chrome DOMString function-source parity');
    assert.equal(pairs.filter(pair=>pair.bindings!==0).length,0,
      'source-observed browser cases conservatively avoid source-changing renames');
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});
