'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const test=require('node:test');
const {parse}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {proveSourceObserverIslands}=require('../src/source-observer-islands');
const {lowerProvedPrimitiveIslandRecords}=require('../src/source-observer-island-arrays');
const {normalizePublicIsland}=require('../sims/source-island-public-normalizer');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile} */
const watched={path:'watched.mjs',sourceType:'module',
  code:'const recordA={privateA:17};const valueA=recordA.privateA;'+
    'export function watched(){return valueA;}'};
/** @type {SourceFile} */
const independent={path:'independent.mjs',sourceType:'module',
  code:'const recordB={privateB:23,otherB:19};const valueB=recordB.privateB;'+
    'export function unrelated(){return valueB;}'};
/** @type {SourceFile} */
const observer={path:'observer.mjs',sourceType:'module',
  code:'import {watched} from "./watched.mjs";'+
    'import {unrelated} from "./independent.mjs";'+
    'const source=watched.toString();const value=unrelated();'};

/**
 * Execute a module group from a temporary directory using an external
 * consumer as the entry point.
 * @param {SourceFile[]} files
 * @returns {Promise<string>}
 */
async function executeEsm(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-island-array-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
      cwd:dir,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('proved primitive island records lower to tuples without recoverable property labels',async()=>{
  const graph=[watched,independent,observer];
  const selected=proveSourceObserverIslands(graph,['independent.mjs']);
  assert.deepEqual([...selected],['independent.mjs']);

  const lowered=lowerProvedPrimitiveIslandRecords(
    independent.code,parse(independent.code,'module'),{seed:'island-array-core',path:'independent.mjs'});
  assert.deepEqual({records:lowered.records,properties:lowered.properties,declined:lowered.declined},
    {records:1,properties:2,declined:null});
  assert.match(lowered.code,/const recordB=\[19,23\];const valueB=recordB\[1\];/);
  const sameSeed=lowerProvedPrimitiveIslandRecords(
    independent.code,parse(independent.code,'module'),{seed:'island-array-core',path:'independent.mjs'});
  const otherSeed=lowerProvedPrimitiveIslandRecords(
    independent.code,parse(independent.code,'module'),{seed:'alpha',path:'independent.mjs'});
  assert.equal(sameSeed.code,lowered.code);
  assert.notEqual(otherSeed.code,lowered.code);
  assert.doesNotMatch(lowered.code,/privateB|otherB/);

  const attacker=normalizePublicIsland(lowered.code);
  assert.equal(attacker.properties,0,
    'the current seedless public property normalizer has no private key spelling to recover');
  assert.equal(attacker.code,lowered.code);

  /** @type {SourceFile} */
  const probe={
    path:'entry.mjs',sourceType:'module',
    code:'import "./observer.mjs";'+
      'import {watched} from "./watched.mjs";'+
      'import {unrelated} from "./independent.mjs";'+
      'console.log(JSON.stringify({watched:watched.toString(),'+
        'unrelated:unrelated.toString(),value:unrelated()}));'
  };
  const original=await executeEsm([watched,independent,observer,probe]);
  const transformed=await executeEsm([
    watched,{...independent,code:lowered.code},observer,probe
  ]);
  assert.equal(transformed,original);
  assert.deepEqual(JSON.parse(transformed),{
    watched:'function watched(){return valueA;}',
    unrelated:'function unrelated(){return valueB;}',
    value:23
  });
});

test('tuple lowering fails closed when an object record owns the special length field',()=>{
  const source='const record={length:2,privateB:23};'+
    'const valueB=record.privateB;export function unrelated(){return valueB;}';
  const result=lowerProvedPrimitiveIslandRecords(source,parse(source,'module'),{seed:'length',path:'independent.mjs'});
  assert.equal(result.code,source);
  assert.equal(result.records,0);
  assert.equal(result.properties,0);
  assert.equal(result.declined,'special length property');
});

test('static computed record keys lower to positional indices',()=>{
  const source='const record={["privateB"]:23,otherB:19};'+
    'const valueB=record["privateB"];export function unrelated(){return valueB;}';
  const result=lowerProvedPrimitiveIslandRecords(source,parse(source,'module'),{seed:'computed',path:'independent.mjs'});
  assert.equal(result.records,1);
  assert.equal(result.properties,2);
  assert.equal(result.declined,null);
  assert.match(result.code,/const record=\[\d+,\d+\];const valueB=record\[\d+\];/);
  assert.doesNotMatch(result.code,/privateB|otherB/);
});

test('core option lowers selected source-observer island records in COO, SCO and SNO',async()=>{
  /** @type {SourceFile} */
  const probe={path:'entry.mjs',sourceType:'module',
    code:'import "./observer.mjs";'+
      'import {watched} from "./watched.mjs";'+
      'import {unrelated} from "./independent.mjs";'+
      'console.log(JSON.stringify({watched:watched.toString(),'+
        'unrelated:unrelated.toString(),value:unrelated()}));'};
  const original=await executeEsm([watched,independent,observer,probe]);
  const propertyMode=obfuscateFiles([watched,independent,observer],{
    mode:'coo',closedWorld:true,seed:'island-array-property-mode',
    strings:false,experimentalSourceObserverIslands:['independent.mjs']
  });
  const propertyOutput=propertyMode.files.find(file=>file.path==='independent.mjs');
  assert.ok(propertyOutput);
  assert.equal(propertyOutput.metrics.properties,2);
  assert.equal(normalizePublicIsland(String(propertyOutput.code)).properties,2,
    'the public normalizer recovers both hashed property names in property mode');
  /** @type {Array<'coo'|'sco'|'sno'>} */
  const modes=['coo','sco','sno'];
  for(const mode of modes) {
    const result=obfuscateFiles([watched,independent,observer],{
      mode,closedWorld:true,seed:'island-array-core-'+mode,
      strings:false,
      experimentalSourceObserverIslands:['independent.mjs'],
      experimentalSourceObserverIslandRecordsToArrays:true
    });
    const emitted=result.files.find(file=>file.path==='independent.mjs');
    assert.ok(emitted);
    assert.equal(emitted.metrics.objects,1);
    assert.equal(emitted.metrics.properties,2);
    assert.match(String(emitted.code),/const recordB=\[\d+,\d+\];const valueB=recordB\[\d+\];/);
    assert.doesNotMatch(String(emitted.code),/privateB|otherB/);
    const attacker=normalizePublicIsland(String(emitted.code));
    assert.equal(attacker.properties,0);
    assert.equal(attacker.code,String(emitted.code));

    const transformed=await executeEsm([...result.files,probe]);
    assert.equal(transformed,original);
    assert.deepEqual(JSON.parse(transformed),{
      watched:'function watched(){return valueA;}',
      unrelated:'function unrelated(){return valueB;}',
      value:23
    });
  }
});

test('core tuple mode requires explicit proved islands and property transforms',()=>{
  assert.throws(()=>obfuscateFiles([watched,independent,observer],{
    mode:'coo',closedWorld:true,seed:'missing-island',strings:false,
    experimentalSourceObserverIslandRecordsToArrays:true
  }),/require at least one proved source observer island/);
  assert.throws(()=>obfuscateFiles([watched,independent,observer],{
    mode:'coo',closedWorld:true,seed:'properties-disabled',strings:false,
    properties:false,
    experimentalSourceObserverIslands:['independent.mjs'],
    experimentalSourceObserverIslandRecordsToArrays:true
  }),/require properties to be enabled/);
});
