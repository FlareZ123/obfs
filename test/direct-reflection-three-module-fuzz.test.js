'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */

/** @param {number} seed */
function random(seed){
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

/** @param {number} index @returns {SourceFile[]} */
function graph(index) {
  const next=random((0x73a5f21c^index)>>>0);
  const actions=[
    'sum+=Reflect.get(state,"score");',
    'sum+=Reflect.get(state,"weight");',
    'sum+=Reflect.has(state,"score")?1:0;',
    'sum+=Object.hasOwn(state,"weight")?3:0;',
    'sum+=Reflect.getOwnPropertyDescriptor(state,"score").value;',
    'sum+=Object.getOwnPropertyDescriptor(state,"weight").value;',
    'Reflect.set(state,"score",7);',
    'sum+=state.score;',
    'sum+=state.weight;',
    'sum^=(Reflect.has(state,"weight")?23:9);'
  ];
  const steps=[];
  for(let i=0;i<12;i++)steps.push(actions[next()%actions.length]);
  const privateBody=['function privateRun(n){let sum=n|0;',
    ...steps,'sum+=state.score+state.weight;return sum|0;}'].join('');
  const entry=[
    'import {run} from "./worker.mjs";',
    'import {state} from "./state.mjs";',
    'console.log(JSON.stringify([run(0),run(1),run(7),run(11)]));'
  ];
  if(index%7===0)entry.push('console.log(JSON.stringify(Object.keys(state)));');
  if(index%11===0)entry.push('console.log(run.toString());');
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={score:7,weight:13};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+privateBody+
        'export function run(n){return privateRun(n);}'},
    {path:'entry.mjs',sourceType:'module',code:entry.join('')}
  ];
}

/** @param {string} dir @param {{path:string,code:string|Buffer}[]} files */
async function execute(dir,files) {
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const result=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
    encoding:'utf8',timeout:10000
  });
  assert.equal(result.status,0,result.stderr);
  return result.stdout;
}

test('64 deterministic three-module reflective owner differential cases', {timeout:120000}, async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflection-fuzz-'));
  let positives=0;
  let refusals=0;
  let transformedFields=0;
  try {
    await fs.mkdir(path.join(root,'native'));
    await fs.mkdir(path.join(root,'protected'));
    for(let index=0;index<64;index++){
      const native=graph(index);
      const transformed=obfuscateFiles(native,{
        mode:'coo',closedWorld:true,
        seed:'direct-reflection-fuzz/'+index,identifiers:false,strings:false
      });
      const nativeOutput=await execute(path.join(root,'native'),native);
      const protectedOutput=await execute(path.join(root,'protected'),transformed.files);
      assert.equal(protectedOutput,nativeOutput,
        'native/compiled ESM observable mismatch at seed index '+index);
      assert.ok(transformed.crossFile.properties>=0&&transformed.crossFile.properties<=2);
      if(transformed.crossFile.properties>0)positives++;
      else refusals++;
      transformedFields+=transformed.crossFile.properties;
    }
    assert.ok(positives>0,'random corpus must exercise a real private field rename');
    assert.ok(refusals>0,'random corpus must contain a genuine unsafe-refusal case');
    console.log('reflection-fuzz='+JSON.stringify({
      seed:'0x73a5f21c',cases:64,positives,refusals,transformedFields
    }));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
