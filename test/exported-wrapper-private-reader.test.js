'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Observe the exported wrapper from outside the declared module graph.
 * The wrapper's native Function#toString is part of the preserved public
 * interface; its private direct-reader helper is intentionally not exported.
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{source:string,values:number[]}>}
 */
async function observe(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-reader-observer-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const ownerUrl=pathToFileURL(path.join(root,'owner.mjs')).href;
    const entryUrl=pathToFileURL(path.join(root,'entry.mjs')).href;
    const script=[
      'const owner=await import(process.argv[1]);',
      'const entry=await import(process.argv[2]);',
      'process.stdout.write(JSON.stringify({source:owner.calculate.toString(),values:entry.values}));'
    ].join('\n');
    const child=spawnSync(process.execPath,
      ['--input-type=module','-e',script,ownerUrl,entryUrl],
      {cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message||'external observer failed');
    return /** @type {{source:string,values:number[]}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const positive=/** @type {SourceFile[]} */ ([
  {path:'owner.mjs',sourceType:'module',code:[
    'const privateRecord={secretAlpha:23,secretBeta:7};',
    'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
    'function readBeta(ownerBeta){return ownerBeta.secretBeta;}',
    'export function calculate(k){return k*readAlpha(privateRecord)+readBeta(privateRecord);}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {calculate} from "./owner.mjs";',
    'export const values=[calculate(0),calculate(1),calculate(13)];'
  ].join('\n')}
]);

test('exported wrapper may call private direct readers without exposing their field source',async()=>{
  const native=await observe(positive);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const output=obfuscateFiles(positive,{
      mode,closedWorld:true,seed:'exported-wrapper-private-reader/'+mode,
      strings:false,identifiers:false,properties:true
    });
    const owner=output.files.find(file=>file.path==='owner.mjs');
    assert.ok(owner);
    assert.equal(owner.metrics.properties,2,mode+': both private owner fields must be rewritten');
    assert.doesNotMatch(String(owner.code),/secretAlpha|secretBeta/u,mode);
    assert.deepEqual(await observe(output.files),native,
      mode+': external Function#toString and numeric results must remain identical');
  }
});

const refused=[
  {
    name:'public wrapper reads the private owner directly',
    code:'const privateRecord={secretAlpha:23};export function calculate(k){return k*privateRecord.secretAlpha;}'
  },
  {
    name:'reader function escapes through an export',
    code:'const privateRecord={secretAlpha:23};function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}export {readAlpha};export function calculate(k){return k*readAlpha(privateRecord);}'
  },
  {
    name:'reader invokes an external callback while holding the owner',
    code:'const privateRecord={secretAlpha:23};function readAlpha(ownerAlpha){hostCallback();return ownerAlpha.secretAlpha;}export function calculate(k){return k*readAlpha(privateRecord);}'
  },
  {
    name:'identity forwarder is not a private value reader',
    code:'const privateRecord={secretAlpha:23};function forward(ownerAlpha){return ownerAlpha;}export function calculate(k){return k*forward(privateRecord).secretAlpha;}'
  }
];

for(const item of refused){
  test('refuse exported-wrapper reader proof when '+item.name,()=>{
    const files=[{path:'owner.mjs',sourceType:'module',code:item.code}];
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      const output=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'exported-wrapper-refusal/'+mode,
        strings:false,identifiers:false,properties:true
      });
      assert.equal(output.files[0].metrics.properties,0,mode+'/'+item.name);
      assert.equal(output.files[0].code,item.code,mode+'/'+item.name);
    }
  });
}
