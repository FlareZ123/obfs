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

// Exported zero-argument closure readers are a separate admission lane from
// private bound targets. new.target can still expose their function source.
const sources=[
  {path:'state.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
  {path:'app.mjs',sourceType:'module',code:[
    'import {owner} from "./state.mjs";',
    "export function internal(){const x=owner.secretField;return {result:new.target<'function internal(){const x=owner.m'?x:0};}"
  ].join('\n')}
];

/**
 * Construct the exported reader from outside the supplied source graph.
 * @param {Source[]} files
 * @returns {Promise<{result:number}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-newtarget-reader-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const script=[
      'const {internal}=await import(process.argv[1]);',
      'process.stdout.write(JSON.stringify(new internal()));'
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',script,pathToFileURL(path.join(root,'app.mjs')).href
    ],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{result:number}} */(JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])){
  test(mode+' new.target source coercion disables exported closure-reader property renaming',async()=>{
    const native=await run(sources);
    assert.deepEqual(native,{result:0});
    const compiled=obfuscateFiles(sources,{
      mode,closedWorld:true,seed:'agent1-newtarget-exported-reader-'+mode,
      properties:true,identifiers:false,strings:false
    });
    const state=compiled.files.find(file=>file.path==='state.mjs');
    const app=compiled.files.find(file=>file.path==='app.mjs');
    assert.ok(state);
    assert.ok(app);
    const emitted=compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:String(file.code)
    }));
    const actual=await run(emitted);
    process.stdout.write('NEW_TARGET_EXPORTED_READER_OBSERVER '+JSON.stringify({
      mode,native,actual,crossFile:compiled.crossFile,
      stateProperties:state.metrics.properties,appProperties:app.metrics.properties,
      stateSource:state.code,appSource:app.code
    })+'\n');
    assert.equal(compiled.crossFile.properties,0,
      JSON.stringify({mode,native,actual,crossFile:compiled.crossFile,state:state.code,app:app.code}));
    assert.match(String(state.code),/secretField/u);
    assert.match(String(app.code),/secretField/u);
    assert.deepEqual(actual,native);
  });
}
