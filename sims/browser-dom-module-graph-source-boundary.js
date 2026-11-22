'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {obfuscateFiles} = require('../src');

const run = promisify(execFile);

// The browser imports the external module, while only the entry script's text
// is embedded in the HTML document that the entry inspects.
/** @type {const} */
const sourceType = 'module';
const library =
  'function compute(input){const hiddenWorker=input+5;return hiddenWorker;}' +
  'export const answer=compute(3);';
const entry =
  'import {answer} from "./lib.mjs";' +
  'function readAnswer(){const privateNumber=answer;return privateNumber;}' +
  'const observed=document.documentElement.outerHTML;' +
  'globalThis.result={value:readAnswer(),sourceMatch:observed.includes("private"+"Number")};';

/** @param {string} code @returns {string} */
function html(code) {
  return '<!doctype html><html><body><pre id="result">pending</pre>' +
    '<script id="script-probe" type="module">' + code + '</script>' +
    '<script>window.addEventListener("load",()=>{' +
    'document.getElementById("result").textContent=' +
    'btoa(JSON.stringify(globalThis.result));});</script></body></html>';
}

/**
 * @param {string} target
 * @returns {Promise<{value:number,sourceMatch:boolean}>}
 */
async function browser(target) {
  const {stdout,stderr} = await run(process.env.CHROMIUM_BIN || 'google-chrome', [
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2200','--dump-dom',target
  ],{timeout:25000,maxBuffer:2*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium module graph did not execute: '+
    stdout.slice(0,500)+'; stderr='+stderr.slice(0,500));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main() {
  const compiled=obfuscateFiles([
    {path:'entry.mjs',sourceType,code:entry},
    {path:'lib.mjs',sourceType,code:library}
  ],{mode:'coo',seed:'dom-inline-module-graph-source',strings:false,
    identifiers:true,properties:false,closedWorld:true});
  const publishedEntry=compiled.files.find(file=>file.path==='entry.mjs');
  const publishedLibrary=compiled.files.find(file=>file.path==='lib.mjs');
  assert.ok(publishedEntry && publishedLibrary,'Compiled graph missing modules');
  assert.equal(typeof publishedEntry.code,'string');
  assert.equal(typeof publishedLibrary.code,'string');
  const routes=new Map([
    ['/native/index.html',{type:'text/html',body:html(entry)}],
    ['/native/lib.mjs',{type:'text/javascript',body:library}],
    ['/compiled/index.html',{type:'text/html',body:html(publishedEntry.code)}],
    ['/compiled/lib.mjs',{type:'text/javascript',body:publishedLibrary.code}]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const selected=routes.get(pathname);
    if(!selected){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':selected.type+'; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(selected.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=/** @type {import('node:net').AddressInfo} */(server.address());
    const url='http://127.0.0.1:'+address.port;
    const native=await browser(url+'/native/index.html');
    const emitted=await browser(url+'/compiled/index.html');
    const evidence={native,emitted,entryMetrics:publishedEntry.metrics,
      libraryMetrics:publishedLibrary.metrics,
      entryChanged:publishedEntry.code!==entry,
      libraryChanged:publishedLibrary.code!==library};
    console.log('DOM_ESM_GRAPH_SOURCE '+JSON.stringify(evidence));
    assert.deepEqual(native,{value:8,sourceMatch:true},
      'Native cross-file graph must be fully executed');
    assert.ok(publishedEntry.metrics.bindings>0,
      'Source-observing module must demonstrate positive identifier transformation');
    assert.ok(publishedLibrary.metrics.bindings>0,
      'Independent imported private helper should remain eligible for renaming');
    assert.deepEqual(emitted,native,
      'Inline ESM source observation must preserve native graph behavior');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
