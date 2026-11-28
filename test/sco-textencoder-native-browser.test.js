'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

const enabled=process.env.OBFS_FOCUSED_TEST===
  'test/sco-textencoder-native-browser.test.js'&&process.platform!=='win32';

/**
 * Host-native TextEncoder source conversion probe. This compares the same
 * executable function in Node and Chromium without carrying Error objects
 * across the browser protocol. The compiler admission check is independent
 * of whether a future Node/Chrome pair happens to agree on these samples.
 *
 * @returns {Record<string, {ok?:unknown,error?:string}>}
 */
function hostProbe(){
  /** @type {Record<string, {ok?:unknown,error?:string}>} */
  const out={};
  const inputs=[
    ['string','ok'],['null',null],['number',42],['boolean',true],
    ['undefined',undefined]
  ];
  for(const [name,value] of inputs){
    try{
      const view=new Uint8Array(16);
      const state=new TextEncoder().encodeInto(
        /** @type {string} */ (/** @type {unknown} */ (value)),view);
      out[/** @type {string} */ (name)]={
        ok:{read:state.read,written:state.written,bytes:[...view]}
      };
    }catch(error){
      const e=/** @type {Error} */ (error);
      out[/** @type {string} */ (name)]={error:e.name+':'+e.message};
    }
  }
  return out;
}

test('selected SCO TextEncoder source conversion preserves browser native behavior by refusal',{
  skip:!enabled,timeout:60000
},async()=>{
  const browserDriver=require('puppeteer-core');
  const browser=await browserDriver.launch({
    channel:process.env.CHROMIUM_BIN?undefined:'chrome',
    executablePath:process.env.CHROMIUM_BIN,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try{
    const page=await browser.newPage();
    const chrome=/** @type {ReturnType<typeof hostProbe>} */ (await page.evaluate(hostProbe));
    const node=hostProbe();
    assert.deepEqual(chrome.string.ok,node.string.ok);
    console.log('SCO_TEXTENCODER_NATIVE '+JSON.stringify({
      node:process.version,chromium:await browser.version(),nodeResults:node,browserResults:chrome
    }));
    const source='export async function privateOp(){'+
      'return new TextEncoder().encodeInto(null,new Uint8Array(8)).written;}'+
      'export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports({
      path:'native-encoder.mjs',sourceType:'module',code:source
    },{privateNames:['privateOp'],seed:'sco-encoder-real-chrome-20261128'}),
    /unproved cross-realm host API/u);
  }finally{
    await browser.close();
  }
});
