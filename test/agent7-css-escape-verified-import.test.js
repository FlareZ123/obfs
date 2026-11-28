'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {collectVerifiedImportedCssEscapeAliases}=require('../src/cross-properties');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Execute exact bytes in an ESM dependency graph, with the CSSOM-to-DOMString
 * source conversion supplied by the untransformed embedding host. A separate
 * real Chromium test establishes that CSS.escape actually coerces functions.
 * @param {SourceFile[]} files
 * @returns {Promise<{source:string,value:number}>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-css-import-'));
  try{
    for(const file of files)await fs.writeFile(path.join(root,file.path),file.code);
    await fs.writeFile(path.join(root,'bootstrap.mjs'),
      'globalThis.CSS={escape(input){return String(input)}};'+
      'await import("./entry.mjs");');
    const child=spawnSync(process.execPath,[path.join(root,'bootstrap.mjs')],{
      cwd:root,encoding:'utf8',timeout:12000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{source:string,value:number}} */(JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const variants=[
  {
    label:'named native export',
    import:'import {escape as consume} from "./native.mjs";',
    call:'consume(inspect)'
  },
  {
    label:'namespace native import',
    import:'import * as api from "./native.mjs";',
    call:'api.escape(inspect)'
  },
  {
    label:'forwarded named export',
    relay:'export {escape as exposed} from "./native.mjs";',
    import:'import {exposed as consume} from "./relay.mjs";',
    call:'consume(inspect)'
  },
  {
    label:'forwarded star export',
    relay:'export * from "./native.mjs";',
    import:'import {escape as consume} from "./relay.mjs";',
    call:'consume(inspect)'
  }
];

/**
 * @param {typeof variants[number]} variant
 * @returns {SourceFile[]}
 */
function observedGraph(variant){
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:
      'const owner={secretField:41};'+
      'export function inspect(privateArg){return privateArg+owner.secretField;}'},
    {path:'native.mjs',sourceType:'module',code:'export const escape=CSS.escape;'}
  ];
  if(variant.relay)files.push({
    path:'relay.mjs',sourceType:'module',code:variant.relay
  });
  files.push({path:'entry.mjs',sourceType:'module',code:[
    'import {inspect} from "./state.mjs";',
    variant.import,
    'process.stdout.write(JSON.stringify({source:'+variant.call+
      ',value:inspect(1)}));'
  ].join('')});
  return files;
}

/**
 * @param {SourceFile[]} files
 * @param {'coo'|'sco'|'sno'} mode
 */
function compile(files,mode){
  return obfuscateFiles(files,{
    mode,seed:'css-verified-import/'+mode,closedWorld:true,
    identifiers:true,properties:true,strings:false
  });
}


test('exact CSS.escape import proof tracks named, namespace and barrel aliases',()=>{
  for(const variant of variants){
    const proof=collectVerifiedImportedCssEscapeAliases(observedGraph(variant));
    const entry=proof.get('entry.mjs');
    const expected=variant.label==='namespace native import'?'api.escape':'consume';
    assert.ok(entry?.has(expected),
      variant.label+' must yield verified '+expected+' ESM intrinsic provenance');
  }
  /** @type {SourceFile[]} */
  const ordinary=[
    {path:'native.mjs',sourceType:'module',
      code:'export const escape=value=>String(value);'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {escape as consume} from "./native.mjs";consume(()=>1);'}
  ];
  const falseProof=collectVerifiedImportedCssEscapeAliases(ordinary);
  assert.equal(falseProof.get('entry.mjs')?.size??0,0,
    'an unrelated same-named local function is not proven to be CSSOM native');
});

test('imported CSS.escape of a primitive preserves unrelated private owner yield',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'const owner={secretField:41};'+
        'function inner(privateArg){return owner.secretField+privateArg;}'+
        'export function inspect(){return inner(1);}'},
    {path:'native.mjs',sourceType:'module',code:'export const escape=CSS.escape;'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {inspect} from "./state.mjs";'+
        'import {escape as consume} from "./native.mjs";'+
        'process.stdout.write(JSON.stringify({source:consume("css-primitive"),'+
        'value:inspect()}));'}
  ];
  const native=await execute(files);
  assert.deepEqual(native,{source:'css-primitive',value:42});
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const output=compile(files,mode);
    const state=output.files.find(f=>f.path==='state.mjs');
    assert.ok(state && state.metrics.properties+output.crossFile.properties>=1,
      mode+' source-safe imported CSS call must retain private record rewrite yield');
    assert.ok(state.metrics.bindings>=1,
      mode+' source-safe imported CSS call must retain lexical renaming');
    assert.deepEqual(await execute(/** @type {SourceFile[]} */(output.files)),native);
  }
});

test('native CSS.escape method provenance crosses ESM imports and barrels',async()=>{
  for(const variant of variants){
    const files=observedGraph(variant);
    const native=await execute(files);
    assert.equal(native.value,42);
    assert.ok(native.source.includes('privateArg')&&
      native.source.includes('secretField'),'Untransformed host must observe source');
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const output=compile(files,mode);
      const executed=await execute(/** @type {SourceFile[]} */(output.files));
      assert.deepEqual(executed,native,
        mode+' '+variant.label+' imported intrinsic source-observation parity');
    }
  }
});

test('unobserved private ESM helper still earns private field rewrite yield',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'const owner={secretField:41};'+
        'function inner(){return owner.secretField;}'+
        'export function inspect(privateArg){return inner()+privateArg;}'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {inspect} from "./state.mjs";'+
        'process.stdout.write(JSON.stringify({source:"safe",value:inspect(1)}));'}
  ];
  const native=await execute(files);
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const output=compile(files,mode);
    const state=output.files.find(f=>f.path==='state.mjs');
    assert.ok(state && state.metrics.properties+output.crossFile.properties>=1,
      mode+' must not disable all unrelated private owner rewrites');
    assert.deepEqual(await execute(/** @type {SourceFile[]} */(output.files)),native);
  }
});
