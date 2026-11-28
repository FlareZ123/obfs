'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

const sources=[
  {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
  {path:'app.mjs',sourceType:'module',code:[
    'import {state} from "./state.mjs";',
    'const internal=(input)=>state.secretField+input;',
    'export const hot=internal.bind(null);'
  ].join('\n')}
];

/**
 * Run the supplied ESM graph through a consumer outside the published file set.
 * @param {Source[]} files
 * @returns {Promise<[number,string,number]>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bound-crossfile-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const script=[
      'const {hot}=await import(process.argv[1]);',
      'process.stdout.write(JSON.stringify([hot(5),hot.name,hot.length]));'
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',script,pathToFileURL(path.join(root,'app.mjs')).href
    ],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {[number,string,number]} */(JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' cross-file imported owner behind a private bound target preserves behavior',async()=>{
    const native=await run(sources);
    const compiled=obfuscateFiles(sources,{
      mode,closedWorld:true,seed:'bound-target-crossfile-'+mode,
      properties:true,identifiers:true,strings:false
    });
    const state=compiled.files.find(file=>file.path==='state.mjs');
    const app=compiled.files.find(file=>file.path==='app.mjs');
    assert.ok(state);
    assert.ok(app);
    const emitted=compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    }));
    const actual=await run(emitted);
    process.stdout.write('BOUND_TARGET_CROSSFILE_PROBE '+JSON.stringify({
      mode,crossFile:compiled.crossFile,
      stateProperties:state.metrics.properties,
      appProperties:app.metrics.properties,
      original:native,emitted:actual,
      stateSource:state.code,appSource:app.code
    })+'\n');
    assert.equal(compiled.crossFile.properties,1,
      JSON.stringify({mode,crossFile:compiled.crossFile,state:state.code,app:app.code}));
    assert.doesNotMatch(String(state.code),/secretField/u);
    assert.doesNotMatch(String(app.code),/secretField/u);
    assert.deepEqual(actual,native);
  });
}


const importedTargetSources=[
  {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
  {path:'reader.mjs',sourceType:'module',code:[
    'import {state} from "./state.mjs";',
    'export const internal=(input)=>state.secretField+input;'
  ].join('\n')},
  {path:'app.mjs',sourceType:'module',code:[
    'import {internal} from "./reader.mjs";',
    'export const hot=internal.bind(null);'
  ].join('\n')}
];

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' imported callable target with an object-independent parameter remains unrenamed',async()=>{
    const native=await run(importedTargetSources);
    const compiled=obfuscateFiles(importedTargetSources,{
      mode,closedWorld:true,seed:'imported-bound-target-'+mode,
      properties:true,identifiers:true,strings:false
    });
    const state=compiled.files.find(file=>file.path==='state.mjs');
    const reader=compiled.files.find(file=>file.path==='reader.mjs');
    assert.ok(state);
    assert.ok(reader);
    assert.equal(compiled.crossFile.properties,0,
      JSON.stringify({mode,crossFile:compiled.crossFile,state:state.code,reader:reader.code}));
    assert.match(String(state.code),/secretField/u);
    assert.match(String(reader.code),/secretField/u);
    const actual=await run(compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    })));
    assert.deepEqual(actual,native);
  });
}

const cyclicOwnerSources=[
  {path:'state.mjs',sourceType:'module',code:[
    'import {marker} from "./app.mjs";',
    'export const state={secretField:23};'
  ].join('\n')},
  {path:'app.mjs',sourceType:'module',code:[
    'import {state} from "./state.mjs";',
    'const internal=(input)=>state.secretField+input;',
    'export const hot=internal.bind(null);',
    'export const marker=1;'
  ].join('\n')}
];

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' cross-file bound owner proof preserves a benign ESM import cycle',async()=>{
    const native=await run(cyclicOwnerSources);
    const compiled=obfuscateFiles(cyclicOwnerSources,{
      mode,closedWorld:true,seed:'cyclic-bound-owner-'+mode,
      properties:true,identifiers:true,strings:false
    });
    const state=compiled.files.find(file=>file.path==='state.mjs');
    const app=compiled.files.find(file=>file.path==='app.mjs');
    assert.ok(state);
    assert.ok(app);
    assert.equal(compiled.crossFile.properties,1,
      JSON.stringify({mode,crossFile:compiled.crossFile,state:state.code,app:app.code}));
    assert.doesNotMatch(String(state.code),/secretField/u);
    assert.doesNotMatch(String(app.code),/secretField/u);
    const actual=await run(compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    })));
    assert.deepEqual(actual,native);
  });
}
