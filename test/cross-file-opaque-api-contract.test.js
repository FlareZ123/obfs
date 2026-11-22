'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{name:string,body:string,bridge?:string,refuse:boolean}} Case */

/**
 * Execute one complete module graph from a separate directory. Comparing
 * stdout, stderr and process status also catches observable exceptions.
 * @param {string} root
 * @param {'native'|'generated'} variant
 * @param {ModuleFile[]} files
 */
async function execute(root,variant,files) {
  const folder=path.join(root,variant);
  await fs.mkdir(folder,{recursive:true});
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(folder,'main.mjs')],{
    encoding:'utf8',
    timeout:5000,
    env:{...process.env,OBFS_TEST_KEY:'secretField'}
  });
  if(child.error)throw child.error;
  return {status:child.status,signal:child.signal,
    stdout:child.stdout,stderr:child.stderr};
}

/** @type {Case[]} */
const cases=[
  {
    name:'proved imported immutable key remains a real positive transform',
    body:'console.log(bag[key]);',
    refuse:false
  },
  {
    name:'direct exported owner is observable through own-key enumeration',
    body:'console.log(Reflect.ownKeys(bag).join(","));',
    refuse:true
  },
  {
    name:'JSON serialization exposes original property names',
    body:'console.log(JSON.stringify({payload:bag}));',
    refuse:true
  },
  {
    name:'object spread transfers property names to an observable clone',
    body:'const clone={...bag};console.log(Object.keys(clone).join(","));',
    refuse:true
  },
  {
    name:'Object.assign transfers keys to a reflective local clone',
    body:'const clone=Object.assign({},bag);console.log(Reflect.ownKeys(clone).join(","));',
    refuse:true
  },
  {
    name:'opaque environment key remains a runtime property read',
    body:'const selected=process.env.OBFS_TEST_KEY;console.log(bag[selected]);',
    refuse:true
  },
  {
    name:'proxy trap records the exact requested property spelling',
    body:'const seen=[];const proxy=new Proxy(bag,{get(target,property,receiver){'+
      'seen.push(String(property));return Reflect.get(target,property,receiver);}});'+
      'console.log(proxy.secretField,seen.join(","));',
    refuse:true
  },
  {
    name:'function receiver argument escapes to reflective callback',
    body:'const inspect=value=>Object.getOwnPropertyNames(value).join(",");'+
      'console.log(inspect(bag));',
    refuse:true
  },
  {
    name:'returned object alias is reflected in a distinct module',
    bridge:'import {bag} from "./state.mjs";export const obtain=()=>bag;',
    body:'import {obtain} from "./bridge.mjs";'+
      'console.log(Object.keys(obtain()).join(","));',
    refuse:true
  },
  {
    name:'cross-file callback observes owner own keys',
    bridge:'export const inspect=value=>Reflect.ownKeys(value).join(",");',
    body:'import {inspect} from "./bridge.mjs";console.log(inspect(bag));',
    refuse:true
  },
  {
    name:'rest destructuring retains observable remainder keys',
    body:'const {secretField:value,...remainder}=bag;'+
      'console.log(value,Object.keys(remainder).join(","));',
    refuse:false
  },
  {
    name:'external global callback observes shape at call boundary',
    body:'globalThis.opaqueAudit=value=>JSON.stringify(value);'+
      'console.log(globalThis.opaqueAudit(bag));',
    refuse:true
  },
  {
    name:'Map storage and retrieval preserve observable owner spelling',
    body:'const index=new Map([["owner",bag]]);'+
      'console.log(Reflect.ownKeys(index.get("owner")).join(","));',
    refuse:true
  },
  {
    name:'WeakRef dereference retains externally visible owner keys',
    body:'const handle=new WeakRef(bag);'+
      'console.log(Object.keys(handle.deref()).join(","));',
    refuse:true
  },
  {
    name:'Promise resolution callback reflects the same owned object',
    body:'Promise.resolve(bag).then(value=>console.log(Object.keys(value).join(",")));',
    refuse:true
  },
  {
    name:'rest parameter forwards an owner into a reflecting caller',
    body:'function carry(...values){return values[0];}'+
      'console.log(Object.keys(carry(bag)).join(","));',
    refuse:true
  },
  {
    name:'implicit arguments forwards an owner into a reflecting caller',
    body:'function carry(){return arguments[0];}'+
      'console.log(Reflect.ownKeys(carry(bag)).join(","));',
    refuse:true
  },
  {
    name:'Array.of transport retains owner identity and key names',
    body:'const values=Array.of(bag);'+
      'console.log(Object.keys(values[0]).join(","));',
    refuse:true
  },
  {
    name:'nested object alias retains reflected key names',
    body:'const holder={item:bag};'+
      'console.log(Reflect.ownKeys(holder.item).join(","));',
    refuse:true
  },
  {
    name:'Reflect.apply forwards an object to reflective native builtin',
    body:'console.log(Reflect.apply(Object.keys,Object,[bag]).join(","));',
    refuse:true
  }
]; 

for(const [index,fixture] of cases.entries()) {
  test('ESM owner API and reflection parity: '+fixture.name,async()=>{
    /** @type {ModuleFile[]} */
    const source=[
      {path:'state.mjs',sourceType:'module',
        code:'export const key="secretField";export const bag={secretField:41};'},
      ...(fixture.bridge ? [{path:'bridge.mjs',sourceType:'module',code:fixture.bridge}]:[]),
      {path:'main.mjs',sourceType:'module',
        code:'import {bag,key} from "./state.mjs";'+fixture.body}
    ];
    const result=obfuscateFiles(source,{
      mode:'coo',closedWorld:true,seed:'opaque-owner-contract-'+index,
      strings:false,identifiers:false
    });
    assert.ok(result.files.length>=source.length);
    if(fixture.refuse) {
      assert.equal(result.crossFile.properties,0,
        fixture.name+': property names observable outside proven edits');
    } else if(index===0) {
      assert.ok(result.crossFile.properties>0,
        'positive control must actually transform a proved property');
    }

    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-opaque-api-'));
    try {
      const original=await execute(root,'native',source);
      const generated=await execute(root,'generated',result.files);
      assert.equal(original.status,0,'native fixture unexpectedly failed');
      assert.deepEqual(generated,original,fixture.name);
    } finally {
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}
