'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Top-level browser WindowProxy aliases resolve to the current realm.
 * Model those aliases in an independent Node child, so native intrinsics
 * mutated by an individual case cannot poison the test process.
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-window-alias-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',windowsHide:true,timeout:10000
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} bootstrap
 * @param {string} sideEffect
 * @returns {SourceFile[]}
 */
function graph(bootstrap,sideEffect) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:bootstrap+sideEffect},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='window-alias-protected-literal';"}
  ];
}

const unsafe=[
  ['top global','globalThis.top=globalThis;','top.String.fromCharCode=()=>"?";'],
  ['globalThis.top','globalThis.top=globalThis;','globalThis.top.String.fromCharCode=()=>"?";'],
  ['parent global','globalThis.parent=globalThis;','parent.String.fromCharCode=()=>"?";'],
  ['window parent','globalThis.window=globalThis;globalThis.parent=globalThis;','window.parent.String.fromCharCode=()=>"?";'],
  ['frames global','globalThis.frames=globalThis;','frames.String.fromCharCode=()=>"?";'],
  ['opener alias','globalThis.opener=globalThis;','opener.String.fromCharCode=()=>"?";']
];

for(const [name,bootstrap,sideEffect] of unsafe) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    test('browser WindowProxy alias must prevent corrupt decoder: '+name+'/'+mode,async()=>{
      const input=graph(bootstrap,sideEffect);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'browser-window-decoder-alias/'+name+'/'+mode
      });
      const native=await execute(input);
      const emitted=await execute(output.files);
      assert.equal(native.status,0,native.stderr);
      assert.equal(native.stdout,'window-alias-protected-literal');
      assert.deepEqual(emitted,native,'A poisoned ambient String changed a generated literal');
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0,
        'The decoder must be disabled before an earlier WindowProxy mutation');
    });
  }
}

for(const mode of /** @type {const} */ (['coo','sno'])) {
  test('unrelated top-level Number write retains actual encoded work: '+mode,async()=>{
    const input=graph('globalThis.top=globalThis;','top.Number.windowAliasCanary=1;');
    const output=obfuscateFiles(input,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'browser-window-decoder-alias/positive/'+mode
    });
    assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
    assert.deepEqual(await execute(output.files),await execute(input));
  });
}
