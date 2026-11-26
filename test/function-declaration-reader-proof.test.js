'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');
const {transformSync}=require('esbuild');
const {normalizePublicIsland}=require('../sims/source-island-public-normalizer');
const {original:hotReaderFixture}=require('../sims/straightline-reader-profile');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @param {string} code @returns {unknown} */
function runCommonJs(code){
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return context.module.exports;
}

/**
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function runEsm(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-function-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('local direct function declarations consume owned fields without changing results',()=>{
  const original=[
    'const root={secretAlpha:23,secretBeta:7};',
    'function first(ownerAlpha){return ownerAlpha.secretAlpha;}',
    'function second(ownerBeta){return ownerBeta.secretBeta;}',
    'module.exports=[first(root)+second(root),first(root),second(root)];'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    for(const seed of ['declaration-reader-A','declaration-reader-B']){
      const prepared=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
        mode,seed,strings:false,identifiers:false
      }).files[0];
      assert.equal(prepared.metrics.objects,1,mode+': exactly one locally-owned record');
      assert.equal(prepared.metrics.properties,2,mode+': both local member keys rewritten');
      assert.deepEqual(JSON.stringify(runCommonJs(prepared.code)),
        JSON.stringify(runCommonJs(original)));
      assert.doesNotMatch(String(prepared.code),/secretAlpha|secretBeta/u);
    }
  }
});

test('cross-module native ESM graph preserves direct named declaration reader calls',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'owner.mjs',sourceType:'module',code:[
      'const privateRecord={secretAlpha:23,secretBeta:7};',
      'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
      'function readBeta(ownerBeta){return ownerBeta.secretBeta;}',
      'export function calculate(k){return k*readAlpha(privateRecord)+readBeta(privateRecord);}'
    ].join('\n')},
    {path:'api.mjs',sourceType:'module',code:[
      'import {calculate} from "./owner.mjs";',
      'export function execute(k){return calculate(k)+calculate(k+1);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {execute} from "./api.mjs";',
      'process.stdout.write(JSON.stringify([execute(0),execute(1),execute(13)]));'
    ].join('\n')}
  ];
  const native=await runEsm(files);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const transformed=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'declaration-reader-esm-'+mode,strings:false,identifiers:false});
    const selected=transformed.files.find(f=>f.path==='owner.mjs');
    assert.ok(selected&&selected.metrics.properties===2,
      mode+': two actually rewritten keys in the declared owner');
    assert.equal(await runEsm(transformed.files),native);
  }
});

test('ESM private readers remain unrenamed when exported, escaped, optional, mixed-owner or source-observed',async()=>{
  /** @type {Array<{name:string,files:SourceFile[]}>} */
  const cases=[
    {
      name:'re-exported helper',
      files:[
        {path:'owner.mjs',sourceType:'module',code:[
          'const privateRecord={secretAlpha:23};',
          'export function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
          'export function calculate(k){return k*readAlpha(privateRecord);}'
        ].join('\\n')},
        {path:'barrel.mjs',sourceType:'module',code:'export {readAlpha} from "./owner.mjs";'},
        {path:'api.mjs',sourceType:'module',code:[
          'import {calculate} from "./owner.mjs";',
          'export {readAlpha} from "./barrel.mjs";',
          'export function execute(k){return calculate(k);}'
        ].join('\\n')},
        {path:'entry.mjs',sourceType:'module',code:[
          'import {execute,readAlpha} from "./api.mjs";',
          'process.stdout.write(JSON.stringify([execute(2),readAlpha({secretAlpha:5})]));'
        ].join('\\n')}
      ]
    },
    {
      name:'helper aliased and stored',
      files:[
        {path:'owner.mjs',sourceType:'module',code:[
          'const privateRecord={secretAlpha:23};',
          'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
          'const alias=readAlpha;',
          'export function calculate(k){return k*alias(privateRecord);}'
        ].join('\\n')},
        {path:'api.mjs',sourceType:'module',code:[
          'import {calculate} from "./owner.mjs";',
          'export function execute(k){return calculate(k);}'
        ].join('\\n')},
        {path:'entry.mjs',sourceType:'module',code:[
          'import {execute} from "./api.mjs";',
          'process.stdout.write(String(execute(2)));'
        ].join('\\n')}
      ]
    },
    {
      name:'helper passed to opaque callback',
      files:[
        {path:'owner.mjs',sourceType:'module',code:[
          'const privateRecord={secretAlpha:23};',
          'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
          'function capture(reader){globalThis.__capturedReader=reader;}',
          'capture(readAlpha);',
          'export function calculate(k){return k*readAlpha(privateRecord);}'
        ].join('\\n')},
        {path:'api.mjs',sourceType:'module',code:[
          'import {calculate} from "./owner.mjs";',
          'export function execute(k){return calculate(k);}'
        ].join('\\n')},
        {path:'entry.mjs',sourceType:'module',code:[
          'import {execute} from "./api.mjs";',
          'process.stdout.write(String(execute(2)));'
        ].join('\\n')}
      ]
    },
    {
      name:'optional helper call',
      files:[
        {path:'owner.mjs',sourceType:'module',code:[
          'const privateRecord={secretAlpha:23};',
          'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
          'export function calculate(k){return k*(readAlpha?.(privateRecord)??0);}'
        ].join('\\n')},
        {path:'api.mjs',sourceType:'module',code:[
          'import {calculate} from "./owner.mjs";',
          'export function execute(k){return calculate(k);}'
        ].join('\\n')},
        {path:'entry.mjs',sourceType:'module',code:[
          'import {execute} from "./api.mjs";',
          'process.stdout.write(String(execute(2)));'
        ].join('\\n')}
      ]
    },
    {
      name:'mixed tracked and imported owner arguments',
      files:[
        {path:'external.mjs',sourceType:'module',code:'export const externalOwner={secretAlpha:13};'},
        {path:'owner.mjs',sourceType:'module',code:[
          'import {externalOwner} from "./external.mjs";',
          'const privateRecord={secretAlpha:23};',
          'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
          'export function calculate(k){return k*readAlpha(privateRecord)+readAlpha(externalOwner);}'
        ].join('\\n')},
        {path:'api.mjs',sourceType:'module',code:[
          'import {calculate} from "./owner.mjs";',
          'export function execute(k){return calculate(k);}'
        ].join('\\n')},
        {path:'entry.mjs',sourceType:'module',code:[
          'import {execute} from "./api.mjs";',
          'process.stdout.write(String(execute(2)));'
        ].join('\\n')}
      ]
    },
    {
      name:'direct helper source observation',
      files:[
        {path:'owner.mjs',sourceType:'module',code:[
          'const privateRecord={secretAlpha:23};',
          'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
          'const observedSource=readAlpha.toString();',
          'export function calculate(k){return k*readAlpha(privateRecord)+observedSource.length*0;}'
        ].join('\\n')},
        {path:'api.mjs',sourceType:'module',code:[
          'import {calculate} from "./owner.mjs";',
          'export function execute(k){return calculate(k);}'
        ].join('\\n')},
        {path:'entry.mjs',sourceType:'module',code:[
          'import {execute} from "./api.mjs";',
          'process.stdout.write(String(execute(2)));'
        ].join('\\n')}
      ]
    }
  ];
  for(const item of cases){
    const native=await runEsm(item.files);
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const transformed=obfuscateFiles(item.files,{mode,closedWorld:true,
        seed:'esm-private-reader-refusal-'+mode+'-'+item.name,strings:false,identifiers:false});
      const owner=transformed.files.find(file=>file.path==='owner.mjs');
      assert.ok(owner,item.name+': owner module must be retained');
      assert.equal(owner.metrics.objects,0,mode+'/'+item.name+': owner must remain unrenamed');
      assert.equal(owner.metrics.properties,0,mode+'/'+item.name+': source-observed/escaped reader must retain its key');
      assert.equal(await runEsm(transformed.files),native,mode+'/'+item.name+': native ESM output parity');
    }
  }
});

