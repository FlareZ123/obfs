'use strict';

/**
 * Frozen-graph native-versus-ordinary-minification control for the three-file
 * stateful ARX application. This is a semantic and artifact receipt, not an
 * obfuscation-security test: no Wasm candidate exists at this comparison level.
 */

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const esbuild=require('esbuild');

/** @typedef {{kind:unknown,payload:unknown}} InputRecord */
/** @typedef {{serial:number,codeUnits:number,words:number[]}} Observation */
/** @typedef {{runScenario:(seed:number,records:InputRecord[],host?:{emit:(event:Observation)=>void})=>string}} ScenarioModule */

/** @param {Uint8Array} content @returns {string} */
function digest(content){return createHash('sha256').update(content).digest('hex');}

/** @param {number} value @returns {number} */
function next(value){value^=value<<13;value^=value>>>17;value^=value<<5;return value|0;}

/**
 * The same frozen values are reused by both sides. Public host observations
 * are cloned on emission to detect callback order or reference alias changes.
 * @param {number} count
 * @returns {InputRecord[]}
 */
function recordsFor(count){
  let random=0x4ae7813;
  /** @type {InputRecord[]} */
  const records=[];
  for(let index=0;index<count;index++){
    random=next(random);
    const payloads=[String.fromCharCode(random&65535),
      String.fromCharCode(0xd800)+(random>>>0),
      -0,NaN,Infinity,false,null,0x80000000,
      ['x',String.fromCharCode(random>>>16)],{value:random},
      '🙂\u0000\udfff',random];
    records.push({kind:index%9===0?undefined:index%7===0?'µ':index%3,
      payload:payloads[index%payloads.length]});
  }
  return records;
}

/**
 * @param {ScenarioModule} application
 * @param {number} seed
 * @param {InputRecord[]} records
 * @returns {{serialized:string,events:string[]}}
 */
function observe(application,seed,records){
  /** @type {string[]} */
  const events=[];
  const serialized=application.runScenario(seed,records,{emit(event){
    events.push(JSON.stringify(event));
  }});
  return {serialized,events};
}

/**
 * Compare the actual three-module native application with a pinned esbuild
 * minified, bundled ESM client, without ever writing a generated source file.
 * @param {number} [recordCount]
 * @returns {Promise<{recordCount:number,seeds:number[],sourceDigests:Record<string,string>,lockDigest:string,controlDigest:string,controlBytes:number,codeUnitTransitions:number,matchedEvents:number,matchedCandidateEvents:number,esbuildVersion:string}>}
 */
async function compareStatefulMinifier(recordCount=12288){
  const root=path.join(__dirname,'../examples/stateful-arx-app/native');
  const entry=path.join(root,'entry.mjs');
  /** @type {Record<string,string>} */
  const sourceDigests={};
  for(const file of ['kernel.mjs','state.mjs','entry.mjs'])
    sourceDigests[file]=digest(readFileSync(path.join(root,file)));
  const lockDigest=digest(readFileSync(path.join(__dirname,'../package-lock.json')));
  const native=/** @type {ScenarioModule} */(await import(pathToFileURL(entry).href));
  const candidate=/** @type {ScenarioModule} */(await import(pathToFileURL(
    path.join(__dirname,'../examples/stateful-arx-app/wasm/entry.mjs')).href));
  const built=await esbuild.build({entryPoints:[entry],bundle:true,write:false,
    minify:true,platform:'neutral',format:'esm',target:'es2022',
    sourcemap:false,logLevel:'silent'});
  assert.equal(built.outputFiles?.length,1,'Expected exactly one ordinary ESM control');
  const controlBytes=/** @type {import('esbuild').OutputFile[]} */(built.outputFiles)[0].contents;
  const published=readFileSync(path.join(__dirname,
    '../examples/stateful-arx-app/minified/entry.mjs'));
  assert.deepEqual(Buffer.from(controlBytes),published,'Minifier control differs from frozen bytes');
  assert.equal(digest(controlBytes),
    'aba8e80d8b22452d70004417b04c6859acf7c61bfb7b5022662878a5422eafed');
  const url='data:text/javascript;base64,'+Buffer.from(controlBytes).toString('base64');
  const minified=/** @type {ScenarioModule} */(await import(url));
  const records=recordsFor(recordCount);
  const seeds=[0,-1,0x7fffffff,0x80000000|0];
  let matchedEvents=0,matchedCandidateEvents=0;
  for(const seed of seeds){
    const original=observe(native,seed,records);
    const reduced=observe(minified,seed,records);
    const protectedOutput=observe(candidate,seed,records);
    assert.equal(reduced.serialized,original.serialized,'Minified output mismatch seed '+seed);
    assert.deepEqual(reduced.events,original.events,'Host callback mismatch seed '+seed);
    assert.equal(protectedOutput.serialized,original.serialized,'Wasm output mismatch seed '+seed);
    assert.deepEqual(protectedOutput.events,original.events,'Wasm host callback mismatch seed '+seed);
    assert.equal(original.events.length,recordCount,'Missing original host callbacks');
    matchedEvents+=original.events.length;
    matchedCandidateEvents+=protectedOutput.events.length;
  }
  let codeUnitTransitions=0;
  for(const record of records)
    codeUnitTransitions+=(String(record.kind)+':'+String(record.payload)).length;
  return {recordCount,seeds,sourceDigests,lockDigest,
    controlDigest:digest(controlBytes),controlBytes:controlBytes.length,
    codeUnitTransitions:codeUnitTransitions*seeds.length,matchedEvents,matchedCandidateEvents,
    esbuildVersion:esbuild.version};
}

module.exports={compareStatefulMinifier,recordsFor};

if(require.main===module){
  compareStatefulMinifier().then(receipt=>console.log('STATEFUL_ARX_CONTROL '+JSON.stringify(receipt)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
