'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const {program} = require('./browser-dom-external-module-source-parity');

/**
 * Resolve PATH-based browser commands to the absolute executable path required by Puppeteer.
 * @param {string} configured
 * @returns {string}
 */
function resolveExecutable(configured) {
  if (path.isAbsolute(configured) || configured.includes(path.sep)) {
    return path.resolve(configured);
  }
  return execFileSync('which',[configured],{encoding:'utf8'}).trim();
}

/** @typedef {import('puppeteer-core').Browser} Browser */
/** @typedef {'inline'|'blob'} Embedding */
/** @typedef {{value:number,sourceMatch:boolean,column?:number}} Observation */

/**
 * Read an unchanged native module from within an actual Chromium page.
 * The source transport differs, while the private object and DOM reader are
 * identical. Keep this separate from compiler transformation coverage.
 * @param {Browser} browser
 * @param {Embedding} embedding
 * @param {string} source
 * @returns {Promise<Observation>}
 */
async function observe(browser, embedding, source) {
  const page = await browser.newPage();
  try {
    await page.setContent('<!doctype html><html><head><title>boundary</title></head><body></body></html>',
      {waitUntil:'load'});
    await page.evaluate(() => { Reflect.set(globalThis,'__resolveObfsResult',()=>{}); });
    await page.evaluate(({kind,code}) => {
      const script = document.createElement('script');
      script.type = 'module';
      if (kind === 'inline') script.textContent = code;
      else script.src = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
      document.body.append(script);
    }, {kind:embedding, code:source});
    await page.waitForFunction('typeof globalThis.__obfsResult === "object"', {timeout:30000});
    return await page.evaluate(() => {
      const result = Reflect.get(globalThis, '__obfsResult');
      const observed = {value:result.value, sourceMatch:result.sourceMatch};
      return typeof result.column === 'number' ?
        {...observed, column:result.column} : observed;
    });
  } finally {
    await page.close();
  }
}

/**
 * A Blob-backed ESM module can fetch its own bytes by import.meta.url.
 * Keep this hostile-source-fetch control separate from DOM-only readers.
 * @param {boolean} renamed
 * @returns {string}
 */
function sourceFetchProgram(renamed) {
  const key = renamed ? 'k' : 'internalSecret';
  return 'const owner={' + key + ':8};' +
    'const selfSource=await(await fetch(import.meta.url)).text();' +
    'globalThis.__obfsResult={value:owner.' + key +
    ',sourceMatch:selfSource.includes("internal"+"Secret")};' +
    'globalThis.__resolveObfsResult();';
}

/**
 * Stack coordinates are an observable source-length side channel for an
 * external module, independently of DOM or text-fetch APIs.
 * @param {boolean} renamed
 * @returns {string}
 */
function stackFrameProgram(renamed) {
  const key = renamed ? 'k' : 'internalSecret';
  return 'const owner={' + key + ':8};' +
    'const frame=String(new Error().stack).split(String.fromCharCode(10))[1]||"";' +
    'const column=Number((frame.split(":").at(-1)||"").replace(")",""))||-1;' +
    'globalThis.__obfsResult={value:owner.' + key +
    ',sourceMatch:false,column};' +
    'globalThis.__resolveObfsResult();';
}

/** @returns {Promise<void>} */
async function main() {
  const browser = await puppeteer.launch({
    executablePath:resolveExecutable(process.env.CHROMIUM_BIN || 'google-chrome'),
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  /** @type {Array<[string,string,boolean]>} */
  const readers = [
    ['outer-html','document.documentElement.outerHTML',true],
    ['xml-serializer','new XMLSerializer().serializeToString(document)',true],
    ['title','document.title',false]
  ];
  let cases = 0;
  try {
    for (const [name,reader,sourceVisible] of readers) {
      for (const embedding of /** @type {Embedding[]} */ (['inline','blob'])) {
        const original = await observe(browser,embedding,program(reader,false));
        const renamed = await observe(browser,embedding,program(reader,true));
        const expectedVisible = embedding === 'inline' && sourceVisible;
        assert.deepEqual(original,{value:8,sourceMatch:expectedVisible},
          name+'/'+embedding+' original');
        assert.deepEqual(renamed,{value:8,sourceMatch:false},
          name+'/'+embedding+' manually renamed');
        cases += 2;
        console.log(JSON.stringify({name,embedding,original,renamed}));
      }
    }
    const ownSource = await observe(browser,'blob',sourceFetchProgram(false));
    const editedSource = await observe(browser,'blob',sourceFetchProgram(true));
    assert.deepEqual(ownSource,{value:8,sourceMatch:true},'Blob self-fetch original');
    assert.deepEqual(editedSource,{value:8,sourceMatch:false},'Blob self-fetch rename');
    cases += 2;
    console.log(JSON.stringify({name:'source-fetch',embedding:'blob',
      original:ownSource,renamed:editedSource}));
    const aliasReader='await(async()=>{const read=fetch;const url=import.meta.url;const text=Response.prototype.text;const response=await read(url);return await text.call(response);})()';
    const aliasOriginal=await observe(browser,'blob',program(aliasReader,false));
    const aliasRenamed=await observe(browser,'blob',program(aliasReader,true));
    assert.deepEqual(aliasOriginal,{value:8,sourceMatch:true},'Blob aliased self-fetch original');
    assert.deepEqual(aliasRenamed,{value:8,sourceMatch:false},'Blob aliased self-fetch rename');
    cases += 2;
    console.log(JSON.stringify({name:'source-fetch-alias',embedding:'blob',
      original:aliasOriginal,renamed:aliasRenamed}));
    const originalStack = await observe(browser,'blob',stackFrameProgram(false));
    const rewrittenStack = await observe(browser,'blob',stackFrameProgram(true));
    assert.equal(originalStack.value,8);
    assert.equal(rewrittenStack.value,8);
    assert.ok(typeof originalStack.column === 'number' &&
      Number.isSafeInteger(originalStack.column) && originalStack.column > 0);
    assert.ok(typeof rewrittenStack.column === 'number' &&
      Number.isSafeInteger(rewrittenStack.column) && rewrittenStack.column > 0);
    assert.ok(originalStack.column > rewrittenStack.column,
      'Shorter property spelling must move the external Blob stack column');
    cases += 2;
    console.log(JSON.stringify({name:'stack-column',embedding:'blob',
      original:originalStack,renamed:rewrittenStack}));
  } finally {
    await browser.close();
  }
  assert.equal(cases,18);
  console.log('Chromium verified '+cases+' native source-embedding observations');
}

if (require.main === module) {
  main().catch(error => {console.error(error);process.exitCode=1;});
}
module.exports = {main,observe,sourceFetchProgram,stackFrameProgram};
