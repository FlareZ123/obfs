'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reader-binding-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    await atomicWrite(path.join(root,'host-probe.mjs'),[
      'import {result} from "./entry.mjs";',
      'import {calculate} from "./state.mjs";',
      'process.stdout.write(JSON.stringify([result,Function.prototype.toString.call(calculate)]));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'host-probe.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('private readers with same-spelled parameters and locals remain binding-distinct',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'function make(){return {secretAlpha:23,secretBeta:19};}',
      'const privateRecord=make();',
      'function readAlpha(owner){const value=owner.secretAlpha;return value;}',
      'function readBeta(owner){const value=owner.secretBeta;return value;}',
      'export function calculate(){return readAlpha(privateRecord)+readBeta(privateRecord);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {calculate} from "./state.mjs";',
      'export const result=calculate();'
    ].join('\n')}
  ];
  const native=await runEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'binding-identity-'+mode,strings:false,identifiers:false});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be retained');
    assert.equal(state.metrics.objects,1,mode+': factory-produced object must be proven');
    assert.equal(state.metrics.properties,2,mode+': both distinct reader bindings must be rewritten');
    assert.doesNotMatch(state.code,/secretAlpha|secretBeta/u,
      mode+': original keys must not remain in factory or readers');
    assert.equal(JSON.parse(await runEsm(transformed.files))[0],JSON.parse(native)[0],
      mode+': runtime result must match');
  }
});

test('private reader refuses when any call site supplies an untracked owner',()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23};',
      'function readAlpha(owner){return owner.secretAlpha;}',
      'export function calculate(externalOwner){return readAlpha(privateRecord)+readAlpha(externalOwner);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {calculate} from "./state.mjs";',
      'export const result=calculate({secretAlpha:5});'
    ].join('\n')}
  ];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'binding-negative-'+mode,strings:false,identifiers:false});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be retained');
    assert.equal(state.metrics.objects,0,mode+': mixed tracked/untracked calls must refuse the object');
    assert.equal(state.metrics.properties,0,mode+': mixed tracked/untracked calls must refuse all keys');
  }
});


/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runClassEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-class-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    await atomicWrite(path.join(root,'host-probe.mjs'),[
      'import {result} from "./entry.mjs";',
      'import {Reader} from "./state.mjs";',
      'process.stdout.write(JSON.stringify([result,Function.prototype.toString.call(Reader)]));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'host-probe.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('block-scoped reader nested in exported class static block remains conservatively unproven',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23};',
      'export class Reader {',
      '  static {',
      '    function readAlpha(owner){return owner.secretAlpha;}',
      '    this.value=readAlpha(privateRecord);',
      '  }',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {Reader} from "./state.mjs";',
      'export const result=Reader.value;'
    ].join('\n')}
  ];
  const native=await runClassEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'class-private-reader-'+mode,strings:false,identifiers:false});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be retained');
    assert.equal(state.metrics.objects,0,mode+': class-contained reader must not be treated as a private source island');
    assert.equal(state.metrics.properties,0,mode+': block-scoped reader remains unproven');
    assert.equal(JSON.parse(await runClassEsm(transformed.files))[0],JSON.parse(native)[0],
      mode+': runtime result must match');
  }
});


/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runExportedReaderEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    await atomicWrite(path.join(root,'host-probe.mjs'),[
      'import {result} from "./entry.mjs";',
      'import {readAlpha} from "./state.mjs";',
      'process.stdout.write(JSON.stringify([result,Function.prototype.toString.call(readAlpha)]));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'host-probe.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('exported generic reader remains unrenamed for arbitrary-owner API semantics',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23};',
      'export function readAlpha(owner){return owner.secretAlpha;}',
      'export function calculate(){return readAlpha(privateRecord);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {calculate} from "./state.mjs";',
      'export const result=calculate();'
    ].join('\n')}
  ];
  const native=await runExportedReaderEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'exported-reader-'+mode,strings:false,identifiers:false});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be retained');
    assert.equal(state.metrics.objects,0,mode+': an inline-exported reader must not be treated as private');
    assert.equal(state.metrics.properties,0,mode+': generic exported reader must retain its original property contract');
    assert.equal(JSON.parse(await runExportedReaderEsm(transformed.files))[0],JSON.parse(native)[0],
      mode+': runtime result must match');
  }
});


test('module-private reader can serve exported class static block without changing class source',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23};',
      'function readAlpha(owner){return owner.secretAlpha;}',
      'export class Reader {',
      '  static {',
      '    this.value=readAlpha(privateRecord);',
      '  }',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {Reader} from "./state.mjs";',
      'export const result=Reader.value;'
    ].join('\n')}
  ];
  const native=await runClassEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'class-private-reader-positive-'+mode,strings:false,identifiers:false});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be retained');
    assert.equal(state.metrics.objects,1,mode+': private owner must be proven');
    assert.equal(state.metrics.properties,1,mode+': private reader key must be rewritten');
    assert.doesNotMatch(state.code,/secretAlpha/u,
      mode+': original private key must not remain in the module');
    assert.equal(JSON.parse(await runClassEsm(transformed.files))[0],JSON.parse(native)[0],
      mode+': runtime result must match');
  }
});


test('directly-invoked class-field arrow is rewritten and exposes transformed source to host',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23};',
      'export class Reader {',
      '  static value=(()=>privateRecord.secretAlpha)();',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {Reader} from "./state.mjs";',
      'export const result=Reader.value;'
    ].join('\n')}
  ];
  const native=await runClassEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'class-field-arrow-'+mode,strings:false,identifiers:false});
    const state=transformed.files.find(file=>file.path==='state.mjs');
    assert.ok(state,mode+': state module must be retained');
    assert.equal(state.metrics.objects,1,mode+': closed-over private object must be proven');
    assert.equal(state.metrics.properties,1,mode+': class-field private key must be rewritten');
    assert.doesNotMatch(state.code,/secretAlpha/u,mode+': original key must not remain in transformed module');
    const baseline=JSON.parse(native);
    const actual=JSON.parse(await runClassEsm(transformed.files));
    assert.equal(actual[0],baseline[0],mode+': runtime result must match');
    assert.notEqual(actual[1],baseline[1],mode+': hostile host should observe transformed class source');
    assert.doesNotMatch(actual[1],/secretAlpha/u,mode+': host-visible class source must not reveal original key');
  }
});
