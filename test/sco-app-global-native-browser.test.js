'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const focused=process.env.OBFS_FOCUSED_TEST===
  'test/sco-app-global-native-browser.test.js';
const browserEnabled=focused&&process.platform!=='win32';

/**
 * Inspect the precise host-global admission failure using a real browser
 * rather than assuming a simulated Node global matches Window semantics.
 * The original script is imported as ESM with a browser-owned application
 * global; the relocated Node execution has no corresponding global. The
 * compiler must decline to promise client/server equivalence.
 */
test('real Chromium application global differs from independent Node host and is refused by SCO',{
  skip:!browserEnabled,timeout:45000
},async()=>{
  const source='export async function protectedOp(){return externalBridge+1;}'+
    'export function publicOp(){return 0;}';
  const localSource='export async function protectedOp(){'+
    'const externalBridge=41;return externalBridge+1;}'+
    'export function publicOp(){return 0;}';
  const puppeteer=require('puppeteer-core');
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    browser=await puppeteer.launch({
      channel:process.env.CHROMIUM_BIN?undefined:'chrome',
      ...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),
      headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const page=await browser.newPage();
    await page.goto('about:blank');
    const observed=await page.evaluate(async(input)=>{
      // The application defines its own ambient global prior to loading ESM.
      globalThis.externalBridge=73;
      const freeModule=await import('data:text/javascript,'+
        encodeURIComponent(input.source));
      const localModule=await import('data:text/javascript,'+
        encodeURIComponent(input.localSource));
      return {
        browserFree:await freeModule.protectedOp(),
        browserLocal:await localModule.protectedOp(),
        hasGlobal:Object.hasOwn(globalThis,'externalBridge')
      };
    },{source,localSource});
    assert.deepEqual(observed,{
      browserFree:74,browserLocal:42,hasGlobal:true
    });
    const nativeServer=await import('data:text/javascript,'+
      encodeURIComponent(source));
    await assert.rejects(nativeServer.protectedOp(),error=>
      error instanceof ReferenceError&&/externalBridge/u.test(error.message));
    const localServer=await import('data:text/javascript,'+
      encodeURIComponent(localSource));
    assert.equal(await localServer.protectedOp(),42);
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'agent35-real-browser-app-global-free',
        privateNames:['protectedOp']}
    ),/unproved unqualified free reference: externalBridge/u);
    const localPartition=partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:localSource,sourceType:'module'},
      {seed:'agent35-real-browser-app-global-owned',
        privateNames:['protectedOp']});
    assert.deepEqual(localPartition.privateNames,['protectedOp']);
    console.log('SCO_APP_GLOBAL_BROWSER '+JSON.stringify({
      browserFree:observed.browserFree,browserLocal:observed.browserLocal,
      serverFree:'ReferenceError',serverLocal:42,refusedUnproved:true
    }));
  }finally{
    if(browser)await browser.close();
  }
});

// The OS-independent syntax control still runs when Chromium is unavailable.
test('selected SCO syntax distinguishes app-global from function-owned local',()=>{
  const source='export async function protectedOp(){return externalBridge;}'+
    'export function publicOp(){return 0;}';
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:source,sourceType:'module'},
    {seed:'agent35-app-global-static',privateNames:['protectedOp']}
  ),/unproved unqualified free reference: externalBridge/u);
  const safeSource='export async function protectedOp(){const externalBridge=41;return externalBridge;}'+
    'export function publicOp(){return 0;}';
  const compiled=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:safeSource,sourceType:'module'},
    {seed:'agent35-app-global-native-local',privateNames:['protectedOp']});
  assert.deepEqual(compiled.privateNames,['protectedOp']);
});


/**
 * Node exposes Buffer as a global. A fresh browser context does not;
 * relocating this selected browser export must therefore decline rather
 * than replacing a native ReferenceError with Node's successful result.
 */
