'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */
const state='const state={secretField:71};export function inspect(){return state.secretField;}';
const sourceText='function inspect(){return state.secretField;}';

/**
 * Exercise the native Node ESM module loader, including imported function
 * objects whose precise source can be observed by another module.
 * @param {ModuleFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-intl-esm-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} expression @returns {ModuleFile[]} */
function graph(expression) {
  return [
    {path:'state.mjs',code:state,sourceType:'module'},
    {path:'main.mjs',code:
      'import {inspect} from "./state.mjs";console.log('+expression+');',
    sourceType:'module'}
  ];
}

for(const [name,expression] of [
  ['Collator receives imported function',
    'new Intl.Collator("en").compare(inspect,'+JSON.stringify(sourceText)+')'],
  ['Segmenter receives imported function',
    '[...new Intl.Segmenter("en").segment(inspect)].map(x=>x.segment).join("")'],
  ['ListFormat error contains imported function source',
    '(()=>{try{return new Intl.ListFormat("en").format([inspect]);}catch(error){return error.message;}})()']
]) {
  test('cross-file Intl observer preserves imported function text: '+name,async()=>{
    const files=graph(expression);
    const native=await execute(files);
    const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
      seed:'intl-cross-file/'+name,strings:false,identifiers:false});
    assert.equal(output.crossFile.properties,0);
    assert.equal(output.files[0].code,state);
    assert.equal(await execute(/** @type {ModuleFile[]} */(output.files)),native);
  });
}

test('without cross-file source observation local owned fields remain renameable',async()=>{
  const files=graph('inspect()');
  const baseline=await execute(files);
  const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
    seed:'intl-cross-file-positive',strings:false,identifiers:false});
  assert.equal(output.files[0].metrics.objects,1,output.files[0].code);
  assert.ok(!output.files[0].code.includes('secretField'));
  assert.equal(await execute(/** @type {ModuleFile[]} */(output.files)),baseline);
});
