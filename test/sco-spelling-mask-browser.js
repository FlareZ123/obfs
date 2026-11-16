'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require('../src');

/**
 * Execute a real Chromium page containing either native source or SCO-served
 * randomized JavaScript. The page prints UTF-16 code units, preserving
 * otherwise invisible NUL and isolated surrogate values in the comparison.
 * @param {string} url
 * @returns {Promise<number[]>}
 */
async function readUnits(url) {
  const browser=process.env.CHROMIUM_BIN??'chromium';
  const {stdout}=await promisify(execFile)(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=4000','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const encoded=stdout.match(/<pre id="out">(\[[0-9,\s]*\])<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not finish the script: '+stdout.slice(0,1500));
  /** @type {number[]} */
  const units=JSON.parse(encoded);
  assert.ok(Array.isArray(units));
  return units;
}

/** @returns {Promise<void>} */
async function main() {
  const first='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
  const second='ghijklmnopqrstuvwxyz0123456789AB';
  const third='A"\\'+String.fromCharCode(0)+'λ🧪'+String.fromCharCode(0xd800)+'Z';
  const source=[
    'const firstMarker='+JSON.stringify(first)+';',
    'const secondMarker='+JSON.stringify(second)+';',
    'const thirdMarker='+JSON.stringify(third)+';',
    'const full=firstMarker+secondMarker+thirdMarker;',
    'const units=[];',
    'for(let i=0;i<full.length;i++)units.push(full.charCodeAt(i));',
    'document.getElementById("out").textContent=JSON.stringify(units);'
  ].join('\n');
  const obfs=createScoHandler([{path:'entry.js',sourceType:'script',code:source}]);
  const server=http.createServer((request,response)=>{
    if(request.url==='/native.js') {
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(source);
      return;
    }
    if(request.url==='/native' || request.url==='/obfuscated') {
      const src=request.url==='/native'?'/native.js':'/obfs/entry.js';
      response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script src="'+src+'"></script>');
      return;
    }
    obfs(request,response);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const base='http://127.0.0.1:'+address.port;
    const expected=[...(first+second+third)].flatMap(char=>[...char].map(unit=>unit.charCodeAt(0)));
    // Array spread iterates by Unicode codepoint, so for exact code units use
    // a numeric index instead of the iterator.
    const full=first+second+third;
    /** @type {number[]} */
    const nativeUnits=[];
    for(let i=0;i<full.length;i++)nativeUnits.push(full.charCodeAt(i));
    const baseline=await readUnits(base+'/native');
    assert.deepEqual(baseline,nativeUnits);
    const emitted=await readUnits(base+'/obfuscated');
    assert.deepEqual(emitted,nativeUnits);
    const responses=await Promise.all([
      fetch(base+'/obfs/entry.js'),fetch(base+'/obfs/entry.js')
    ]);
    assert.ok(responses.every(response=>response.status===200));
    const codes=await Promise.all(responses.map(response=>response.text()));
    assert.notEqual(codes[0],codes[1],
      'Eligible request-time literals must exhibit distinct random spellings');
    process.stdout.write(JSON.stringify({
      chromium:'passed',nativeUnits:baseline.length,emittedUnits:emitted.length,
      sourceVariantsDistinct:true,containsUnpairedSurrogate:full.includes(String.fromCharCode(0xd800)),
      browser:'real Chromium, HTTP-served native versus SCO'
    })+'\n');
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
