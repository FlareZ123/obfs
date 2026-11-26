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

// A bound constructor's [[Construct]] forwards new.target === boundTarget
// to the original target. Abstract relational comparison then ToPrimitives
// that function to its source string. The literal threshold is deliberately
// between the original "secretField" spelling and the obfuscated "_p..." key.
const sources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    "function internal(){const x=owner.secretField;return {result:new.target<'function internal(){const x=owner.m'?x:0};}",
    'export const hot=internal.bind(null);'
  ].join('\n')
}];

/**
 * Invoke the exported bound constructor from outside the supplied source graph.
 * @param {Source[]} files
 * @returns {Promise<{result:number}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-newtarget-bound-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const script=[
      'const {hot}=await import(process.argv[1]);',
      'process.stdout.write(JSON.stringify(new hot()));'
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

test('new.target relational source observation disables private bound-target property renaming',async()=>{
  const native=await run(sources);
  const compiled=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'agent2-newtarget-bound-source-observer',
    properties:true,identifiers:false,strings:false
  });
  const app=compiled.files.find(file=>file.path==='app.mjs');
  assert.ok(app);
  const emitted=compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
  const actual=await run(emitted);
  process.stdout.write('NEW_TARGET_BOUND_SOURCE_OBSERVER '+JSON.stringify({
    original:native,emitted:actual,
    propertyRenames:app.metrics.properties,
    source:app.code
  })+'\n');
  assert.equal(app.metrics.properties,0,
    JSON.stringify({native,actual,propertyRenames:app.metrics.properties,source:app.code}));
  assert.deepEqual(actual,native);
});
