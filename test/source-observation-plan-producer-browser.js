'use strict';

const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const mutateSource=[
  'const weakMapPrototype=Object.getPrototypeOf(new WeakMap());',
  'const nativeWeakMapSet=weakMapPrototype.set;',
  'weakMapPrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
  '};'
].join('\n');

const storageSource=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

const entrySource=[
  "import './mutate.mjs';",
  "export {sample} from './storage.mjs';"
].join('\n');

/**
 * Run a three-module ESM graph in a fresh real Chromium page. The browser's
 * native Document.title setter performs the DOMString conversion.
 * @param {import('puppeteer-core').Browser} browser
 * @param {string} mutateCode
 * @param {string} storageCode
 * @returns {Promise<{result:{value:number,independent:number},title:string}>}
 */
async function runInBrowser(browser,mutateCode,storageCode) {
  const page=await browser.newPage();
  try {
    await page.setContent('<!doctype html><html><head><title>initial</title></head><body></body></html>');
    const storageReady=await page.evaluate(()=>{
      try {
        const fakeStorage=Object.create(Storage.prototype);
        Object.defineProperty(window,'localStorage',{
          configurable:true,value:fakeStorage
        });
        return true;
      } catch {
        return false;
      }
    });
    assert.equal(storageReady,true,'Chromium must allow a fake Storage receiver inheriting Storage.prototype');
    const result=await page.evaluate(async ({mutate,storage,entry})=>{
      const mutateUrl=URL.createObjectURL(new Blob([mutate],{type:'text/javascript'}));
      const storageUrl=URL.createObjectURL(new Blob([storage],{type:'text/javascript'}));
      const entryModule=entry
        .replace("'./mutate.mjs'","'"+mutateUrl+"'")
        .replace("'./storage.mjs'","'"+storageUrl+"'");
      const entryUrl=URL.createObjectURL(new Blob([entryModule],{type:'text/javascript'}));
      try {
        const {sample}=await import(entryUrl);
        const value=sample();
        return {result:value,title:document.title};
      } finally {
        URL.revokeObjectURL(entryUrl);
        URL.revokeObjectURL(mutateUrl);
        URL.revokeObjectURL(storageUrl);
      }
    },{mutate:mutateCode,storage:storageCode,entry:entrySource});
    return result;
  } finally {
    await page.close();
  }
}

async function main() {
  assert.equal(observesFunctionSource(parse(mutateSource,'module')),false);
  assert.equal(observesFunctionSource(parse(storageSource,'module')),false);
  const sourceFiles=[
    {path:'entry.mjs',sourceType:'module',code:entrySource},
    {path:'mutate.mjs',sourceType:'module',code:mutateSource},
    {path:'storage.mjs',sourceType:'module',code:storageSource}
  ];
  const compiled=obfuscateFiles(sourceFiles,{
    mode:'coo',seed:'agent4-weakmap-cross-file-chromium',
    properties:false,identifiers:true,strings:false,closedWorld:true
  });
  const mutate=compiled.files.find(file=>file.path==='mutate.mjs');
  const storage=compiled.files.find(file=>file.path==='storage.mjs');
  assert.ok(mutate&&storage);
  assert.ok(storage.metrics.bindings>=2,
    JSON.stringify({mutate:mutate.metrics,storage:storage.metrics}));
  const configuredBinary=process.env.CHROMIUM_BIN??'google-chrome';
  const executablePath=execFileSync('which',[configuredBinary],{encoding:'utf8'}).trim();
  assert.ok(executablePath,'Unable to resolve Chromium executable: '+configuredBinary);
  const browser=await puppeteer.launch({
    executablePath,headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try {
    const native=await runInBrowser(browser,mutateSource,storageSource);
    const emitted=await runInBrowser(browser,String(mutate.code),String(storage.code));
    assert.deepEqual(emitted.result,native.result);
    assert.ok(native.title.includes('privateLocal'),JSON.stringify(native));
    assert.ok(!emitted.title.includes('privateLocal'),
      JSON.stringify({native,emitted,storageMetrics:storage.metrics}));
    process.stdout.write('REAL_CHROMIUM_CROSS_FILE_WEAKMAP_PROTOTYPE_ESCAPE_FALSE_SAFE '+
      JSON.stringify({storageMetrics:storage.metrics,native,emitted})+'\n');
  } finally {
    await browser.close();
  }
}

main().catch(error=>{
  process.stderr.write(String(error?.stack??error)+'\n');
  process.exitCode=1;
});
