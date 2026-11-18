'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require('../src');

const html='<!doctype html><html><body><pre id="out">pending</pre>'+
  '<script src="./client.js"></script></body></html>';
const original='document.getElementById("out").textContent=location.hostname+"|42";';

/** @param {http.RequestListener} handler @param {(origin:string)=>Promise<string>} run @returns {Promise<string>} */
async function withServer(handler,run) {
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'::1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    return await run('http://[::1]:'+address.port+'/obfs/index.html');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/** @param {string} url @returns {Promise<string>} */
async function readDom(url) {
  const browser=process.env.CHROMIUM_BIN??'chromium';
  const {stdout}=await promisify(execFile)(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-proxy-server','--no-first-run','--virtual-time-budget=7000',
    '--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
  assert.ok(observed,'Chromium IPv6 page failed to execute: '+stdout.slice(0,1200));
  return observed;
}

/** @returns {Promise<void>} */
async function main() {
  // HTML is an active opaque asset in the distributed-source observation
  // proof. Serve that public shell separately, while the only SCO-published
  // executable remains protected by the same host policy under test.
  /** @type {import('../src/core').SourceFile[]} */
  const files=[{path:'client.js',sourceType:'script',code:original}];
  const native=await withServer((request,response)=>{
    if(request.url==='/obfs/index.html') {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(html);
    } else if(request.url==='/obfs/client.js') {
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'}).end(original);
    } else response.writeHead(404).end();
  },readDom);
  const sco=createScoHandler(files,{
    allowedHosts:['[::1]'],publicPaths:['client.js']
  });
  const generated=await withServer((request,response)=>{
    if(request.url==='/obfs/index.html') {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(html);
    } else sco(request,response);
  },readDom);
  assert.equal(native,'[::1]|42');
  assert.equal(generated,native);
  process.stdout.write('Real IPv6 Chromium native and SCO host-locked script parity: '+generated+'\n');
}

if(require.main===module) {
  main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={main};
