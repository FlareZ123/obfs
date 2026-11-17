'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {collectVerifiedImportedPrimitives}=require('../src/cross-properties');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} Source */

/**
 * Execute the actual module linker with its own fresh input directory.
 * @param {Source[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-import-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const consumer=await import(pathToFileURL(path.join(dir,'consumer.mjs')).href);
    return /** @type {string} */(consumer.result);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} primitive @param {string} [exportSyntax] @returns {Source[]} */
function sources(primitive,exportSyntax) {
  const exporter=exportSyntax??'export const marker='+primitive+';';
  const importer=exportSyntax?
    'import {"quoted-public-name" as observed} from "./state.mjs";':
    'import {marker as observed} from "./state.mjs";';
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:23};'+
        'export function peek(x){return x.secretField;}'+exporter},
    {path:'consumer.mjs',sourceType:'module',
      code:importer+'import {state,peek} from "./state.mjs";'+
        'export const result=String(observed)+":"+peek(state);'}
  ];
}

/** @param {Source[]} files @param {boolean} closedWorld */
function compiled(files,closedWorld=true) {
  return obfuscateFiles(files,{mode:'coo',closedWorld,
    seed:'imported-primitive-source-proof',strings:false,identifiers:false,properties:true});
}

for(const [label,literal,rendered] of /** @type {Array<[string,string,string]>} */([
  ['number','37','37:23'],
  ['boolean','true','true:23'],
  ['null','null','null:23'],
  ['bigint','37n','37:23'],
  ['string','"hello"','hello:23']
])) {
  test('proven ESM '+label+' literal prevents false native String source observation',async()=>{
    const original=sources(literal);
    const provenance=collectVerifiedImportedPrimitives(original);
    assert.equal(provenance.get('consumer.mjs')?.has('observed'),true);
    const transformed=compiled(original);
    assert.equal(transformed.crossFile.properties,1,'Safe field must still change');
    assert.equal(await execute(original),rendered);
    assert.equal(await execute(/** @type {Source[]} */ (transformed.files)),rendered);
  });
}

test('quoted public ESM literal alias is proven without renaming syntax tokens',async()=>{
  const files=sources('37','const internal=37;export {internal as "quoted-public-name"};');
  assert.equal(collectVerifiedImportedPrimitives(files).get('consumer.mjs')?.has('observed'),true);
  const emitted=compiled(files);
  assert.equal(emitted.crossFile.properties,1);
  assert.equal(await execute(/** @type {Source[]} */ (emitted.files)),await execute(files));
  assert.match(/** @type {string} */(emitted.files[0].code),/"quoted-public-name"/u);
});

for(const [name,definition,expectedProof] of /** @type {Array<[string,string,boolean]>} */([
  ['function export','export const marker=function dangerous(){return 37;};',false],
  ['mutable export','export let marker=37;marker=function dangerous(){return 37;};',false],
  ['opaque factory','export const marker=make();function make(){return 37;}',false]
])) {
  test('unproved ESM '+name+' source remains original',async()=>{
    const originals=sources('',definition);
    assert.equal(collectVerifiedImportedPrimitives(originals).get('consumer.mjs')?.has('observed'),
      expectedProof);
    const emitted=compiled(originals);
    assert.equal(emitted.crossFile.properties,0);
    assert.equal(await execute(/** @type {Source[]} */(emitted.files)),await execute(originals));
    assert.deepEqual(emitted.files.map(file=>file.code),originals.map(file=>file.code));
  });
}

test('open-world imported primitives remain unproved without the graph contract',async()=>{
  const originals=sources('37');
  const emitted=compiled(originals,false);
  assert.equal(emitted.crossFile.properties,0);
  assert.equal(await execute(/** @type {Source[]} */(emitted.files)),await execute(originals));
});
