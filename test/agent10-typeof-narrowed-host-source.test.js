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
/** @type {[string,string,number,boolean][]} */
const selectors=[
  ['guard-on-left',"typeof dynamic==='string'?dynamic:null",0,false],
  ['guard-on-right',"'string'===typeof dynamic?dynamic:null",0,false],
  ['guard-parenthesized',"(typeof dynamic==='string')?dynamic:null",0,false],
  ['guard-through-two-aliases',"typeof dynamic==='string'?dynamic:null",2,false],
  ['guard-optional-chain',"typeof dynamic==='string'?dynamic:null",0,true]
];
/** @param {string} expression @param {number} aliases
 * @param {boolean} optional @returns {Input[]} */
function graphFor(expression,aliases,optional) {
  const aliasLines=Array.from({length:aliases},(_,index)=>
    'const alias'+index+'='+(index===0?'narrowed':'alias'+(index-1))+';');
  const selected=aliases?'alias'+(aliases-1):'narrowed';
  return [
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'const dynamic=process.argv[2];',
      'const narrowed='+expression+';',
      ...aliasLines,
      'const observed=await '+selected+(optional?'?.':'.')+'toLocaleString("en-US");',
      'console.log(JSON.stringify({field:owner.secretField,observed}));'
    ].join('\n')}
  ];
}
/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function runWithHost(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-typeof-string-host-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=path.join(root,'host.cjs');
    await atomicWrite(preload,[
      'const {pathToFileURL}=require("node:url");',
      'const path=require("node:path");',
      'const target=pathToFileURL(path.join(process.cwd(),"owner.mjs")).href;',
      'Object.defineProperty(String.prototype,"toLocaleString",{configurable:true,',
      'value:function(){return import(target).then(m=>Object.keys(m.owner));}});'
    ].join('\n'));
    const proc=spawnSync(process.execPath,['-r',preload,path.join(root,'main.mjs'),'7'],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(proc.status,0,proc.stderr||String(proc.error));
    return proc.stdout;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}
for(const [name,expression,aliases,optional] of selectors){
  for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */ (['coo','sco','sno'])){
    test('typeof-narrowed primitive host method reentry preserves ESM keys '+name+' '+mode,async()=>{
      const input=graphFor(expression,aliases,optional);
      const native=await runWithHost(input);
      assert.equal(native,'{"field":7,"observed":["secretField"]}\n');
      const emitted=obfuscateFiles(input,{
        mode,seed:'agent10-typeof-null/'+name+'/'+mode,
        closedWorld:true,properties:true,identifiers:false,strings:false
      });
      const actual=await runWithHost(emitted.files);
      assert.equal(actual,native,'Host-reentrant string formatter must not reveal renamed ESM owner keys');
      assert.equal(emitted.crossFile.properties,0,
        'Typeof-narrowed string may invoke a mutable inherited formatter');
    });
  }
}
