'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {
  partitionScoSelectedAsyncExports,createScoHandler,bindScoModuleExports
}=require('../src');

const enabled=process.env.OBFS_FOCUSED_TEST===
  'test/sco-intl-selected-live-browser-parity.test.js'&&
  process.platform!=='win32';

/**
 * Check a selected async export under real Chromium and Node with a real
 * same-origin HTTP RPC facade. Browser cookie authorization is deliberately
 * independent of source confidentiality; the test exercises semantic parity.
 *
 * @param {string} body
 * @param {string} label
 * @returns {Promise<{refused:boolean,original?:unknown,emitted?:unknown,server?:unknown}>}
 */
async function attempt(body,label){
  const source='export async function privateOp(){'+body+'}'+
    'export function visible(){return 7;}';
  /** @type {ReturnType<typeof partitionScoSelectedAsyncExports>} */
  let partition;
  try{
    partition=partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'sco-intl-live-host-20261123/'+label,privateNames:['privateOp']}
    );
  }catch(error){
    if(error instanceof TypeError&&/realm-local configuration/u.test(error.message)){
      console.log(JSON.stringify({label,refused:true,reason:error.message}));
      return {refused:true};
    }
    throw error;
  }
  const namespace=await import('data:text/javascript,'+encodeURIComponent(source));
  const handler=createScoHandler([partition.clientFile],{
    remoteMethods:bindScoModuleExports(partition,namespace),
    authorizeRead:req=>req.headers.cookie?.includes('session=allowed')===true,
    authorizeRpc:req=>req.headers.cookie?.includes('session=allowed')===true,
    authorizeOperation:req=>req.headers.cookie?.includes('session=allowed')===true
  });
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{'content-type':'text/html'});
      res.end('<!doctype html><title>Selected SCO host parity</title>');
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
      body:JSON.stringify({method:partition.methodNames.privateOp,args:[]})
    });
    assert.equal(denied.status,403,'Missing browser session must be rejected');
    const puppeteer=require('puppeteer-core');
    browser=await puppeteer.launch({
      channel:process.env.CHROMIUM_BIN?undefined:'chrome',
      executablePath:process.env.CHROMIUM_BIN,
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']
    });
    const page=await browser.newPage();
    await page.setCookie({url:origin,name:'session',value:'allowed'});
    await page.goto(origin+'/');
    const original=await page.evaluate(
      async (/** @type {string} */ originalText)=>{
        const module=await import('data:text/javascript,'+
          encodeURIComponent(originalText));
        return module.privateOp();
      },source);
    const emitted=await page.evaluate(
      async (/** @type {string} */ url)=>{
        const module=await import(url);
        return module.privateOp();
      },origin+'/obfs/mixed.mjs');
    const serverValue=await namespace.privateOp();
    console.log(JSON.stringify({
      label,refused:false,original,emitted,server:serverValue,
      chrome:await browser.version(),node:process.version
    }));
    assert.equal(emitted,original,
      'Selected SCO output diverges from native Chromium: '+label);
    return {refused:false,original,emitted,server:serverValue};
  }finally{
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

test('selected SCO currency host drift is refused or preserves native browser parity',{
  skip:!enabled,timeout:60000
},async()=>{
  await attempt("return Intl.supportedValuesOf('currency').includes('ZWG');",
    'currency');
});

test('selected SCO Intl.Locale method-shape drift is refused or preserves parity',{
  skip:!enabled,timeout:60000
},async()=>{
  await attempt("return typeof new Intl.Locale('en').getCollations;",
    'locale');
});

test('selected SCO safe arithmetic still runs through live authorized browser RPC',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await attempt('return Math.imul(7,13);','safe-math');
  assert.equal(result.refused,false,'Safe selected export must remain relocated');
  assert.equal(result.original,91);
  assert.equal(result.server,91);
  assert.equal(result.emitted,91);
});
