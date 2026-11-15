'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {transform}=require('../lib/transform');
const {neutralizeHashedNames}=require('./offline-normalize');
const {reconstruct}=require('./reconstruct');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
/** @typedef {'main-ast'|'checker'} Candidate */

const ORIGINAL=/** @type {Source[]} */ ([
  {path:'state.mjs',sourceType:'module',code:
    'export const state={secretField:17,otherField:29};'+
    'export function read(x){return x.secretField+x.otherField;}'},
  {path:'consumer.mjs',sourceType:'module',code:
    'import {state,read} from "./state.mjs";'+
    'export function consume(){const alias=state;return read(alias)+alias.secretField;}'},
  {path:'external.mjs',sourceType:'module',code:
    'export function bridge(value){return globalThis.window.api.bridge(value);}'},
  {path:'entry.mjs',sourceType:'module',code:
    'import {state,read} from "./state.mjs";'+
    'import {consume} from "./consumer.mjs";'+
    'import {bridge} from "./external.mjs";'+
    'import {performance} from "node:perf_hooks";'+
    'globalThis.window={api:{bridge:(n)=>n&255}};'+
    'let sum=0;for(let i=0;i<10000;i++)sum+=consume()+read(state)+bridge(i);'+
    'for(let round=0;round<3;round++){let warm=0;for(let i=0;i<10000;i++)warm+=consume()+bridge(i);if(warm<0)throw Error("Unexpected warmup");}'+
    'const start=performance.now();let hot=0;for(let i=0;i<50000;i++)hot+=consume()+read(state)+bridge(i);'+
    'const elapsed=performance.now()-start;'+
    'process.stdout.write(JSON.stringify({sum,hot,hot_ms:elapsed,api_ok:typeof window.api.bridge==="function"}));'}
]);
const SEEDS=['mfw-unpublished-3af2','mfw-unpublished-51b0','mfw-unpublished-b97c','mfw-unpublished-841e'];

/** @param {string} input @returns {string} */
function sha(input) {
  return createHash('sha256').update(input).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Always test with the unmodified native ESM loader in a fresh isolated
 * process. This also catches invalid import bindings, resolution mistakes
 * and user-defined ambient API changes rather than mocking module semantics.
 * @param {Source[]} files
 * @param {number} trials
 * @returns {Promise<{runs:{sum:number,hot:number,hot_ms:number,api_ok:boolean}[],totalBytes:number}>}
 */
async function execute(files,trials) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-multifile-decision-'));
  try {
    for(const f of files)await atomicWrite(path.join(root,f.path),f.code);
    /** @type {{sum:number,hot:number,hot_ms:number,api_ok:boolean}[]} */
    const runs=[];
    for(let n=0;n<trials;n++) {
      const result=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
        encoding:'utf8',timeout:20000
      });
      if(result.error)throw result.error;
      assert.equal(result.status,0,result.stderr);
      const parsed=JSON.parse(result.stdout);
      assert.equal(typeof parsed.hot_ms,'number');
      runs.push(parsed);
    }
    return {runs,totalBytes:files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0)};
  }finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {Candidate} name
 * @param {string} seed
 * @returns {{files:Source[],coverage:object}}
 */
function transformSource(name,seed) {
  if(name==='main-ast') {
    const result=obfuscateFiles(ORIGINAL,{
      mode:'coo',seed,closedWorld:true,strings:false,identifiers:false
    });
    return {files:/** @type {Source[]} */ (result.files),
      coverage:{crossFile:result.crossFile,perFile:result.files.map(f=>({path:f.path,metrics:f.metrics}))}};
  }
  const source=Object.fromEntries(ORIGINAL.map(file=>[file.path,file.code]));
  const result=transform(source,{seed,closedWorld:true});
  return {files:ORIGINAL.map(file=>({...file,code:result.files[file.path]})),
    coverage:{renamed:result.renamed,diagnostics:result.diagnostics}};
}

/**
 * A seedless offline attacker changes the deterministic mangled key spelling
 * to neutral labels, and then executes its reconstructed graph. This
 * demonstrates readability normalization, not recovery of erased key names.
 * @param {Candidate} name
 * @param {Source[]} files
 * @returns {{files:Source[],neutralized:number}}
 */
