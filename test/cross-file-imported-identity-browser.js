'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const {build,transform}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {pairedBudgetBound}=require('../sims/paired-budget-bound');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{path:string,code:string}} Output */
/** @typedef {{native:number[],minified:number[],mangled:number[],compiled:number[]}} Timings */

/**
 * A browser-valid cross-file identity-forwarding graph. Public host callbacks
 * receive only primitive results: the protected object never escapes to
 * caller-owned JavaScript. The unsafe ownKeys variant is a negative control.
 *
 * @param {boolean} reflective
 * @param {number} [depth]
 * @returns {Input[]}
 */
function graph(reflective,depth=1){
  const additional=Array.from({length:depth-1},(_,i)=>
    'const relay'+i+'='+(i===0?'forward':'relay'+(i-1))+';').join('');
  const target=depth===1?'forward':'relay'+(depth-2);
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17,otherField:5};'},
    {path:'identity.mjs',sourceType:'module',
      code:'export const identity=x=>x;'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const forward=identity;'+additional+
        'export function run(a){const result='+target+'(state);'+
        (reflective?'return [Object.keys(result),result.secretField+a];':
          'return (result.secretField+a)^result.otherField;')+'}'}
  ];
}

/**
 * One combined ESM distribution with two unrelated owners sharing identical
 * field names. The first owner is private and accessed through an identity
 * alias; the second is reflected to the public API.
 *
 * @returns {Input[]}
 */
function mixedGraph(){
  return [
    {path:'private-state.mjs',sourceType:'module',
      code:'export const secret={secretField:17,otherField:5};'},
    {path:'public-state.mjs',sourceType:'module',
      code:'export const visible={secretField:23,otherField:7};'},
    {path:'identity.mjs',sourceType:'module',
      code:'export const identity=x=>x;'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {secret} from "./private-state.mjs";'+
        'import {visible} from "./public-state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const forward=identity;'+
        'export function run(a){const local=forward(secret);'+
        'return [(local.secretField+a)^local.otherField,'+
        'Object.keys(visible),visible.secretField+a];}'}
  ];
}

/** @param {Input[]} input @returns {Output[]} */
function compile(input){
  const built=obfuscateFiles(input,{
    mode:'coo',closedWorld:true,
    seed:'browser-cross-imported-identity-alias-'+
      (input[2].code.includes('Object.keys')?'reflection':'positive'),
    identifiers:false,strings:false,properties:true
  });
  const reflective=input[2].code.includes('Object.keys');
  assert.equal(built.crossFile.objects,reflective?0:1);
  assert.equal(built.crossFile.properties,reflective?0:2);
  return built.files.map(file=>({path:file.path,code:String(file.code)}));
}

/**
 * Opt-in property-mangling esbuild control. One build invocation receives
 * all ESM source files so property renamings remain consistent between them.
 * The explicit regex is a manual whole-graph policy, not a reflection proof.
 * @param {Input[]} input
 * @returns {Promise<Output[]>}
 */
