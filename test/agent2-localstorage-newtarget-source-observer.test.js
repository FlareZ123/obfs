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

const sources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'export function outer(){',
    ' const internal=()=>{const x=owner.secretField;localStorage.setItem(\'k\',new.target);return x;};',
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

/**
 * Construct outer from outside the source graph. The host-provided Storage
 * shim models the Web Storage DOMString conversion of setItem's value.
 * @param {Source[]} files
 * @returns {Promise<{result:number,storedHasOriginal:boolean}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-localstorage-newtarget-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const script=[
      "globalThis.localStorage={setItem(_key,value){globalThis.__stored=String(value);}};",
      'const {outer}=await import(process.argv[1]);',
      'const result=new outer();',
      "process.stdout.write(JSON.stringify({result:result.result,storedHasOriginal:globalThis.__stored.includes('secretField')}));"
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',script,pathToFileURL(path.join(root,'app.mjs')).href
    ],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{result:number,storedHasOriginal:boolean}} */(JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('unmodeled Web Storage string conversion of lexical new.target disables owner property renaming',async()=>{
  const native=await run(sources);
  assert.deepEqual(native,{result:7,storedHasOriginal:true});
  const compiled=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'agent2-localstorage-newtarget-source-observer',
    properties:true,identifiers:false,strings:false
  });
  const app=compiled.files.find(file=>file.path==='app.mjs');
  assert.ok(app);
  const emitted=compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
  const actual=await run(emitted);
  process.stdout.write('LOCALSTORAGE_NEW_TARGET_SOURCE_OBSERVER '+JSON.stringify({
    original:native,emitted:actual,
    propertyRenames:app.metrics.properties,
    source:app.code
  })+'\n');
  assert.equal(app.metrics.properties,0,
    JSON.stringify({native,actual,propertyRenames:app.metrics.properties,source:app.code}));
  assert.deepEqual(actual,native);
});
