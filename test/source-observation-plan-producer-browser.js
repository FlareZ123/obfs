'use strict';

const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Execute one module in a fresh real Chromium page. Document.title is the
 * browser's native DOMString setter; no source-conversion shim is installed.
 * @param {import('puppeteer-core').Browser} browser
 * @param {string} source
 * @returns {Promise<{result:{value:number,independent:number},title:string}>}
 */
async function runInBrowser(browser,source) {
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
    const url='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');
    const result=await page.evaluate(async moduleUrl=>{
      const {sample}=await import(moduleUrl);
      const value=sample();
      return {result:value,title:document.title};
    },url);
    return result;
  } finally {
    await page.close();
  }
}

/**
 * @param {string} prototypeSetup
 * @returns {string}
 */
function makeSource(prototypeSetup) {
  return [
    prototypeSetup,
    'const nativeWeakMapSet=weakMapPrototype.set;',
    'weakMapPrototype.set=function(key,value){',
    '  document.title=value;',
    '  return Reflect.apply(nativeWeakMapSet,this,[key,value]);',
    '};',
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
  ].join('\\n');
}

async function main() {
  const variants=[
    {
      name:'Object.getPrototypeOf',
      setup:'const weakMapPrototype=Object.getPrototypeOf(new WeakMap());'
    },
    {
      name:'Reflect.getPrototypeOf',
      setup:'const weakMapPrototype=Reflect.getPrototypeOf(new WeakMap());'
    },
    {
      name:'new WeakMap().__proto__',
      setup:'const weakMapPrototype=new WeakMap().__proto__;'
    },
    {
      name:'aliased Object.getPrototypeOf',
      setup:'const getPrototypeOf=Object.getPrototypeOf; const weakMapPrototype=getPrototypeOf(new WeakMap());'
    },
    {
      name:'aliased Reflect.getPrototypeOf',
      setup:'const getPrototypeOf=Reflect.getPrototypeOf; const weakMapPrototype=getPrototypeOf(new WeakMap());'
    }
  ];
  const browser=await puppeteer.launch({
    executablePath:process.env.CHROMIUM_BIN??'google-chrome',
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try {
    const receipts=[];
    for(const [index,variant] of variants.entries()) {
      const source=makeSource(variant.setup);
      assert.equal(observesFunctionSource(parse(source,'module')),false,variant.name);
      const compiled=obfuscateFiles([{
        path:'entry.mjs',sourceType:'module',code:source
      }],{
        mode:'coo',seed:'agent4-weakmap-chromium-'+index,
        properties:false,identifiers:true,strings:false
      });
      const app=compiled.files.find(file=>file.path==='entry.mjs');
      assert.ok(app,variant.name);
      assert.ok(app.metrics.bindings>=2,
        JSON.stringify({variant:variant.name,metrics:app.metrics}));
      const native=await runInBrowser(browser,source);
      const emitted=await runInBrowser(browser,String(app.code));
      assert.deepEqual(emitted.result,native.result,variant.name);
      assert.ok(native.title.includes('privateLocal'),
        JSON.stringify({variant:variant.name,native}));
      assert.ok(!emitted.title.includes('privateLocal'),
        JSON.stringify({variant:variant.name,emitted,metrics:app.metrics}));
      receipts.push({
        variant:variant.name,bindings:app.metrics.bindings,
        nativeTitle:native.title,emittedTitle:emitted.title
      });
    }
    process.stdout.write('REAL_CHROMIUM_WEAKMAP_PROTOTYPE_ESCAPE_FALSE_SAFE '+
      JSON.stringify(receipts)+'\\n');
  } finally {
    await browser.close();
  }
}

main().catch(error=>{
  process.stderr.write(String(error?.stack??error)+'\\n');
  process.exitCode=1;
});
