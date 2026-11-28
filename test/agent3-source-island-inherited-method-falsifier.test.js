'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const files=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'const hostMarker=[0].flat().length;',
    'console.log(JSON.stringify({source:watched.toString(),value:unrelated(),hostMarker}));'
  ].join('\n')}
];

/**
 * An embedding Node host patches an inherited native method *before* the
 * declared ESM graph executes. The ESM source itself never names fs, process,
 * globalThis, require, Function or any other bare ambient host capability.
 * A call to [0].flat() is nevertheless a callback into mutable host state.
 *
 * @param {readonly SourceFile[]} modules
 * @returns {string}
 */
function run(modules) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-proto-source-'));
  try{
    for(const file of modules)
      fs.writeFileSync(path.join(folder,file.path),String(file.code),'utf8');
    fs.writeFileSync(path.join(folder,'runner.mjs'),[
      'import fs from "node:fs";',
      'Array.prototype.flat=function(){',
      '  const text=fs.readFileSync("./independent.mjs","utf8");',
      '  return text.includes("privateB")?[17,19]:[17];',
      '};',
      'await import("./entry.mjs");'
    ].join('\n'),'utf8');
    const child=spawnSync(process.execPath,[path.join(folder,'runner.mjs')],{
      cwd:folder,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    fs.rmSync(folder,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno']))test(
  mode+': inherited host prototype method must not observe selected ESM file bytes',()=>{
    const native=run(files);
    assert.equal(JSON.parse(native).hostMarker,2);
    let output;
    try{
      output=obfuscateFiles(files,{
        mode,seed:'agent3-inherited-method-source-'+mode,
        closedWorld:true,properties:true,identifiers:true,strings:false,
        experimentalSourceObserverIslands:['independent.mjs']
      });
    }catch(error){
      assert.match(String(error),/source|opaque|island|reader|closed|refuse/i);
      return;
    }
    const selected=output.files.find(f=>f.path==='independent.mjs');
    assert.ok(selected);
    const emitted=run(output.files.map(file=>({
      path:file.path,sourceType:file.sourceType,code:String(file.code)
    })));
    assert.equal(emitted,native,
      'a host-modified inherited method observed changed selected module bytes; '+
      'selectedPropertyRewrites='+selected.metrics.properties);
  }
);
