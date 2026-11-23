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
 * Run an ESM graph with host-mutated primitive prototype toString methods.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function executeWithHostPrimitiveToString(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-tostring-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'preload.cjs');
    await atomicWrite(preloader,[
      'for(const prototype of [String.prototype,Number.prototype,Boolean.prototype,BigInt.prototype,Symbol.prototype]){',
      '  Object.defineProperty(prototype,"toString",{configurable:true,writable:true,value:function(){return Function;}});',
      '}'
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

const primitiveMethods=[
  {label:'String',expression:'"x".toString()'},
  {label:'Number',expression:'(19).toString(16)'},
  {label:'Boolean',expression:'(true).toString()'},
  {label:'BigInt',expression:'(19n).toString(16)'},
  {label:'Symbol',expression:'Symbol.iterator.toString()'}
];

for(const primitive of primitiveMethods) {
  test('host-mutated '+primitive.label+'.prototype.toString can return a Function',async()=>{
    const files=graph([
      'import {state} from "./state.mjs";',
      'const Loader='+primitive.expression+';',
      'const injected=Loader(\'return import("./state.mjs")\');',
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n'));
    const native=await executeWithHostPrimitiveToString(files);
    assert.equal(native,'[53,["secretField"],53]\n');
    const output=transform(files,'primitive-prototype-tostring-'+primitive.label);
    const emitted=await executeWithHostPrimitiveToString(output.files);
    assert.equal(emitted,native,
      'A primitive prototype method must not be assumed to be the pristine builtin');
    assert.equal(output.crossFile.properties,0,
      'A host-overridden primitive toString method can produce an opaque Function');
  });
}

test('ordinary primitive arithmetic keeps independent private-field rewrite yield',async()=>{
  const files=graph([
    'import {state} from "./state.mjs";',
    'const total=1+2;',
    'console.log(JSON.stringify([state.secretField,total]));'
  ].join('\n'));
  const native=await executeWithHostPrimitiveToString(files);
  assert.equal(native,'[53,3]\n');
  const output=transform(files,'primitive-prototype-tostring-positive');
  const emitted=await executeWithHostPrimitiveToString(output.files);
  assert.equal(emitted,native);
  assert.equal(output.crossFile.properties,1,
    'Primitive arithmetic does not consult a prototype method and should retain one safe rewrite');
});
