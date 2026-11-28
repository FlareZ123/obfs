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
/** @typedef {'plain'|'payload'|'escape'|'escape-mutate'} Scenario */
/** @type {Array<'coo'|'sno'|'sco'>} */
const modes=['coo','sno','sco'];

/** @param {Scenario} scenario @returns {ModuleFile[]} */
function graph(scenario) {
  const state={path:'state.mjs',sourceType:/** @type {'module'} */('module'),
    code:'export const shared={publicValue:-0};export const state={privateAlpha:23,privateBeta:7};'};
  let use="import {state,shared} from './state.mjs';\n";
  if(scenario==='payload')use+=
    "globalThis.externalObserver('before',shared,state.privateAlpha,state.privateBeta);\n"+
    "state.privateBeta=1/0;\n"+
    "globalThis.externalObserver('after',shared,state.privateAlpha,state.privateBeta);\n";
  if(scenario==='escape'||scenario==='escape-mutate')
    use+="globalThis.externalObserver(state);\n";
  use+="export const result=[state.privateAlpha,state.privateAlpha,state.privateBeta,shared,shared];\n";
  return [state,{path:'entry.mjs',sourceType:'module',code:use}];
}

/**
 * Evaluate the real Node ESM graph with a host observer that is deliberately
 * outside the obfuscator's supplied source files. Capture the host trace and
 * declared export together, preserving cross-boundary reference aliasing.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {Scenario} scenario
 * @returns {Promise<unknown>}
 */
async function observe(files,scenario) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-external-exact-'));
  try {
    for(const file of files)await fs.writeFile(path.join(root,file.path),file.code);
    const runner=[
      "const {pathToFileURL}=require('node:url');",
      "const {snapshotDataGraph}=require(process.argv[2]);",
      "const events=[];",
      "globalThis.externalObserver=(...args)=>{",
      "  if(process.argv[3]==='escape'||process.argv[3]==='escape-mutate'){",
      "    const owner=args[0];events.push([Object.keys(owner),owner.privateAlpha,owner.privateBeta]);",
      "    if(process.argv[3]==='escape-mutate'){owner.privateAlpha=11;owner.privateBeta=-0;}",
      "  }else{events.push(args);}",
      "};",
      "(async()=>{const {result}=await import(pathToFileURL(process.argv[1]).href);",
      "  process.stdout.write(JSON.stringify(snapshotDataGraph({events,result})));",
      "})().catch(error=>{console.error(error);process.exitCode=1;});"
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '-e',runner,path.join(root,'entry.mjs'),require.resolve('../sims/semantic-data-oracle'),scenario
    ],{cwd:root,encoding:'utf8',timeout:15000});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {Scenario} scenario @returns {unknown} */
function independentExpected(scenario) {
  const shared={publicValue:-0};
  /** @type {unknown[]} */
  const events=[];
  if(scenario==='payload')events.push(
    ['before',shared,23,7],['after',shared,23,Infinity]);
  if(scenario==='escape'||scenario==='escape-mutate')events.push([
    ['privateAlpha','privateBeta'],23,7
  ]);
  const current=scenario==='escape-mutate'?11:23;
  return snapshotDataGraph({events,result:[
    current,current,scenario==='payload'?Infinity:scenario==='escape-mutate'?-0:7,shared,shared
  ]});
}

test('cross-file properties preserve exact out-of-graph callbacks and owner escape',async()=>{
  /** @type {Array<{scenario:Scenario,mode:string,rewritten:number}>} */
  const rows=[];
  for(const scenario of /** @type {Scenario[]} */(['plain','payload','escape','escape-mutate'])){
    const files=graph(scenario);
    const native=await observe(files,scenario);
    assert.deepEqual(native,independentExpected(scenario),
      scenario+': independent native external-trace expectation');
    for(const mode of modes){
      const compiled=obfuscateFiles(files,{mode,closedWorld:true,
        properties:true,strings:false,identifiers:false,
        seed:'exact-outside-graph/'+scenario+'/'+mode});
      const transformed=await observe(compiled.files,scenario);
      assert.deepEqual(transformed,native,
        scenario+'/'+mode+': emitted export and external callback trace parity');
      rows.push({scenario,mode,rewritten:compiled.crossFile.properties});
      if(scenario==='escape'||scenario==='escape-mutate')
        assert.equal(compiled.crossFile.properties,0,
          scenario+'/'+mode+': external owner escape forbids private-field renaming');
    }
  }
  assert.ok(rows.some(row=>row.scenario==='plain'&&row.rewritten>0),
    'test must include an actual private property rewrite');
  process.stdout.write('EXACT_EXTERNAL_TRACE '+JSON.stringify(rows)+'\n');
});
