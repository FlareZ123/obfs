'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile,spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {promisify}=require('node:util');
const vm=require('node:vm');
const {normalizeScoVariant}=require('../sims/sco-variant-normalize');
const {createScoHandler,obfuscateFiles}=require('../src');

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
    'function emit(value){',
    'const firstMarker='+JSON.stringify(first)+';',
    'const secondMarker='+JSON.stringify(second)+';',
    'const thirdMarker='+JSON.stringify(third)+';',
    'const privateOwner={secretField:7};',
    'return {payload:firstMarker+secondMarker+thirdMarker,count:privateOwner.secretField};',
    '}',
    'const result=emit(7);',
    'const full=result.payload;',
    'const units=[];',
    'for(let i=0;i<full.length;i++)units.push(full.charCodeAt(i));',
    'units.push(result.count);',
    'document.getElementById("out").textContent=JSON.stringify(units);'
  ].join('\n');
  const preview=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'sco',seed:'browser-utf16-private-owner',strings:false
  }).files[0];
  assert.ok(preview.metrics.properties>=1,
    'The private owner must genuinely transform in the browser fixture');
  assert.ok(preview.metrics.bindings>=1,
    'Function-local bindings must genuinely transform in the browser fixture');
  const obfs=createScoHandler([{path:'entry.mjs',sourceType:'module',code:source}]);
  const server=http.createServer((request,response)=>{
    if(request.url==='/native.mjs') {
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(source);
      return;
    }
    if(request.url==='/native' || request.url==='/obfuscated') {
      const src=request.url==='/native'?'/native.mjs':'/obfs/entry.mjs';
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'cache-control':'no-store',
        'content-security-policy':"default-src 'none'; script-src 'self'"});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script type="module" src="'+src+'"></script>');
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
    // Index by UTF-16 code units; Unicode iteration would combine surrogates.
    const full=first+second+third;
    /** @type {number[]} */
    const nativeUnits=[];
    for(let i=0;i<full.length;i++)nativeUnits.push(full.charCodeAt(i));
    nativeUnits.push(7);
    const baseline=await readUnits(base+'/native');
    assert.deepEqual(baseline,nativeUnits);
    const emitted=await readUnits(base+'/obfuscated');
    assert.deepEqual(emitted,nativeUnits);
    const responses=await Promise.all([
      fetch(base+'/obfs/entry.mjs'),fetch(base+'/obfs/entry.mjs')
    ]);
    assert.ok(responses.every(response=>response.status===200));
    const codes=await Promise.all(responses.map(response=>response.text()));
    assert.notEqual(codes[0],codes[1],
      'Eligible request-time literals must exhibit distinct random spellings');
    for(const code of codes){
      assert.ok(!code.includes('secretField'),
        'SCO must actually rename the private field in served browser code');
      const attacker=spawnSync(process.execPath,[
        path.join(__dirname,'../sims/sco-spelling-mask-extractor.js')
      ],{input:code,encoding:'utf8',timeout:10000,windowsHide:true});
      if(attacker.error)throw attacker.error;
      assert.equal(attacker.status,0,attacker.stderr);
      const report=JSON.parse(attacker.stdout);
      assert.equal(report.matched,true);
      assert.equal(report.predictedDigest,
        createHash('sha256').update(code).digest('hex'));
      assert.equal(report.mask.length,32);
    }
    // A second source-only AST attack normalizes the randomized property,
    // lexical binding and string spellings to a single executable program.
    const canonical=codes.map(code=>normalizeScoVariant(code,'module'));
    assert.equal(canonical[0],canonical[1],
      'Freshly randomized client modules must collapse under static normalization');
    let reconstructedOutput='';
    const mockDocument={getElementById:()=>({
      /** @param {string} value */
      set textContent(value){reconstructedOutput=value;}
    })};
    vm.runInNewContext(canonical[0],{document:mockDocument},{timeout:1000});
    assert.deepEqual(JSON.parse(reconstructedOutput),nativeUnits,
      'Statically normalized public code must recover the same observable behavior');
    process.stdout.write(JSON.stringify({
      chromium:'passed',nativeUnits:baseline.length,emittedUnits:emitted.length,
      sourceVariantsDistinct:true,sourceOnlyMaskRecoveryOnRenamedModule:true,
      normalizedCodeEqualAcrossRequests:true,normalizedCodeExecutesEquivalently:true,
      observedPrivateFieldResult:nativeUnits.at(-1),
      transformedPrivateFields:preview.metrics.properties,
      transformedBindings:preview.metrics.bindings,containsUnpairedSurrogate:full.includes(String.fromCharCode(0xd800)),
      browser:'real Chromium, HTTP-served native versus SCO'
    })+'\n');
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
