'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {normalizeDistributedFiles}=require('./attacker-token-normalize');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/** @typedef {{index:number,kind:string,files:SourceFile[],expected:number,privateFields:number}} Fixture */
/** @typedef {{index:number,files:{path:string,code:string|Buffer}[]}} ExecutableFixture */

const kinds=Object.freeze([
  'direct-import','two-readers','imported-identity','dynamic-key',
  'json-reflection','opaque-external-reader','foreign-reader',
  'own-keys','function-source','dynamic-loader'
]);

/**
 * Generate an independent three-to-five-file ESM graph. Each graph contains
 * two candidate private fields. Its declared capability boundary is fixed:
 * named ESM imports are closed; window.api remains external and observable.
 *
 * @param {number} seed
 * @param {string} kind
 * @returns {Fixture}
 */
function fixture(seed,kind) {
  const field='privateMetric'+seed;
  const other='weightedFactor'+seed;
  const first=seed*13+17;
  const second=seed*7+3;
  const readers='export function readScore(value){return value.'+field+';}'+
    'export function readWeight(value){return value.'+other+';}';
  let state='export const state={'+field+':'+first+','+other+':'+second+'};';
  let logic='';
  /** @type {SourceFile[]} */
  const files=[];
  let expected=0;

  switch(kind) {
    case 'direct-import':
      logic='import {state} from "./state.mjs";'+
        'export const result=state.'+field+'*state.'+other+';';
      expected=2;
      break;
    case 'two-readers':
      state+=readers;
      logic='import {state,readScore,readWeight} from "./state.mjs";'+
        'export const result=readScore(state)+readWeight(state);';
      expected=2;
      break;
    case 'imported-identity':
      state+=readers;
      files.push({path:'identity.mjs',sourceType:'module',code:'export const identity=value=>value;'});
      logic='import {state,readScore,readWeight} from "./state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const alias=identity(state);'+
        'export const result=readScore(alias)+readWeight(alias);';
      expected=2;
      break;
    case 'dynamic-key':
      logic='import {state} from "./state.mjs";'+
        'export const result=state[globalThis.window.api.keyFor('+seed+')]+state.'+other+';';
      break;
    case 'json-reflection':
      logic='import {state} from "./state.mjs";'+
        'export const result=JSON.stringify(state);';
      break;
    case 'opaque-external-reader':
      logic='import {state} from "./state.mjs";'+
        'export const result=globalThis.window.api.read(state);';
      break;
    case 'foreign-reader':
      state+=readers;
      logic='import {state,readScore} from "./state.mjs";'+
        'export const result=readScore(state)+readScore({'+field+':99});';
      break;
    case 'own-keys':
      logic='import {state} from "./state.mjs";'+
        'export const result=Reflect.ownKeys(state).join("|");';
      break;
    case 'function-source':
      state+=readers;
      logic='import {state,readScore} from "./state.mjs";'+
        'export const result=[readScore(state),String(readScore).includes("'+field+'")];';
      break;
    case 'dynamic-loader':
      files.push({path:'late.mjs',sourceType:'module',code:'export const late=11;'});
      logic='import {state} from "./state.mjs";'+
        'export const result=state.'+field+'+(await import("./late.mjs")).late;';
      break;
    default:
      throw new RangeError('Unknown fixture kind: '+kind);
  }

  files.push({path:'state.mjs',sourceType:'module',code:state});
  files.push({path:'logic.mjs',sourceType:'module',code:logic});
  files.push({path:'entry.mjs',sourceType:'module',code:
    'import {result as value} from "./logic.mjs";'+
    'export const result=[value,globalThis.window.api.offset];'});
  return {index:seed*kinds.length+kinds.indexOf(kind),kind,files,expected,privateFields:2};
}

/**
 * Execute all entries through the actual Node ESM loader. The runner owns the
 * explicit external API; its source is intentionally outside the input graph.
 * Native, transformed and recovered graphs receive the identical host.
 *
 * @param {string} root
 * @param {ExecutableFixture[]} graphs
 * @param {0|1} [apiVariant]
 * @returns {Promise<unknown[]>}
 */