test('real Chromium and Node differ on a free Buffer selected export',{
  skip:!browserEnabled,timeout:45000
},async()=>{
  const source='export async function protectedOp(){return Buffer.byteLength("ab");}'+
    'export function publicOp(){return 0;}';
  const nativeNode=await import('data:text/javascript,'+
    encodeURIComponent(source));
  assert.equal(await nativeNode.protectedOp(),2);
  const puppeteer=require('puppeteer-core');
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    browser=await puppeteer.launch({
      channel:process.env.CHROMIUM_BIN?undefined:'chrome',
      ...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),
      headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const page=await browser.newPage();
    await page.goto('about:blank');
    const observed=await page.evaluate(async(code)=>{
      const imported=await import('data:text/javascript,'+
        encodeURIComponent(code));
      try{
        return {type:typeof Buffer,
          outcome:'value:'+String(await imported.protectedOp())};
      }catch(error){
        const name=error&&typeof error==='object'&&'name' in error?
          String(error.name):String(error);
        return {type:typeof Buffer,outcome:'throw:'+name};
      }
    },source);
    assert.deepEqual(observed,{
      type:'undefined',outcome:'throw:ReferenceError'
    });
    console.log('SCO_BUFFER_NATIVE_MISMATCH '+JSON.stringify({
      node:2,browser:observed.outcome,browserBufferType:observed.type
    }));
    assert.throws(()=>partitionScoSelectedAsyncExports(
      {path:'mixed.mjs',code:source,sourceType:'module'},
      {seed:'agent35-browser-buffer-free',privateNames:['protectedOp']}
    ),/unproved/u);
  }finally{
    if(browser)await browser.close();
  }
});

test('selected SCO Buffer lexical shadow has stable primitive behavior',async()=>{
  const source='export async function protectedOp(){'+
    'const Buffer=41;return Buffer+1;}'+
    'export function publicOp(){return 0;}';
  const native=await import('data:text/javascript,'+
    encodeURIComponent(source));
  assert.equal(await native.protectedOp(),42);
  const partition=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:source,sourceType:'module'},
    {seed:'agent35-buffer-local-positive',privateNames:['protectedOp']});
  assert.deepEqual(partition.privateNames,['protectedOp']);
});


test('reviewed private server-only dependency retains Node Buffer as a deliberate ambient',()=>{
  const source='import {readValue} from "./private/leaf.mjs";'+
    'export async function protectedOp(){return readValue();}'+
    'export function publicOp(){return 0;}';
  const file={path:'mixed.mjs',sourceType:'module',code:source};
  const options={
    seed:'agent35-server-owned-buffer-positive',
    privateNames:['protectedOp'],
    privateModuleImports:['./private/leaf.mjs'],
    privateModuleSources:[{
      path:'private/leaf.mjs',
      code:'export function readValue(){return Buffer.byteLength("ab")+process.versions.node.length;}'
    }]
  };
  assert.throws(()=>partitionScoSelectedAsyncExports(file,options),
    /SCO private static dependency has unproved unqualified free reference: private\/leaf\.mjs:Buffer/u);
  const result=partitionScoSelectedAsyncExports(file,{
    ...options,allowServerNodeGlobals:true
  });
  assert.deepEqual(result.privateNames,['protectedOp']);
  assert.doesNotMatch(result.clientFile.code,/Buffer/u);
});


/** @type {{name:string,expression:string}[]} */
const nodeAmbientCandidates=[
  {name:'globalThis.Buffer',expression:'globalThis.Buffer.byteLength("ab")'},
  {name:'process',expression:'process.versions.node'},
  {name:'globalThis.process',expression:'globalThis.process.versions.node'},
  {name:'global',expression:'global===globalThis'},
  {name:'globalThis.global',expression:'globalThis.global===globalThis'},
  {name:'setImmediate',expression:'Boolean(setImmediate)'},
  {name:'clearImmediate',expression:'Boolean(clearImmediate)'}
];

/** @param {string} expression @returns {string} */
function ambientSelectedSource(expression){
  return 'export async function protectedOp(){return '+expression+';}'+
    'export function publicOp(){return 0;}';
}

test('unowned Node ambient roots cannot be silently migrated to selected SCO',()=>{
  /** @type {string[]} */
  const admitted=[];
  for(const item of nodeAmbientCandidates){
    try{
      partitionScoSelectedAsyncExports(
        {path:'mixed.mjs',sourceType:'module',
          code:ambientSelectedSource(item.expression)},
        {seed:'agent35-cross-host-ambient-'+item.name,privateNames:['protectedOp']}
      );
      admitted.push(item.name);
    }catch(error){
      assert.match(String(error),/unproved|host|realm|ambient|global/u,item.name);
    }
  }
  assert.deepEqual(admitted,[],'selected browser source admitted free Node ambient roots');
});

