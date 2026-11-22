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
 * Each transport is a distinct interprocedural identity-preserving operation.
 * Export each from its own ESM module, then compose 1 to 3 separate imports.
 * @type {string[]}
 */
const transports=[
  'return value;',
  'return [value][0];',
  'return ({member:value}).member;',
  'return new Map([["owner",value]]).get("owner");',
  'return new Set([value]).values().next().value;',
  'return Promise.resolve(value);',
  'return new WeakRef(value).deref();',
  'return new Proxy(value,{});',
  'const f=(...values)=>values[0];return f(value);',
  'const g=function*(v){yield v;};return g(value).next().value;',
  'const record={get member(){return value;}};return record.member;',
  'return Reflect.apply(v=>v,null,[value]);'
];

/** @type {string[]} */
const observers=[
  'Object.keys(owner).join(",")',
  'Reflect.ownKeys(owner).join(",")',
  'JSON.stringify(owner)',
  'JSON.stringify({...owner})',
  'Object.entries(owner).map(([k,v])=>k+":"+v).join(",")',
  'Object.getOwnPropertyNames(owner).join(",")',
  'Reflect.ownKeys(Object.assign({},owner)).join(",")',
  'Reflect.ownKeys(structuredClone(owner)).join(",")'
];

const seed=0x05b52026;
let state=seed;
/** @returns {number} */
function random() {
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/**
 * @param {number} index
 * @returns {{files:ModuleFile[],hops:number,observation:number}}
 */
function sketch(index) {
  const hops=1+(random()%3);
  const observation=random()%observers.length;
  const property='secret_'+index.toString(16);
  const value=10+(random()%901);
  /** @type {ModuleFile[]} */
  const files=[{
    path:'state.mjs',sourceType:'module',
    code:'export const owner={'+property+':'+value+',sentinel:5};'
  }];
  /** @type {string[]} */
  const imports=['import {owner as source} from "./state.mjs";'];
  const flow=['let owner=source;'];
  for(let hop=0;hop<hops;hop++) {
    const name='relay'+hop;
    const variant=transports[random()%transports.length];
    files.push({path:name+'.mjs',sourceType:'module',
      code:'export async function relay(value){'+variant+'}'});
    imports.push('import {relay as '+name+'} from "./'+name+'.mjs";');
    flow.push('owner=await '+name+'(owner);');
  }
  // Proxy values cannot be structured-cloned; compare caught error semantics.
  flow.push('try{console.log('+observers[observation]+');}catch(error){'+
    'console.log("CAUGHT:"+error.name+":"+error.message);}');
  files.push({path:'main.mjs',sourceType:'module',code:imports.join('')+flow.join('')});
  return {files,hops,observation};
}

/**
 * Execute the same graph as a separate Node ESM subprocess, capturing
 * observable text, errors, and process termination.
 * @param {string} directory
 * @param {ModuleFile[]} files
 * @returns {Promise<{status:number|null,signal:NodeJS.Signals|null,stdout:string,stderr:string}>}
 */
async function run(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:5000
  });
  if(child.error)throw child.error;
  return {status:child.status,signal:child.signal,stdout:child.stdout,stderr:child.stderr};
}

test('seeded multi-hop ESM identity transports preserve observable owner key spellings',
  async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-owner-sketch-'));
    const counts={cases:64,observations:observers.length,transportGrammars:transports.length,
      multiHop:0,refused:0};
    try {
      for(let index=0;index<counts.cases;index++) {
        const {files,hops}=sketch(index);
        if(hops>1)counts.multiHop++;
        const output=obfuscateFiles(files,{
          mode:'coo',closedWorld:true,strings:false,identifiers:false,
          seed:'composed-owner-sketch/'+index
        });
        assert.equal(output.crossFile.properties,0,
          'observable cross-file owner rewrite in sketch '+index);
        counts.refused++;
        const original=await run(path.join(root,'case'+index,'original'),files);
        assert.equal(original.status,0,'native failure '+index+': '+original.stderr);
        const generated=await run(path.join(root,'case'+index,'generated'),
          /** @type {ModuleFile[]} */ (output.files));
        assert.deepEqual(generated,original,
          'original/generated mismatch on composed sketch '+index);
      }
      assert.ok(counts.multiHop>=20,'seed coverage must include multi-hop flows');
      console.log('COMPOSED_OWNER_SKETCH '+JSON.stringify({
        seed:'0x'+seed.toString(16),...counts
      }));
    }finally {
      await fs.rm(root,{force:true,recursive:true});
    }
  });
