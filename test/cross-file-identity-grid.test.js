'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Deterministically construct a native ESM object-flow graph.
 * Covers imported identity functions, exported const arrows, import aliases,
 * arbitrary static key names, computed access, const forwarding and patterns.
 * @param {number} index
 * @returns {ModuleFile[]}
 */
function makeGraph(index){
  const key='secretField'+index;
  const other='sideField'+index;
  const root='localState'+index;
  const accessor='relay'+index;
  const imported=index%2 ? 'identity as '+accessor : 'identity';
  const call=index%2 ? accessor : 'identity';
  const helper=index%3===0 ? 'export const identity=x=>x;' :
    'export function identity(x){return x;}';
  /** @type {string} */
  let body;
  switch(index%5){
    case 0:body='const current='+call+'('+root+');console.log(current.'+key+');';break;
    case 1:body='const first='+call+'('+root+');const second=first;console.log(second["'+key+'"]);';break;
    case 2:body='const current='+call+'('+root+');const {'+key+':value}=current;console.log(value);';break;
    case 3:body='const current='+call+'('+root+');console.log(current.'+other+'.join(":"));';break;
    default:body='const current='+call+'('+root+');console.log(current["'+key+'"],current.'+other+'[0]);';
  }
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={'+key+':'+index+','+other+':['+index+','+(index+1)+']};'},
    {path:'helper.mjs',sourceType:'module',code:helper},
    {path:'main.mjs',sourceType:'module',code:
      'import {state as '+root+'} from "./state.mjs";'+
      'import {'+imported+'} from "./helper.mjs";'+body}
  ];
}

test('48 deterministic cross-file identity graphs preserve native ESM execution',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-identity-grid-'));
  try {
    /** @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const file of sources)await atomicWrite(path.join(directory,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    for(let index=0;index<48;index++){
      const source=makeGraph(index);
      const baseline=await execute(source);
      const result=obfuscateFiles(source,{mode:'coo',closedWorld:true,seed:'identity-grid-'+index,strings:false,identifiers:false});
      assert.equal(result.crossFile.properties,2,'Index '+index+' should rename both literal keys');
      assert.equal(await execute(result.files),baseline,'Index '+index+' behavior changed');
    }
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
