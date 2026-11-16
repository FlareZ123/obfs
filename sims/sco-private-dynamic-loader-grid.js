'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports}=require('../src');

/**
 * Independent private-graph source-completeness challenge. Each unsafe
 * generated private engine dynamically imports a *real*, unlisted ESM leaf.
 * The compiler receives the engine source but deliberately not the leaf.
 *
 * @typedef {{name:string,prefix:string,unsafe:boolean,expected:number}} Fixture
 */

/** @type {Fixture[]} */
const fixtures=[
  {name:'direct-constructor',unsafe:true,expected:42,
    prefix:'const load=(()=>0).constructor("p","return import(p)");'},
  {name:'literal-key-alias',unsafe:true,expected:42,
    prefix:'const k="constructor"; const o={}; const load=o[k][k]("p","return import(p)");'},
  {name:'computed-inline-callable',unsafe:true,expected:42,
    prefix:'const k=["con","structor"].join(""); const load=(()=>0)[k]("p","return import(p)");'},
  {name:'unknown-key-object-alias',unsafe:true,expected:42,
    prefix:'const k=["con","structor"].join(""); const o={}; const load=o[k][k]("p","return import(p)");'},
  {name:'factory-returned-function',unsafe:true,expected:42,
    prefix:'const make=()=>(()=>0); const fn=make(); const k=["con","structor"].join(""); const load=fn[k]("p","return import(p)");'},
  {name:'keyed-property-getter-helper',unsafe:true,expected:42,
    prefix:'const get=(o,k)=>o[k]; const k=["con","structor"].join(""); const load=get(get({},k),k)("p","return import(p)");'},
  {name:'Object-keys-derived',unsafe:true,expected:42,
    prefix:'const k=Object.keys({constructor:1})[0]; const o={}; const load=o[k][k]("p","return import(p)");'},
  {name:'String-fromCharCode-derived',unsafe:true,expected:42,
    prefix:'const k=String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114); const o={}; const load=o[k][k]("p","return import(p)");'},
  {name:'safe-direct-field',unsafe:false,expected:42,
    prefix:'const record={answer:41};'},
  {name:'safe-const-computed-key',unsafe:false,expected:42,
    prefix:'const k="answer";const record={answer:41};'},
  {name:'safe-numeric-array-index',unsafe:false,expected:42,
    prefix:'const record=[41];'},
  {name:'safe-callable-name-field',unsafe:false,expected:3,
    prefix:'const fn=(v)=>v;'}
];

/** @param {Fixture} fixture @returns {string} */
function source(fixture){
  if(fixture.unsafe){
    return fixture.prefix+'\n'+
      'export async function deriveProof(v){return (await load("./deep/secret.mjs")).secretValue+v;}';
  }
  const statement=fixture.name==='safe-callable-name-field'?
    'return fn["name"].length+v;':
    fixture.name==='safe-numeric-array-index'?
      'return record[0]+v;':
      fixture.name==='safe-const-computed-key'?
        'return record[k]+v;':
        'return record.answer+v;';
  return fixture.prefix+'\nexport function deriveProof(v){'+statement+'}';
}

const entry=[
  'import {deriveProof} from "./private/engine.mjs";',
  'export async function protectedDigest(v){return deriveProof(v);}',
  'export function visible(v){return v;}'
].join('\n');

/**
 * @param {Fixture} fixture
 * @returns {Promise<{name:string,unsafe:boolean,nativeValue:number,admitted:boolean,
 *   privatePaths:string[],reason:string}>}
 */
async function evaluate(fixture){
  const code=source(fixture);
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-dynamic-grid-'));
  try{
    await atomicWrite(path.join(folder,'private/engine.mjs'),code);
    await atomicWrite(path.join(folder,'private/deep/secret.mjs'),'export const secretValue=41;\n');
    const native=await import(pathToFileURL(path.join(folder,'private/engine.mjs')).href);
    const nativeValue=await native.deriveProof(1);
    assert.equal(nativeValue,fixture.expected,
      'Native fixture must demonstrate the stated behavior: '+fixture.name);
    try{
      const partition=partitionScoSelectedAsyncExports({
        path:'entry.mjs',sourceType:'module',code:entry
      },{
        seed:'sco-dynamic-private-graph-20261116',
        privateNames:['protectedDigest'],
        privateModuleImports:['./private/engine.mjs'],
        privateModuleSources:[{path:'private/engine.mjs',code}]
      });
      return {name:fixture.name,unsafe:fixture.unsafe,nativeValue,
        admitted:true,privatePaths:partition.clientFile.privateModulePaths??[],reason:''};
    }catch(error){
      return {name:fixture.name,unsafe:fixture.unsafe,nativeValue,
        admitted:false,privatePaths:[],
        reason:error instanceof Error?error.message:String(error)};
    }
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

async function main(){
  const cases=[];
  for(const fixture of fixtures)cases.push(await evaluate(fixture));
  const unsafe=cases.filter(x=>x.unsafe);
  const safe=cases.filter(x=>!x.unsafe);
  const summary={
    source:'sims/sco-private-dynamic-loader-grid.js',
    node:process.version,platform:process.platform,
    unsafeCases:unsafe.length,
    nativeUnsafeSucceeded:unsafe.filter(x=>x.nativeValue===42).length,
    unsafeAdmittedWithMissingLeaf:unsafe.filter(x=>x.admitted&&
      !x.privatePaths.includes('private/deep/secret.mjs')).length,
    unsafeRefused:unsafe.filter(x=>!x.admitted).length,
    safeControls:safe.length,
    safeAdmitted:safe.filter(x=>x.admitted).length,
    safeRefused:safe.filter(x=>!x.admitted).length,
    cases
  };
  console.log('SCO_PRIVATE_DYNAMIC_LOADER_GRID '+JSON.stringify(summary));
  assert.equal(summary.safeAdmitted,summary.safeControls,
    'Known safe positive source controls must retain compiler coverage');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
