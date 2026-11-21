'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/**
 * Execute one exact emitted graph in a clean Node ESM process.
 * @param {string} dir
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function run(dir,files){
  await fs.mkdir(dir,{recursive:true});
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const result=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
    encoding:'utf8',timeout:12000,windowsHide:true
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

/**
 * @param {string} reader
 * @param {string} [helper]
 * @returns {ModuleFile[]}
 */
function graph(reader,helper){
  return [
    {path:'owner.mjs',sourceType:'module',code:'export const state={secretField:73};'},
    {path:'helper.mjs',sourceType:'module',
      code:helper??'export const identity=value=>value;'},
    {path:'read.mjs',sourceType:'module',code:reader},
    {path:'entry.mjs',sourceType:'module',
      code:"import {observed} from './read.mjs';process.stdout.write(observed);"}
  ];
}

for(const [name,reader,helper] of [
  ['direct host clone',
    "import {state} from './owner.mjs';"+
      'const copied=structuredClone(state);'+
      'export const observed=JSON.stringify([Reflect.ownKeys(copied),'+
      'copied.secretField,state.secretField]);'],
  ['imported clone alias',
    "import {state} from './owner.mjs';"+
      "import {clone} from './helper.mjs';"+
      'const copied=clone(state);'+
      'export const observed=JSON.stringify([Reflect.ownKeys(copied),'+
      'copied.secretField,state.secretField]);',
    'export const clone=structuredClone;'],
  ['Reflect.apply clone',
    "import {state} from './owner.mjs';"+
      'const copied=Reflect.apply(structuredClone,null,[state]);'+
      'export const observed=JSON.stringify([Reflect.ownKeys(copied),'+
      'copied.secretField,state.secretField]);']
]){
  test('cross-file structuredClone own-key escape refuses private rewrite: '+name,async()=>{
    const original=graph(reader,helper);
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-clone-keys-'));
    try{
      const native=await run(path.join(root,'native'),original);
      assert.equal(native,'[["secretField"],73,73]');
      for(const mode of /** @type {const} */ (['coo','sno'])){
        const emitted=obfuscateFiles(original,{
          mode,closedWorld:true,strings:false,identifiers:false,
          seed:'clone-own-keys/'+name+'/'+mode
        });
        assert.equal(emitted.crossFile.properties,0,
          'Clone-observed imported owner key cannot be renamed');
        assert.equal(emitted.files[0].metrics.properties,0);
        assert.equal(await run(path.join(root,mode),emitted.files),native);
      }
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
}

test('cross-file owner without clone observer remains positively renameable',async()=>{
  const source=graph(
    "import {state} from './owner.mjs';"+
    'export const observed=JSON.stringify(state.secretField);'
  );
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-clone-keys-positive-'));
  try{
    const native=await run(path.join(root,'native'),source);
    assert.equal(native,'73');
    for(const mode of /** @type {const} */ (['coo','sno'])){
      const emitted=obfuscateFiles(source,{
        mode,closedWorld:true,strings:false,identifiers:false,
        seed:'clone-own-keys/safe/'+mode
      });
      assert.ok(emitted.crossFile.properties>=1,
        'Unescaped ESM owner should remain eligible for interfile renaming');
      assert.equal(await run(path.join(root,mode),emitted.files),native);
    }
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
