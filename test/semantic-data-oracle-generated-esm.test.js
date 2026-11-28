'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {snapshotDataGraph}=require('../sims/semantic-data-oracle');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @type {Array<'coo'|'sno'|'sco'>} */
const modes=['coo','sno','sco'];

/**
 * Generate a deterministic, 26-module ESM graph with distinct owner names,
 * positive aliases/identity/destructuring and owner-reflection refusals.
 * Each input has 48 candidate own fields, and every exact expected value is
 * constructed independently from the generated module source.
 *
 * @param {number} seed
 * @returns {{files:ModuleFile[],expected:unknown[],candidateFields:number}}
 */
function generated(seed){
  /** @type {ModuleFile[]} */
  const files=[{path:'bridge.mjs',sourceType:'module',code:
    'export const identity=value=>value;'+
    'export const shared={publicValue:-0};'}];
  const chunks=["import {identity,shared} from './bridge.mjs';"];
  const expressions=[];
  /** @type {unknown[]} */
  const expected=[];
  for(let i=0;i<24;i++){
    const name='record'+i;
    const keyA='privateLeft'+i;
    const keyB='privateRight'+i;
    const left=i%5===0?-0:seed*100+i*7;
    const right=seed*11+i*3;
    files.push({path:'owners/owner'+i+'.mjs',sourceType:'module',code:
      'export const '+name+'={'+keyA+':'+String(Object.is(left,-0)?'-0':left)+
      ','+keyB+':'+right+'};'});
    chunks.push("import {"+name+"} from './owners/owner"+i+".mjs';");
    let read=name+'.'+keyA;
    let extra="'direct'";
    /** @type {string} */
    let expectedExtra='direct';
    switch(i%8){
    case 1:
      chunks.push('const alias'+i+'='+name+';');
      read='alias'+i+'.'+keyA;
      extra="'alias'";
      expectedExtra='alias';
      break;
    case 2:
      chunks.push('const { '+keyA+':selected'+i+' }='+name+';');
      read='selected'+i;
      extra="'destructure'";
      expectedExtra='destructure';
      break;
    case 3:
      read='identity('+name+').'+keyA;
      extra="'identity'";
      expectedExtra='identity';
      break;
    case 4:
      extra='Object.keys('+name+').join(":")';
      expectedExtra=keyA+':'+keyB;
      break;
    case 5:
      extra='Reflect.ownKeys('+name+').join(":")';
      expectedExtra=keyA+':'+keyB;
      break;
    case 6:
      extra='JSON.stringify('+name+')';
      expectedExtra=JSON.stringify({[keyA]:left,[keyB]:right});
      break;
    case 7:
      chunks.push("const key"+i+"='"+keyA+"';");
      read=name+'[key'+i+']';
      extra="'computed'";
      expectedExtra='computed';
      break;
    }
    expressions.push('['+read+','+name+'.'+keyB+','+extra+']');
    expected.push([left,right,expectedExtra]);
  }
  chunks.push('export const result=['+expressions.join(',')+
    ',[shared,shared],[-0,0/0,9007199254740993n]];');
  files.push({path:'entry.mjs',sourceType:'module',code:chunks.join('\n')});
  const shared={publicValue:-0};
  expected.push([shared,shared],[-0,NaN,9007199254740993n]);
  return {files,expected,candidateFields:24*2};
}

/**
 * Run the unmodified ESM entry under the real Node loader, then serialize only
 * the externally declared value with the independent bounded data observer.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exact-generated-'));
  try{
    for(const file of files){
      const target=path.join(root,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,file.code);
    }
    const runner=[
      "const {pathToFileURL}=require('node:url');",
      "const {snapshotDataGraph,serializeDataSnapshot}=require(process.argv[2]);",
      "(async()=>{const {result}=await import(pathToFileURL(process.argv[1]).href);",
      "process.stdout.write(serializeDataSnapshot(snapshotDataGraph(result)));",
      "})().catch(error=>{console.error(error);process.exitCode=1;});"
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '-e',runner,path.join(root,'entry.mjs'),
      require.resolve('../sims/semantic-data-oracle')
    ],{cwd:root,encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('96-owner generated real ESM exact-value plus positive/refusal differential',async()=>{
  /** @type {Array<{seed:number,mode:string,properties:number,candidates:number}>} */
  const reports=[];
  for(const seed of [1,3,11,29]){
    const sample=generated(seed);
    const native=await execute(sample.files);
    assert.deepEqual(native,snapshotDataGraph(sample.expected),
      'seed '+seed+': independently generated native ESM values and aliases');
    for(const mode of modes){
      const output=obfuscateFiles(sample.files,{
        mode,closedWorld:true,properties:true,strings:false,identifiers:false,
        seed:'generated-exact-graph/'+seed+'/'+mode
      });
      const emitted=await execute(output.files);
      assert.deepEqual(emitted,native,seed+'/'+mode+
        ': the entire generated mixed-shape ESM data graph must remain exact');
      assert.ok(output.crossFile.properties>=2,
        seed+'/'+mode+': at least one owner must actually be renamed');
      reports.push({seed,mode,properties:output.crossFile.properties,
        candidates:sample.candidateFields});
    }
  }
  process.stdout.write('EXACT_GENERATED_ESM '+JSON.stringify(reports)+'\n');
});
