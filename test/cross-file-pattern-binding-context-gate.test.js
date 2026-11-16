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
 * Native execution exposes imported exported-object key names.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-pattern-context-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/**
 * The for-of, catch and function parameter binding patterns have no direct
 * VariableDeclarator initializer. Their dynamic key can still read the
 * inherited Function constructor from Number and perform a runtime import.
 * @param {string} setup
 * @returns {ModuleFile[]}
 */
function graph(setup){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'const key=["con","structor"].join("");',
      'let injected;',
      setup,
      'const remote=await injected();',
      'console.log(JSON.stringify([state.secretField,Object.keys(remote.state),remote.state.secretField]));'
    ].join('\n')}
  ];
}

for(const [label,source] of [
  ['for-of declaration',
    'for(const {[key]:Loader} of [Number]){injected=Loader('+JSON.stringify('return import("./state.mjs")')+');}'],
  ['for-of assignment',
    'let Loader;for({[key]:Loader} of [Number]){injected=Loader('+JSON.stringify('return import("./state.mjs")')+');}'],
  ['function parameter',
    'function compile({[key]:Loader}){return Loader('+JSON.stringify('return import("./state.mjs")')+');}injected=compile(Number);'],
  ['catch parameter',
    'try{throw Number;}catch({[key]:Loader}){injected=Loader('+JSON.stringify('return import("./state.mjs")')+');}']
]) {
  test('dynamic constructor destructuring in '+label+' must refuse mangling',async()=>{
    const input=graph(source);
    const original=await execute(input);
    assert.equal(original,'[53,["secretField"],53]\n');
    const output=obfuscateFiles(input,{
      mode:'coo',closedWorld:true,seed:'pattern-context-'+label,
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.properties,0);
    assert.equal(await execute(output.files),original);
  });
}

test('known constant computed function parameter pattern retains one renamed field',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:53};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";const key="value";'+
      'function pick({[key]:v}){return v;}console.log(state.secretField+pick({value:2}));'}
  ];
  const native=await execute(files);
  assert.equal(native,'55\n');
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'known-pattern-positive',strings:false,identifiers:false
  });
  assert.equal(output.crossFile.properties,1);
  assert.equal(await execute(output.files),native);
});
