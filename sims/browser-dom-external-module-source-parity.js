'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);

/** @typedef {{value:number,sourceMatch:boolean}|{value:number,column:number|null}} Observation */

/**
 * Source visibility is an embedding property. Native inline ESM contributes
 * its own source text to document serialization. Native external ESM does not.
 * The module is kept source-identical except for the private object key.
 *
 * @param {string} reader
 * @param {boolean} renamed
 * @returns {string}
 */
function program(reader, renamed) {
  const key = renamed ? 'k' : 'internalSecret';
  return 'function calculate(){const owner={' + key + ':8};return owner.' + key + ';}' +
    'const observed=' + reader + ';' +
    'globalThis.__obfsResult={value:calculate(),sourceMatch:observed.includes("internal"+"Secret")};' +
    'globalThis.__resolveObfsResult();';
}

/**
 * Capture the native V8 stack column for a frame in this module's own source.
 * @param {boolean} renamed
 * @returns {string}
 */
function stackProgram(renamed) {
  const key = renamed ? 'k' : 'internalSecret';
  return 'function calculate(){const owner={' + key + ':8};return owner.' + key + ';}' +
    'const frame=String(new Error().stack).split(String.fromCharCode(10))[1]||"";' +
    'const match=frame.match(/:(\\d+):(\\d+)\\)?$/);' +
    'globalThis.__obfsResult={value:calculate(),column:match?Number(match[2]):null};' +
    'globalThis.__resolveObfsResult();';
}

/**
 * @param {string} mode
 * @param {string} moduleSource
 * @returns {string}
 */
function page(mode, moduleSource) {
  const source = mode === 'inline'
    ? '<script type="module" id="probe">' + moduleSource + '</script>'
    : '<script type="module" src="/entry.mjs"></script>';
  return '<!doctype html><html><head><title>boundary</title></head><body>' +
    '<pre id="result">pending</pre>' +
    '<script>globalThis.__obfsResultReady=new Promise(resolve=>{' +
    'globalThis.__resolveObfsResult=resolve;});</script>' + source +
    '<script>globalThis.__obfsResultReady.then(()=>{' +
    'document.getElementById("result").textContent=' +
    'btoa(JSON.stringify(globalThis.__obfsResult));});</script></body></html>';
}

/**
 * @param {string} browserExecutable
 * @param {'inline'|'external'} mode
 * @param {string} moduleSource
 * @returns {Promise<Observation>}
 */
async function evaluate(browserExecutable, mode, moduleSource) {
  const server = http.createServer((request, response) => {
    if (request.url === '/entry.mjs') {
      response.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8',
        'Cache-Control':'no-store'});
      response.end(moduleSource);
      return;
    }
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store'});
    response.end(page(mode, moduleSource));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(undefined));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing server port');
    const url = 'http://127.0.0.1:' + address.port + '/';
    const {stdout,stderr} = await run(browserExecutable, [
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=2500','--dump-dom',url
    ], {timeout:20000,maxBuffer:2*1024*1024,encoding:'utf8'});
    const encoded = stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded, 'Missing Chromium output: ' + stdout.slice(0,300) +
      '; ' + stderr.slice(0,200));
    return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve(undefined));
    });
  }
}

/** @returns {Promise<void>} */
async function main() {
  const executable = process.env.CHROMIUM_BIN || 'google-chrome';
  /** @type {Array<[string,string,boolean,boolean]>} */
  const cases = [
    ['outer-html','document.documentElement.outerHTML',true,false],
    ['xml-serializer','new XMLSerializer().serializeToString(document)',true,false],
    ['title','document.title',false,false],
    ['source-fetch','await(await fetch(import.meta.url)).text()',true,true]
  ];
  for (const [label, reader, inlineExpected, externalExpected] of cases) {
    for (const mode of /** @type {const} */ (['inline','external'])) {
      const original = await evaluate(executable,mode,program(reader,false));
      const renamed = await evaluate(executable,mode,program(reader,true));
      const sourceMatch = mode === 'inline' ? inlineExpected : externalExpected;
      assert.deepEqual(original,{value:8,sourceMatch});
      assert.deepEqual(renamed,{value:8,sourceMatch:false});
      console.log(JSON.stringify({label,mode,original,renamed,
        transformationPreservesResult:JSON.stringify(original)===JSON.stringify(renamed)}));
    }
  }
  for (const mode of /** @type {const} */ (['inline','external'])) {
    const original=await evaluate(executable,mode,stackProgram(false));
    const renamed=await evaluate(executable,mode,stackProgram(true));
    assert.equal(original.value,8);
    assert.equal(renamed.value,8);
    assert.ok('column' in original,'Missing native stack column');
    assert.ok('column' in renamed,'Missing renamed stack column');
    assert.equal(typeof original.column,'number','Missing native stack column');
    assert.equal(typeof renamed.column,'number','Missing renamed stack column');
    assert.notEqual(original.column,renamed.column,
      'Shortening a source property must shift its native stack column');
    console.log(JSON.stringify({label:'stack-column',mode,original,renamed,
      transformationPreservesResult:JSON.stringify(original)===JSON.stringify(renamed)}));
  }
}

if (require.main === module) {
  main().catch(error => {console.error(error);process.exitCode=1;});
}
module.exports={main,program,page,evaluate};
