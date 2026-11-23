'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {
  partitionScoSelectedAsyncExports,partitionScoSelectedGraph,
  createScoHandler,bindScoModuleExports
}=require('../src');

const enabled=process.env.OBFS_FOCUSED_TEST===
  'test/sco-webidl-method-host-browser.test.js'&&process.platform!=='win32';

/**
 * Run native Chromium and the emitted selected-SCO facade over a real
 * cookie-authorized HTTP RPC, while preserving the Node private execution.
 * A refused source is safe only for recognized host-observation diagnostics.
 * @param {string} body
 * @param {string} label
 * @returns {Promise<{refused:boolean,original?:unknown,emitted?:unknown,server?:unknown}>}
 */
async function compare(body,label){
  const source='export async function privateOp(){'+body+'}'+
    'export function visible(){return 7;}';
  /** @type {ReturnType<typeof partitionScoSelectedAsyncExports>} */
  let compiled;
  try{
    compiled=partitionScoSelectedAsyncExports(
      {path:'webidl-method.mjs',code:source,sourceType:'module'},
      {privateNames:['privateOp'],seed:'sco-host-webidl-method-20261123/'+label}
    );
  }catch(error){
    if(error instanceof TypeError&&/realm-local|unproved cross-realm/u.test(error.message)){
      console.log('SCO_HOST_WEBIDL_METHOD '+JSON.stringify({label,refused:true,reason:error.message}));
      return {refused:true};
    }
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
      res.writeHead(200,{'content-type':'text/html'});
      res.end('<!doctype html><title>SCO base64 host comparison</title>');
      return;
    }
    void handler(req,res);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const addr=server.address();
    assert.ok(addr&&typeof addr!=='string');
    const origin='http://127.0.0.1:'+addr.port;
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
      headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const page=await browser.newPage();
    await page.setCookie({url:origin,name:'session',value:'allowed'});
    await page.goto(origin+'/');
    const original=await page.evaluate(async (/** @type {string} */ text)=>{
      const native=await import('data:text/javascript,'+encodeURIComponent(text));
      return native.privateOp();
    },source);
    const emitted=await page.evaluate(async (/** @type {string} */ url)=>{
      const remote=await import(url);
      return remote.privateOp();
    },origin+'/obfs/webidl-method.mjs');
    const serverValue=await namespace.privateOp();
    console.log('SCO_HOST_WEBIDL_METHOD '+JSON.stringify({
      label,refused:false,original,emitted,server:serverValue,
      node:process.version,chrome:await browser.version()
    }));
    assert.equal(emitted,original,'Selected SCO changed native browser result: '+label);
    return {refused:false,original,emitted,server:serverValue};
  }finally{
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

test('selected SCO Headers append invalid name remains browser-semantic',{
  skip:!enabled,timeout:60000
},async()=>{
  await compare("try{new Headers().append('bad name','x');return 'ok';}catch(e){return e.name+':'+e.message;}",'headers-append-invalid');
});

test('selected SCO URLSearchParams append Symbol preserves browser error text',{
  skip:!enabled,timeout:60000
},async()=>{
  await compare("try{new URLSearchParams().append(Symbol('x'),'1');return 'ok';}catch(e){return e.name+':'+e.message;}",'urlsearchparams-symbol');
});

test('selected SCO WebIDL method-positive query remains protected',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare("return new URLSearchParams('a=1').get('a');",'urlsearchparams-valid-get');
  assert.equal(result.refused,false);
  assert.deepEqual(result,{refused:false,original:'1',emitted:'1',server:'1'});
});
