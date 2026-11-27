'use strict';

/**
 * Fail-closed opaque source flow and definite primitive sink negative control.
 * "Map" is intentionally not a syntax-only definite callable-origin carrier.
 * An unknown value returned by Map#get must not authorize rewriting a
 * potentially stringified imported function's body.
 */
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/** @param {boolean} opaque @returns {SourceFile[]} */
function graph(opaque) {
  return [
    {path:'logic.mjs',sourceType:'module',code:
      'const owner={secretField:57};'+
      'export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:'module',code:
      'const record={privateField:73};'+
      'export const independent=73;'+
      'export const locallyOwnedRecordValue=record.privateField;'},
    {path:'observer.mjs',sourceType:'module',code:[
      'import {inspect} from "./logic.mjs";',
      'import {independent} from "./pure.mjs";',
      'const target=document.createElement("div");',
      opaque?'const values=new Map([["fn",inspect]]);':'',
      opaque?'target.id=values.get("fn");':'target.id="literal";',
      'export const observed={source:target.id,value:inspect(),independent};'
    ].filter(Boolean).join('\n')}
  ];
}

/**
 * @param {SourceFile[]} files
 * @returns {{source:string,value:number,independent:number}}
 */
function executeGraph(files) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-opaque-webidl-'));
  try{
    for(const file of files)fs.writeFileSync(path.join(root,file.path),file.code);
    const host=[
      'globalThis.document={createElement(){let id="";',
      'return {set id(v){id=String(v)},get id(){return id}};}};',
      'const data=await import(process.argv[1]);',
      'console.log(JSON.stringify(data.observed));'
    ].join('');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',host,
      pathToFileURL(path.join(root,'observer.mjs')).href
    ],{cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr || child.error?.message);
    return JSON.parse(child.stdout.trim());
  } finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}

test('opaque imported function source flow fails closed without killing proved primitive sibling yield',()=>{
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    for(const opaque of [false,true]) {
      const original=graph(opaque);
      const expected=executeGraph(original);
      const emitted=obfuscateFiles(original,{
        mode,seed:'agent42-opaque-sink-'+mode+'-'+opaque,
        closedWorld:true,identifiers:false,strings:false,properties:true
      });
      const actual=executeGraph(emitted.files);
      const producer=emitted.files.find(x=>x.path==='logic.mjs');
      const unrelated=emitted.files.find(x=>x.path==='pure.mjs');
      assert.ok(producer&&unrelated);
      assert.deepEqual(actual,expected,mode+' opaque='+opaque+' original/emitted parity');
      assert.equal(actual.value,57);
      assert.equal(actual.independent,73);
      assert.ok(unrelated.metrics.properties>=1,
        mode+' opaque='+opaque+' proved primitive sibling must retain rewrite yield');
      if(opaque) {
        assert.equal(producer.metrics.properties,0,
          mode+' Map#get imported function producer source must be preserved');
        assert.equal(String(producer.code),original[0].code);
      } else {
        assert.ok(producer.metrics.properties>=1,
          mode+' provably literal DOMString sink must not veto unrelated function owner rewrite');
      }
    }
  }
});
