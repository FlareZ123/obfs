'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
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
  // Puppeteer requires an absolute executable path. GitHub Actions supplies
  // CHROMIUM_BIN=google-chrome as a shell command, so use installed Chrome
  // channel discovery when the configured value is not an absolute path.
  const configured=process.env.CHROMIUM_BIN;
  const launchTarget=configured&&path.isAbsolute(configured)?
    {executablePath:configured}:{channel:'chrome'};
  const browser=await puppeteer.launch({
    ...launchTarget,
    headless:true,
    args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-proxy-server','--no-first-run']
  });
  try {
    const page=await browser.newPage();
    /** @type {string[]} */
    const network=[];
    page.on('requestfailed',request=>{
      network.push('failed '+request.url()+' '+(request.failure()?.errorText??''));
    });
    page.on('response',response=>{
      if(response.url().endsWith('/client.js')){
        network.push('script status '+response.status());
      }
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    try {
      await page.waitForFunction(
        "document.querySelector('#out')?.textContent !== 'pending'",
        {timeout:15000}
      );
    } catch(error) {
      console.error('Chromium IPv6 navigation diagnostics: '+JSON.stringify({
        url,network,body:(await page.content()).slice(0,1200)
      }));
      throw error;
    }
    const observed=await page.$eval('#out',element=>element.textContent??'');
    assert.ok(observed,'Chromium IPv6 page produced empty result');
    return observed;
  } finally {
    await browser.close();
  }
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
