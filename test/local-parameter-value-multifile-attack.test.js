'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {relabelAndTamperOneFieldArithmetic}=
  require('../sims/local-param-public-tamper');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleSource */

/** @type {ModuleSource[]} */
const native=[
  {path:'private.mjs',sourceType:'module',code:
    'export function compute(payload){const owner={payload,bias:3};'+
    'return globalThis.HOST.externalValue(owner.payload+owner.bias);}'},
  {path:'host.mjs',sourceType:'module',code:
    'globalThis.HOST={externalValue(number){globalThis.events.push(number);return number*2;}};'},
  {path:'entry.mjs',sourceType:'module',code:
    'import "./host.mjs";import {compute} from "./private.mjs";'+
    'globalThis.events=[];console.log(JSON.stringify({result:compute(39),events:globalThis.events}));'}
];

/**
 * Materialize a delivered module graph exactly, then run in a clean
 * independent Node process with a real global host callback.
 * @param {string} destination
 * @param {ModuleSource[]} files
 * @returns {Promise<{output:string,files:number}>}
 */
async function execute(destination,files){
  for(const file of files)await atomicWrite(path.join(destination,file.path),file.code);
  const processResult=spawnSync(process.execPath,[path.join(destination,'entry.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(processResult.error)throw processResult.error;
  assert.equal(processResult.status,0,processResult.stderr);
  return {output:processResult.stdout.trim(),files:files.length};
}

test('actual three-file ESM retains host callback and is source-only relabelable and tamperable',async()=>{
  const originalDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-param-attack-native-'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-param-attack-'));
  try {
    const baseline=await execute(originalDir,native);
    assert.equal(baseline.output,'{"result":84,"events":[42]}');
    for(const mode of /** @type {const} */ (['coo','sno'])) {
      for(let seed=0;seed<4;seed++) {
        const output=obfuscateFiles(native,{
          mode,closedWorld:true,
          seed:'parameter-multifile-source-only-'+seed,
          identifiers:false,strings:false,properties:true
        });
        const count=output.files.reduce((sum,file)=>sum+file.metrics.objects,0);
        assert.equal(count,1,'Exactly one real private owner must transform');
        const published=output.files.map(file=>({
          path:file.path,sourceType:/** @type {'module'} */(file.sourceType),
          code:String(file.code)
        }));
        const attack=relabelAndTamperOneFieldArithmetic(published);
        assert.equal(attack.fields,2,'Two published private owner fields are normalizable');
        const emittedDir=path.join(directory,'emitted-'+mode+'-'+seed);
        const normalizedDir=path.join(directory,'normalized-'+mode+'-'+seed);
        const tamperedDir=path.join(directory,'tampered-'+mode+'-'+seed);
        assert.deepEqual(await execute(emittedDir,published),baseline);
        assert.deepEqual(await execute(normalizedDir,attack.files),baseline);
        assert.equal((await execute(tamperedDir,attack.tampered)).output,
          '{"result":72,"events":[36]}');
        assert.equal(attack.files.find(file=>file.path==='host.mjs')?.code,
          published.find(file=>file.path==='host.mjs')?.code,
          'Public-only label recovery must preserve external host API contract');
      }
    }
  }finally{
    await Promise.all([originalDir,directory].map(dir=>
      fs.rm(dir,{recursive:true,force:true})));
  }
});
