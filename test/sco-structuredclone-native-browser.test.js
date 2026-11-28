'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

const enabled=process.env.OBFS_FOCUSED_TEST===
  'test/sco-structuredclone-native-browser.test.js'&&process.platform!=='win32';

/**
 * Native structuredClone values and native exception messages. These are
 * intentionally evaluated in each actual runtime; transporting thrown Error
 * objects across the Puppeteer boundary would erase their original names.
 *
 * @returns {Record<string,{value?:unknown,name?:string,message?:string,ctor?:string}>}
 */
function nativeProbe(){
  /** @type {Record<string,{value?:unknown,name?:string,message?:string,ctor?:string}>} */
  const result={};
  /** @type {Array<[string,()=>unknown]>} */
  const cases=[
    ['valid-record',()=>structuredClone({value:7}).value],
    ['symbol',()=>structuredClone(Symbol('x'))],
    ['callable',()=>structuredClone(function example(){return 1;})],
    ['domexception',()=>{
      const copy=structuredClone(new DOMException('bad','NotAllowedError'));
      return {
        ctor:copy.constructor.name,
        name:copy.name??null,
        message:copy.message??null,
        keys:Object.keys(copy)
      };
    }]
  ];
  for(const [name,fn] of cases){
    try{
      result[name]={value:fn()};
    }catch(error){
      const e=/** @type {Error} */(error);
      result[name]={name:e.name,message:e.message,ctor:e.constructor.name};
    }
  }
  return result;
}

test('native structuredClone exposes Node/Chromium divergence and selected SCO refuses relocation',{
  skip:!enabled,timeout:60000
},async()=>{
  const puppeteer=require('puppeteer-core');
  const browser=await puppeteer.launch({
    channel:process.env.CHROMIUM_BIN?undefined:'chrome',
    executablePath:process.env.CHROMIUM_BIN,
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try{
    const page=await browser.newPage();
    const node=nativeProbe();
    const chrome=/** @type {ReturnType<typeof nativeProbe>} */(await page.evaluate(nativeProbe));
    assert.deepEqual(node['valid-record'],chrome['valid-record']);
    console.log('SCO_STRUCTUREDCLONE_NATIVE '+JSON.stringify({
      node:process.version,chrome:await browser.version(),
      nodeResults:node,browserResults:chrome
    }));
    assert.notEqual(node.symbol.message,chrome.symbol.message,
      'Source-pinned error-text mismatch may have disappeared; reassess admission');
    const source='export async function privateOp(){'+
      "try{structuredClone(Symbol('x'));return 'ok';}catch(e){return e.message;}"+
      '}export function visible(){return 7;}';
    assert.throws(()=>partitionScoSelectedAsyncExports({
      path:'clone-realm-browser.mjs',code:source,sourceType:'module'
    },{privateNames:['privateOp'],seed:'clone-native-browser-20261128'}),
    /unproved cross-realm host API/u);
  }finally{
    await browser.close();
  }
});
