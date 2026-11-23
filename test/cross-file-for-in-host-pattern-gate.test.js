'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Execute an actual ESM graph after a host-owned CommonJS preloader mutates
 * String.prototype. The preloader is intentionally outside the compiler's
 * source graph.
 *
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function executeWithPreloader(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-for-in-host-pattern-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'preload.cjs');
    await atomicWrite(preloader,
      "Object.defineProperty(String.prototype,'callback',{configurable:true,get(){return Function;}});");
    const child=spawnSync(process.execPath,
      ['-r',preloader,path.join(directory,'main.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout;
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('for-in object binding pattern must account for inherited String prototype getters',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'let injected;',
      'for(const {callback:Loader} in ["x"]){',
      '  injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      '}',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
  const native=await executeWithPreloader(files);
  assert.equal(native,'[53,["secretField"],53]\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'for-in-host-prototype-callback',
    strings:false,identifiers:false,properties:true
  });
  const emitted=await executeWithPreloader(output.files);
  assert.equal(emitted,native,
    'Generated ESM must preserve the original host-injected callback behavior and public field name');
  assert.equal(output.crossFile.properties,0,
    'An inherited host getter can inject Function through a ForInStatement pattern');
});


test('for-in assignment-pattern binding must account for inherited String prototype getters',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'let Loader;',
      'let injected;',
      'for({callback:Loader} in ["x"]){',
      '  injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      '}',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
  const native=await executeWithPreloader(files);
  assert.equal(native,'[53,["secretField"],53]\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'for-in-host-prototype-callback-assignment',
    strings:false,identifiers:false,properties:true
  });
  const emitted=await executeWithPreloader(output.files);
  assert.equal(emitted,native,
    'Generated ESM must preserve host-injected callbacks from an assignment-pattern ForInStatement');
  assert.equal(output.crossFile.properties,0,
    'An inherited host getter can inject Function through a ForInStatement assignment pattern');
});


test('for-in string key followed by object destructuring remains an unknown host source',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'let injected;',
      'for(const key in ["x"]){',
      '  const {callback:Loader}=key;',
      '  injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      '}',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
  const native=await executeWithPreloader(files);
  assert.equal(native,'[53,["secretField"],53]\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'for-in-string-key-followed-by-pattern',
    strings:false,identifiers:false,properties:true
  });
  const emitted=await executeWithPreloader(output.files);
  assert.equal(emitted,native,
    'Generated ESM must preserve inherited String prototype getters after a simple ForIn binding');
  assert.equal(output.crossFile.properties,0,
    'A simple ForIn key remains a String wrapper source for later destructuring');
});


test('simple ForIn identifier without destructuring preserves safe cross-file rewrite yield',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'for(const key in ["x"]){void key;}',
      'console.log(state.secretField);'
    ].join('\n')}
  ];
  const native=await executeWithPreloader(files);
  assert.equal(native,'53\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'for-in-simple-key-positive-control',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(output.crossFile.properties,1,
    'A plain ForIn identifier is only a string key; do not discard unrelated private rewrite yield');
  assert.equal(await executeWithPreloader(output.files),native);
});


test('ForIn StringKey provenance survives a cross-file function return before destructuring',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:53};'},
    {path:'keys.mjs',sourceType:'module',code:[
      'export function getKey(){',
      '  for(const key in ["x"])return key;',
      '  return "";',
      '}'
    ].join('\n')},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'import {getKey} from "./keys.mjs";',
      'const {callback:Loader}=getKey();',
      'const injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
  const native=await executeWithPreloader(files);
  assert.equal(native,'[53,["secretField"],53]\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'for-in-stringkey-cross-file-return',
    strings:false,identifiers:false,properties:true
  });
  const emitted=await executeWithPreloader(output.files);
  assert.equal(emitted,native,
    'StringKey provenance must survive a cross-file function return before destructuring');
  assert.equal(output.crossFile.properties,0,
    'A function returning a ForIn property key must not hide later host String prototype access');
});


test('string primitive object destructuring must account for host String prototype getters',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'const {callback:Loader}="x";',
      'const injected=Loader('+JSON.stringify('return import("./state.mjs")')+');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
  const native=await executeWithPreloader(files);
  assert.equal(native,'[53,["secretField"],53]\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'string-primitive-object-pattern',
    strings:false,identifiers:false,properties:true
  });
  const emitted=await executeWithPreloader(output.files);
  assert.equal(emitted,native,
    'Object destructuring from a String primitive can invoke host String.prototype accessors');
  assert.equal(output.crossFile.properties,0,
    'A host getter on String.prototype can supply a hidden callback from a string primitive');
});
