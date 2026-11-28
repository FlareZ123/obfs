'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-member-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=path.join(root,'preload.cjs');
    await atomicWrite(preload,[
      'for(const prototype of [Number.prototype,Boolean.prototype,BigInt.prototype,Symbol.prototype,String.prototype]){',
      '  Object.defineProperty(prototype,"callback",{configurable:true,get:function(){return Function;}});',
      '  Object.defineProperty(prototype,"callbackMethod",{configurable:true,value:function(){return Function;}});',
      '}'
    ].join('\n'));
    const child=spawnSync(process.execPath,['-r',preload,path.join(root,'main.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||String(child.error));
    return child.stdout;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} consumer @returns {ModuleFile[]} */
function graph(consumer) {
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',consumer,
      'const source=Loader(\'return import("./state.mjs")\');',
      'const remote=await source();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
}

/** @param {ModuleFile[]} files @param {string} seed */
function transform(files,seed) {
  return obfuscateFiles(files,{mode:'coo',seed,closedWorld:true,
    properties:true,identifiers:false,strings:false});
}

const primitives=[
  {label:'number',value:'1'},
  {label:'boolean',value:'true'},
  {label:'bigint',value:'1n'},
  {label:'symbol',value:'Symbol.iterator'},
  {label:'string',value:'"value"'}
];
for(const primitive of primitives) {
  for(const method of ['callback','callbackMethod()']) {
    test('host boxed '+primitive.label+' direct member '+method+
      ' can reveal transformed cross-file keys',async()=>{
      const files=graph('const Loader=('+primitive.value+').'+method+';');
      const native=await execute(files);
      assert.equal(native,'[53,["secretField"],53]\n');
      const result=transform(files,'primitive-member-'+primitive.label+'-'+method);
      const emitted=await execute(result.files);
      assert.equal(emitted,native,
        'Host-supplied callable can dynamically import an otherwise closed ESM owner');
      assert.equal(result.crossFile.properties,0,'Unsafe renaming must be declined');
    });
  }
}

test('unrelated arithmetic retains a private property rewrite',async()=>{
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";const answer=1+2;console.log(JSON.stringify([state.secretField,answer]));'}
  ];
  const native=await execute(files);
  const result=transform(files,'primitive-member-arithmetic-positive');
  const emitted=await execute(result.files);
  assert.equal(native,'[53,3]\n');
  assert.equal(emitted,native);
  assert.equal(result.crossFile.properties,1);
});
