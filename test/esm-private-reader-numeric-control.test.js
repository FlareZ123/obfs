'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Run a complete native Node ESM graph as real separate .mjs files. The
 * exported API is scalar; a known non-source-coercing strict equality check
 * avoids introducing an opaque host observer into this proof fixture.
 *
 * @param {SourceFile[] | ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<void>}
 */
async function verify(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-reader-numeric-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const processResult=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(processResult.status,0,
      processResult.stderr||processResult.error?.message||'Unexpected nonzero status');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const files=[
  {path:'owner.mjs',sourceType:/** @type {'module'} */('module'),code:[
    'const privateRecord={secretAlpha:23,secretBeta:7};',
    'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
    'function readBeta(ownerBeta){return ownerBeta.secretBeta;}',
    'export function calculate(k){return k*readAlpha(privateRecord)+readBeta(privateRecord);}'
  ].join('')},
  {path:'api.mjs',sourceType:/** @type {'module'} */('module'),code:[
    'import {calculate} from "./owner.mjs";',
    'export function execute(k){return calculate(k)+calculate(k+1);}'
  ].join('')},
  {path:'entry.mjs',sourceType:/** @type {'module'} */('module'),code:[
    'import {execute} from "./api.mjs";',
    'process.exitCode=execute(0)===37&&execute(1)===83&&execute(13)===635?0:1;'
  ].join('')}
];

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' numeric-only three-file ESM private named-reader owns two fields',async()=>{
    await verify(files);
    const compiled=obfuscateFiles(files,{mode,closedWorld:true,
      seed:'private-reader-numeric/'+mode,
      strings:false,identifiers:false,properties:true});
    const selected=compiled.files.find(file=>file.path==='owner.mjs');
    assert.ok(selected);
    assert.equal(selected.metrics.properties,2,
      'Both private owner fields must be rewritten for a meaningful positive');
    await verify(compiled.files);
  });
}
