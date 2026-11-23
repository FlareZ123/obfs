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
    assert.deepEqual(emitted,original,'Selected SCO changed native browser result: '+label);
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
  const computed=await compare("return new Headers({'x-demo':'ok'})['get']('x-demo');",'headers-computed-get');
  assert.deepEqual(computed,{refused:false,original:'ok',emitted:'ok',server:'ok'});
  const templateValue=await compare("return new Headers({'x-demo':`ok`}).get('x-demo');",'headers-template-value');
  assert.deepEqual(templateValue,{refused:false,original:'ok',emitted:'ok',server:'ok'});
  const concatValue=await compare("return new Headers({'x-demo':'o'+'k'}).get(`x-demo`);",'headers-static-concat-name-value');
  assert.deepEqual(concatValue,{refused:false,original:'ok',emitted:'ok',server:'ok'});
  const appendConcat=await compare("return new Headers().append('x-demo','o'+'k')===undefined;",'headers-concat-append');
  assert.deepEqual(appendConcat,{refused:false,original:true,emitted:true,server:true});
  const concatName=await compare("return new Headers({'x-demo':'ok'}).get('x-'+'demo');",'headers-concat-name');
  assert.deepEqual(concatName,{refused:false,original:'ok',emitted:'ok',server:'ok'});
  const trim=await compare("return new Headers({'x-demo':'  ok  '}).get('x-demo');",'headers-trim-whitespace');
  assert.deepEqual(trim,{refused:false,original:'ok',emitted:'ok',server:'ok'});
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
  const tupleGet=await compare("return new URLSearchParams([['a','1'],['b','two']])['get']('b');",'urlsearchparams-tuples-computed-get');
  assert.deepEqual(tupleGet,{refused:false,original:'two',emitted:'two',server:'two'});
  const templateGet=await compare("return new URLSearchParams(`a=1`).get('a');",'urlsearchparams-template-get');
  assert.deepEqual(templateGet,{refused:false,original:'1',emitted:'1',server:'1'});
  const concatGet=await compare("return new URLSearchParams('a'+'=1').get('a');",'urlsearchparams-static-concat-get');
  assert.deepEqual(concatGet,{refused:false,original:'1',emitted:'1',server:'1'});
  const templateArg=await compare("return new URLSearchParams('a=1').get(`a`);",'urlsearchparams-template-argument');
  assert.deepEqual(templateArg,{refused:false,original:'1',emitted:'1',server:'1'});
  const concatArg=await compare("return new URLSearchParams('a=1').get('a'+'');",'urlsearchparams-concat-argument');
  assert.deepEqual(concatArg,{refused:false,original:'1',emitted:'1',server:'1'});
  const duplicates=await compare("return new URLSearchParams([['a','1'],['a','2']]).getAll('a');",'urlsearchparams-duplicate-values');
  assert.deepEqual(duplicates,{refused:false,original:['1','2'],emitted:['1','2'],server:['1','2']});
  const plus=await compare("return new URLSearchParams('q=a+b&x=%2B').get('q');",'urlsearchparams-plus-decoding');
  assert.deepEqual(plus,{refused:false,original:'a b',emitted:'a b',server:'a b'});
  const malformed=await compare("return new URLSearchParams('q=%FF').get('q');",'urlsearchparams-invalid-utf8');
  assert.deepEqual(malformed,{refused:false,original:'\uFFFD',emitted:'\uFFFD',server:'\uFFFD'});
  const math=await compare('return Math.imul(17,19);','native-private-math');
  assert.deepEqual(math,{refused:false,original:323,emitted:323,server:323});
});


