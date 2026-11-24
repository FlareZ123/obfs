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
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {string|null} primitivePrototype
 * @returns {Promise<string>}
 */
async function execute(files,primitivePrototype) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-primitive-unused-getter-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preload=primitivePrototype===null?'':[
      'Object.defineProperty('+primitivePrototype+'.prototype,"callback",{',
      '  configurable:true,',
      '  get:function(){',
      '    import("./state.mjs").then(({state})=>console.log("HOST:"+Object.keys(state).join(",")));',
      '    return 0;',
      '  }',
      '});'
    ].join('\n');
    await atomicWrite(path.join(directory,'preload.cjs'),preload);
    const child=spawnSync(process.execPath,
      ['-r',path.join(directory,'preload.cjs'),path.join(directory,'main.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.split(/\r?\n/).filter(Boolean).sort().join('\n')+'\n';
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} main @returns {ModuleFile[]} */
function graph(main) {
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:main}
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
  test('unused local binding from '+primitive.label+' prototype getter still preserves host observation',async()=>{
    const files=graph([
      'import {state} from "./state.mjs";',
      'const ignored='+primitive.expression+'.callback;',
      'console.log("APP:"+state.secretField);'
    ].join('\n'));
    const native=await execute(files,primitive.prototype);
    assert.equal(native,'APP:53\nHOST:secretField\n');
    const output=transform(files,'unused-getter-'+primitive.label);
    const emitted=await execute(output.files,primitive.prototype);
    assert.equal(emitted,native,
      'Even an unused getter result can have host side effects before the local binding is discarded');
    assert.equal(output.crossFile.properties,0,
      'A primitive getter with host side effects must veto owner-key renaming');
  });
}

test('ordinary arithmetic keeps an independent private-field rewrite',async()=>{
  const files=graph([
    'import {state} from "./state.mjs";',
    'const total=1+2;',
    'console.log(JSON.stringify([state.secretField,total]));'
  ].join('\n'));
  const native=await execute(files,null);
  assert.equal(native,'[53,3]\n');
  const output=transform(files,'unused-getter-arithmetic-positive');
  const emitted=await execute(output.files,null);
  assert.equal(emitted,native);
  assert.equal(output.crossFile.properties,1);
});
