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
/** @type {Input[]} */
const graph=[
  {path:'owner.mjs',sourceType:'module',
    code:'export const owner={secretField:7};'},
  {path:'main.mjs',sourceType:'module',code:[
    'import {owner} from "./owner.mjs";',
    'const nativeNumber=7;',
    'const observed=await nativeNumber.toLocaleString("en-US");',
    'console.log(JSON.stringify({field:owner.secretField,observed}));'
  ].join('\n')}
];

/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-locale-'));
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
    const proc=spawnSync(process.execPath,['-r',preload,path.join(root,'main.mjs')],
      {cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(proc.status,0,proc.stderr||String(proc.error));
    return proc.stdout;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {Array<'coo'|'sco'|'sno'>} */ (['coo','sco','sno'])) {
  test('host-overridden primitive toLocaleString can import owner keys: '+mode,async()=>{
    const native=await execute(graph);
    assert.equal(native,'{"field":7,"observed":["secretField"]}\n');
    const built=obfuscateFiles(graph,{mode,seed:'locale-remote-observer-'+mode,
      closedWorld:true,properties:true,identifiers:false,strings:false});
    const emitted=await execute(built.files);
    assert.equal(emitted,native,
      'toLocaleString may be replaced by a host function that dynamically imports owner');
    assert.equal(built.crossFile.properties,0,
      'Host method exposure invalidates closed-world cross-file owner renaming');
  });
}
