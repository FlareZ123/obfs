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
