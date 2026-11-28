'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @type {[string,string][]} */
const variants=[
  ['literal control','const nativeNumber=7;'],
  ['numeric binary','const nativeNumber=5+2;'],
  ['numeric binary alias','const first=5;const nativeNumber=first+2;'],
  ['numeric bitwise','const nativeNumber=7|0;'],
  ['numeric exponent','const nativeNumber=2**3-1;'],
  ['awaited numeric primitive','const nativeNumber=await Promise.resolve(7);']
];
/** @param {string} binding @returns {Input[]} */
function graphFor(binding){
  return [
    {path:'owner.mjs',sourceType:'module',
      code:'export const owner={secretField:7};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      binding,
      'const observed=await nativeNumber.toLocaleString("en-US");',
      'console.log(JSON.stringify({field:owner.secretField,observed}));'
    ].join('\n')}
  ];
}
/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-boxed-binary-host-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=path.join(root,'host.cjs');
    await atomicWrite(preload,[
      'const {pathToFileURL}=require("node:url");',
      'const path=require("node:path");',
      'const target=pathToFileURL(path.join(process.cwd(),"owner.mjs")).href;',
      'Object.defineProperty(Number.prototype,"toLocaleString",{configurable:true,',
      'value:function(){return import(target).then(remote=>Object.keys(remote.owner));}});'
    ].join('\n'));
    const proc=spawnSync(process.execPath,['-r',preload,path.join(root,'main.mjs')],
      {cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(proc.status,0,proc.stderr||String(proc.error));
    return proc.stdout;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}
for(const [variant,binding] of variants){
  for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */ (['coo','sco','sno'])){
    test('host method can inspect '+variant+' owner keys: '+mode,async()=>{
      const graph=graphFor(binding);
      const native=await execute(graph);
      assert.equal(native,'{"field":7,"observed":["secretField"]}\n');
      const built=obfuscateFiles(graph,{
        mode,seed:'agent10-boxed-binary/'+variant+'/'+mode,
        closedWorld:true,properties:true,identifiers:false,strings:false
      });
      const emitted=await execute(built.files);
      assert.equal(emitted,native,variant+' source parity under host override');
      assert.equal(built.crossFile.properties,0,
        variant+' mutable prototype method must veto cross-file owner rewrites');
    });
  }
}
