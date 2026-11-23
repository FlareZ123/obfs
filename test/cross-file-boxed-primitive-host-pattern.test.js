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
 * Run an ESM graph after a host-only preload installs prototype accessors and
 * iterators on boxed primitive prototypes.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function executeWithHostBoxedPrimitiveCapabilities(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-boxed-primitive-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'preload.cjs');
    await atomicWrite(preloader,[
      'for(const prototype of [Number.prototype,Boolean.prototype,BigInt.prototype,Symbol.prototype]){',
      '  Object.defineProperty(prototype,"callback",{configurable:true,get:function(){return Function;}});',
      '  Object.defineProperty(prototype,Symbol.iterator,{configurable:true,value:function*(){yield Function;}});',
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

const primitives=[
  {label:'Number',expression:'1'},
  {label:'Boolean',expression:'true'},
  {label:'BigInt',expression:'1n'},
  {label:'Symbol',expression:'Symbol.iterator'}
];

for(const primitive of primitives) {
  for(const pattern of ['object','array']) {
    test('boxed '+primitive.label+' '+pattern+' destructuring can receive a host Function',async()=>{
      const binding=pattern==='object'
        ? 'const {callback:Loader}='+primitive.expression+';'
        : 'const [Loader]='+primitive.expression+';';
      const files=graph([
        'import {state} from "./state.mjs";',
        binding,
        'const injected=Loader(\'return import("./state.mjs")\');',
        'const remote=await injected();',
        'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
      ].join('\n'));
      const native=await executeWithHostBoxedPrimitiveCapabilities(files);
      assert.equal(native,'[53,["secretField"],53]\n');
      const output=transform(files,'boxed-primitive-'+primitive.label+'-'+pattern);
      const emitted=await executeWithHostBoxedPrimitiveCapabilities(output.files);
      assert.equal(emitted,native,
        'A host-modified boxed primitive prototype must not enable unsafe owner-key renaming');
      assert.equal(output.crossFile.properties,0,
        'A host-provided Function from boxed-primitive destructuring must be treated as opaque');
    });
  }
}

test('primitive arithmetic retains independent private-field rewrite yield',async()=>{
  const files=graph([
    'import {state} from "./state.mjs";',
    'const total=1+2;',
    'console.log(JSON.stringify([state.secretField,total]));'
  ].join('\n'));
  const native=await executeWithHostBoxedPrimitiveCapabilities(files);
  assert.equal(native,'[53,3]\n');
  const output=transform(files,'boxed-primitive-arithmetic-positive');
  const emitted=await executeWithHostBoxedPrimitiveCapabilities(output.files);
  assert.equal(emitted,native);
  assert.equal(output.crossFile.properties,1,
    'Ordinary primitive arithmetic should preserve one safe cross-file property rewrite');
});
