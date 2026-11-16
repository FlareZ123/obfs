'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'|'commonjs'}} Source */
/**
 * Check emitted files in the same native Node environment as their originals.
 * The fixture actually reads its own or a sibling JavaScript file by path.
 * @param {Source[] | ReturnType<typeof obfuscateFiles>['files']} files
 * @param {string} entry
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(files,entry) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-node-loader-read-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,entry)],{
      encoding:'utf8',timeout:20000
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const [label,loader] of [
  ['named node:module createRequire',
    'import {createRequire} from "node:module";\n'+
    'const io=createRequire(import.meta.url)("node:fs");\n'],
  ['default module createRequire',
    'import Module from "module";\n'+
    'const io=Module.createRequire(import.meta.url)("node:fs");\n'],
  ['module _load',
    'import Module from "node:module";\n'+
    'const io=Module._load("node:fs");\n']
]) {
  test('opaque module loader preserves cross-file source bytes: '+label,async()=>{
    /** @type {Source[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',
        code:'export const state={secretField:23};\n'},
      {path:'main.mjs',sourceType:'module',
        code:'import {state} from "./state.mjs";\n'+loader+
          'const source=io.readFileSync(new URL("./state.mjs",import.meta.url),"utf8");\n'+
          'console.log(state.secretField,source.includes("secretField"));\n'}
    ];
    const baseline=await run(files,'main.mjs');
    assert.equal(baseline.status,0,baseline.stderr);
    assert.equal(baseline.stdout,'23 true\n');
    const compiled=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'opaque-loader/'+label,
      strings:false,identifiers:true
    });
    assert.equal(compiled.crossFile.properties,0);
    assert.deepEqual(compiled.files.map(file=>file.code),files.map(file=>file.code));
    assert.deepEqual(await run(compiled.files,'main.mjs'),baseline);
  });
}

for(const [label,loader] of [
  ['module.require','module.require("node:fs")'],
  ['require.main.require','require.main.require("node:fs")'],
  ['process.mainModule.require','process.mainModule.require("node:fs")'],
  ['module.constructor._load','module.constructor._load("node:fs")'],
  ['module.constructor.createRequire',
    'module.constructor.createRequire(__filename)("node:fs")']
]) {
  test('CommonJS built-in require member preserves self-source: '+label,async()=>{
    /** @type {Source[]} */
    const files=[{path:'main.cjs',sourceType:'commonjs',
      code:'const io='+loader+';\n'+
        'const source=io.readFileSync(__filename,"utf8");\n'+
        'const state={secretField:31};\n'+
        'const key=["secret","Field"].join("");\n'+
        'console.log(state.secretField,source.includes(key));\n'}];
    const baseline=await run(files,'main.cjs');
    assert.equal(baseline.status,0,baseline.stderr);
    assert.equal(baseline.stdout,'31 true\n');
    const compiled=obfuscateFiles(files,{
      mode:'sno',seed:'cjs-opaque-loader/'+label,strings:true,
      properties:true,identifiers:true
    });
    assert.equal(compiled.files[0].code,files[0].code);
    assert.deepEqual(await run(compiled.files,'main.cjs'),baseline);
  });
}
