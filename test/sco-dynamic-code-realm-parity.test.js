'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/** @typedef {{label:string,body:string}} DynamicSourceCase */
/** @type {DynamicSourceCase[]} */
const cases=[
  {label:'Function direct',body:"return Function('return typeof process')();"},
  {label:'new Function',body:"return (new Function('return typeof process'))();"},
  {label:'indirect Function alias',
    body:"const F=Function;return F('return typeof process')();"},
  {label:'direct eval',body:"return eval('typeof process');"},
  {label:'globalThis Function',
    body:"return globalThis.Function('return typeof process')();"},
  {label:'globalThis eval',body:"return globalThis.eval('typeof process');"},
  {label:'direct arrow inherited constructor',
    body:"return (()=>0).constructor('return typeof process')();"},
  {label:'object inherited constructor chain',
    body:"return ({}).constructor.constructor('return typeof process')();"},
  {label:'array inherited constructor chain',
    body:"return [].constructor.constructor('return typeof process')();"},
  {label:'named local arrow constructor',
    body:"const local=()=>0;return local.constructor('return typeof process')();"}
];

/** @param {string} body @returns {string} */
function source(body){
  return 'export async function protectedOp(){'+body+'}'+
    'export function visible(){return 7;}';
}

/** @param {string} body */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'cross-host-dynamic-source.mjs',sourceType:'module',code:source(body)
  },{seed:'sco-dynamic-source-host-crossing',privateNames:['protectedOp']});
}

test('dynamic-source evaluator reads different process global in Node and independent realm',async()=>{
  for(const sample of cases){
    const native=await import('data:text/javascript,'+encodeURIComponent(source(sample.body)));
    assert.equal(await native.protectedOp(),'object',sample.label+' original Node');
    const isolated=vm.runInNewContext('(async function(){'+sample.body+'})()',{});
    assert.equal(await isolated,'undefined',sample.label+' isolated realm');
  }
});

test('selected SCO must refuse dynamic-source constructors and eval across realms',()=>{
  for(const sample of cases){
    assert.throws(()=>compile(sample.body),
      /unproved|host|realm|unsafe|constructor|loader|eval|Function/i,sample.label);
  }
});

test('selected SCO can still admit stable direct local callable expressions',()=>{
  for(const body of [
    'return 7;',
    'return (function(){return 7;})();',
    'const run=()=>7;return run();',
    'const own={constructor:7};return own.constructor;'
  ])assert.deepEqual(compile(body).privateNames,['protectedOp'],body);
});

test('real Chromium ESM confirms dynamic-source realm mismatch for selected code',{
  skip:process.platform==='win32'||
    process.env.OBFS_FOCUSED_TEST!=='test/sco-dynamic-code-realm-parity.test.js',
  timeout:45000
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
    const results=await page.evaluate(async bodies=>{
      /** @type {string[]} */
      const observations=[];
      for(const body of bodies){
        const code='export async function protectedOp(){'+body+'}';
        try{
          const module=await import('data:text/javascript,'+encodeURIComponent(code));
          observations.push('value:'+String(await module.protectedOp()));
        }catch(error){
          observations.push('throw:'+String(error&&typeof error==='object'&&'name' in error?
            error.name:error));
        }
      }
      return observations;
    },cases.map(sample=>sample.body));
    assert.deepEqual(results,cases.map(()=>'value:undefined'));
    console.log('SCO_DYNAMIC_SOURCE_CROSS_REALM '+JSON.stringify({
      node:'object',chromium:results,count:results.length
    }));
  }finally{
    if(browser)await browser.close();
  }
});
