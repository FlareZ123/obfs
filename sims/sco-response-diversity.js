'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createScoHandler}=require('../src');
const {parse}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{name:string,files:ModuleFile[],probe:string,expectDistinct:boolean,checkModule?:boolean}} Fixture */

/** @param {number[]} data @returns {number} */
function median(data) {
  const sorted=[...data].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

const plain='export const value=17;';
const handler='function compute(amount){const privateData={secretField:9};return privateData.secretField+amount;}export {compute};';
const localObserved='function compute(amount){const privateData={secretField:9};return privateData.secretField+amount;}const source=compute.toString();export {compute,source};';
const remoteObserved='import {compute} from "./state.mjs";export const source=compute.toString();';

/** @type {Fixture[]} */
const fixtures=[
  {
    name:'untransformable-numeric-export',
    files:[{path:'plain.mjs',sourceType:'module',code:plain}],
    probe:'plain.mjs',expectDistinct:false
  },
  {
    name:'eligible-private-closure',
    files:[{path:'handler.mjs',sourceType:'module',code:handler}],
    probe:'handler.mjs',expectDistinct:true,checkModule:true
  },
  {
    name:'same-file-source-observer',
    files:[{path:'local.mjs',sourceType:'module',code:localObserved}],
    probe:'local.mjs',expectDistinct:false,checkModule:true
  },
  {
    name:'other-module-source-observer',
    files:[
      {path:'state.mjs',sourceType:'module',code:handler},
      {path:'entry.mjs',sourceType:'module',code:remoteObserved}
    ],
    probe:'state.mjs',expectDistinct:false,checkModule:true
  },
  {
    name:'unrelated-module-without-observer',
    files:[
      {path:'handler.mjs',sourceType:'module',code:handler},
      {path:'unrelated.mjs',sourceType:'module',code:plain}
    ],
    probe:'handler.mjs',expectDistinct:true,checkModule:true
  }
];

/**
 * SCO uses a fresh random nonce per GET, but an ineligible file may receive
 * byte-identical responses. This measures actual emitted diversity instead of
 * counting random draws or assuming every file changes.
 * @param {Fixture} fixture
 * @param {number} requestCount
 * @returns {Promise<object>}
 */
async function measure(fixture,requestCount) {
  const server=http.createServer(createScoHandler(fixture.files,{
    closedWorld:fixture.files.length>1
  }));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const original=fixture.files.find(file=>file.path===fixture.probe);
    assert.ok(original);
    /** @type {Set<string>} */
    const digests=new Set();
    /** @type {number[]} */
    const times=[];
    let changedResponses=0;
    let minimumBytes=Infinity;
    let maximumBytes=0;
    for(let n=0;n<requestCount;n++) {
      const start=performance.now();
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+fixture.probe);
      const transformed=await response.text();
      const elapsed=performance.now()-start;
      assert.equal(response.status,200);
      times.push(elapsed);
      parse(transformed,'module');
      digests.add(createHash('sha256').update(transformed).digest('hex'));
      if(transformed!==original.code)changedResponses++;
      minimumBytes=Math.min(minimumBytes,Buffer.byteLength(transformed));
      maximumBytes=Math.max(maximumBytes,Buffer.byteLength(transformed));
      if(fixture.checkModule) {
        const namespace=await import('data:text/javascript,'+encodeURIComponent(transformed));
        assert.equal(namespace.compute(4),13);
        if(fixture.name==='same-file-source-observer') {
          const originalNamespace=await import('data:text/javascript,'+encodeURIComponent(original.code));
          assert.equal(namespace.source,originalNamespace.source);
        }
      }
    }
    if(fixture.expectDistinct) {
      assert.ok(digests.size>1,fixture.name+' never emitted a distinct response');
      assert.ok(changedResponses>0,fixture.name+' did not mutate any response');
    } else {
      assert.equal(digests.size,1,fixture.name+' unexpectedly changed between requests');
      assert.equal(changedResponses,0,fixture.name+' unexpectedly rewrote source');
    }
    return {
      fixture:fixture.name,requestCount,
      uniqueSha256Digests:digests.size,changedResponses,
      meanResponseMs:times.reduce((a,b)=>a+b,0)/times.length,
      medianResponseMs:median(times),
      minBytes:minimumBytes,maxBytes:maximumBytes,
      responseMs:times
    };
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {object[]} */
  const results=[];
  for(const fixture of fixtures) {
    const observed=await measure(fixture,12);
    results.push(observed);
    process.stdout.write(JSON.stringify(observed)+'\n');
  }
  await atomicWrite(path.join(process.cwd(),'sco-response-diversity-output.json'),JSON.stringify({
    time:new Date().toISOString(),
    node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,
    contract:'five ESM fixtures, twelve independent actual SCO GETs per probe, fresh nonce per response',
    caveat:'This is a source-diversity observation only, not a security measure or 2.5x performance guarantee.',
    results
  },null,2)+'\n');
}
main().catch(error=>{process.stderr.write(String(error?.stack||error)+'\n');process.exitCode=1;});
