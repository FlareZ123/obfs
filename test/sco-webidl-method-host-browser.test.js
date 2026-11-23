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
      res.end('<!doctype html><title>SCO Web IDL method comparison</title>');
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
  const result=await compare("try{new Headers().append('bad name','x');return 'ok';}catch(e){return e.name+':'+e.message;}",'headers-append-invalid');
  assert.equal(result.refused,true);
});

test('selected SCO URLSearchParams append Symbol preserves browser error text',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare("try{new URLSearchParams().append(Symbol('x'),'1');return 'ok';}catch(e){return e.name+':'+e.message;}",'urlsearchparams-symbol');
  assert.equal(result.refused,true);
});

test('selected SCO WebIDL method-positive query remains protected',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare("return new URLSearchParams('a=1').get('a');",'urlsearchparams-valid-get');
  assert.equal(result.refused,false);
  assert.deepEqual(result,{refused:false,original:'1',emitted:'1',server:'1'});
});

test('selected SCO Headers get valid literal remains protected',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare("return new Headers({'x-demo':'ok'}).get('x-demo');",'headers-get-valid');
  assert.deepEqual(result,{refused:false,original:'ok',emitted:'ok',server:'ok'});
});

test('selected SCO literal append keeps defined result parity',{
  skip:!enabled,timeout:60000
},async()=>{
  const result=await compare("return new URLSearchParams('a=1').append('b','2')===undefined;",'urlsearchparams-append-valid');
  assert.deepEqual(result,{refused:false,original:true,emitted:true,server:true});
});

test('selected SCO query toString and safe private arithmetic retain yield',{
  skip:!enabled,timeout:60000
},async()=>{
  const query=await compare("return new URLSearchParams([['a','1'],['b','two']]).toString();",'urlsearchparams-tostring-valid');
  assert.deepEqual(query,{refused:false,original:'a=1&b=two',emitted:'a=1&b=two',server:'a=1&b=two'});
  const math=await compare('return Math.imul(17,19);','native-private-math');
  assert.deepEqual(math,{refused:false,original:323,emitted:323,server:323});
});

test('selected SCO Web IDL method admission fails closed on alias and extraction',{
  skip:process.env.OBFS_FOCUSED_TEST!=='test/sco-webidl-method-host-browser.test.js'
},()=>{
  /** @param {string} body */
  const compile=body=>partitionScoSelectedAsyncExports({
    path:'method-static.mjs',sourceType:'module',
    code:'export async function privateOp(x){'+body+'}'+
      'export function visible(){return 7;}'
  },{seed:'webidl-method-static-v1',privateNames:['privateOp']});
  for(const body of [
    "new Headers().append('bad name','x');return 1;",
    "new URLSearchParams().append(Symbol('x'),'1');return 1;",
    "return new Headers().get('bad name');",
    "return new URLSearchParams().get(x);",
    "return new Headers().append('x-demo',x);",
    "const h=new Headers();return h.get('x-demo');",
    "const p=new URLSearchParams('a=1');return p.get('a');",
    "const get=new URLSearchParams('a=1').get;return get('a');",
    "return new Headers();",
    "return new URLSearchParams('a=1').constructor;",
    "return new URLSearchParams('a=1')['get'].call(null,'a');"
  ])assert.throws(()=>compile(body),/unproved cross-realm WebIDL constructor/,body);
  for(const body of [
    "return new URLSearchParams('a=1').get('a');",
    "return new URLSearchParams('a=1').toString();",
    "return new URLSearchParams('a=1').append('b','2')===undefined;",
    "return new Headers({'x-demo':'ok'}).get('x-demo');",
    "return new Headers().set('x-demo','ok')===undefined;",
    "return Math.imul(17,19);"
  ])assert.deepEqual(compile(body).privateNames,['privateOp'],body);
});

test('private SCO ESM graph applies Web IDL method admission to imported leaves',{
  skip:process.env.OBFS_FOCUSED_TEST!=='test/sco-webidl-method-host-browser.test.js'
},()=>{
  /** @param {string} body */
  const graph=body=>partitionScoSelectedGraph([{
    file:{
      path:'method-graph.mjs',sourceType:'module',
      code:"import {leaf} from './private/leaf.mjs';"+
        'export async function privateOp(){return leaf();}'+
        'export function visible(){return 7;}'
    },
    options:{
      seed:'webidl-method-graph-v1',privateNames:['privateOp'],
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:'export function leaf(){'+body+'}'
      }]
    }
  }]);
  for(const body of [
    "return new URLSearchParams().append(Symbol('x'),'1');",
    "return new Headers().append('bad name','x');",
    "const h=new Headers();return h.get('x-demo');"
  ])assert.throws(()=>graph(body),/unproved cross-realm WebIDL constructor/,body);
  for(const body of [
    "return new URLSearchParams('a=1').get('a');",
    "return new Headers({'x-demo':'ok'}).get('x-demo');",
    "return Math.imul(17,19);"
  ])assert.deepEqual(graph(body).exposedPaths,['method-graph.mjs'],body);
});
