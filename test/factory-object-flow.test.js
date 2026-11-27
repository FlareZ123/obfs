'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {neutralizeHashedNames}=require('../sims/offline-normalize');
const {buildSample}=require('../examples/factory-ownership/build-sample.cjs');

/** @param {string} source @returns {string} */
function run(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} code
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(code,mode){
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode,seed:'factory-own-fields-v1',identifiers:false,strings:false
  }).files[0];
}

const positive=[
  'function make(){return {secretField:17,otherField:[3,5]};}',
  'const owner=make();',
  'const alias=owner;',
  'const {secretField:captured}=alias;',
  'module.exports=[captured,alias.otherField[1]];'
].join('');

test('single-use private factory returns a renamable object with aliases and destructuring',()=>{
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const result=compile(positive,mode);
    assert.equal(result.metrics.objects,1,mode);
    assert.equal(result.metrics.properties,2,mode);
    assert.doesNotMatch(String(result.code),/secretField|otherField/u);
    assert.equal(run(String(result.code)),run(positive));
    const attacked=neutralizeHashedNames([{
      path:'entry.cjs',sourceType:'commonjs',code:String(result.code)
    }]);
    assert.equal(attacked.properties,2);
    assert.equal(run(attacked.files[0].code),run(positive));
  }
});

for(const factory of [
  'const make=()=>({secretField:17,otherField:[3,5]});',
  'const make=()=>{return {secretField:17,otherField:[3,5]};};',
  'const make=function privateFactory(){return {secretField:17,otherField:[3,5]};};'
]) {
  test('immutable expression factory retains exact own-field behavior: '+factory.slice(0,42),()=>{
    const source=factory+'const owner=make();const alias=owner;'+
      'module.exports=[alias.secretField,alias.otherField[1]];';
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const result=compile(source,mode);
      assert.equal(result.metrics.objects,1,mode);
      assert.equal(result.metrics.properties,2,mode);
      assert.doesNotMatch(String(result.code),/secretField|otherField/u);
      assert.equal(run(String(result.code)),run(source));
    }
  });
}

test('refuse escaped or mutable expression factories',()=>{
  for(const source of [
    'const make=()=>({secretField:17});const owner=make();const leaked=make;module.exports=[owner.secretField,typeof leaked];',
    'let make=()=>({secretField:17});const owner=make();module.exports=owner.secretField;',
    'const make=()=>({secretField:17});const owner=make.call(null);module.exports=owner.secretField;'
  ]){
    const result=compile(source,'sno');
    assert.equal(result.metrics.objects,0);
    assert.equal(run(String(result.code)),run(source));
  }
});

for(const expression of [
  '(()=>({secretField:17,otherField:[3,5]}))()',
  '(function(){return {secretField:17,otherField:[3,5]};})()',
  '(function ephemeral(){return {secretField:17,otherField:[3,5]};})()'
]) {
  test('single-use immediately invoked factory owns a safe literal: '+expression.slice(0,43),()=>{
    const source='const owner='+expression+';const alias=owner;'+
      'module.exports=[alias.secretField,alias.otherField[1]];';
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const result=compile(source,mode);
      assert.equal(result.metrics.objects,1,mode);
      assert.equal(result.metrics.properties,2,mode);
      assert.doesNotMatch(String(result.code),/secretField|otherField/u);
      assert.equal(run(String(result.code)),run(source));
    }
  });
}

for(const expression of [
  '(async()=>({secretField:17}))()',
  '((x)=>({secretField:17}))(0)',
  '(()=>{const value=17;return {secretField:value};})()',
  '(()=>({secretField:17}))?.()'
]) {
  test('immediately invoked unproved factory shape declines: '+expression,()=>{
    const source='const owner='+expression+';module.exports=owner.secretField;';
    const result=compile(source,'sno');
    assert.equal(result.metrics.objects,0);
  });
}

