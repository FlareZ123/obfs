'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @type {SourceFile[]} */
const sourceFiles=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {watched} from "./watched.mjs";',
    'import {unrelated} from "./independent.mjs";',
    'console.log(JSON.stringify({source:watched.toString(),value:unrelated()}));'
  ].join('\n')}
];

/**
 * Native/emitted exact Node ESM stdout, including a function-source witness.
 * @param {SourceFile[]} files
 * @returns {string}
 */
function execute(files) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agent3-observer-yield-'));
  try {
    for(const file of files){
      assert.equal(typeof file.code,'string');
      fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
    }
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      cwd:directory,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    fs.rmSync(directory,{force:true,recursive:true});
  }
}

const original=execute(sourceFiles);
assert.deepEqual(JSON.parse(original),{
  source:'function watched(){return v;}',
  value:23
});
for(const mode of /** @type {const} */ (['coo','sco','sno']))test(
  mode+': source-observer island emits protected key and preserves native Node ESM stdout',()=>{
    const output=obfuscateFiles(sourceFiles,{
      mode,seed:'agent3-source-island-executed-'+mode,
      closedWorld:true,strings:false,identifiers:true,properties:true,
      experimentalSourceObserverIslands:['independent.mjs']
    });
    const independent=output.files.find(file=>file.path==='independent.mjs');
    assert.ok(independent && independent.metrics.properties>0,
      mode+': must emit an independently safe key rewrite');
    assert.equal(independent.metrics.bindings,0,
      mode+': exported function source must remain unchanged');
    const emitted=execute(output.files.map(file=>({
      path:file.path,sourceType:file.sourceType,code:String(file.code)
    })));
    assert.equal(emitted,original,mode+': native/emitted output and source parity');
  }
);