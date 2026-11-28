'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,expression:string,patch:string}} Variant */

/** @type {SourceFile[]} */
const base=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'}
];

/** @type {Variant[]} */
const variants=[
  {
    name:'explicit inherited method dispatch',
    expression:'[0].flat().length',
    patch:'Array.prototype.flat=function(){'+
      'const data=fs.readFileSync("./independent.mjs","utf8");'+
      'return data.includes("privateB")?[17,19]:[17];};'
  },
  {
    name:'implicit ToPrimitive valueOf dispatch',
    expression:'+[0]',
    patch:'Array.prototype.valueOf=function(){'+
      'const data=fs.readFileSync("./independent.mjs","utf8");'+
      'return data.includes("privateB")?2:1;};'
  }
];

/** @param {string} expression @returns {SourceFile[]} */
function graph(expression) {
  return [...base,{path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(JSON.stringify({source:watched.toString(),'+
      'value:unrelated(),marker:'+expression+'}));'
  ].join('\n')}];
}

/**
 * Host prototype mutation occurs before declared modules execute. Neither
 * runtime callback nor native fs module appears in the compiler input group.
 * @param {readonly SourceFile[]} modules
 * @param {string} hostPatch
 * @returns {{source:string,value:number,marker:number}}
 */
function run(modules,hostPatch) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-proto-reader-'));
  try{
    for(const file of modules)
      fs.writeFileSync(path.join(folder,file.path),String(file.code),'utf8');
    fs.writeFileSync(path.join(folder,'runner.mjs'),[
      'import fs from "node:fs";',hostPatch,'await import("./entry.mjs");'
    ].join('\n'),'utf8');
    const child=spawnSync(process.execPath,[path.join(folder,'runner.mjs')],{
      cwd:folder,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{
    fs.rmSync(folder,{recursive:true,force:true});
  }
}

for(const variant of variants)test(
  'source islands reject '+variant.name+' without any free ambient name',()=>{
    const files=graph(variant.expression);
    const native=run(files,variant.patch);
    assert.equal(native.value,23);
    assert.equal(native.marker,2);

    // A separate *unsafe* leaf-only compiler call is the counterfactual.
    // It proves this exact host method observes changed distributed bytes.
    const unsafe=obfuscateFiles([base[1]],{
      mode:'coo',seed:'host-prototype-counterfactual-'+variant.name,
      closedWorld:false,properties:true,identifiers:false,strings:false
    });
    assert.ok(unsafe.files[0].metrics.properties>=1);
    const forced=files.map(file=>file.path==='independent.mjs' ?
      {...file,code:String(unsafe.files[0].code)}:file);
    const changed=run(forced,variant.patch);
    assert.equal(changed.value,23);
    assert.equal(changed.source,native.source);
    assert.equal(changed.marker,1,
      'source-byte observation must distinguish original from forced rewrite');

    // The reviewed *group* admission must refuse both direct method calls
    // and hidden iterator/coercion effects in all three environments.
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles(files,{
        mode,seed:'host-prototype-proof-'+variant.name+'-'+mode,
        closedWorld:true,properties:true,identifiers:false,strings:false,
        experimentalSourceObserverIslands:['independent.mjs']
      }),/Source observer islands refuse/i,mode);
    }
  }
);