const refused=[
  ['repeated calls', 'const second=make();module.exports=[owner.secretField,Object.keys(second)];'],
  ['exported factory', 'module.exports=[owner.secretField,make];'],
  ['factory alias', 'const copy=make;module.exports=[owner.secretField,copy===make];'],
  ['runtime key', 'const key="secretField";module.exports=owner[key];'],
  ['reflection', 'module.exports=Object.keys(owner).join(",");'],
  ['owner escape', 'module.exports=owner;'],
  ['source observation', 'module.exports=[owner.secretField,make.toString()];']
];
for(const [label,ending] of refused){
  test('refuse factory property rewriting: '+label,()=>{
    const source='function make(){return {secretField:17};}const owner=make();'+ending;
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const result=compile(source,mode);
      assert.equal(result.metrics.objects,0,mode+'/'+label);
      assert.equal(run(String(result.code)),run(source),mode+'/'+label);
    }
  });
}
test('single-use factory primitive arithmetic is renameable with exact native behavior',()=>{
  const source='function make(){return {secretField:(12+5)};}'+
    'const owner=make();module.exports=owner.secretField;';
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const output=compile(source,mode);
    assert.equal(output.metrics.objects,1,mode);
    assert.equal(output.metrics.properties,1,mode);
    assert.doesNotMatch(String(output.code),/secretField/u);
    assert.equal(run(String(output.code)),run(source),mode);
  }
});

for(const source of [
  'function make(){return {secretField:(1n/0n)};}const owner=make();module.exports=owner.secretField;',
  'function make(){return {...{secretField:17}};}const owner=make();module.exports=owner.secretField;',
  'function make(){const marker=1;return {secretField:marker};}const owner=make();module.exports=owner.secretField;',
  'function make(x){return {secretField:17};}const owner=make();module.exports=owner.secretField;',
  'function make(){return {get secretField(){return 17}};}const owner=make();module.exports=owner.secretField;'
]) {
  test('refuse unproved factory body: '+source.slice(0,54),()=>{
    const output=compile(source,'sno');
    assert.equal(output.metrics.objects,0);
    if(!source.includes('1n/0n'))
      assert.equal(run(String(output.code)),run(source));
    else assert.equal(output.code,source,
      'Potentially throwing BigInt constant arithmetic must remain unchanged');
  });
}

test('exported factory in ESM remains public and its object shape unchanged',()=>{
  const code='export function make(){return {secretField:17};}const owner=make();export const result=owner.secretField;';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code}],{
    mode:'coo',seed:'exported-factory',identifiers:false,strings:false
  });
  assert.equal(output.files[0].metrics.objects,0);
  assert.equal(output.files[0].code,code);
});

test('generated factory sample is byte exact and static labels remain reversible',async()=>{
  const generated=await buildSample(true);
  const original=await fs.readFile(path.join(__dirname,'../examples/factory-ownership/before.cjs'),'utf8');
  assert.equal(run(generated),run(original));
  const attacked=neutralizeHashedNames([{path:'factory.cjs',sourceType:'commonjs',code:generated}]);
  assert.equal(attacked.properties,2);
  assert.equal(run(attacked.files[0].code),run(original));
});

test('private ESM factory preserves two-file native Node execution',async()=>{
  const input=[
    {path:'state.mjs',sourceType:'module',code:
      'function make(){return {secretField:17,otherField:5};}const owner=make();export function read(){return owner.secretField+owner.otherField;}'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {read} from "./state.mjs";console.log(read());'}
  ];
  const transformed=obfuscateFiles(input,{
    mode:'coo',closedWorld:true,seed:'factory-cross-module-run',
    identifiers:false,strings:false
  });
  assert.equal(transformed.files[0].metrics.objects,1);
  assert.equal(transformed.files[0].metrics.properties,2);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-'));
  try {
    /** @param {typeof input | ReturnType<typeof obfuscateFiles>['files']} files @returns {Promise<string>} */
    async function execute(files){
      for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
        encoding:'utf8',timeout:7000
      });
      assert.equal(result.status,0,result.stderr);
      return result.stdout.trim();
    }
    assert.equal(await execute(input),'22');
    assert.equal(await execute(transformed.files),'22');
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
});


test('in-program source observation blocks an exported closure-owner rewrite',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'const owner={secretField:17};export function read(){return owner.secretField;}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {read} from "./state.mjs";console.log(Function.prototype.toString.call(read));'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'exported-closure-source-observer',
    identifiers:false,strings:false
  });
  assert.equal(output.crossFile.properties,0);
  assert.match(output.files.find(file=>file.path==='state.mjs').code,/secretField/);
});

test('without a closed-world assertion, exported generic readers keep public owner shapes',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17};export function read(owner){return owner.secretField;}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state,read} from "./state.mjs";console.log(read(state));'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:false,seed:'exported-generic-reader-open-world',
    identifiers:false,strings:false
  });
  assert.equal(output.crossFile.properties,0);
  assert.match(output.files.find(file=>file.path==='state.mjs').code,/secretField/);
});
