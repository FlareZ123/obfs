'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');
const {normalizePublicFields} = require('./public-token-normalizer');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{seed:number,kind:number,scenario:string,files:ModuleFile[],mustPreserveNames:boolean,expectedPositive:boolean}} Fixture */

const SCENARIOS = [
  'direct-reads',
  'local-alias',
  'identity-function',
  'destructure',
  'object-keys',
  'reflect-own-keys',
  'object-entries',
  'json-stringify',
  'spread-keys',
  'assign-keys',
  'descriptor-table-keys',
  'for-in-keys',
  'external-dynamic-lookup',
  'external-key-observer',
  'get-own-descriptor',
  'reflect-get',
  'coercing-key',
  'inherited-getter-after-delete',
  'proxy-own-keys',
  'unrelated-object-keys',
  'unrelated-descriptor',
  'object-values',
  'has-own',
  'external-numeric-call'
];

/** @param {number} seed @param {number} kind @returns {Fixture} */
function makeFixture(seed, kind) {
  const first = 'privateField' + seed;
  const second = 'auxiliaryField' + seed;
  const firstValue = seed * 37 + 11;
  const secondValue = seed * 29 + 7;
  const q = JSON.stringify(first);
  const mode = SCENARIOS[kind];
  assert.ok(mode, 'Unknown scenario ' + kind);
  /** @type {ModuleFile[]} */
  const files = [{
    path: 'state.mjs',
    sourceType: 'module',
    code: 'export const state={' + first + ':' + firstValue + ',' +
      second + ':' + secondValue + '};'
  }];
  let body = '';
  let host = false;
  switch (mode) {
    case 'direct-reads':
      body = 'return state.' + first + '+state.' + second + ';';
      break;
    case 'local-alias':
      body = 'const alias=state;return alias.' + first + '+alias.' + second + ';';
      break;
    case 'identity-function':
      body = 'const identity=x=>x;return identity(state).' + first +
        '+identity(state).' + second + ';';
      break;
    case 'destructure':
      body = 'const {' + first + ':a,' + second +
        ':b}=state;return a+b;';
      break;
    case 'object-keys':
      body = 'return Object.keys(state).sort().join("|");';
      break;
    case 'reflect-own-keys':
      body = 'return Reflect.ownKeys(state).sort().join("|");';
      break;
    case 'object-entries':
      body = 'return Object.entries(state).map(([k,v])=>k+":"+v).sort().join("|");';
      break;
    case 'json-stringify':
      body = 'return JSON.stringify(state);';
      break;
    case 'spread-keys':
      body = 'return Object.keys({...state}).sort().join("|");';
      break;
    case 'assign-keys':
      body = 'return Object.keys(Object.assign({},state)).sort().join("|");';
      break;
    case 'descriptor-table-keys':
      body = 'return Object.keys(Object.getOwnPropertyDescriptors(state)).sort().join("|");';
      break;
    case 'for-in-keys':
      body = 'const keys=[];for(const key in state)keys.push(key);return keys.sort().join("|");';
      break;
    case 'external-dynamic-lookup':
      body = 'return window.api.lookup(state)+state.' + second + ';';
      host = true;
      break;
    case 'external-key-observer':
      body = 'return window.api.keys(state).sort().join("|");';
      host = true;
      break;
    case 'get-own-descriptor':
      body = 'return Object.getOwnPropertyDescriptor(state,'+q+').value+state.'+second+';';
      break;
    case 'reflect-get':
      body = 'return Reflect.get(state,'+q+')+state.'+second+';';
      break;
    case 'coercing-key':
      body = 'const k={[Symbol.toPrimitive](){return '+q+';}};return state[k]+state.'+second+';';
      break;
    case 'inherited-getter-after-delete':
      body = 'delete state.'+first+';Object.setPrototypeOf(state,{get '+first+
        '(){return 701;}});return state.'+first+'+state.'+second+';';
      break;
    case 'proxy-own-keys':
      body = 'const wrapped=new Proxy(state,{ownKeys(target){return Reflect.ownKeys(target);}});'+
        'return Object.keys(wrapped).sort().join("|");';
      break;
    case 'unrelated-object-keys':
      body = 'const metadata={other:2};const keys=Object.keys(metadata);'+
        'return state.'+first+'+state.'+second+'+keys.length;';
      break;
    case 'unrelated-descriptor':
      body = 'const metadata={other:2};const d=Object.getOwnPropertyDescriptor(metadata,"other");'+
        'return state.'+first+'+state.'+second+'+d.value;';
      break;
    case 'object-values':
      body = 'return Object.values(state).reduce((a,b)=>a+b,0);';
      break;
    case 'has-own':
      body = 'return [Object.hasOwn(state,'+q+'),state.'+first+',state.'+second+'];';
      break;
    case 'external-numeric-call':
      body = 'return state.'+first+'+state.'+second+'+window.api.numeric(17);';
      host = true;
      break;
  }
  if (host) {
    const hostCode = 'globalThis.window={api:{lookup:o=>o['+q+'],'+
      'keys:o=>Object.keys(o),numeric:n=>n*3+1}};';
    files.push({path:'host.mjs',sourceType:'module',code:hostCode});
  }
  files.push({
    path:'bridge.mjs',
    sourceType:'module',
    code:(host?'import "./host.mjs";':'')+
      'import {state} from "./state.mjs";'+
      'export const value=(()=>{'+body+'})();'
  });
  files.push({
    path:'entry.mjs',
    sourceType:'module',
    code:'import {value} from "./bridge.mjs";export {value};'
  });
  return {
    seed,kind,scenario:mode,files,
    mustPreserveNames: [
      'object-keys','reflect-own-keys','object-entries','json-stringify',
      'spread-keys','assign-keys','descriptor-table-keys','for-in-keys',
      'external-key-observer','proxy-own-keys'
    ].includes(mode),
    expectedPositive: mode==='direct-reads'
  };
}

