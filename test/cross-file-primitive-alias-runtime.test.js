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

/**
 * Assignments are *listed* forward but executed in descending order through
 * functions. Unlike a dead control-flow stress case, a0 really is a String
 * when the host callback is consumed, and each intermediate alias is live.
 * @param {number} count
 * @param {boolean} observe
 * @returns {ModuleFile[]}
 */
function graph(count,observe) {
  const aliases=Array.from({length:count+1},(_,i)=>'alias'+i);
  const links=aliases.slice(0,-1).map((name,i)=>
    'function link'+i+'(){'+name+'='+aliases[i+1]+';}');
  const calls=aliases.slice(0,-1).map((_,i)=>'link'+(count-1-i)+'();');
  const code=[
    'import {state} from "./state.mjs";',
    'let '+aliases.join(',')+';',
    ...links,
    aliases[count]+'="host-boxed";',
    ...calls,
    ...(observe?[
      'const Loader='+aliases[0]+'.callback;',
      'const dynamic=Loader(\'return import("./state.mjs")\');',
      'const remote=await dynamic();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ]:['console.log(state.secretField);'])
  ].join('\n');
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code}
  ];
}

/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-alias-live-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=path.join(root,'host.cjs');
    await atomicWrite(preloader,
      'Object.defineProperty(String.prototype,"callback",{configurable:true,get(){return Function;}});');
    const output=spawnSync(process.execPath,['-r',preloader,path.join(root,'main.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(output.status,0,output.stderr||String(output.error));
    return output.stdout;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {ModuleFile[]} files @param {string} seed */
function compile(files,seed){
  return obfuscateFiles(files,{
    mode:'coo',seed,closedWorld:true,
    identifiers:false,strings:false,properties:true
  });
}

for(const depth of [1,8,64]) {
  test('actual host getter reached through '+depth+' executed function aliases',async()=>{
    const files=graph(depth,true);
    const native=await execute(files);
    assert.equal(native,'[53,["secretField"],53]\n');
    const result=compile(files,'actual-host-alias-'+depth);
    const emitted=await execute(result.files);
    assert.equal(emitted,native,
      'A live alias to a host String getter must not hide a dynamic module import');
    assert.equal(result.crossFile.properties,0,'live alias to native getter must veto cross-file key rewrite');
  });
}

test('64 executed aliases without boxed-host consumption retain one private rewrite',async()=>{
  const files=graph(64,false);
  const native=await execute(files);
  assert.equal(native,'53\n');
  const result=compile(files,'actual-host-alias-positive');
  const emitted=await execute(result.files);
  assert.equal(emitted,native);
  assert.equal(result.crossFile.properties,1,'live aliases alone must not discard independent private rewrite');
});
