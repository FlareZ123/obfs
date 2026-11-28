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
    'import {unrelated} from "./independent.mjs";',
    'const fd=ambientFilesystem.openSync("./independent.mjs","r");',
    'const data=new Uint8Array(4096);',
    'const n=ambientFilesystem.readSync(fd,data,0,data.length,0);',
    'ambientFilesystem.closeSync(fd);',
    'console.log(JSON.stringify({value:unrelated(),observedFile:new TextDecoder().decode(data.slice(0,n))}));'
  ].join('\n')}
];

/**
 * Execute the supplied ESM graph with a public host capability that is not
 * declared in the syntactically closed module graph. The host API reads the
 * exact distributed file, not the function's live source.
 * @param {readonly SourceFile[]} modules
 * @returns {string}
 */
function run(modules) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-ambient-reader-'));
  try{
    for(const file of modules)
      fs.writeFileSync(path.join(folder,file.path),String(file.code),'utf8');
    fs.writeFileSync(path.join(folder,'runner.mjs'),[
      'import fs from "node:fs";',
      'globalThis.ambientFilesystem=fs;',
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
  mode+': injected Node host reader cannot observe rewritten selected ESM module bytes',()=>{
    const native=run(files);
    // The *proof* must refuse an opaque host file-reader rather than allow a
    // local key rewrite whose contents can be read as exact file bytes.
    let output;
    try {
      output=obfuscateFiles(files,{
        mode,seed:'agent3-ambient-host-source-'+mode,
        closedWorld:true,properties:true,identifiers:true,strings:false,
        experimentalSourceObserverIslands:['independent.mjs']
      });
    }catch(error) {
      assert.match(String(error),/source|opaque|island|reader|closed|refuse/i);
      return;
    }
    const selected=output.files.find(file=>file.path==='independent.mjs');
    assert.ok(selected);
    const emitted=run(output.files.map(file=>({
      path:file.path,sourceType:file.sourceType,code:String(file.code)
    })));
    assert.equal(emitted,native,
      'an ambient host reader exposed a byte-level semantic mismatch; properties='+selected.metrics.properties);
  }
);

for(const mode of /** @type {const} */ (['coo','sco','sno']))test(
  mode+': a dead nested declaration cannot launder an outer host reader',()=>{
    /** @type {SourceFile[]} */
    const shadowGraph=files.map(file=>file.path!=='entry.mjs'?file:{
      ...file,code:String(file.code).replace(
        'const fd=ambientFilesystem.openSync',
        'function unused(){const ambientFilesystem=0;return ambientFilesystem;}\n'+
        'const fd=ambientFilesystem.openSync'
      )
    });
    const native=run(shadowGraph);
    let output;
    try {
      output=obfuscateFiles(shadowGraph,{
        mode,seed:'agent3-shadowed-ambient-reader-'+mode,
        closedWorld:true,properties:true,identifiers:true,strings:false,
        experimentalSourceObserverIslands:['independent.mjs']
      });
    }catch(error) {
      assert.match(String(error),/source|opaque|island|reader|closed|refuse/i);
      return;
    }
    const emitted=run(output.files.map(file=>({
      path:file.path,sourceType:file.sourceType,code:String(file.code)
    })));
    assert.equal(emitted,native,
      'scope-insensitive name resolution incorrectly authorized a host reader');
  }
);