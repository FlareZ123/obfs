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
 * The unlisted host getter observes the transformed ESM export during its
 * own execution. It returns a non-callable value; no application call is
 * needed for the observation.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {string|null} primitivePrototype
 * @returns {Promise<string>}
 */
async function executeWithHostPrototypeObserver(files,primitivePrototype) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-getter-observer-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'preload.cjs');
    const source=primitivePrototype===null?'':[
      'Object.defineProperty('+primitivePrototype+'.prototype,"callback",{',
      '  configurable:true,',
      '  get:function(){',
      '    import("./state.mjs").then(({state})=>{',
      '      console.log("HOST:"+Object.keys(state).join(","));',
      '    });',
      '    return 0;',
      '  }',
      '});'
    ].join('\n');
    await atomicWrite(preloader,source);
    const child=spawnSync(process.execPath,
      ['-r',preloader,path.join(directory,'main.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.split(/\r?\n/).filter(Boolean).sort().join('\n')+'\n';
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

const primitives=[
  {label:'Number',prototype:'Number',expression:'(1)'},
  {label:'Boolean',prototype:'Boolean',expression:'(true)'},
  {label:'BigInt',prototype:'BigInt',expression:'(1n)'},
  {label:'Symbol',prototype:'Symbol',expression:'(Symbol.iterator)'}
];

for(const primitive of primitives) {
  test('host getter on '+primitive.label+' prototype observes renamed ESM export without calling its result',async()=>{
    const files=graph([
      'import {state} from "./state.mjs";',
      'void '+primitive.expression+'.callback;',
      'console.log("APP:"+state.secretField);'
    ].join('\n'));
    const native=await executeWithHostPrototypeObserver(files,primitive.prototype);
    assert.equal(native,'APP:53\nHOST:secretField\n');
    const output=transform(files,'primitive-getter-observer-'+primitive.label);
    const emitted=await executeWithHostPrototypeObserver(output.files,primitive.prototype);
    assert.equal(emitted,native,
      'The getter itself can observe the cross-file owner even when its result is never called');
    assert.equal(output.crossFile.properties,0,
      'A primitive prototype getter is an unlisted host effect and must veto unsafe owner-key renaming');
  });
}

test('ordinary own primitive length read retains independent private-field rewrite yield',async()=>{
  const files=graph([
    'import {state} from "./state.mjs";',
    'const length="x".length;',
    'console.log("APP:"+state.secretField+":"+length);'
  ].join('\n'));
  const native=await executeWithHostPrototypeObserver(files,null);
  assert.equal(native,'APP:53:1\n');
  const output=transform(files,'primitive-getter-own-length-positive');
  const emitted=await executeWithHostPrototypeObserver(output.files,null);
  assert.equal(emitted,native);
  assert.equal(output.crossFile.properties,1,
    'A primitive own-data length read should preserve one independent safe rewrite');
});
