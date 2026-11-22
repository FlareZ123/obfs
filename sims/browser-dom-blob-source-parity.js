'use strict';

const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const {program} = require('./browser-dom-external-module-source-parity');

/** @typedef {import('puppeteer-core').Browser} Browser */
/** @typedef {'inline'|'blob'} Embedding */
/** @typedef {{value:number,sourceMatch:boolean}} Observation */

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
    await page.evaluate(({kind,code}) => {
      const script = document.createElement('script');
      script.type = 'module';
      if (kind === 'inline') script.textContent = code;
      else script.src = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
      document.body.append(script);
    }, {kind:embedding, code:source});
    await page.waitForFunction('typeof globalThis.result === "object"', {timeout:15000});
    return await page.evaluate(() => {
      const result = Reflect.get(globalThis, 'result');
      return {value:result.value, sourceMatch:result.sourceMatch};
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
    'globalThis.result={value:owner.' + key +
    ',sourceMatch:selfSource.includes("internal"+"Secret")};';
}

/** @returns {Promise<void>} */
async function main() {
  const browser = await puppeteer.launch({
    executablePath:process.env.CHROMIUM_BIN || 'google-chrome',
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
  } finally {
    await browser.close();
  }
  assert.equal(cases,14);
  console.log('Chromium verified '+cases+' native source-embedding observations');
}

if (require.main === module) {
  main().catch(error => {console.error(error);process.exitCode=1;});
}
module.exports = {main,observe,sourceFetchProgram};