/**
 * Execute all cases under the actual Node ESM linker and a fresh directory,
 * returning ordered JSON-serializable values. No run uses a mock importer.
 * @param {string} folder
 * @param {{index:number,files:ModuleFile[]}[]} collection
 * @returns {Promise<unknown[]>}
 */
async function execute(folder, collection) {
  for (const item of collection) {
    for (const file of item.files) {
      await atomicWrite(path.join(folder,String(item.index),file.path),file.code);
    }
  }
  const runner = collection.map(item =>
    'out.push((await import("./'+item.index+'/entry.mjs")).value);'
  ).join('');
  await atomicWrite(path.join(folder,'runner.mjs'),
    'const out=[];'+runner+'process.stdout.write(JSON.stringify(out));');
  const child = spawnSync(process.execPath,[path.join(folder,'runner.mjs')],{
    encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,'Native ESM execution failed: '+child.stderr);
  return JSON.parse(child.stdout);
}

/**
 * Deterministic multi-file semantic differential and property-yield measurement.
 * @param {number} [seeds]
 * @param {'coo'|'sno'|'sco'} [mode]
 * @returns {Promise<{mode:'coo'|'sno'|'sco',graphs:number,scenarios:number,positiveGraphs:number,positiveRenames:number,observedGraphs:number,observedUnsafeRenames:number,renamesByScenario:Record<string,number>,nativeEqual:true,attackerReplayEqual:true,attackerNormalizedFields:number}>}
 */
async function runMatrix(seeds=12,mode='coo') {
  assert.ok(Number.isInteger(seeds) && seeds>0 && seeds<=100);
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-observers-'));
  try {
    /** @type {(Fixture&{index:number})[]} */
    const fixtures=[];
    for(let seed=0;seed<seeds;seed++) {
      for(let kind=0;kind<SCENARIOS.length;kind++) {
        fixtures.push({...makeFixture(seed,kind),index:seed*SCENARIOS.length+kind});
      }
    }
    let positiveGraphs=0,positiveRenames=0,observedGraphs=0,observedUnsafeRenames=0;
    /** @type {Record<string,number>} */
    const renamesByScenario={};
    const protectedCases=fixtures.map(item=>{
      const result=obfuscateFiles(item.files,{
        mode,closedWorld:true,strings:false,identifiers:false,
        seed:'esm-observers/'+item.index
      });
      const count=result.crossFile.properties;
      renamesByScenario[item.scenario]=(renamesByScenario[item.scenario]??0)+count;
      if(item.expectedPositive) {
        positiveGraphs++;
        positiveRenames+=count;
        assert.ok(count>=2,'Positive transformed-work regression: '+item.scenario+
          ' seed '+item.seed+' has '+count+' protected renames');
      }
      if(item.mustPreserveNames) {
        observedGraphs++;
        observedUnsafeRenames+=count;
        assert.equal(count,0,'Source-observable private names were rewritten in '+
          item.scenario+' seed '+item.seed);
      }
      return {index:item.index,files:/** @type {ModuleFile[]} */(result.files)};
    });
    let attackerNormalizedFields=0;
    const normalizedCases=protectedCases.map(item=>{
      // This attacker receives only the emitted files, without source input,
      // a secret seed, or compiler internals beyond its public name syntax.
      const normalized=normalizePublicFields(item.files);
      attackerNormalizedFields+=normalized.properties;
      return {index:item.index,files:/** @type {ModuleFile[]} */(normalized.files)};
    });
    const baseline=await execute(path.join(scratch,'original'),fixtures);
    const transformed=await execute(path.join(scratch,'transformed'),protectedCases);
    const normalized=await execute(path.join(scratch,'attacker-normalized'),normalizedCases);
    assert.deepEqual(transformed,baseline,'Original and emitted ESM graphs differ');
    assert.deepEqual(normalized,baseline,'Seedless static field-name normalization changed semantics');
    assert.ok(attackerNormalizedFields>=positiveGraphs*2,
      'Seedless attacker must neutralize both fields in every positive graph');
    return {
      mode,graphs:fixtures.length,scenarios:SCENARIOS.length,
      positiveGraphs,positiveRenames,observedGraphs,observedUnsafeRenames,
      renamesByScenario,nativeEqual:true,attackerReplayEqual:true,attackerNormalizedFields
    };
  }finally{
    await fs.rm(scratch,{recursive:true,force:true});
  }
}

if(require.main===module){
  runMatrix().then(result=>process.stdout.write(JSON.stringify({
    commit:process.env.GITHUB_SHA??'unknown',
    node:process.version,platform:process.platform,...result,
    evidence:'Closed ESM test graph only; no hostile-host secrecy or universal 2.5x claim'
  },null,2)+'\n')).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}
module.exports={SCENARIOS,makeFixture,runMatrix};