async function mangleGraph(input){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esbuild-mangle-'));
  try{
    for(const file of input)
      await atomicWrite(path.join(root,file.path),file.code);
    const result=await build({
      absWorkingDir:root,
      entryPoints:input.map(file=>file.path),
      outbase:root,
      outdir:path.join(root,'out'),
      outExtension:{'.js':'.mjs'},
      bundle:false,write:false,
      platform:'browser',format:'esm',target:'es2022',
      minify:true,legalComments:'none',
      mangleProps:/^(secretField|otherField)$/,
      mangleCache:{secretField:'a',otherField:'b'}
    });
    const files=result.outputFiles??[];
    assert.equal(files.length,input.length);
    const emitted=files.map(file=>({
      path:path.basename(file.path),code:file.text
    }));
    assert.deepEqual(emitted.map(file=>file.path).sort(),
      input.map(file=>file.path).sort());
    return emitted;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * Test the exact same native/published ESM graph and a reflexive-key
 * rejection in real Chrome. Timed work includes only repeated pure
 * entry calls, not compilation, import, input creation or callback hashing.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Map<string,{body:string,type:string}>} */
  const assets=new Map([
    ['/index.html',{body:'<!doctype html><html><head><meta charset="utf-8"></head><body>Cross-file identity proof</body></html>',
      type:'text/html; charset=utf-8'}]
  ]);
  /** @type {{caseName:string,ordinaryMinifiedLabelsVisible:boolean,mangledLabelsVisible:boolean,protectedLabelsVisible:boolean}[]} */
  const staticLabelEvidence=[];
  for(const [name,reflective,depth] of /** @type {[string,boolean,number][]} */ (
    [['positive',false,1],['transitive',false,3],['reflective',true,1]])){
    const original=graph(reflective,depth),compiled=compile(original);
    const mangled=await mangleGraph(original);
    /** @type {Output[]} */
    const minified=await Promise.all(original.map(async file=>({
      path:file.path,
      code:(await transform(file.code,{
        format:'esm',loader:'js',target:'es2022',sourcefile:file.path,
        minify:true,legalComments:'none'
      })).code
    })));
    /** @param {Input[]|Output[]} files @returns {boolean} */
    function hasSourceLabels(files){
      return ['secretField','otherField'].every(name=>
        files.some(file=>file.code.includes(name)));
    }
    assert.equal(hasSourceLabels(original),true);
    assert.equal(hasSourceLabels(minified),true,
      'Normal esbuild property preservation should leave both semantic labels');
    assert.equal(hasSourceLabels(mangled),false,
      'Configured esbuild property mangling should remove both labels');
    assert.equal(hasSourceLabels(compiled),reflective,
      'Proved private labels should vanish; reflective labels must survive');
    staticLabelEvidence.push({
      caseName:name,ordinaryMinifiedLabelsVisible:true,
      mangledLabelsVisible:false,protectedLabelsVisible:reflective
    });
    for(const [variant,files] of /** @type {[string,Input[]|Output[]][]} */ (
      [['native',original],['minified',minified],['mangled',mangled],['compiled',compiled]])){
      for(const file of files)
        assets.set('/'+name+'/'+variant+'/'+file.path,
          {body:file.code,type:'text/javascript; charset=utf-8'});
    }
  }
  const mixed=mixedGraph();
  const mixedBuilt=obfuscateFiles(mixed,{
    mode:'coo',closedWorld:true,properties:true,
    identifiers:false,strings:false,
    seed:'same-graph-private-vs-reflected-owner'
  });
  assert.equal(mixedBuilt.crossFile.objects,1,
    'Private owner should be provably renamed despite reflected sibling');
  assert.equal(mixedBuilt.crossFile.properties,2);
  const mixedCompiled=mixedBuilt.files.map(file=>({
    path:file.path,code:String(file.code)
  }));
  const mixedMangled=await mangleGraph(mixed);
  const privateNative=mixed.find(file=>file.path==='private-state.mjs');
  const privateCompiled=mixedCompiled.find(file=>file.path==='private-state.mjs');
  const publicCompiled=mixedCompiled.find(file=>file.path==='public-state.mjs');
  const publicMangled=mixedMangled.find(file=>file.path==='public-state.mjs');
  assert.ok(privateNative&&privateCompiled&&publicCompiled&&publicMangled);
  assert.match(privateNative.code,/secretField|otherField/u);
  assert.doesNotMatch(privateCompiled.code,/secretField|otherField/u);
  assert.match(publicCompiled.code,/secretField|otherField/u);
  assert.doesNotMatch(publicMangled.code,/secretField|otherField/u);
  for(const [variant,files] of /** @type {[string,Input[]|Output[]][]} */ (
    [['native',mixed],['compiled',mixedCompiled],['mangled',mixedMangled]])){
    for(const file of files){
      assets.set('/mixed/'+variant+'/'+file.path,{
        body:file.code,type:'text/javascript; charset=utf-8'
      });
    }
  }
  const server=http.createServer((request,response)=>{
    const asset=assets.get(request.url??'');
    if(request.method!=='GET'||!asset){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':asset.type,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"script-src 'self'"
    });
    response.end(asset.body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    /** @type {Promise<void>} */
    const listening=new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    await listening;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',
      {waitUntil:'domcontentloaded',timeout:45000});
    const data=await page.evaluate(async()=>{
      /** @type {Timings} */
      const time={native:[],minified:[],mangled:[],compiled:[]};
      const expected=(/** @type {string} */ (JSON.stringify(['secretField','otherField'])));
      const positiveNative='/positive/native/entry.mjs';
      const positiveMinified='/positive/minified/entry.mjs';
      const positiveMangled='/positive/mangled/entry.mjs';
      const positiveCompiled='/positive/compiled/entry.mjs';
      const transitiveNative='/transitive/native/entry.mjs';
      const transitiveMangled='/transitive/mangled/entry.mjs';
      const transitiveCompiled='/transitive/compiled/entry.mjs';
      const negativeNative='/reflective/native/entry.mjs';
      const negativeMangled='/reflective/mangled/entry.mjs';
      const negativeCompiled='/reflective/compiled/entry.mjs';
      const baseline=/** @type {{run:(a:number)=>number}} */(
        await import(positiveNative));
      const ordinaryMinified=/** @type {{run:(a:number)=>number}} */ (
        await import(positiveMinified));
      const configuredMangled=/** @type {{run:(a:number)=>number}} */ (
        await import(positiveMangled));
      const protectedGraph=/** @type {{run:(a:number)=>number}} */ (
        await import(positiveCompiled));
      const transitiveBaseline=/** @type {{run:(a:number)=>number}} */ (
        await import(transitiveNative));
      const transitiveMangle=/** @type {{run:(a:number)=>number}} */ (
        await import(transitiveMangled));
      const transitiveCandidate=/** @type {{run:(a:number)=>number}} */ (
        await import(transitiveCompiled));
      const reflectiveBaseline=/** @type {{run:(a:number)=>[string[],number]}} */ (
        await import(negativeNative));
      const reflectiveMangle=/** @type {{run:(a:number)=>[string[],number]}} */ (
        await import(negativeMangled));
      const reflectiveCandidate=/** @type {{run:(a:number)=>[string[],number]}} */ (
        await import(negativeCompiled));
      let parity=0;
      for(let i=0;i<4096;i++){
        const native=baseline.run(i);
        if(!Object.is(native,protectedGraph.run(i))||
           !Object.is(native,ordinaryMinified.run(i))||
           !Object.is(native,configuredMangled.run(i)))
          throw Error('Browser cross-file positive or minifier mismatch at '+i);
        if(!Object.is(transitiveBaseline.run(i),transitiveCandidate.run(i))||
           !Object.is(transitiveBaseline.run(i),transitiveMangle.run(i)))
          throw Error('Browser transitive alias differential mismatch at '+i);
        const reflected=reflectiveBaseline.run(i);
        const transformed=reflectiveCandidate.run(i);
        const unsafeMangled=reflectiveMangle.run(i);
        if(JSON.stringify(reflected)!==JSON.stringify(transformed)||
            JSON.stringify(reflected[0])!==expected)
          throw Error('Browser reflective refusal mismatch at '+i);
        if(JSON.stringify(unsafeMangled[0])===expected||
           !Object.is(unsafeMangled[1],reflected[1]))
          throw Error('Configured esbuild reflective negative mismatch at '+i);
        parity++;
      }
      // Source-visible host APIs only consume values. An external observer of
      // the protected object shape is deliberately OUTSIDE closedWorld:true.
      /** @type {number[]} */
      const collected=[];
      (/** @type {any} */ (globalThis)).externalBridge={
        /** @param {number} value */
        accept(value){collected.push(value);}
      };
      /** @param {(value:number)=>number} fn @param {number} iterations */
      function timed(fn,iterations){
        let checksum=0;
        const start=performance.now();
        for(let i=0;i<iterations;i++){
          const value=fn(i);
          checksum^=value;
          if(i%8191===0)
            (/** @type {any} */ (globalThis)).externalBridge.accept(value);
        }
        const ms=performance.now()-start;
        if(!Number.isFinite(ms)||ms<=0)throw Error('No browser CPU witness');
        return {ms,checksum};
      }
      for(let i=0;i<4;i++){
        timed(baseline.run,65536);
        timed(ordinaryMinified.run,65536);
        timed(configuredMangled.run,65536);
        timed(protectedGraph.run,65536);
      }
      const orders=[
        ['native','minified','mangled','compiled'],
        ['compiled','mangled','minified','native'],
        ['minified','native','compiled','mangled'],
        ['mangled','compiled','native','minified']
      ];
      for(let trial=0;trial<12;trial++){
        const order=orders[trial%orders.length];
        /** @type {number|undefined} */
        let checksum;
        for(const variant of order){
          const fn=variant==='native'?baseline.run:
            variant==='minified'?ordinaryMinified.run:
            variant==='mangled'?configuredMangled.run:protectedGraph.run;
          const result=timed(fn,100000);
          if(checksum!==undefined&&result.checksum!==checksum)
            throw Error('Browser benchmark checksum mismatch '+variant);
          if(checksum===undefined)checksum=result.checksum;
          time[/** @type {'native'|'minified'|'mangled'|'compiled'} */ (variant)].push(result.ms);
        }
      }
      // Validate every held-out browser output after timing, so a matching
      // XOR checksum cannot conceal sporadic semantic divergence.
      let exactHeldoutInputs=0;
      for(let i=0;i<100000;i++){
        const expectedValue=baseline.run(i);
        if(!Object.is(expectedValue,ordinaryMinified.run(i))||
           !Object.is(expectedValue,configuredMangled.run(i))||
           !Object.is(expectedValue,protectedGraph.run(i))||
           !Object.is(transitiveBaseline.run(i),transitiveMangle.run(i))||
           !Object.is(transitiveBaseline.run(i),transitiveCandidate.run(i)))
          throw Error('Exact browser held-out output mismatch '+i);
        exactHeldoutInputs++;
      }
      return {trace:{
        typedInputs:parity,exactHeldoutInputs,
        exactHeldoutParity:true,hostCallbacks:collected.length,
        outputParity:true,transitiveParity:true,reflectiveRefusalParity:true,
        benchmarkChecksumsMatched:true,
        configuredMangleReflectedKeysChanged:true
      },time};
    });
    assert.equal(data.trace.typedInputs,4096);
    assert.equal(data.trace.exactHeldoutInputs,100000);
    assert.equal(data.trace.exactHeldoutParity,true);
    assert.ok(data.trace.hostCallbacks>0);
    assert.equal(data.trace.outputParity,true);
    assert.equal(data.trace.reflectiveRefusalParity,true);
    assert.equal(data.trace.transitiveParity,true);
    assert.equal(data.trace.benchmarkChecksumsMatched,true);
    const bound=pairedBudgetBound(data.time.native,data.time.compiled);
    const minifiedBound=pairedBudgetBound(data.time.minified,data.time.compiled);
    const mangledBound=pairedBudgetBound(data.time.mangled,data.time.compiled);
    console.log('CROSS_FILE_IMPORTED_IDENTITY_CHROMIUM '+JSON.stringify({
      version:await browser.version(),
      positiveFieldsRenamed:2,
      transitiveFieldsRenamed:2,
      reflectiveFieldsRenamed:0,
      cases:4096,exactHeldoutInputs:data.trace.exactHeldoutInputs,
      exactHeldoutParity:true,callbackCount:data.trace.hostCallbacks,
      fullOutputParity:true,transitiveOutputParity:true,
      reflectiveKeyParity:true,
      staticLabelEvidence,
      nativeVsCompiled:bound,
      minifiedVsCompiled:minifiedBound,
      mangledVsCompiled:mangledBound,
      strictObservedBreaches:bound.samplePairs-bound.observedPairsWithinBudget,
      strictObservedMinifiedBreaches:minifiedBound.samplePairs-minifiedBound.observedPairsWithinBudget,
      strictObservedMangledBreaches:mangledBound.samplePairs-mangledBound.observedPairsWithinBudget,
      timingMs:data.time,
      caveat:'One esbuild build call with explicit mangleProps removes both source labels on positive graphs but changes observed Object.keys in the reflective negative, whereas the conservative compiler refuses that rewrite. Default esbuild minification preserves labels. Configured esbuild needs an external whole-graph safety policy. Hostile COO clients can inspect every distributed source. Browser warm runtime work excludes compilation and cold-start costs.'
    }));
  }finally{
    try{if(browser)await browser.close();}
    finally{
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve()));
      await closed;
    }
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