test('selected SCO bounded Web IDL method matrix matches native host semantics',{
  skip:!enabled,timeout:60000
},async()=>{
  // Execute the method family through one selected private RPC and one
  // real Chromium launch to keep the focused two-OS gate decision-bearing.
  const cases=[
    {label:'query-get-all',expr:"JSON.stringify(new URLSearchParams('a=1&a=2').getAll('a'))",result:'["1","2"]'},
    {label:'query-has',expr:"new URLSearchParams('a=1').has('a')",result:true},
    {label:'query-delete',expr:"new URLSearchParams('a=1').delete('a')===undefined",result:true},
    {label:'query-set',expr:"new URLSearchParams('a=1').set('b','2')===undefined",result:true},
    {label:'query-sort',expr:"new URLSearchParams('b=2&a=1').sort()===undefined",result:true},
    {label:'headers-has',expr:"new Headers({'x-demo':'ok'}).has('x-demo')",result:true},
    {label:'headers-append',expr:"new Headers().append('x-demo','ok')===undefined",result:true},
    {label:'headers-delete',expr:"new Headers({'x-demo':'ok'}).delete('x-demo')===undefined",result:true}
  ];
  const body='return ['+cases.map(item=>'('+item.expr+')').join(',')+'];';
  const got=await compare(body,'bounded-method-matrix');
  assert.deepEqual(got,{
    refused:false,
    original:cases.map(item=>item.result),
    emitted:cases.map(item=>item.result),
    server:cases.map(item=>item.result)
  },cases.map(item=>item.label).join(','));
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
    "return new Headers().has('bad name');",
    "return new URLSearchParams().getAll(Symbol('x'));",
    "return new URLSearchParams().get(x);",
    "return new Headers().append('x-demo',x);",
    "const h=new Headers();return h.get('x-demo');",
    "const p=new URLSearchParams('a=1');return p.get('a');",
    "const get=new URLSearchParams('a=1').get;return get('a');",
    "return new Headers();",
    "return new URLSearchParams('a=1').constructor;",
    "return new URLSearchParams('a=1')['get'].call(null,'a');",
    "return new globalThis.Headers().get('bad name');",
    "return new globalThis['URLSearchParams']().get(x);",
    "const g=globalThis;return new g.Headers().get('bad name');",
    "const {Headers:H}=globalThis;return new H().get('bad name');",
    "const key='Headers';const H=globalThis[key];return new H().get('x-demo');",
    "const key='URLSearchParams';const {[key]:H}=globalThis;return new H().get('a');",
    "const root=globalThis;const key='Headers';const H=root[key];return new H().get('x-demo');",
    "const {...rest}=globalThis;const H=rest.Headers;return new H().get('x-demo');",
    "const {Headers:H=0}=globalThis;return new H().get('x-demo');",
    "const key='Headers';const {[key]:H=0}=globalThis;return new H().get('x-demo');",
    "let H;({Headers:H}=globalThis);return new H().get('x-demo');",
    "let H;({Headers:H=0}=globalThis);return new H().get('x-demo');",
    "const key='Headers';let H;({[key]:H=0}=globalThis);return new H().get('x-demo');",
    "let rest;({...rest}=globalThis);const H=rest.Headers;return new H().get('x-demo');",
    "const root=globalThis;const {...rest}=root;const H=rest.Headers;return new H().get('x-demo');",
    "const root=globalThis;let rest;({...rest}=root);const H=rest.Headers;return new H().get('x-demo');",
    "const input='a=1';return new URLSearchParams(input).get('a');",
    "return new URLSearchParams(`a=${'1'}`).get('a');",
    "return new URLSearchParams('a=é').get('a');",
    "return new URLSearchParams('a=1').get('é');",
    "return new URLSearchParams([['a','é']]).get('a');",
    "return new Headers().append('x-demo','café');",
    "return new Headers({'x-demo':'café'}).get('x-demo');",
    "return new Headers().get('X-Demo');",
    "const querySuffix='1';return new URLSearchParams('a=1').get('a'+querySuffix);",
    "const headerSuffix='k';return new Headers().append('x-demo','o'+headerSuffix);",
    "const headerNameSuffix='demo';return new Headers({'x-demo':'ok'}).get('x-'+headerNameSuffix);",
    "return new Headers({'x-demo':'ok'}).get(`x-${'demo'}`);",
    "return new Headers({'x-demo':'ok'}).get('x-é');"
  ])assert.throws(()=>compile(body),/unproved cross-realm WebIDL constructor/,body);
  for(const body of [
    "const H=Reflect.get(globalThis,'Headers');return new H().get('x-demo');",
    "const H=Object.getOwnPropertyDescriptor(globalThis,'Headers').value;return new H().get('x-demo');",
    "Headers.prototype.append=function(){return 'patched';};return new Headers().append('x-demo','ok');",
    "Object.defineProperty(URLSearchParams.prototype,'get',{value:function(){return 'patched';}});return new URLSearchParams('a=1').get('a');",
    "const root=window;const H=root.Headers;return new H().get('x-demo');",
    "let root;root=globalThis;const H=root.Headers;return new H().get('x-demo');",
    "const a=globalThis;const b=a;const H=b.Headers;return new H().get('x-demo');",
    "const root=globalThis;let H;({Headers:H}=root);return new H().get('x-demo');"
  ])assert.throws(()=>compile(body),/realm-local|unproved cross-realm WebIDL constructor/,body);
  for(const name of ['Headers','URLSearchParams']){
    const shadowed='export async function privateOp('+name+'){' +
      'return new '+name+'().get("x");}' +
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports({
      path:'method-shadow.mjs',sourceType:'module',code:shadowed
    },{seed:'webidl-method-shadow-v1',privateNames:['privateOp']}),
    /unproved cross-realm WebIDL constructor/,name);
  }
  for(const name of ['Headers','URLSearchParams']){
    const source='const '+name+'=17;'+
      'export async function privateOp(){return new '+name+'().get("x");}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports({
      path:'method-module-shadow.mjs',sourceType:'module',code:source
    },{seed:'webidl-method-module-shadow-v1',privateNames:['privateOp']}),
    /unproved cross-realm WebIDL constructor/,name);
  }
  for(const body of [
    "return new URLSearchParams('a=1').get('a');",
    "return new URLSearchParams('a=1').toString();",
    "return new URLSearchParams([['a','1']])['get']('a');",
    "return new URLSearchParams(`a=1`).get('a');",
    "return new URLSearchParams('a'+'=1').get('a');",
    "return new URLSearchParams('a=1').get(`a`);",
    "return new URLSearchParams('a=1').get('a'+'');",
    "return new URLSearchParams('a=1').append('b','2')===undefined;",
    "return new Headers({'x-demo':'ok'}).get('x-demo');",
    "return new Headers({'x-demo':'ok'})['get']('x-demo');",
    "return new Headers({'x-demo':`ok`}).get('x-demo');",
    "return new Headers({'x-demo':'o'+'k'}).get(`x-demo`);",
    "return new Headers().get('x-'+'demo');",
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
    "const h=new Headers();return h.get('x-demo');",
    "const key='Headers';const H=globalThis[key];return new H().get('x-demo');",
    "let H;({Headers:H}=globalThis);return new H().get('x-demo');",
    "const {...rest}=globalThis;const H=rest.Headers;return new H().get('x-demo');",
    "const {Headers:H=0}=globalThis;return new H().get('x-demo');",
    "const input='a=1';return new URLSearchParams(input).get('a');"
  ])assert.throws(()=>graph(body),/unproved cross-realm WebIDL constructor|realm-local intrinsic state access/,body);
  for(const body of [
    "const H=Reflect.get(globalThis,'Headers');return new H().get('x-demo');",
    "Headers.prototype.get=function(){return 'patched';};return new Headers().get('x-demo');",
    "const root=window;const H=root.Headers;return new H().get('x-demo');"
  ])assert.throws(()=>graph(body),/unproved cross-realm WebIDL constructor|realm-local intrinsic state access|realm-local prototype/,body);
  for(const name of ['Headers','URLSearchParams']){
    const body='const '+name+'=17;export function leaf(){return new '+name+'().get("x");}';
    const source=partitionScoSelectedGraph.bind(null,[{
      file:{
        path:'method-shadow-graph.mjs',sourceType:'module',
        code:"import {leaf} from './private/leaf.mjs';"+
          'export async function privateOp(){return leaf();}'+
          'export function visible(){return 7;}'
      },
      options:{
        seed:'webidl-method-shadow-graph-v1',privateNames:['privateOp'],
        privateModuleImports:['./private/leaf.mjs'],
        privateModuleSources:[{path:'private/leaf.mjs',code:body}]
      }
    }]);
    assert.throws(source,/unproved cross-realm WebIDL constructor/,name);
  }
  for(const body of [
    "return new URLSearchParams('a=1').get('a');",
    "return new Headers({'x-demo':'ok'}).get('x-demo');",
    "return Math.imul(17,19);"
  ])assert.deepEqual(graph(body).exposedPaths,['method-graph.mjs'],body);
});
