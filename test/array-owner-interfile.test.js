'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/**
 * Load the original and transformed ESM groups from separate filesystem
 * directories so Node module caching cannot conceal an incorrect rewrite.
 *
 * @param {{path:string,code:string,sourceType:'module'}[]} files
 * @returns {Promise<{observe:(value:number)=>number,nativeSource:string}>}
 */
async function importGroup(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'array-owner-esm-'));
  try{
    for(const file of files){
      await atomicWrite(path.join(directory,file.path),file.code);
    }
    const loaded=await import(pathToFileURL(path.join(directory,'entry.mjs')).href);
    assert.equal(typeof loaded.observe,'function');
    return {observe:/** @type {(value:number)=>number} */(loaded.observe),
      nativeSource:files.map(f=>f.code).join('\n')};
  }finally{
    // Imported ESM namespaces remain callable after their source files are
    // unlinked: all executable module instances have been evaluated already.
    await fs.rm(directory,{recursive:true,force:true});
  }
}

const modules=[
  {path:'owner.mjs',sourceType:'module',code:[
    'export const vault={privateCount:41,hiddenAddend:5};',
    'const holder=[vault];const alias=holder[0];',
    'export function inner(v){return alias.privateCount+vault.hiddenAddend+v;}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {vault,inner} from "./owner.mjs";',
    'export function observe(v){return inner(v)+vault.privateCount;}'
  ].join('\n')}
];

/** @param {typeof modules} files @returns {ReturnType<typeof obfuscateFiles>} */
function transform(files){
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,
    seed:'array-holder-import-20261116',
    strings:false,identifiers:false,properties:true
  });
}

test('cross-file ESM owner-holder alias is conservatively renamed with every known use',{
  timeout:30000
},async()=>{
  const compiled=transform(modules);
  const texts=compiled.files.map(file=>String(file.code)).join('\n');
  const renamed=compiled.files.reduce((sum,file)=>sum+(file.metrics.properties||0),0);
  assert.ok(renamed>=2,'Expected two private labels to be renamed across ESM');
  assert.doesNotMatch(texts,/privateCount|hiddenAddend/u);
  const before=await importGroup(modules);
  const after=await importGroup(/** @type {typeof modules} */(compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }))));
  for(let n=-100;n<=100;n++)assert.equal(after.observe(n),before.observe(n));
});

test('interfile reflective owner consumer prevents unsafe renaming',{
  timeout:30000
},async()=>{
  const reflected=[
    modules[0],
    {path:'entry.mjs',sourceType:'module',code:[
      'import {vault,inner} from "./owner.mjs";',
      'export function observe(v){return Object.keys(vault).join(",")+":"+inner(v);}'
    ].join('\n')}
  ];
  const compiled=transform(reflected);
  const texts=compiled.files.map(file=>String(file.code)).join('\n');
  assert.match(texts,/privateCount/u);
  const before=await importGroup(reflected);
  const after=await importGroup(/** @type {typeof modules} */(compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }))));
  for(let n=-10;n<=10;n++){
    assert.equal(after.observe(n),before.observe(n));
  }
});
