#!/usr/bin/env node
'use strict';
/**
 * Independent native oracle for the WeakMap/Storage source-observation matrix.
 * It never loads the obfuscator. A literal bind-name mutation must change the
 * native DOMString-captured function source iff the setup selected the native
 * WeakMap.prototype. Numeric behavior must be identical across the mutation.
 *
 * Run: node sims/agent2-native-source-oracle.cjs --matrix test/agent3-weakmap-cfg-matrix.test.js
 * Or:  node sims/agent2-native-source-oracle.cjs --cases-json path/to/cases.json
 *
 * --matrix evaluates only the trusted test's literal const cases=[...] slice
 * in a restricted VM with a deadline, without executing its test imports.
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');

/** @typedef {[name:string,setup:string,access:string]} Case */
/** @param {string} filename @returns {Case[]} */
function loadCases(filename) {
  if(filename.endsWith('.json')) {
    const data=JSON.parse(fs.readFileSync(filename,'utf8'));
    assert.ok(Array.isArray(data));
    return data.map(row=>[row[0],row[1],typeof row[2]==='string'?row[2]:'carrier.instance']);
  }
  const source=fs.readFileSync(filename,'utf8');
  const first=source.indexOf('const cases=[');
  const last=source.indexOf('\nconst tail=',first);
  assert.ok(first>=0&&last>first,'expected trusted literal const cases=[...] matrix');
  const data=vm.runInNewContext(source.slice(first,last)+'\n cases;',{}, {timeout:2000});
  assert.ok(Array.isArray(data));
  assert.ok(data.every(row=>Array.isArray(row)&&row.length===3&&
    typeof row[0]==='string'&&typeof row[1]==='string'&&typeof row[2]==='string'),
    'each matrix row must be a complete name/setup/access tuple');
  return data.map(row=>[row[0],row[1],row[2]]);
}
const STORAGE=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');
const RUNNER=[
  'class Storage{constructor(){this.data=new Map();}setItem(k,v){this.data.set(String(k),String(v));}}',
  'globalThis.Storage=Storage;globalThis.localStorage=new Storage();',
  'let title="";globalThis.document={};',
  'Object.defineProperty(document,"title",{get(){return title;},set(v){title=String(v);}});',
  'Math.random=()=>0.25;',
  'const {nativeShared}=await import("./mutate.mjs");',
  'const {sample}=await import("./storage.mjs");',
  'process.stdout.write(JSON.stringify({nativeShared,result:sample(),capturedSource:document.title}));'
].join('\n');
/**
 * @param {string} setup
 * @param {string} access
 * @param {boolean} rename
 * @returns {{nativeShared:boolean,result:{value:number,independent:number},capturedSource:string}}
 */
function run(setup,access,rename) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-native-source-oracle-'));
  try {
    const mutate=[
      setup,
      'const nativePrototype=Object.getPrototypeOf('+access+');',
      'export const nativeShared=nativePrototype===WeakMap.prototype;',
      'const nativeSet=nativePrototype.set;',
      'nativePrototype.set=function(key,value){document.title=value;return Reflect.apply(nativeSet,this,[key,value]);};'
    ].join('\n');
    fs.writeFileSync(path.join(dir,'mutate.mjs'),mutate);
    fs.writeFileSync(path.join(dir,'storage.mjs'),rename?
      STORAGE.replaceAll('privateLocal','renamedPrivateLocal'):STORAGE);
    fs.writeFileSync(path.join(dir,'runner.mjs'),RUNNER);
    const child=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      encoding:'utf8',timeout:12000,maxBuffer:1024*1024
    });
    assert.equal(child.status,0,child.stderr||'native process failed: '+child.signal);
    return JSON.parse(child.stdout);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
function main() {
  const args=process.argv.slice(2);
  assert.equal(args.length,2,'pass --matrix <test-file> or --cases-json <json-file>');
  assert.ok(['--matrix','--cases-json'].includes(args[0]));
  const rows=loadCases(path.resolve(args[1]));
  let positive=0,negative=0;
  const mismatches=[];
  for(const [name,setup,access] of rows) {
    const original=run(setup,access,false);
    const mutated=run(setup,access,true);
    assert.deepEqual(mutated.result,original.result,'numeric values changed: '+name);
    assert.equal(mutated.nativeShared,original.nativeShared,'native prototype changed: '+name);
    const changed=original.capturedSource!==mutated.capturedSource;
    if(changed!==original.nativeShared)
      mismatches.push({name,nativeShared:original.nativeShared,changed});
    if(original.nativeShared)positive++;else negative++;
  }
  assert.deepEqual(mismatches,[],'source mutation witness mismatches');
  console.log('NATIVE_SOURCE_METAMORPHIC '+JSON.stringify({
    node:process.version,cases:rows.length,positive,negative,sourceMismatches:0
  }));
}
main();