test('immutable two-statement helper expressions can safely consume owned fields',()=>{
  const variants=[
    'const read=(incoming)=>{const value=incoming.secretAlpha;return value;};',
    'const read=function(incoming){const value=incoming.secretAlpha;return value;};'
  ];
  for(const declaration of variants){
    const source='const root={secretAlpha:23};'+declaration+'module.exports=read(root);';
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'immutable-reader-'+mode,strings:false,identifiers:false
      }).files[0];
      assert.equal(result.metrics.objects,1,mode+': local immutable helper object');
      assert.equal(result.metrics.properties,1,mode+': proven own field');
      assert.equal(runCommonJs(result.code),23);
    }
  }
});

test('name-only scope proof conservatively declines duplicate formal spellings',()=>{
  const source='const root={secretAlpha:23};'+
    'function first(owner){return owner.secretAlpha;}'+
    'function second(owner){return owner.secretAlpha;}'+
    'module.exports=[first(root),second(root)];';
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'duplicate-formal-'+mode,strings:false,identifiers:false
    }).files[0];
    assert.equal(result.metrics.objects,0);
    assert.equal(JSON.stringify(runCommonJs(result.code)),JSON.stringify(runCommonJs(source)));
  }
});

test('readers must decline when one helper also consumes an unproved external owner',()=>{
  const source=[
    'const root={secretAlpha:23};',
    'function read(owner){return owner.secretAlpha;}',
    'const external={secretAlpha:13};',
    'module.exports=[read(root),read(external)];'
  ].join('\n');
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'declaration-reader-unproved-'+mode,strings:false,identifiers:false
    }).files[0];
    assert.equal(result.metrics.objects,0);
    assert.equal(JSON.stringify(runCommonJs(result.code)),JSON.stringify(runCommonJs(source)));
  }
});