function neutralize(name,files) {
  if(name==='main-ast'){
    const result=neutralizeHashedNames(files);
    return {files:/** @type {Source[]} */ (result.files),
      neutralized:result.properties+result.variables};
  }
  const result=reconstruct(Object.fromEntries(files.map(f=>[f.path,f.code])));
  return {files:files.map(f=>({...f,code:result.files[f.path]})),neutralized:result.renamed};
}

/** @returns {Promise<void>} */
async function main() {
  const original=await execute(ORIGINAL,5);
  const originalResults=original.runs.map(x=>[x.sum,x.hot,x.api_ok]);
  assert.ok(originalResults.every(x=>JSON.stringify(x)===JSON.stringify(originalResults[0])));
  /** @type {Record<string,unknown>} */
  const comparisons={};
  for(const name of /** @type {Candidate[]} */ (['main-ast','checker'])) {
    const attacks=[];
    let firstCoverage={};
    let normalized=0;
    let modifiedBytes=0;
    let ownHot=[];
    for(const seed of SEEDS) {
      const result=transformSource(name,seed);
      if(!attacks.length) {
        firstCoverage=result.coverage;
        modifiedBytes=result.files.reduce((n,f)=>n+Buffer.byteLength(f.code),0);
      }
      const actual=await execute(result.files,1);
      const attack=neutralize(name,result.files);
      const decoded=await execute(attack.files,1);
      const expected=JSON.stringify(originalResults[0]);
      const actualEqual=JSON.stringify([actual.runs[0].sum,actual.runs[0].hot,actual.runs[0].api_ok])===expected;
      const decodedEqual=JSON.stringify([decoded.runs[0].sum,decoded.runs[0].hot,decoded.runs[0].api_ok])===expected;
      assert.ok(actualEqual,name+' transformed ESM graph changed external API or arithmetic results');
      assert.ok(decodedEqual,name+' source-only normalized graph failed ESM execution');
      attacks.push({seed_id:sha(seed).slice(0,12),behavior_equivalent:actualEqual,
        normalized_graph_executable:decodedEqual,neutralized_names:attack.neutralized,
        transformed_hot_ms:actual.runs[0].hot_ms});
      normalized+=attack.neutralized;
      ownHot.push(actual.runs[0].hot_ms);
    }
    const repeated=await execute(transformSource(name,SEEDS[0]).files,5);
    comparisons[name]={
      candidate_output_bytes:modifiedBytes,coverage:firstCoverage,
      tested_seeds:SEEDS.length,behavior_successes:attacks.filter(x=>x.behavior_equivalent).length,
      attacker_successes:attacks.filter(x=>x.normalized_graph_executable).length,
      normalized_names_across_seeds:normalized,
      hot_original_median_ms:median(original.runs.map(x=>x.hot_ms)),
      hot_transformed_median_ms:median(repeated.runs.map(x=>x.hot_ms)),
      hot_ratio:median(repeated.runs.map(x=>x.hot_ms))/median(original.runs.map(x=>x.hot_ms)),
      seed_details:attacks
    };
  }
  process.stdout.write(JSON.stringify({
    purpose:'Pinned four-file native ESM closed-world and external API comparison',
    commit:process.env.GITHUB_SHA??'unknown',
    node:process.version,platform:process.platform,
    original_sha256:Object.fromEntries(ORIGINAL.map(f=>[f.path,sha(f.code)])),
    original_total_bytes:original.totalBytes,external_api:'globalThis.window.api.bridge',
    original_median_hot_ms:median(original.runs.map(x=>x.hot_ms)),
    native_trials_per_candidate:5,attack_seeds:SEEDS.length,
    attacker_model:'source-only neutralization of hash-looking names and native ESM replay',
    coverage_and_attacks:comparisons,
    caveats:'One finite ESM graph, pure numeric work, Node native loader, no runtime instrumentation or browser; per-process launch excluded from hot timer. Name normalization does not recover original private spellings.'
  },null,2)+'\n');
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
