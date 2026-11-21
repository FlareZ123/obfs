'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */

/**
 * Deterministic diverse 3-module ESM graph. No attacker-controlled
 * helper-body effects are assumed pure: only exact one-parameter identity.
 *
 * @param {number} index
 * @param {boolean} unsafe
 * @returns {Input[]}
 */
function graph(index,unsafe){
  const depth=index%8+1,kind=index%8;
  const identity=index%2===0||kind===5&&unsafe
    ?'export function identity(x){return x;}'
    :'export const identity=x=>x;';
  const lines=[
    'import {state} from "./state.mjs";',
    'import {identity} from "./identity.mjs";'
  ];
  for(let i=0;i<depth;i++)
    lines.push('const relay'+i+'='+(i===0?'identity':'relay'+(i-1))+';');
  const last='relay'+(depth-1);
  if(!unsafe){
    lines.push('const value='+last+'(state);');
    if(index%4===0){
      lines.push('const also=relay0(state);');
      lines.push('console.log(JSON.stringify([also.otherField,value.secretField]));');
    }else if(index%4===1){
      lines.push('console.log(JSON.stringify([value["secretField"],value["otherField"]]));');
    }else{
      lines.push('console.log(JSON.stringify([value.secretField,value.otherField]));');
    }
  }else switch(kind){
    case 0:
      lines.push('console.log(JSON.stringify([Object.keys(state),'+last+'(state).secretField]));');
      break;
    case 1:
      lines.push('console.log(JSON.stringify(['+last+'.toString(),'+last+'(state).secretField]));');
      break;
    case 2:
      lines.push('const holder={fn:'+last+'};'+
        'console.log(holder.fn(state).secretField);');
      break;
    case 3:
      lines.push('console.log('+last+'.call(null,state).secretField);');
      break;
    case 4:
      lines.push('console.log('+last+'.bind(null,state)().secretField);');
      break;
    case 5:
      lines.push('console.log((new '+last+'(state)).secretField);');
      break;
    case 6:
      lines.push('function opaque(fn){return fn(state);}'+
        'console.log(opaque('+last+').secretField);');
      break;
    default:
      lines.push('let variable='+last+';variable=identity;'+
        'console.log(variable(state).secretField);');
  }
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:17,otherField:5};'},
    {path:'identity.mjs',sourceType:'module',code:identity},
    {path:'entry.mjs',sourceType:'module',code:lines.join('')}
  ];
}

/**
 * Execute the real ESM loader once per graph in a fresh child process.
 * This catches module linking and evaluation-order faults missed by
 * simply interpreting an individual AST without imports.
 *
 * @param {Input[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function run(files){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-id-fuzz-'));
  try{
    for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
      encoding:'utf8',timeout:12000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

test('64 deterministic proven cross-file identity alias chains preserve exact output and rewrite both fields',async()=>{
  for(let i=0;i<64;i++){
    const original=graph(i,false);
    const transformed=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,properties:true,
      seed:'transitive-immutable-identity-positive-'+i,
      identifiers:false,strings:false
    });
    assert.equal(transformed.crossFile.objects,1,'positive case '+i);
    assert.equal(transformed.crossFile.properties,2,'positive case '+i);
    assert.equal(await run(transformed.files),await run(original),'positive case '+i);
  }
});

test('64 deterministic opaque and source-observable cross-file alias chains preserve native fields',async()=>{
  for(let i=0;i<64;i++){
    const original=graph(i,true);
    const transformed=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,properties:true,
      seed:'transitive-immutable-identity-negative-'+i,
      identifiers:false,strings:false
    });
    assert.equal(transformed.crossFile.objects,0,'negative case '+i);
    assert.equal(transformed.crossFile.properties,0,'negative case '+i);
    assert.equal(await run(transformed.files),await run(original),'negative case '+i);
  }
});