test('real Chromium and Node native execution disagree on those ambient roots',{
  skip:!browserEnabled,timeout:45000
},async()=>{
  const puppeteer=require('puppeteer-core');
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    browser=await puppeteer.launch({
      channel:process.env.CHROMIUM_BIN?undefined:'chrome',
      ...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const page=await browser.newPage();
    await page.goto('about:blank');
    const sources=nodeAmbientCandidates.map(x=>ambientSelectedSource(x.expression));
    const browserResults=await page.evaluate(async(items)=>{
      /** @type {string[]} */
      const values=[];
      for(const code of items){
        try{
          const imported=await import('data:text/javascript,'+encodeURIComponent(code));
          values.push('value:'+String(await imported.protectedOp()));
        }catch(error){
          const name=error&&typeof error==='object'&&'name' in error?
            String(error.name):String(error);
          values.push('throw:'+name);
        }
      }
      return values;
    },sources);
    const nativeResults=[];
    for(const code of sources){
      const imported=await import('data:text/javascript,'+encodeURIComponent(code));
      nativeResults.push('value:'+String(await imported.protectedOp()));
    }
    assert.equal(browserResults.length,nodeAmbientCandidates.length);
    for(let i=0;i<nodeAmbientCandidates.length;i++){
      assert.notEqual(browserResults[i],nativeResults[i],
        nodeAmbientCandidates[i].name);
    }
    console.log('SCO_NODE_AMBIENT_BROWSER_NATIVE '+JSON.stringify({
      names:nodeAmbientCandidates.map(x=>x.name),
      browserResults,nativeResults
    }));
  }finally{
    if(browser)await browser.close();
  }
});


test('selected SCO process local primitive is lexically owned',async()=>{
  const source='export async function protectedOp(){'+
    'const process=41;return process+1;}'+
    'export function publicOp(){return 0;}';
  const native=await import('data:text/javascript,'+encodeURIComponent(source));
  assert.equal(await native.protectedOp(),42);
  const partition=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {seed:'agent35-process-local-positive',privateNames:['protectedOp']});
  assert.deepEqual(partition.privateNames,['protectedOp']);
});


test('selected and transitive SCO decline browser-base-dependent Response.redirect',()=>{
  const body='return Response.redirect("/next",302).headers.get("location");';
  const direct='export async function protectedOp(){'+body+'}'+
    'export function publicOp(){return 0;}';
  const indirect='import {readValue} from "./private/leaf.mjs";'+
    'export async function protectedOp(){return readValue();}'+
    'export function publicOp(){return 0;}';
  const opts={seed:'agent35-response-browser-base-decline',
    privateNames:['protectedOp']};
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:direct,sourceType:'module'},opts
  ),/unproved cross-realm host API/u);
  assert.throws(()=>partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',code:indirect,sourceType:'module'},{
      ...opts,privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{path:'private/leaf.mjs',
        code:'export function readValue(){'+body+'}'}]
    }
  ),/unproved cross-realm host API/u);
});

test('selected SCO retains inert local Response scalar ownership',async()=>{
  const code='export async function protectedOp(){'+
    'const Response=41;return Response+1;}'+
    'export function publicOp(){return 0;}';
  const native=await import('data:text/javascript,'+encodeURIComponent(code));
  assert.equal(await native.protectedOp(),42);
  const transformed=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code},
    {seed:'agent35-response-local-scalar',privateNames:['protectedOp']});
  assert.deepEqual(transformed.privateNames,['protectedOp']);
});


/**
 * Deterministic syntax wrappers probe unqualified native host roots through
 * closures, accessors, await, arrays, scalar records and branch expressions.
 * All native outputs are observed in independent Node and browser ESM realms.
 * @param {string} expression
 * @returns {string[]}
 */
function ambientBodies(expression){
  return [
    'return '+expression+';',
    'return ['+expression+'][0];',
    'const value='+expression+';return value;',
    'const reader=()=>'+expression+';return reader();',
    'const reader=async()=>'+expression+';return await reader();',
    'return ({get value(){return '+expression+';}}).value;',
    'const record={value:'+expression+'};return record.value;',
    'return (true?'+expression+':0);'
  ];
}

/**
 * All text outputs are explicitly converted to scalar strings so the
 * Chromium and Node realms do not share object prototypes or host errors.
 * @param {unknown} value
 * @returns {string}
 */
function scalarObservation(value){
  return 'value:'+String(value);
}

