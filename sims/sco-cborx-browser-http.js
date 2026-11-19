'use strict';

const assert = require('node:assert/strict');
const {execFile} = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {promisify} = require('node:util');
const {Encoder} = require('cbor-x');
const {pairedBudgetBound} = require('./paired-budget-bound');

const runFile = promisify(execFile);
const nodeEncoder = new Encoder({
  structuredClone: true,
  useRecords: false,
  alwaysUseFloat: true
});
const TOKEN = 'local-cborx-browser-pilot-v1';

/**
 * @param {'native'|'cbor-cold'|'cbor-hot'|'http-semantic'} variant
 * @returns {string}
 */
function pageSource(variant) {
  const loadCbor = variant === 'native' ? '' : '<script src="/vendor/cbor-x.js"></script>';
  const common = String.raw`
function payload(count){
  return {category:"cborx-browser",records:Array.from({length:count},(_,index)=>({
    index,label:"event-"+index+(index%11===0?"終":"")+(index%13===0?"🧪":""),
    quantity:Math.imul(index+1,2654435761)|0
  }))};
}
function task(data){
  let state=0x13579bdf;
  for(const record of data.records){
    state=Math.imul((state^record.quantity^record.index)|0,0x45d9f3b)|0;
    state=(state+record.label.length)|0;
  }
  for(let round=0;round<25000;round++)
    state=Math.imul((state^round)|0,0x27d4eb2d)|0;
  return state|0;
}
function semanticObservations(restored){
  return {
    cycle:restored.self===restored,
    sharedReference:restored.left===restored.right,
    ownUndefined:Object.hasOwn(restored,"missing")&&restored.missing===undefined,
    nan:Number.isNaN(restored.nan),
    negativeZero:Object.is(restored.negativeZero,-0),
    bigint:restored.bigint===12345678901234567890n,
    date:restored.date instanceof Date&&restored.date.toISOString()==="2026-11-18T00:00:00.000Z",
    regexp:restored.regexp instanceof RegExp&&restored.regexp.source==="obfs"&&restored.regexp.flags==="gi",
    set:restored.set instanceof Set&&[...restored.set].join(",")==="1,2,3",
    map:restored.map instanceof Map&&restored.map.get("x")===7
  };
}
`;
  if (variant === 'native' || variant === 'cbor-cold') {
    return '<!doctype html><html><head><meta charset="utf-8">'+loadCbor+
      '</head><body><pre id="out">pending</pre><script>'+
      'document.getElementById("out").textContent="pass:"+JSON.stringify({variant:'+
      JSON.stringify(variant)+',bootMs:performance.now(),hasCbor:'+
      (variant === 'native' ? 'false' : 'typeof CBOR==="object"')+'});'+
      '</script></body></html>';
  }
  if (variant === 'cbor-hot') {
    return '<!doctype html><html><head><meta charset="utf-8">'+loadCbor+
      '</head><body><pre id="out">pending</pre><script>'+common+String.raw`
const defaultEncoder=new CBOR.Encoder({structuredClone:true,useRecords:false});
const floatEncoder=new CBOR.Encoder({structuredClone:true,useRecords:false,alwaysUseFloat:true});
const codecs={
  native:value=>value,
  json:value=>JSON.parse(JSON.stringify(value)),
  cborDefault:value=>defaultEncoder.decode(defaultEncoder.encode(value)),
  cborFloat:value=>floatEncoder.decode(floatEncoder.encode(value))
};
function sample(codec,data,repeats){
  let checksum=0;
  const started=performance.now();
  for(let i=0;i<repeats;i++)checksum=(checksum+task(codec(data)))|0;
  return {ms:performance.now()-started,checksum};
}
const semanticSource={left:{},missing:undefined,nan:NaN,negativeZero:-0,
  bigint:12345678901234567890n,date:new Date("2026-11-18T00:00:00.000Z"),
  regexp:/obfs/gi,set:new Set([1,2,3]),map:new Map([["x",7]])};
semanticSource.right=semanticSource.left;semanticSource.self=semanticSource;
const floatSemantic=semanticObservations(codecs.cborFloat(semanticSource));
const rows=[];
const variants=["native","json","cborDefault","cborFloat"];
const orders=[
  ["native","json","cborDefault","cborFloat"],
  ["cborFloat","native","json","cborDefault"],
  ["cborDefault","cborFloat","native","json"],
  ["json","cborDefault","cborFloat","native"]
];
for(const count of [1,32]){
  const data=payload(count);
  const values={native:[],json:[],cborDefault:[],cborFloat:[]};
  for(const name of variants)sample(codecs[name],data,32);
  for(let trial=0;trial<12;trial++){
    const checksums={};
    for(const name of orders[trial%orders.length]){
      const observation=sample(codecs[name],data,4096);
      values[name].push(observation.ms);
      checksums[name]=observation.checksum;
    }
    if(checksums.native!==checksums.json||
       checksums.native!==checksums.cborDefault||
       checksums.native!==checksums.cborFloat)throw Error("checksum mismatch");
  }
  rows.push({count,values});
}
document.getElementById("out").textContent="pass:"+JSON.stringify({
  variant:"cbor-hot",floatSemantic,rows
});
`+'</script></body></html>';
  }

  return '<!doctype html><html><head><meta charset="utf-8">'+loadCbor+
    '</head><body><pre id="out">pending</pre><script>'+common+String.raw`
(async()=>{
  const encoder=new CBOR.Encoder({structuredClone:true,useRecords:false,alwaysUseFloat:true});
  const shared={marker:"shared"};
  const source={left:shared,right:shared,missing:undefined,nan:NaN,negativeZero:-0,
    bigint:12345678901234567890n,date:new Date("2026-11-18T00:00:00.000Z"),
    regexp:/obfs/gi,set:new Set([1,2,3]),map:new Map([["x",7]])};
  source.self=source;
  const response=await fetch("/echo-cbor",{
    method:"POST",
    headers:{"content-type":"application/cbor","x-obfs-token":"local-cborx-browser-pilot-v1"},
    body:encoder.encode(source)
  });
  if(!response.ok)throw Error("HTTP "+response.status);
  const restored=encoder.decode(new Uint8Array(await response.arrayBuffer()));
  const observations=semanticObservations(restored);
  document.getElementById("out").textContent="pass:"+JSON.stringify({
    variant:"http-semantic",observations,
    semanticContractMet:Object.values(observations).every(Boolean)
  });
})().catch(error=>{
  document.getElementById("out").textContent="fail:"+String(error&&error.stack||error);
});
`+'</script></body></html>';
}

