'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {neutralizeHashedNames}=require('./offline-normalize');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleSource */
/** @typedef {{name:string,files:ModuleSource[],expectedProperties:number}} GridCase */

/**
 * Deterministic, never-compared-with-original-label ESM source variants.
 * All programs use real named exports and the native Node ESM loader.
 * @param {number} index
 * @param {string} scenario
 * @returns {GridCase}
 */
function makeGraph(index,scenario){
  const fingerprint=createHash('sha256').update('nested-reader-grid-v1/'+index)
    .digest('hex').slice(0,8);
  const secret='secret_'+fingerprint;
  const other='other_'+fingerprint;
  const state='export const state={'+secret+':'+(20+index)+','+other+':'+
    (100-index)+'};export function peek(value){return value.'+secret+';}';
  const prefix='import {state,peek} from "./state.mjs";'+
    'import {identity} from "./identity.mjs";';
  const show=/** @param {string} expression @returns {string} */ expression=>
    'console.log(JSON.stringify('+expression+'));';
  let body='';
  let expectedProperties=0;
  switch(scenario){
    case 'imported-identity':
      body=show('[peek(identity(state)),state.'+other+']');
      expectedProperties=2;
      break;
    case 'two-local-identities':
      body='const first=left=>left;const second=right=>right;'+
        show('[peek(second(first(state))),state.'+other+']');
      expectedProperties=2;
      break;
    case 'mixed-imported-local':
      body='const first=alpha=>alpha;const second=beta=>beta;'+
        show('[peek(first(identity(second(state)))),state.'+other+']');
      expectedProperties=2;
      break;
    case 'foreign-owner':
      body='const foreign={'+secret+':99};'+
        show('[peek(identity(state)),peek(identity(foreign)),state.'+other+']');
      break;
    case 'foreign-forwarded':
      body='const first=alpha=>alpha;'+
        show('[peek(first(state)),peek(first({'+secret+':99})),state.'+other+']');
      break;
    case 'reader-escapes':
      body='const detached=peek;'+
        show('[detached(identity(state)),state.'+other+']');
      break;
    case 'dynamic-key':
      body='const key='+JSON.stringify(secret)+';'+
        show('[peek(identity(state)),state[key],state.'+other+']');
      break;
    case 'reflection':
      body=show('[Object.keys(state),peek(identity(state)),state.'+other+']');
      break;
    case 'source-observation':
      body=show('[peek.toString(),peek(identity(state)),state.'+other+']');
      break;
    default:
      throw new TypeError('Unknown graph scenario '+scenario);
  }
  return {name:scenario+'/'+index,expectedProperties,files:[
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'identity.mjs',sourceType:'module',
      code:'export const identity=packet=>packet;'},
    {path:'main.mjs',sourceType:'module',code:prefix+body}
  ]};
}

/**
 * Execute a file group under an independent Node process so ESM module caching
 * and global mutations cannot silently equalize the baseline and candidate.
 * @param {string} directory
 * @param {ModuleSource[]} files
 * @returns {Promise<string>}
 */
async function runGraph(directory,files){
  for(const file of files){
    await atomicWrite(path.join(directory,file.path),file.code);
  }
  const proc=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:10000
  });
  if(proc.error)throw proc.error;
  assert.equal(proc.status,0,proc.stderr);
  return proc.stdout;
}

/**
 * Matched native/compiler/seedless-adversary observation on 36 independent
 * closed-world ESM graphs. The negative scenarios must decline key renaming.
 * @returns {Promise<{graphs:number,positive:number,negative:number,renamedProperties:number,normalizedProperties:number}>}
 */
async function runNestedReaderGrid(){
  const scenarios=['imported-identity','two-local-identities',
    'mixed-imported-local','foreign-owner','foreign-forwarded',
    'reader-escapes','dynamic-key','reflection','source-observation'];
  let graphs=0,positive=0,negative=0,renamedProperties=0,normalizedProperties=0;
  for(let index=0;index<4;index++){
    for(const scenario of scenarios){
      const sample=makeGraph(index,scenario);
      const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reader-grid-'));
      try{
        const original=await runGraph(directory,sample.files);
        const obfuscated=obfuscateFiles(sample.files,{
          mode:'coo',closedWorld:true,seed:'nested-grid-seed/'+index+'/'+scenario,
          strings:false,identifiers:false
        });
        assert.equal(obfuscated.crossFile.properties,sample.expectedProperties,
          sample.name+'/'+JSON.stringify(obfuscated.crossFile));
        const produced=obfuscated.files.map(file=>({
          path:file.path,sourceType:'module',
          code:/** @type {string} */ (file.code)
        }));
        assert.equal(await runGraph(directory,produced),original,
          'Generated graph differs: '+sample.name);
        const attack=neutralizeHashedNames(produced);
        assert.equal(attack.properties,sample.expectedProperties,
          'Unexpected source-only neutralization: '+sample.name);
        assert.equal(await runGraph(directory,attack.files.map(file=>({
          path:file.path,sourceType:'module',code:file.code
        }))),original,'Source-only normalized graph differs: '+sample.name);
        graphs++;
        renamedProperties+=sample.expectedProperties;
        normalizedProperties+=attack.properties;
        if(sample.expectedProperties)positive++;
        else negative++;
      }finally{
        await fs.rm(directory,{recursive:true,force:true});
      }
    }
  }
  return {graphs,positive,negative,renamedProperties,normalizedProperties};
}

if(require.main===module){
  runNestedReaderGrid().then(result=>console.log(JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runNestedReaderGrid};