test('56-wrapper original-host ESM differential is covered by SCO admission',{
  skip:!browserEnabled,timeout:45000
},async()=>{
  const fixtures=nodeAmbientCandidates.flatMap(ambient=>
    ambientBodies(ambient.expression).map((body,index)=>({
      label:ambient.name+' / wrapper '+index,
      code:'export async function protectedOp(){'+body+'}'+
        'export function publicOp(){return 0;}'
    }))
  );
  assert.equal(fixtures.length,56);
  const puppeteer=require('puppeteer-core');
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    browser=await puppeteer.launch({
      channel:process.env.CHROMIUM_BIN?undefined:'chrome',
      ...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),
      headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const page=await browser.newPage();
    await page.goto('about:blank');
    const browserResults=await page.evaluate(async(sources)=>{
      /** @type {string[]} */
      const values=[];
      for(const code of sources){
        try{
          const module=await import('data:text/javascript,'+encodeURIComponent(code));
          values.push('value:'+String(await module.protectedOp()));
        }catch(error){
          const name=error&&typeof error==='object'&&'name' in error?
            String(error.name):String(error);
          values.push('throw:'+name);
        }
      }
      return values;
    },fixtures.map(fixture=>fixture.code));
    const nativeResults=[];
    for(const fixture of fixtures){
      const module=await import('data:text/javascript,'+
        encodeURIComponent(fixture.code));
      try{
        nativeResults.push(scalarObservation(await module.protectedOp()));
      }catch(error){
        const name=error&&typeof error==='object'&&'name' in error?
          String(error.name):String(error);
        nativeResults.push('throw:'+name);
      }
    }
    assert.equal(browserResults.length,fixtures.length);
    /** @type {string[]} */
    const admitted=[];
    for(let index=0;index<fixtures.length;index++){
      const fixture=fixtures[index];
      assert.notEqual(browserResults[index],nativeResults[index],fixture.label);
      try{
        partitionScoSelectedAsyncExports(
          {path:'mixed.mjs',sourceType:'module',code:fixture.code},
          {seed:'agent35-native-ambient-wrapper-matrix',privateNames:['protectedOp']}
        );
        admitted.push(fixture.label);
      }catch(error){
        assert.match(String(error),/unproved|host|realm|ambient|global/u,
          fixture.label);
      }
    }
    console.log('SCO_NODE_AMBIENT_WRAPPER_MATRIX '+JSON.stringify({
      total:fixtures.length,mismatched:fixtures.length,admitted
    }));
    assert.deepEqual(admitted,[]);
  }finally{
    if(browser)await browser.close();
  }
});


/**
 * Admit only lexically owned local globals in selected browser-origin source.
 * Validate the generated facade against the original ESM in a real browser,
 * while the migrated private methods execute through cookie-authorized Node.
 */
test('real authenticated SCO preserves local Node-spelled scalar shadows',{
  skip:!browserEnabled,timeout:60000
},async()=>{
  const code='export async function bufferLocal(){'+
    'const Buffer=41;return Buffer+1;}'+
    'export async function processLocal(){'+
    'const process=41;return process+1;}'+
    'export async function responseLocal(){'+
    'const Response=41;return Response+1;}'+
    'export function visible(){return 7;}';
  const names=['bufferLocal','processLocal','responseLocal'];
  const compiled=partitionScoSelectedAsyncExports(
    {path:'local-globals.mjs',code,sourceType:'module'},
    {seed:'agent35-native-node-ambient-live-rpc',
      privateNames:names});
  assert.deepEqual(compiled.privateNames,names);
  const native=await import('data:text/javascript,'+encodeURIComponent(code));
  const handler=createScoHandler([compiled.clientFile],{
    remoteMethods:bindScoModuleExports(compiled,native),
    authorizeRead:req=>req.headers.cookie?.includes('session=allowed')===true,
    authorizeRpc:req=>req.headers.cookie?.includes('session=allowed')===true,
    authorizeOperation:req=>req.headers.cookie?.includes('session=allowed')===true
  });
  const server=http.createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(200,{'content-type':'text/html'});
      res.end('<!doctype html><title>Local SCO host shadow parity</title>');
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
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:compiled.methodNames.bufferLocal,args:[]})
    });
    assert.equal(denied.status,403);
    const puppeteer=require('puppeteer-core');
    browser=await puppeteer.launch({
      channel:process.env.CHROMIUM_BIN?undefined:'chrome',
      ...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),
      headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
    });
    const page=await browser.newPage();
    await page.setCookie({url:origin,name:'session',value:'allowed'});
    await page.goto(origin+'/');
    const observed=await page.evaluate(async(source)=>{
      const original=await import('data:text/javascript,'+encodeURIComponent(source));
      const emitted=await import('/obfs/local-globals.mjs');
      return {
        native:[
          await original.bufferLocal(),
          await original.processLocal(),
          await original.responseLocal(),
          original.visible()
        ],
        transformed:[
          await emitted.bufferLocal(),
          await emitted.processLocal(),
          await emitted.responseLocal(),
          emitted.visible()
        ]
      };
    },code);
    assert.deepEqual(observed.native,[42,42,42,7]);
    assert.deepEqual(observed.transformed,observed.native);
    console.log('SCO_NODE_AMBIENT_LIVE_RPC '+JSON.stringify({
      original:observed.native,emitted:observed.transformed,
      deniedStatus:denied.status
    }));
  }finally{
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});
