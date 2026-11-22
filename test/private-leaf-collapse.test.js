'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {collapsePrivateLeaf}=require('../workplace/private-leaf-collapse');

/** @type {{path:string,code:string,sourceType:'module'}} */
const LEAF={path:'private.mjs',sourceType:'module',code:
  'export const owner={secretFirst:7,secretSecond:5};\n'+
  'export function readPrivate(){return owner.secretFirst+owner.secretSecond;}'};
/** @type {{path:string,code:string,sourceType:'module'}} */
const ENTRY={path:'entry.mjs',sourceType:'module',code:
  'import {readPrivate} from "./private.mjs";\n'+
  'export function publicRun(n){return work(n);}\n'+
  'function work(n){let total=0;for(let i=0;i<n;i++)total+=readPrivate();return total;}'};

/** @param {[string,string][]} contents */
async function load(contents){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-leaf-'));
  for(const [name,code] of contents){
    const destination=path.join(dir,name);
    const staging=destination+'.stage';
    await fs.writeFile(staging,code,'utf8');
    await fs.rename(staging,destination);
  }
  const mod=await import(pathToFileURL(path.join(dir,'entry.mjs')).href);
  return {dir,mod};
}

test('reviewed single-private-leaf collapse admits nonzero private fields and preserves entry ESM source',async()=>{
  const collapsed=collapsePrivateLeaf(LEAF,ENTRY,{entryOnlyReviewed:true});
  assert.equal(collapsed.path,'entry.mjs');
  assert.doesNotMatch(collapsed.code,/\bimport\s*\{/u);
  assert.doesNotMatch(collapsed.code,/\bexport const owner/u);
  const compiled=obfuscateFiles([collapsed],{
    mode:'coo',closedWorld:true,seed:'private-leaf-review-only-20261122',
    identifiers:false,properties:true,strings:false
  });
  assert.equal(compiled.files.length,1);
  assert.ok(compiled.files[0].metrics.properties>=2,
    'Must transform actual private owner fields in the collapsed graph: '+compiled.files[0].code);
  const original=await load([['private.mjs',LEAF.code],['entry.mjs',ENTRY.code]]);
  const emitted=await load([['entry.mjs',String(compiled.files[0].code)]]);
  try{
    assert.deepEqual(Object.keys(original.mod),['publicRun']);
    assert.deepEqual(Object.keys(emitted.mod),['publicRun']);
    assert.equal(String(original.mod.publicRun),String(emitted.mod.publicRun));
    for(const count of [0,1,17,1000,10000])
      assert.equal(original.mod.publicRun(count),emitted.mod.publicRun(count));
    process.stdout.write('ENTRY_PRIVATE_LEAF_COLLAPSED '+JSON.stringify({
      originalFiles:2,emittedFiles:1,privateProperties:compiled.files[0].metrics.properties,
      publicFunctionSourceIdentical:true,entryValue1000:emitted.mod.publicRun(1000)
    })+'\n');
  }finally{
    await fs.rm(original.dir,{recursive:true,force:true});
    await fs.rm(emitted.dir,{recursive:true,force:true});
  }
});

test('source-only entry alias and lexical collision are rejected before bundling',()=>{
  assert.throws(()=>collapsePrivateLeaf(LEAF,ENTRY,{entryOnlyReviewed:false}),/reviewed/);
  const badLeaf={...LEAF,code:'export function readPrivate(){return Math.max(7,0);}'};
  const badEntry={...ENTRY,code:ENTRY.code+'\nconst Math={max:()=>13};'};
  assert.throws(()=>collapsePrivateLeaf(badLeaf,badEntry,{entryOnlyReviewed:true}),/pure zero-argument|capture.*Math/);
  const metaLeaf={...LEAF,code:'export const owner={secretFirst:import.meta.url,secretSecond:5};'+
    'export function readPrivate(){return owner.secretSecond;}'};
  assert.throws(()=>collapsePrivateLeaf(metaLeaf,ENTRY,{entryOnlyReviewed:true}),/primitive-only|dynamic/);
  const renamedImport={...ENTRY,code:ENTRY.code.replace('import {readPrivate}',
    'import {readPrivate as alias}')};
  assert.throws(()=>collapsePrivateLeaf(LEAF,renamedImport,{entryOnlyReviewed:true}),/unaliased/);
  const reassignment={...ENTRY,code:ENTRY.code+'\nreadPrivate=()=>13;'};
  assert.throws(()=>collapsePrivateLeaf(LEAF,reassignment,{entryOnlyReviewed:true}),/reassign imported/);
  const hiddenEval={...ENTRY,code:ENTRY.code+'\neval("typeof owner");'};
  assert.throws(()=>collapsePrivateLeaf(LEAF,hiddenEval,{entryOnlyReviewed:true}),/dynamic scope/);
});
