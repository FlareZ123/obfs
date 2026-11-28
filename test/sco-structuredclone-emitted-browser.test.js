'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {
  partitionScoSelectedAsyncExports,createScoHandler,bindScoModuleExports
}=require('../src');

const enabled=process.env.OBFS_FOCUSED_TEST===
  'test/sco-structuredclone-emitted-browser.test.js'&&process.platform!=='win32';

/** @returns {Promise<{refused:boolean,original?:string,emitted?:string,node?:string}>} */
async function selectedBrowserParity(){
  const source=[
    'export async function privateOp(){',
    "try{structuredClone(Symbol('x'));return 'ok';}",
    'catch(e){return e.message;}',
    '}',
    'export function visible(){return 7;}'
  ].join('');
  /** @type {ReturnType<typeof partitionScoSelectedAsyncExports>} */
  let compiled;
  try{
    compiled=partitionScoSelectedAsyncExports({
      path:'clone-host.mjs',sourceType:'module',code:source
    },{privateNames:['privateOp'],seed:'clone-actual-browser-20261128'});
  }catch(error){
    if(error instanceof TypeError&&/unproved cross-realm host API/u.test(error.message))
      return {refused:true};
    throw error;
  }
  const namespace=await import('data:text/javascript,'+encodeURIComponent(source));
  const handler=createScoHandler([compiled.clientFile],{
    remoteMethods:bindScoModuleExports(compiled,namespace),
    authorizeRead:req=>req.headers.cookie?.includes('session=allowed')===true,
    authorizeRpc:req=>req.headers.cookie?.includes('session=allowed')===true,
    authorizeOperation:req=>req.headers.cookie?.includes('session=allowed')===true
  });
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      res.end('<!doctype html><title>structuredClone SCO comparison</title>');
      return;
    }
    void handler(req,res);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({method:compiled.methodNames.privateOp,args:[]})
    });
    assert.equal(denied.status,403);
    const puppeteer=require('puppeteer-core');
    browser=await puppeteer.launch({
      channel:process.env.CHROMIUM_BIN?undefined:'chrome',
      executablePath:process.env.CHROMIUM_BIN,
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const page=await browser.newPage();
    await page.setCookie({url:origin,name:'session',value:'allowed'});
    await page.goto(origin+'/');
    const original=await page.evaluate(async (/** @type {string} */ text)=>{
      const module=await import('data:text/javascript,'+encodeURIComponent(text));
      return module.privateOp();
    },source);
    const emitted=await page.evaluate(async (/** @type {string} */ url)=>{
      const module=await import(url);
      return module.privateOp();
    },origin+'/obfs/clone-host.mjs');
    const node=await namespace.privateOp();
    console.log('SCO_STRUCTUREDCLONE_EMITTED '+JSON.stringify({
      original,emitted,node,chrome:await browser.version(),nodeVersion:process.version
    }));
    assert.equal(emitted,original,'Selected SCO changed native Chromium structuredClone result');
    return {refused:false,original,emitted,node};
  }finally{
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

test('selected SCO refuses or exactly preserves real-browser structuredClone over HTTP',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await selectedBrowserParity();
  if(result.refused)assert.equal(result.refused,true);
});
