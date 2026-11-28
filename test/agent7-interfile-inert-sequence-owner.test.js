'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {'coo'|'sco'|'sno'} Mode */

/** @param {SourceFile[]} files @returns {Promise<string>} */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-sequence-'));
  try {
    for(const file of files)await fs.writeFile(path.join(directory,file.path),file.code);
    const run=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      cwd:directory,encoding:'utf8',timeout:12000
    });
    assert.equal(run.status,0,run.stderr||run.error?.message);
    return run.stdout.trim();
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} consumer
 * @returns {SourceFile[]}
 */
function graph(consumer) {
  return [
    {path:'owner.mjs',sourceType:'module',
      code:'export const owner={privateKey:17,otherKey:5};'},
    {path:'consumer.mjs',sourceType:'module',
      code:'import {owner as imported} from "./owner.mjs";'+consumer},
    {path:'entry.mjs',sourceType:'module',
      code:'import {output} from "./consumer.mjs";'+
        'console.log(JSON.stringify(output));'}
  ];
}

/** @param {SourceFile[]} files @param {Mode} mode @param {string} label */
function compile(files,mode,label) {
  return obfuscateFiles(files,{
    mode,seed:'cross-file-inert-sequence/'+label+'/'+mode,
    closedWorld:true,identifiers:false,strings:false,properties:true
  });
}

const positives=[
  ['const alias=(0,imported);'+
    'export const output=alias.privateKey+alias.otherKey;',22],
  ['const alias=(true,null,imported);const second=(0,alias);'+
    'export const output=second.privateKey+second.otherKey;',22],
  ['function read(record){return record.privateKey+record.otherKey;}'+
    'export const output=read((0,imported));',22],
  ['function forward(value){return value;}'+
    'const alias=forward((0,imported));'+
    'export const output=alias.privateKey+alias.otherKey;',22]
];

test('cross-file exported owner property names rewrite through inert comma aliases and helper parameters',async()=>{
  for(let i=0;i<positives.length;i++) {
    const [consumer,result]=positives[i];
    const files=graph(/** @type {string} */(consumer));
    const native=await execute(files);
    assert.equal(native,String(result));
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const compiled=compile(files,mode,String(i));
      assert.equal(compiled.crossFile.properties,2,
        mode+' expected both ESM exported keys renamed through alias '+i);
      const owner=compiled.files.find(file=>file.path==='owner.mjs');
      const importer=compiled.files.find(file=>file.path==='consumer.mjs');
      assert.ok(owner && importer);
      assert.doesNotMatch(String(owner.code),/privateKey|otherKey/u);
      assert.doesNotMatch(String(importer.code),/privateKey|otherKey/u);
      assert.equal(await execute(/** @type {SourceFile[]} */(compiled.files)),native,
        mode+' native/emitted ESM source graph result mismatch');
    }
  }
});

const negatives=[
  'const alias=(globalThis.exposed=imported,imported);'+
    'export const output=Object.keys(globalThis.exposed);',
  'const alias=(0,imported);export const output=Object.keys(alias);',
  'const alias=(0,imported);export const output=Reflect.ownKeys(alias);',
  'const alias=(0,imported);'+
    'export const output=[alias.privateKey,Object.keys(alias)];',
  'const alias=(0,imported);'+
    'export const output=alias;'
];

test('cross-file comma aliases exposed through host globals, exports and reflection decline',async()=>{
  for(let i=0;i<negatives.length;i++){
    const files=graph(negatives[i]);
    const native=await execute(files);
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const compiled=compile(files,mode,'escape-'+i);
      assert.equal(compiled.crossFile.properties,0,
        mode+' must decline observable owner shape in negative '+i);
      assert.equal(await execute(/** @type {SourceFile[]} */(compiled.files)),native,
        mode+' escaped owner output parity for negative '+i);
    }
  }
});