/**
 * @param {string} root
 * @param {'native'|'cbor-cold'|'cbor-hot'|'http-semantic'} variant
 * @returns {Promise<any>}
 */
async function browserSample(root, variant) {
  const args = [
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run'
  ];
  if (variant === 'http-semantic') args.push('--virtual-time-budget=5000');
  args.push('--dump-dom', root + '/' + variant + '.html');
  const {stdout} = await runFile(process.env.CHROMIUM_BIN ?? 'google-chrome', args, {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024
  });
  const match = stdout.match(/<pre id="out">pass:(\{[^<]*\})<\/pre>/u);
  assert.ok(match, 'Browser did not complete '+variant+': '+stdout.slice(-1000));
  return JSON.parse(match[1]);
}

/**
 * @param {number[]} baseline
 * @param {number[]} candidate
 * @returns {object|null}
 */
function browserBound(baseline, candidate) {
  if (baseline.some(value => value === 0) || candidate.some(value => value === 0)) return null;
  return pairedBudgetBound(baseline, candidate);
}

/** @returns {Promise<object>} */
async function run() {
  const bundlePath = path.join(process.cwd(), 'node_modules', 'cbor-x', 'dist', 'index.js');
  const bundle = await fs.readFile(bundlePath, 'utf8');
  assert.match(bundle, /Encoder/u);

  const assets = new Map([
    ['/vendor/cbor-x.js', bundle],
    ['/native.html', pageSource('native')],
    ['/cbor-cold.html', pageSource('cbor-cold')],
    ['/cbor-hot.html', pageSource('cbor-hot')],
    ['/http-semantic.html', pageSource('http-semantic')]
  ]);

  let echoRequests = 0;
  const server = http.createServer((request, response) => {
    const target = request.url ?? '';
    if (request.method === 'GET' && assets.has(target)) {
      response.writeHead(200, {
        'content-type': target.endsWith('.html') ?
          'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(assets.get(target));
      return;
    }
    if (request.method === 'POST' && target === '/echo-cbor') {
      if (request.headers['x-obfs-token'] !== TOKEN) {
        response.writeHead(403).end();
        return;
      }
      /** @type {Buffer[]} */
      const chunks = [];
      let bytes = 0;
      request.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) request.destroy(new Error('body too large'));
        else chunks.push(chunk);
      });
      request.on('end', () => {
        const decoded = nodeEncoder.decode(Buffer.concat(chunks));
        const encoded = nodeEncoder.encode(decoded);
        echoRequests++;
        response.writeHead(200, {
          'content-type': 'application/cbor',
          'content-length': encoded.byteLength,
          'cache-control': 'no-store'
        });
        response.end(encoded);
      });
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const root = 'http://127.0.0.1:' + address.port;

    const cold = {native: [], cbor: []};
    for (let trial = 0; trial < 9; trial++) {
      const order = trial % 2 === 0 ?
        /** @type {const} */ (['native','cbor-cold']) :
        /** @type {const} */ (['cbor-cold','native']);
      for (const variant of order) {
        const result = await browserSample(root, variant);
        assert.equal(result.hasCbor, variant === 'cbor-cold');
        (variant === 'native' ? cold.native : cold.cbor).push(result.bootMs);
      }
    }

    const hot = await browserSample(root, 'cbor-hot');
    assert.ok(Object.values(hot.floatSemantic).every(Boolean));
    const hotRows = hot.rows.map(row => {
      for (const values of Object.values(row.values)) {
        assert.equal(values.length, 12);
        assert.ok(values.every(ms => Number.isFinite(ms) && ms >= 0));
      }
      return {
        count: row.count,
        timerResolutionLimited: Object.values(row.values).some(values => values.some(ms => ms === 0)),
        floatVsNative: browserBound(row.values.native, row.values.cborFloat),
        defaultVsNative: browserBound(row.values.native, row.values.cborDefault),
        jsonVsNative: browserBound(row.values.native, row.values.json),
        floatVsDefault: browserBound(row.values.cborDefault, row.values.cborFloat),
        samples: row.values
      };
    });

    const httpSemantic = await browserSample(root, 'http-semantic');
    assert.equal(httpSemantic.semanticContractMet, true);
    assert.equal(echoRequests, 1);

    return {
      node: process.version,
      platform: process.platform,
      candidate: 'cbor-x@1.6.9 alwaysUseFloat',
      browser: process.env.CHROMIUM_BIN ?? 'google-chrome',
      bundleBytes: Buffer.byteLength(bundle),
      coldModuleReadyMs: cold,
      coldCborVsNative: browserBound(cold.native, cold.cbor),
      hotFloatSemantic: hot.floatSemantic,
      hotRows,
      httpSemantic,
      echoRequests,
      boundary: 'real Chromium standalone UMD load, hot in-page codec, and one loopback binary HTTP graph roundtrip; HTTP timing excluded'
    };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

if (require.main === module) {
  run().then(result => {
    process.stdout.write('SCO_CBORX_CHROMIUM_HTTP ' + JSON.stringify(result) + '\n');
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {pageSource, browserSample, browserBound, run};
