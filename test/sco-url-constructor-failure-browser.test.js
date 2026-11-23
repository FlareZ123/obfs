'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {
  partitionScoSelectedAsyncExports,createScoHandler,bindScoModuleExports
}=require('../src');

const enabled=process.env.OBFS_FOCUSED_TEST===
  'test/sco-url-constructor-failure-browser.test.js'&&process.platform!=='win32';

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
      {path:'url-host.mjs',code:source,sourceType:'module'},
      {privateNames:['privateOp'],seed:'sco-host-url-20261123/'+label}
    );
  }catch(error){
    if(error instanceof TypeError&&/realm-local|unproved cross-realm/u.test(error.message)){
      console.log('SCO_HOST_URL_CONSTRUCTOR '+JSON.stringify({label,refused:true,reason:error.message}));
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
    },origin+'/obfs/url-host.mjs');
    const serverValue=await namespace.privateOp();
    console.log('SCO_HOST_URL_CONSTRUCTOR '+JSON.stringify({
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


test('selected SCO invalid URL constructor retains native browser error message',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare("try{return new URL(':').hostname;}catch(e){return e.name+':'+e.message;}",'invalid-url');
  assert.equal(result.refused,true);
});

test('selected SCO valid ASCII URL hostname remains a positive relocated workload',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare(
    "return new URL('https://example.org/a?b=1').hostname;",'safe-url');
  assert.equal(result.original,'example.org');
  assert.equal(result.server,'example.org');
  assert.equal(result.emitted,'example.org');
});

test('selected SCO arithmetic remains correct in authenticated browser RPC',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare('return Math.imul(13,23);','safe-math');
  assert.deepEqual(result,{refused:false,original:299,emitted:299,server:299});
});

/** @param {string} body @param {string} [publicBody] */
function partition(body,publicBody='return 7;'){
  return partitionScoSelectedAsyncExports({
    path:'url-admission.mjs',sourceType:'module',
    code:'export async function privateOp(candidate){'+body+'}'+
      'export function visible(){'+publicBody+'}'
  },{privateNames:['privateOp'],seed:'sco-url-admission-20261123'});
}

test('SCO URL constructor proof refuses possible native failures and keeps fixed valid work',()=>{
  for(const body of [
    "try{return new URL(':').hostname;}catch(e){return e.message;}",
    "return new URL(candidate).hostname;",
    "return new URL('/relative','https://example.org').pathname;"
  ])assert.throws(()=>partition(body),/unproved cross-realm object URL API/,body);
  for(const body of [
    "return new URL('https://example.org/a?b=1').hostname;",
    "const url=new URL('https://example.org');return url.pathname;",
    "return Math.imul(13,23);"
  ])assert.deepEqual(partition(body).privateNames,['privateOp'],body);
  const exposed=partition('return 7;',
    "try{return new URL(':').hostname;}catch(e){return e.message;}")
    .clientFile.code;
  assert.ok(exposed.includes("new URL(':').hostname"));
});
