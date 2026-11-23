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
 * Run an actual ESM graph under a host-only String iterator replacement.
 * The preloader is deliberately not part of the compiler's declared graph.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function executeWithHostStringIterator(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-for-in-string-iterator-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'preload.cjs');
    await atomicWrite(preloader,[
      'Object.defineProperty(String.prototype,Symbol.iterator,{',
      '  configurable:true,',
      '  value:function*(){yield Function;}',
      '});'
    ].join('\n'));
    const child=spawnSync(process.execPath,
      ['-r',preloader,path.join(directory,'main.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout;
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} mainSource @returns {ModuleFile[]} */
function graph(mainSource) {
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:mainSource}
  ];
}

/** @param {ModuleFile[]} files @param {string} seed */
function transform(files,seed) {
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed,strings:false,identifiers:false,properties:true
  });
}

for(const [label,loop] of [
  ['declaration binding','for(const [Loader] in [\'x\']){injected=Loader(\'return import("./state.mjs")\');}'],
  ['assignment binding','for([Loader] in [\'x\']){injected=Loader(\'return import("./state.mjs")\');}']
]) {
  test('ForIn '+label+' must account for host-modified String iterator',async()=>{
    const files=graph([
      'import {state} from "./state.mjs";',
      'let Loader;',
      'let injected;',
      loop,
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n'));
    const native=await executeWithHostStringIterator(files);
    assert.equal(native,'[53,["secretField"],53]\n');
    const output=transform(files,'for-in-string-iterator-'+label);
    const emitted=await executeWithHostStringIterator(output.files);
    assert.equal(emitted,native,
      'Generated ESM must preserve the host-injected dynamic-import behavior');
    assert.equal(output.crossFile.properties,0,
      'An array-pattern ForIn binding can invoke a host-modified String iterator');
  });
}

for(const [label,setup] of [
  ['alias assignment','const alias=key;const [Loader]=alias;'],
  ['local function return','const alias=identity(key);const [Loader]=alias;']
]) {
  test('ForIn StringKey provenance survives '+label,async()=>{
    const lines=[
      'import {state} from "./state.mjs";',
      ...(label==='local function return'?['function identity(value){return value;}']:[]),
      'let injected;',
      'for(const key in ["x"]){',
      setup,
      'injected=Loader(\'return import("./state.mjs")\');',
      '}',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ];
    const files=graph(lines.join('\n'));
    const native=await executeWithHostStringIterator(files);
    assert.equal(native,'[53,["secretField"],53]\n');
    const output=transform(files,'for-in-stringkey-'+label);
    const emitted=await executeWithHostStringIterator(output.files);
    assert.equal(emitted,native,
      'A StringKey must remain host-sensitive through aliases and local returns');
    assert.equal(output.crossFile.properties,0,
      'Destructuring a ForIn StringKey must not publish a renamed owner key');
  });
}

test('simple ForIn identifier binding retains independent private-field rewrite yield',async()=>{
  const files=graph([
    'import {state} from "./state.mjs";',
    'const seen=[];',
    'for(const key in ["x"])seen.push(key);',
    'console.log(JSON.stringify([state.secretField,seen]));'
  ].join('\n'));
  const native=await executeWithHostStringIterator(files);
  assert.equal(native,'[53,["0"]]\n');
  const output=transform(files,'for-in-string-iterator-positive-control');
  const emitted=await executeWithHostStringIterator(output.files);
  assert.equal(emitted,native);
  assert.equal(output.crossFile.properties,1,
    'A simple ForIn key binding does not invoke the String iterator and should retain one safe rewrite');
});
