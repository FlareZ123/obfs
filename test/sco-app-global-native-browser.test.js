'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedAsyncExports}=require('../src');

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
  const result=partitionScoSelectedAsyncExports(
    {path:'mixed.mjs',sourceType:'module',code:source},
    {
      seed:'agent35-server-owned-buffer-positive',
      privateNames:['protectedOp'],
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:'export function readValue(){return Buffer.byteLength("ab");}'
      }]
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
