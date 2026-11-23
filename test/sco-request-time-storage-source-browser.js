'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {createScoHandler}=require('../src/sco');

const storageKey='sco-request-time-storage-source';
const sourceMarker='sco-request-time-source-marker-0123456789abcdef0123456789abcdef';
const source=[
  'function inspect(){',
  '  const privateLocal=29;',
  '  const marker="'+sourceMarker+'";',
  '  return {value:privateLocal,marker};',
  '}',
  'function independent(){',
  '  const independentLocal=7;',
  '  return independentLocal;',
  '}',
  'export function sample(){',
  '  const inspected=inspect();',
  '  localStorage.setItem("'+storageKey+'",inspect);',
  '  return {value:inspected.value,marker:inspected.marker,independent:independent()};',
  '}'
].join('\n');

/**
 * @typedef {{status:number,body:string}} HttpResult
 */

/**
 * Request the actual request-time artifact from createScoHandler.
 * @param {number} port
 * @param {string} hostHeader
 * @returns {Promise<HttpResult>}
 */
function requestModule(port,hostHeader) {
  return new Promise((resolve,reject)=>{
    const request=http.request({
      hostname:'127.0.0.1',
      port,
      path:'/obfs/entry.mjs',
      method:'GET',
      headers:{host:hostHeader}
    },response=>{
      /** @type {string[]} */
      const chunks=[];
      response.setEncoding('utf8');
      response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({
        status:response.statusCode??0,
        body:chunks.join('')
      }));
    });
    request.once('error',reject);
    request.end();
  });
}

/**
 * Exercise the real SCO HTTP handler, including its per-request spelling
 * variation and host lock, then execute the exact returned artifacts in Chrome.
 * @returns {Promise<void>}
 */
async function main() {
  const handler=createScoHandler([{
    path:'entry.mjs',
    sourceType:'module',
    code:source
  }],{
    allowedHosts:['127.0.0.1']
  });
  /** @type {Map<string,string>} */
  const servedModules=new Map();
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://localhost').pathname;
    if(pathname==='/') {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end('<!doctype html><html><body>request-time SCO witness</body></html>');
      return;
    }
    if(pathname==='/native.mjs') {
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(source);
      return;
    }
    const served=servedModules.get(pathname);
    if(served!==undefined) {
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(served);
      return;
    }
    handler(request,response);
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });

  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected local TCP server');
    const origin='http://127.0.0.1:'+address.port;
    const hostHeader='127.0.0.1:'+address.port;
    const first=await requestModule(address.port,hostHeader);
    const second=await requestModule(address.port,hostHeader);
    const denied=await requestModule(address.port,'attacker.invalid');

    assert.equal(first.status,200,'authorized Host must receive the SCO artifact');
    assert.equal(second.status,200,'a second authorized request must receive an artifact');
    assert.equal(denied.status,403,'an unauthorized Host must be rejected');
    assert.notEqual(first.body,second.body,
      'separate SCO requests should use independently randomized artifacts');
    assert.ok(!first.body.includes('privateLocal'),
      'request-time SCO compilation should rewrite the observed function local');
    assert.ok(!first.body.includes('independentLocal'),
      'request-time SCO compilation should retain unrelated private rewrite yield');
    assert.ok(first.body.includes('\\u'),
      'request-time literal spelling variation should encode the source marker');
    assert.ok(!first.body.includes(sourceMarker),
      'request-time artifact should not retain the marker literal spelling');

    servedModules.set('/served-a.mjs',first.body);
    servedModules.set('/served-b.mjs',second.body);

    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'chromium',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto(origin+'/',{waitUntil:'load'});
    /** @type {any} */
    const report=await page.evaluate(async key=>{
      const native=await import('/native.mjs');
      const first=await import('/served-a.mjs');
      const second=await import('/served-b.mjs');
      /**
       * @param {{sample:()=>{value:number,marker:string,independent:number}}} module
       */
      function run(module) {
        localStorage.clear();
        const result=module.sample();
        return {
          result,
          source:localStorage.getItem(key)
        };
      }
      return {
        native:run(native),
        first:run(first),
        second:run(second)
      };
    },storageKey);

    assert.equal(report.native.result.value,29);
    assert.equal(report.native.result.marker,sourceMarker);
    assert.equal(report.native.result.independent,7);
    for(const label of ['first','second']) {
      assert.equal(report[label].result.value,29,label+' numeric result');
      assert.equal(report[label].result.marker,sourceMarker,label+' marker value');
      assert.equal(report[label].result.independent,7,label+' independent helper');
      assert.notEqual(report[label].source,report.native.source,
        label+' Storage readback must expose the changed function source');
      assert.ok(!report[label].source.includes('privateLocal'),
        label+' source should contain the transformed private binding');
      assert.ok(report[label].source.includes('\\u'),
        label+' source should contain request-time Unicode literal spelling');
      assert.ok(!report[label].source.includes(sourceMarker),
        label+' source should not retain the original marker spelling');
    }
    assert.ok(report.native.source.includes('privateLocal'));
    assert.notEqual(report.first.source,report.second.source,
      'two request-time variants should expose distinct transformed source');

    process.stdout.write(JSON.stringify({
      browser:await browser.version(),
      hostLock:{allowed:200,denied:denied.status},
      requestVariants:{distinct:first.body!==second.body},
      sourceParity:{
        native:report.native.source,
        first:report.first.source,
        second:report.second.source
      },
      values:{
        native:report.native.result,
        first:report.first.result,
        second:report.second.result
      },
      compilerSourceObservation:false
    },null,2)+'\n');
  } finally {
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module) {
  main().catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={main};
