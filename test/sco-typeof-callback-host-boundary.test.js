'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Compile one selected private async export and one independently retained
 * public export. No private server-global option is intentionally enabled.
 *
 * @param {string} body
 * @returns {ReturnType<typeof partitionScoSelectedAsyncExports>}
 */
function compile(body){
  return partitionScoSelectedAsyncExports({
    path:'typeof-callback.mjs',
    sourceType:'module',
    code:'export async function protectedOp(){'+body+'}\n'+
      'export function visible(){return 7;}\n'
  },{seed:'typeof-callback-host-20261128',privateNames:['protectedOp']});
}

test('unqualified Node process is not a portable browser binding when an Array callback runs',async()=>{
  const body='return typeof [0].map(()=>process)[0];';
  const runningInNode=Function('return (async function(){'+body+'})()');
  assert.equal(await runningInNode(),'object');
  const inIndependentRealm=vm.runInNewContext('(async function(){'+body+'})()',{});
  await assert.rejects(inIndependentRealm,{name:'ReferenceError'});
});

test('selected SCO must reject free process reached by callback evaluation inside typeof',()=>{
  // The typeof operator only suppresses an unresolved identifier error for
  // its immediate Identifier operand. The map/flatMap/filter callback is
  // actually invoked before typeof can form its resulting primitive tag.
  // A guard treating every nested function body as inert can miss this.
  for(const body of [
    'return typeof [0].map(()=>process)[0];',
    'return typeof [0].flatMap(()=>[process])[0];',
    'return typeof [0].filter(()=>Boolean(process))[0];',
    'return typeof ({get value(){return process;}}).value;'
  ]){
    assert.throws(()=>compile(body),/unproved|host|realm|browser/i,body);
  }
});

test('callback host guard leaves non-reading and locally owned primitives usable',()=>{
  for(const body of [
    'return typeof [0].map(()=>7)[0];',
    'return typeof ({get value(){return 7;}}).value;',
    'return typeof (()=>process);',
    'const process=7;return typeof [0].map(()=>process)[0];'
  ]){
    assert.deepEqual(compile(body).privateNames,['protectedOp'],body);
  }
});

/**
 * Native ESM in actual Chromium and independent Node should disagree on the
 * free process read before any source transformation. This verifies the
 * intended target-realm contract rather than assuming a Node VM is a browser.
 * Opt in only for the focused CI lane, where Chromium is available on Linux.
 */
/** @type {{label:string,expression:string,node:string}[]} */
const nativeTypeofCases=[
  {label:'map',expression:'typeof [0].map(()=>process)[0]',node:'object'},
  {label:'flatMap',expression:'typeof [0].flatMap(()=>[process])[0]',node:'object'},
  {label:'filter',expression:'typeof [0].filter(()=>Boolean(process))[0]',node:'number'},
  {label:'every',expression:'typeof [0].every(()=>Boolean(process))',node:'boolean'},
  {label:'some',expression:'typeof [0].some(()=>Boolean(process))',node:'boolean'},
  {label:'find',expression:'typeof [0].find(()=>Boolean(process))',node:'number'},
  {label:'forEach',expression:'typeof [0].forEach(()=>process)',node:'undefined'},
  {label:'reduce',expression:'typeof [0].reduce(()=>process,0)',node:'object'},
  {label:'Array.from',expression:'typeof Array.from([0],()=>process)[0]',node:'object'},
  {label:'replace',expression:'typeof "x".replace(/x/,()=>process)',node:'string'},
  {label:'sort',expression:'typeof [2,1].sort(()=>process)',node:'object'},
  {label:'getter',expression:'typeof ({get value(){return process;}}).value',node:'object'},
  {label:'Proxy getter',expression:'typeof (new Proxy({},{get(){return process;}})).value',node:'object'},
  {label:'generator next',expression:'typeof (function*(){return process})().next().value',node:'object'},
  {label:'optional map',expression:'typeof [0]?.map?.(()=>process)?.[0]',node:'object'}
];

test('real Chromium native ESM mismatch and compiler refusal for fifteen eager typeof bodies',{
  skip:process.platform==='win32'||
    process.env.OBFS_FOCUSED_TEST!=='test/sco-typeof-callback-host-boundary.test.js',
  timeout:45000
},async()=>{
  /** @type {{label:string,value:string}[]} */
  const nodeResults=[];
  for(const sample of nativeTypeofCases){
    const source='export async function protectedOp(){return '+sample.expression+';}';
    const imported=await import('data:text/javascript,'+encodeURIComponent(source));
    const value=await imported.protectedOp();
    assert.equal(value,sample.node,sample.label+' Node ESM');
    nodeResults.push({label:sample.label,value});
  }
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
    const observed=await page.evaluate(async cases=>{
      /** @type {{label:string,result:string}[]} */
      const results=[];
      for(const sample of cases){
        const source='export async function protectedOp(){return '+sample.expression+';}';
        const imported=await import('data:text/javascript,'+encodeURIComponent(source));
        try{
          results.push({label:sample.label,
            result:'value:'+String(await imported.protectedOp())});
        }catch(error){
          results.push({label:sample.label,
            result:'throw:'+String(error&&typeof error==='object'&&'name' in error?
              error.name:error)});
        }
      }
      return {processType:typeof process,results};
    },nativeTypeofCases);
    assert.equal(observed.processType,'undefined');
    assert.deepEqual(observed.results,nativeTypeofCases.map(sample=>({
      label:sample.label,result:'throw:ReferenceError'
    })));
    for(const sample of nativeTypeofCases){
      const code='export async function protectedOp(){return '+sample.expression+';}'+
        'export function visible(){return 7;}';
      assert.throws(()=>partitionScoSelectedAsyncExports({
        path:'typeof-callback.mjs',sourceType:'module',code
      },{seed:'typeof-callback-browser-proof',privateNames:['protectedOp']}),
      /unproved|host|realm|browser/i,sample.label);
    }
    console.log('SCO_TYPEOF_CALLBACK_BROWSER '+JSON.stringify({
      nativeCases:nativeTypeofCases.length,nodeResults,
      browserProcess:observed.processType,
      browserReferenceErrors:observed.results.length,
      compilerRefusals:nativeTypeofCases.length
    }));
  }finally{
    if(browser)await browser.close();
  }
});

/**
 * A reviewed private static ESM dependency is also a relocated realm, not an
 * exemption from the callback reachability obligation. Its module graph is
 * declared explicitly, so a host-global read inside a getter is still unsafe.
 */
test('audited transitive private helper refuses nested typeof getter host reads',()=>{
  const file={
    path:'typeof-callback.mjs',sourceType:'module',
    code:'import {read} from "./private/leaf.mjs";'+
      'export async function protectedOp(){return read();}'+
      'export function visible(){return 7;}'
  };
  /** @param {string} leaf */
  function audited(leaf){
    return partitionScoSelectedAsyncExports(file,{
      seed:'typeof-callback-audited-private',
      privateNames:['protectedOp'],
      privateModuleImports:['./private/leaf.mjs'],
      privateModuleSources:[{
        path:'private/leaf.mjs',
        code:'export function read(){'+leaf+'}'
      }]
    });
  }
  assert.throws(()=>audited(
    'return typeof ({get value(){return externalBridge;}}).value;'
  ),/unproved|host|realm|browser/i);
  assert.deepEqual(audited(
    'const externalBridge=7;return typeof ({get value(){return externalBridge;}}).value;'
  ).privateNames,['protectedOp']);
});
