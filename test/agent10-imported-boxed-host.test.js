'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} Input */
/** @param {string} init @returns {Input[]} */
function graphFor(init){
  return [
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'number.mjs',sourceType:'module',code:'export const nativeNumber='+init+';'},
    {path:'consumer.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'import {nativeNumber} from "./number.mjs";',
      'const observed=await nativeNumber.toLocaleString("en-US");',
      'console.log(JSON.stringify({field:owner.secretField,observed}));'
    ].join('\n')}
  ];
}
/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-imported-boxed-host-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=path.join(root,'host.cjs');
    await atomicWrite(preload,[
      'const {pathToFileURL}=require("node:url");',
      'const path=require("node:path");',
      'const target=pathToFileURL(path.join(process.cwd(),"owner.mjs")).href;',
      'Object.defineProperty(Number.prototype,"toLocaleString",{configurable:true,',
      'value:function(){return import(target).then(remote=>Object.keys(remote.owner));}});'
    ].join('\n'));
    const proc=spawnSync(process.execPath,['-r',preload,path.join(root,'consumer.mjs')],
      {cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(proc.status,0,proc.stderr||String(proc.error));
    return proc.stdout;
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}
for(const [variant,init] of /** @type {[string,string][]} */ ([
  ['literal','7'],
  ['arithmetic','3+4'],
  ['unary','+7'],
  ['conditional','true?7:0']
])){
  for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */ (['coo','sco','sno'])){
    test('imported proven primitive may dispatch overridden host method '+variant+' '+mode,async()=>{
      const graph=graphFor(init);
      const native=await execute(graph);
      assert.equal(native,'{"field":7,"observed":["secretField"]}\n');
      const built=obfuscateFiles(graph,{mode,
        seed:'agent10-imported-boxed/'+variant+'/'+mode,
        closedWorld:true,properties:true,identifiers:false,strings:false
      });
      const emitted=await execute(built.files);
      assert.equal(emitted,native,
        'Host method must not observe renamed keys through imported primitive');
      assert.equal(built.crossFile.properties,0,
        'Imported primitive must propagate may-boxed provenance before cross-file rewrites');
    });
  }
}
