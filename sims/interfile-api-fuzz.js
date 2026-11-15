'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/** @typedef {{index:number,scenario:string,files:SourceFile[],expectedProperties:number|null}} Fixture */

/**
 * Build a closed-world ESM graph with two private fields. The negative cases
 * expose them through an unknown key, reflection, JSON, or an external API.
 * Each generated graph gets its own real Node module filesystem namespace.
 *
 * @param {number} seed
 * @param {number} kind
 * @returns {Fixture}
 */
function fixture(seed,kind) {
  const field='privateField'+seed;
  const other='auxiliaryField'+seed;
  const first=(seed*17)%101+1;
  const second=(seed*29)%79+2;
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={'+field+':'+first+','+other+':'+second+'};'}
  ];
  let logic='';
  let expectedProperties=null;
  let scenario='';
  if(kind===0) {
    scenario='static-private';
    logic='export const value=state.'+field+'+state.'+other+';';
    expectedProperties=2;
  }else if(kind===1) {
    scenario='external-dynamic-key';
    logic='import "./api.mjs";export const value=state[globalThis.window.api.key]+state.'+other+';';
    expectedProperties=0;
  }else if(kind===2) {
    scenario='json-reflection';
    logic='export const value=JSON.stringify(state);';
    expectedProperties=0;
  }else if(kind===3) {
    scenario='own-keys-reflection';
    logic='export const value=Reflect.ownKeys(state).sort().join("|");';
    expectedProperties=0;
  }else if(kind===4) {
    scenario='external-object-reader';
    logic='import "./api.mjs";export const value=globalThis.window.api.read(state);';
    expectedProperties=0;
  }else if(kind===5) {
    scenario='computed-constant-alias';
    logic='const key='+JSON.stringify(field)+';export const value=state[key]+state.'+other+';';
    expectedProperties=0;
  }else {
    throw new RangeError('Unknown graph shape');
  }
  if(kind===1||kind===4)files.push({
    path:'api.mjs',sourceType:'module',
    code:'globalThis.window={api:{key:'+JSON.stringify(field)+
      ',read(object){return object['+JSON.stringify(field)+']+7;}}};'
  });
  files.push({path:'bridge.mjs',sourceType:'module',
    code:'import {state} from "./state.mjs";'+logic});
  files.push({path:'entry.mjs',sourceType:'module',
    code:'import {value} from "./bridge.mjs";export {value};'});
  return {index:seed*6+kind,scenario,files,expectedProperties};
}

/**
 * Run an array of independent file-graph fixtures with Node's actual ESM
 * loader. One fresh Node child imports all entries in order, preserving
 * module graph semantics without per-fixture process-spawn noise.
 *
 * @param {string} root
 * @param {{index:number,files:SourceFile[]}[]} fixtures
 * @returns {Promise<unknown[]>}
 */
async function execute(root,fixtures) {
  await fs.mkdir(root,{recursive:true});
  for(const caseFile of fixtures) {
    for(const file of caseFile.files) {
      const destination=path.join(root,String(caseFile.index),file.path);
      await atomicWrite(destination,file.code);
    }
  }
  const body='const out=[];'+fixtures.map(f=>
    'out.push((await import("./'+f.index+'/entry.mjs")).value);'
  ).join('')+'console.log(JSON.stringify(out));';
  const runner=path.join(root,'runner.mjs');
  await atomicWrite(runner,body);
  const result=spawnSync(process.execPath,[runner],{
    encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024
  });
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

/**
 * @param {number} [seedCount]
 * @returns {Promise<{graphs:number,positive:number,negative:number,positiveProperties:number,nativeEqual:boolean}>}
 */
async function runApiFuzz(seedCount=20) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-interfile-api-fuzz-'));
  try {
    /** @type {Fixture[]} */
    const cases=[];
    for(let seed=0;seed<seedCount;seed++) {
      for(let kind=0;kind<6;kind++)cases.push(fixture(seed,kind));
    }
    let positive=0,negative=0,positiveProperties=0;
    const transformed=cases.map(item=>{
      const output=obfuscateFiles(item.files,{
        mode:'coo',closedWorld:true,
        seed:'api-interfile-fuzz/'+item.index,
        strings:false,identifiers:false
      });
      if(item.expectedProperties===2) {
        assert.ok(output.crossFile.properties>=2,
          item.scenario+' expected two safe key rewrites for '+item.index);
        positive++;
        positiveProperties+=output.crossFile.properties;
      } else {
        assert.equal(output.crossFile.properties,0,
          item.scenario+' unexpectedly renamed reflected/escaped fields for '+item.index);
        negative++;
      }
      return {index:item.index,files:/** @type {SourceFile[]} */ (output.files)};
    });
    const reference=await execute(path.join(root,'original'),cases);
    const changed=await execute(path.join(root,'obfuscated'),transformed);
    assert.deepEqual(changed,reference,'Native inter-file ESM output differs from obfuscated output');
    return {graphs:cases.length,positive,negative,positiveProperties,nativeEqual:true};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  runApiFuzz().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runApiFuzz,fixture,execute};
