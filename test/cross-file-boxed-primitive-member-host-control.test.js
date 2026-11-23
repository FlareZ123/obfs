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
 * Run the supplied ESM graph after an unlisted host preload mutates all
 * non-string primitive prototype surfaces used by the fixtures.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function executeWithHostPrimitiveGetters(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-boxed-primitive-member-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'preload.cjs');
    await atomicWrite(preloader,[
      'for(const prototype of [Number.prototype,Boolean.prototype,BigInt.prototype,Symbol.prototype]){',
      '  Object.defineProperty(prototype,"callback",{configurable:true,get:function(){return Function;}});',
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

/**
 * @param {string} mainSource
 * @param {boolean} withPass
 * @returns {ModuleFile[]}
 */
function graph(mainSource,withPass) {
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:mainSource}
  ];
  if(withPass)files.push({
    path:'pass.mjs',sourceType:'module',
    code:'export function identity(value){return value;}'
  });
  return files;
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

const flows=[
  {
    label:'direct literal',
    code:expression=>'const Loader=('+expression+').callback;',
    withPass:false
  },
  {
    label:'assignment alias',
    code:expression=>'const primitive='+expression+';const alias=primitive;const Loader=alias.callback;',
    withPass:false
  },
  {
    label:'local identity return',
    code:expression=>'function identity(value){return value;}const primitive='+expression+';const alias=identity(primitive);const Loader=alias.callback;',
    withPass:false
  },
  {
    label:'object field storage',
    code:expression=>'const primitive='+expression+';const holder={primitive};const alias=holder.primitive;const Loader=alias.callback;',
    withPass:false
  },
  {
    label:'imported ESM identity return',
    code:expression=>'import {identity} from "./pass.mjs";const primitive='+expression+';const alias=identity(primitive);const Loader=alias.callback;',
    withPass:true
  }
];

for(const primitive of primitives) {
  for(const flow of flows) {
    test('host '+primitive.label+' prototype getter survives '+flow.label+' provenance',async()=>{
      const files=graph([
        'import {state} from "./state.mjs";',
        flow.code(primitive.expression),
        'const injected=Loader(\'return import("./state.mjs")\');',
        'const remote=await injected();',
        'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
      ].join('\n'),flow.withPass);
      const native=await executeWithHostPrimitiveGetters(files);
      assert.equal(native,'[53,["secretField"],53]\n');
      const output=transform(files,'boxed-member-'+primitive.label+'-'+flow.label);
      const emitted=await executeWithHostPrimitiveGetters(output.files);
      assert.equal(emitted,native,
        'Host-controlled primitive member reads must not enable unsafe cross-file owner-key renaming');
      assert.equal(output.crossFile.properties,0,
        'A primitive-origin host getter must be treated as an unknown callable source');
    });
  }
}

test('ordinary primitive arithmetic retains independent private-field rewrite yield',async()=>{
  const files=graph([
    'import {state} from "./state.mjs";',
    'const total=1+2;',
    'console.log(JSON.stringify([state.secretField,total]));'
  ].join('\n'),false);
  const native=await executeWithHostPrimitiveGetters(files);
  assert.equal(native,'[53,3]\n');
  const output=transform(files,'boxed-member-arithmetic-positive');
  const emitted=await executeWithHostPrimitiveGetters(output.files);
  assert.equal(emitted,native);
  assert.equal(output.crossFile.properties,1,
    'Ordinary primitive arithmetic should retain one safe cross-file property rewrite');
});