async function execute(root,graphs,apiVariant=0) {
  for(const graph of graphs)for(const file of graph.files) {
    await atomicWrite(path.join(root,String(graph.index),file.path),file.code);
  }
  const keyPrefix=apiVariant===0?'privateMetric':'weightedFactor';
  const offset=apiVariant===0?5:31;
  const bonus=apiVariant===0?9:19;
  const prefix='globalThis.window={api:{offset:'+offset+','+
    'keyFor(index){return '+JSON.stringify(keyPrefix)+'+index;},'+
    'read(object){const key=Object.keys(object).find(name=>name.startsWith('+JSON.stringify(keyPrefix)+'));'+
    'if(key===undefined)throw Error("Missing externally observed private key");'+
    'return object[key]+'+bonus+';}}};const results=[];';
  const body=prefix+graphs.map(graph=>
    'results.push((await import("./'+graph.index+'/entry.mjs")).result);'
  ).join('')+'console.log(JSON.stringify(results));';
  const runner=path.join(root,'runner.mjs');
  await atomicWrite(runner,body);
  const child=spawnSync(process.execPath,[runner],{
    encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  const values=JSON.parse(child.stdout);
  assert.ok(Array.isArray(values));
  return /** @type {unknown[]} */ (values);
}

/**
 * Held-out attack/coverage experiment. This fixes its workload and its
 * simple source-only adversary before comparing emitted artifacts.
 * The adversary normalizes recognizable hashes without reading originals;
 * matching fixed outputs is narrower than general program reconstruction.
 *
 * @param {number} [seedCount]
 * @returns {Promise<{graphs:number,apiConfigurations:number,observations:number,files:number,positiveGraphs:number,refusedGraphs:number,
 *    candidatePrivateFields:number,renamedPrivateFields:number,recoveredLabels:number,
 *    outputMatches:number,normalizedMatches:number,sourceBytes:number,outputBytes:number,
 *    attackMilliseconds:number,refusalKinds:Record<string,number>}>}
 */
async function runHeldout(seedCount=3) {
  if(!Number.isSafeInteger(seedCount)||seedCount<1||seedCount>20) {
    throw new RangeError('seedCount must be an integer in 1..20');
  }
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-heldout-attack-'));
  try {
    const cases=[];
    for(let seed=0;seed<seedCount;seed++)
      for(const kind of kinds)cases.push(fixture(seed,kind));

    /** @type {ExecutableFixture[]} */
    const transformed=[];
    /** @type {ExecutableFixture[]} */
    const reconstructed=[];
    /** @type {Record<string,number>} */
    const refusalKinds={};
    let positiveGraphs=0,refusedGraphs=0,renamedPrivateFields=0;
    let recoveredLabels=0,sourceBytes=0,outputBytes=0;
    let attackMilliseconds=0;
    for(const item of cases) {
      const result=obfuscateFiles(item.files,{
        mode:'coo',seed:'heldout-object-flow/'+item.index,
        closedWorld:true,strings:false,identifiers:false
      });
      assert.equal(result.crossFile.properties,item.expected,
        item.kind+' graph='+item.index+' property-proof discrepancy');
      if(item.expected>0)positiveGraphs++;
      else {
        refusedGraphs++;
        refusalKinds[item.kind]=(refusalKinds[item.kind]??0)+1;
      }
      renamedPrivateFields+=result.crossFile.properties;
      sourceBytes+=item.files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0);
      outputBytes+=result.files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0);
      transformed.push({index:item.index,files:result.files});
      const start=performance.now();
      const normalized=normalizeDistributedFiles(result.files.map(file=>{
        if(typeof file.code!=='string')throw new TypeError('Expected JavaScript text');
        return {path:file.path,code:file.code};
      }));
      attackMilliseconds+=performance.now()-start;
      recoveredLabels+=normalized.properties;
      assert.ok(normalized.properties>=result.crossFile.properties,
        item.kind+' source-only attacker did not recognize protected names');
      for(const file of normalized.files) {
        assert.doesNotMatch(file.code,/_p[a-f0-9]{10}(?:[a-f0-9]{2})?\b/u);
      }
      reconstructed.push({index:item.index,files:normalized.files});
    }

    let outputMatches=0,normalizedMatches=0;
    for(const apiVariant of /** @type {(0|1)[]} */ ([0,1])) {
      const original=await execute(path.join(root,'original-'+apiVariant),
        cases.map(item=>({index:item.index,files:item.files})),apiVariant);
      const output=await execute(path.join(root,'obfuscated-'+apiVariant),transformed,apiVariant);
      const recovered=await execute(path.join(root,'normalized-'+apiVariant),reconstructed,apiVariant);
      assert.equal(original.length,cases.length);
      for(let i=0;i<cases.length;i++) {
        if(JSON.stringify(output[i])===JSON.stringify(original[i]))outputMatches++;
        if(JSON.stringify(recovered[i])===JSON.stringify(original[i]))normalizedMatches++;
      }
    }
    assert.equal(outputMatches,cases.length*2,'Obfuscated behavior mismatch');
    assert.equal(normalizedMatches,cases.length*2,'Source-only normalization changed behavior');
    return {
      graphs:cases.length,apiConfigurations:2,observations:cases.length*2,
      files:cases.reduce((sum,item)=>sum+item.files.length,0),
      positiveGraphs,refusedGraphs,
      candidatePrivateFields:cases.reduce((sum,item)=>sum+item.privateFields,0),
      renamedPrivateFields,recoveredLabels,outputMatches,normalizedMatches,
      sourceBytes,outputBytes,attackMilliseconds:Number(attackMilliseconds.toFixed(3)),
      refusalKinds
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  runHeldout().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runHeldout,fixture,execute,kinds};