test('public-only source normalization retains a functional clone beside an ordinary minifier',()=>{
  const published=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',
    code:hotReaderFixture}],{
    mode:'coo',seed:'public-helper-normalization',strings:false,identifiers:false
  }).files[0];
  assert.equal(published.metrics.properties,1);
  const normalized=normalizePublicIsland(String(published.code));
  assert.equal(normalized.properties,1,'Seedless attacker must find the selected public field');
  assert.notEqual(normalized.code,published.code);
  const minified=transformSync(hotReaderFixture,{
    loader:'js',format:'cjs',target:'node22',minify:true
  }).code;
  const variants=[
    runCommonJs(hotReaderFixture),runCommonJs(minified),
    runCommonJs(String(published.code)),runCommonJs(normalized.code)
  ];
  for(const variant of variants)assert.equal(typeof variant,'function');
  const functions=/** @type {Array<(value:number)=>number>} */(variants);
  for(let input=-256;input<=256;input++){
    const expected=functions[0](input);
    for(const fn of functions.slice(1))assert.equal(fn(input),expected);
  }
  console.log('IMMUTABLE_READER_PUBLIC_NORMALIZER '+JSON.stringify({
    observedInputCount:513,privateFieldsFound:normalized.properties,
    nativeBytes:Buffer.byteLength(hotReaderFixture),
    minifiedBytes:Buffer.byteLength(minified),
    generatedBytes:Buffer.byteLength(String(published.code)),
    sourceOnlyNormalizedBytes:Buffer.byteLength(normalized.code),
    matchedFunctionalClones:3
  }));
});

test('source-observed callers only transfer owners to exact private member readers',()=>{
  const unsafe=[
    [
      'const root={secretAlpha:23};',
      'function read(owner){const value=owner.secretAlpha;notify(value);return value;}',
      'function notify(observed){return observed;}',
      'const calculate=function calculate(){return read(root);};',
      'module.exports={calculate,result:calculate()};'
    ].join('\n'),
    [
      'const root={secretAlpha:23};',
      'const read=(owner)=>{const value=owner.secretAlpha;notify(value);return value;};',
      'function notify(observed){return observed;}',
      'const calculate=function calculate(){return read(root);};',
      'module.exports={calculate,result:calculate()};'
    ].join('\n'),
    [
      'const root={secretAlpha:23};',
      'function identity(owner){return owner;}',
      'const calculate=function calculate(){return identity(root).secretAlpha;};',
      'module.exports={calculate,result:calculate()};'
    ].join('\n'),
    [
      'const root={secretAlpha:23};',
      'function read(ignored,owner){return owner.secretAlpha;}',
      'const calculate=function calculate(){return read(root,root);};',
      'module.exports={calculate,result:calculate()};'
    ].join('\n'),
    [
      'const root={secretAlpha:23};',
      'function read(owner){return owner.secretAlpha;}',
      'const calculate=function calculate(){return read?.(root);};',
      'module.exports={calculate,result:calculate()};'
    ].join('\n')
  ];
  for(const source of unsafe)for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'observed-caller-refusal-'+mode,strings:false,identifiers:false
    }).files[0];
    assert.equal(result.metrics.objects,0,mode+': non-reader transfer must retain original keys');
    assert.deepEqual(JSON.stringify(runCommonJs(result.code)),
      JSON.stringify(runCommonJs(source)));
  }
});

test('source-observed and escaped declaration readers preserve their original source',()=>{
  const unsafe=[
    'const root={secretAlpha:23};function read(owner){return owner.secretAlpha;}' +
      'module.exports=[read(root),read.toString()];',
    'const root={secretAlpha:23};function read(owner){return owner.secretAlpha;}' +
      'module.exports={read,value:read(root)};'
  ];
  for(const source of unsafe)for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'declaration-reader-escape-'+mode,strings:false,identifiers:false
    }).files[0];
    assert.equal(result.metrics.objects,0,mode+': escaped function proof must decline');
  }
});
