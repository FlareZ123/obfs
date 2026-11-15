'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');
const {buildSample}=require('../examples/factory-cross-file/build-sample.cjs');

/**
 * @param {string} state
 * @param {string} entry
 * @returns {ReturnType<typeof obfuscateFiles>}
 */
function compile(state,entry){
  return obfuscateFiles([
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ],{mode:'coo',seed:'factory-cross-file-test',closedWorld:true,strings:false,identifiers:false});
}

/** @param {ReturnType<typeof obfuscateFiles>['files']} files @returns {Promise<string>} */
async function execute(files) {
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-graph-'));
  try {
    for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
      encoding:'utf8',timeout:7000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout.trim();
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

const mainEntry='import {shared} from "./state.mjs";console.log(shared.secretField+shared.otherField);';
for(const factory of [
  'function make(){return {secretField:17,otherField:5};}',
  'const make=()=>({secretField:17,otherField:5});',
  'const make=function privateMake(){return {secretField:17,otherField:5};};'
]) {
  test('closed-world ESM rewrites exported owner from single private factory: '+factory.slice(0,38),async()=>{
    const state=factory+'export const shared=make();';
    const originals=[
      {path:'state.mjs',sourceType:/** @type {'module'} */ ('module'),code:state},
      {path:'entry.mjs',sourceType:/** @type {'module'} */ ('module'),code:mainEntry}
    ];
    const transformed=compile(state,mainEntry);
    assert.equal(transformed.crossFile.objects,1);
    assert.equal(transformed.crossFile.properties,2);
    assert.doesNotMatch(String(transformed.files[0].code),/secretField|otherField/u);
    assert.doesNotMatch(String(transformed.files[1].code),/secretField|otherField/u);
    assert.equal(await execute(originals),'22');
    assert.equal(await execute(transformed.files),'22');
    const neutralized=normalizeDistributedFiles(transformed.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    })));
    assert.equal(neutralized.properties,2);
    assert.equal(await execute(neutralized.files),'22');
  });
}

for(const expression of [
  '(()=>({secretField:17,otherField:5}))()',
  '(function privateMaker(){return {secretField:17,otherField:5};})()'
]) {
  test('closed-world exported owner from immediately invoked private literal factory: '+expression.slice(0,38),async()=>{
    const state='export const shared='+expression+';';
    const output=compile(state,mainEntry);
    assert.equal(output.crossFile.objects,1);
    assert.equal(output.crossFile.properties,2);
    assert.doesNotMatch(String(output.files[0].code),/secretField|otherField/u);
    assert.doesNotMatch(String(output.files[1].code),/secretField|otherField/u);
    const inputs=[
      {path:'state.mjs',sourceType:/** @type {'module'} */ ('module'),code:state},
      {path:'entry.mjs',sourceType:/** @type {'module'} */ ('module'),code:mainEntry}
    ];
    assert.equal(await execute(inputs),'22');
    assert.equal(await execute(output.files),'22');
    const neutralized=normalizeDistributedFiles(output.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    })));
    assert.equal(neutralized.properties,2);
    assert.equal(await execute(neutralized.files),'22');
  });
}

for(const [description,state,entry] of [
  ['exported factory', 'function make(){return {secretField:17};}export {make};export const shared=make();',
    'import {shared} from "./state.mjs";console.log(shared.secretField);'],
  ['second factory call', 'function make(){return {secretField:17};}const extra=make();export const shared=make();',
    'import {shared} from "./state.mjs";console.log(shared.secretField);'],
  ['dynamic external key', 'function make(){return {secretField:17};}export const shared=make();',
    'import {shared} from "./state.mjs";const key="secretField";console.log(shared[key]);'],
  ['reflection', 'function make(){return {secretField:17};}export const shared=make();',
    'import {shared} from "./state.mjs";console.log(Object.keys(shared).join(","));'],
  ['namespace consumer', 'function make(){return {secretField:17};}export const shared=make();',
    'import * as namespace from "./state.mjs";console.log(namespace.shared.secretField);'],
  ['optional factory invocation', 'function make(){return {secretField:17};}export const shared=make?.();',
    'import {shared} from "./state.mjs";console.log(shared.secretField);']
]) {
  test('cross-file private factory proof declines '+description,()=>{
    const result=compile(state,entry);
    assert.equal(result.crossFile.objects,0,description);
    assert.equal(result.crossFile.properties,0,description);
  });
}

test('private factory with imported reader preserves its receiver contract',async()=>{
  const state='function make(){return {secretField:17,otherField:5};}'+
    'export const shared=make();export function read(x){return x.secretField;}';
  const entry='import {shared,read} from "./state.mjs";console.log(read(shared)+shared.otherField);';
  const result=compile(state,entry);
  assert.equal(result.crossFile.objects,1);
  assert.equal(result.crossFile.properties,2);
  assert.doesNotMatch(String(result.files[0].code),/secretField|otherField/u);
  assert.equal(await execute(result.files),'22');
});

test('cross-file generated sample is reproducible and semantically equivalent',async()=>{
  const output=await buildSample(true);
  assert.equal(output.crossFile.objects,1);
  const dir=path.join(__dirname,'../examples/factory-cross-file');
  /** @param {'before'|'after'} which @returns {Promise<ReturnType<typeof obfuscateFiles>['files']>} */
  async function readFiles(which){
    return Promise.all(['state.mjs','entry.mjs'].map(async name=>({
      path:name,sourceType:/** @type {'module'} */ ('module'),
      code:await fs.readFile(path.join(dir,which,name),'utf8')
    })));
  }
  assert.equal(await execute(await readFiles('before')),'22');
  assert.equal(await execute(await readFiles('after')),'22');
});
