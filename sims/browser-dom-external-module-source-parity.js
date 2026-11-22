'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);

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
    'globalThis.result={value:calculate(),sourceMatch:observed.includes("internal"+"Secret")};';
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
    '<pre id="result">pending</pre>' + source +
    '<script>addEventListener("load",()=>{' +
    'document.getElementById("result").textContent=' +
    'btoa(JSON.stringify(globalThis.result));});</script></body></html>';
}

/**
 * @param {string} browserExecutable
 * @param {'inline'|'external'} mode
 * @param {string} moduleSource
 * @returns {Promise<{value:number,sourceMatch:boolean}>}
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
      server.listen(0, '127.0.0.1', resolve);
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
  /** @type {Array<[string,string,boolean]>} */
  const cases = [
    ['outer-html','document.documentElement.outerHTML',true],
    ['xml-serializer','new XMLSerializer().serializeToString(document)',true],
    ['title','document.title',false]
  ];
  for (const [label, reader, inlineExpected] of cases) {
    for (const mode of /** @type {const} */ (['inline','external'])) {
      const original = await evaluate(executable,mode,program(reader,false));
      const renamed = await evaluate(executable,mode,program(reader,true));
      const sourceMatch = mode === 'inline' && inlineExpected;
      assert.deepEqual(original,{value:8,sourceMatch});
      assert.deepEqual(renamed,{value:8,sourceMatch:false});
      console.log(JSON.stringify({label,mode,original,renamed,
        transformationPreservesResult:JSON.stringify(original)===JSON.stringify(renamed)}));
    }
  }
}

if (require.main === module) {
  main().catch(error => {console.error(error);process.exitCode=1;});
}
module.exports={main,program,page,evaluate};
