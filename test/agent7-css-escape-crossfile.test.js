'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {parse,observesFunctionSource}=require('../src/ast');

/** @typedef {import('../src/core').SourceFile} SourceFile */

const source='const state={secretField:41};'+
  'export function inspect(){return state.secretField;}';
// Independent positive control: the published wrapper has no private-field
// spelling in its own source, so the inner directly invoked helper can be
// renamed in the absence of an imported source-observer call.
const wrappedSource='const state={secretField:41};'+
  'function privateInspect(){return state.secretField;}'+
  'export function inspect(){return privateInspect();}';
const importLine='import {inspect} from "./state.mjs";';
const entries={
  direct:importLine+'console.log(JSON.stringify({value:inspect()}));',
  css:importLine+'console.log(JSON.stringify({source:CSS.escape(inspect),'+
    'value:inspect()}));'
};

/**
 * Run an actual native Node ES module graph. CSS.escape is supplied by an
 * untransformed host bootstrap so no explicit String(fn) enters the compiler
 * graph. CSSOM's browser implementation is independently exercised by the
 * Chromium witness in agent7-css-escape-native-source.test.js.
 * @param {SourceFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-css-observe-'));
  try {
    for(const file of files) {
      await fs.writeFile(path.join(directory,file.path),file.code);
    }
    await fs.writeFile(path.join(directory,'bootstrap.mjs'),
      'globalThis.CSS={escape(input){return String(input)}};'+
      'await import("./entry.mjs");');
    const result=spawnSync(process.execPath,[path.join(directory,'bootstrap.mjs')],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(result.status,0,result.stderr||result.error?.message);
    return result.stdout.trim();
  }finally{
    await fs.rm(directory,{force:true,recursive:true});
  }
}

/**
 * @param {'direct'|'css'} kind
 * @returns {SourceFile[]}
 */
function graph(kind) {
  return [
    {path:'state.mjs',sourceType:'module',code:kind==='direct'?wrappedSource:source},
    {path:'entry.mjs',sourceType:'module',code:entries[kind]}
  ];
}

/** @param {SourceFile[]} files @param {'coo'|'sno'|'sco'} mode */
function compile(files,mode) {
  return obfuscateFiles(files,{mode,closedWorld:true,
    seed:'css-crossfile-'+mode,properties:true,strings:false,identifiers:false});
}

test('native CSSOM source observer is visible in ESM import graph',async()=>{
  const native=JSON.parse(await execute(graph('css')));
  assert.equal(native.value,41);
  assert.equal(native.source,'function inspect(){return state.secretField;}');
  assert.equal(observesFunctionSource(parse(entries.css,'module')),true,
    'The compiler must recognize a native CSS.escape imported callable');
});

test('closed-world imported direct-call positive property rewrite remains',async()=>{
  const original=graph('direct');
  const native=await execute(original);
  for(const mode of /** @type {const} */(['coo','sco','sno'])) {
    const compiled=compile(original,mode);
    const transformed=compiled.files[0];
    assert.ok((transformed.metrics.properties+compiled.crossFile.properties)>0,
      mode+' fixture must have actual protected-property yield');
    assert.equal(await execute(/** @type {SourceFile[]} */(compiled.files)),native,
      mode+' direct-call numeric parity');
  }
});

test('closed-world CSS.escape call preserves imported function source in each mode',async()=>{
  const original=graph('css');
  const native=await execute(original);
  for(const mode of /** @type {const} */(['coo','sco','sno'])) {
    const compiled=compile(original,mode);
    const emitted=await execute(/** @type {SourceFile[]} */(compiled.files));
    assert.equal(emitted,native,
      mode+' imported function source must remain unchanged');
  }
});
