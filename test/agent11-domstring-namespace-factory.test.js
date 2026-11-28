'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @type {{id:string,domSource:string,consumer:string}[]} */
const fixtures=[
  {id:'namespace-factory',
    domSource:"export function makeTarget(){return document.getElementById('sink');}",
    consumer:"import * as dom from './dom.mjs';dom.makeTarget().setAttribute('data-source',inspect);"},
  {id:'namespace-element',
    domSource:"export const target=document.getElementById('sink');",
    consumer:"import * as dom from './dom.mjs';dom.target.setAttribute('data-source',inspect);"}
];

/**
 * Execute a real Node ESM graph with a host-provided DOMString conversion sink.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<{result:number,safe:number,source:string}>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-namespace-domstring-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),String(file.code));
    const preload=path.join(directory,'host.cjs');
    await atomicWrite(preload,
      'globalThis.__domStringCaptures=[];'+
      'const target={setAttribute(_name,value){globalThis.__domStringCaptures.push(String(value));}};'+
      'globalThis.document={getElementById(_id){return target;}};');
    const child=spawnSync(process.execPath,
      ['--require',preload,path.join(directory,'entry.mjs')],
      {encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} domSource
 * @param {string} consumer
 * @returns {ModuleFile[]}
 */
function graph(domSource,consumer){
  return [
    {path:'dom.mjs',sourceType:'module',code:domSource},
    {path:'safe.mjs',sourceType:'module',code:
      'export function readSafe(){const safePrivateMarker=29;return safePrivateMarker;}'},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {readSafe} from './safe.mjs';",
      'function inspect(){const privateSourceMarker=17;return privateSourceMarker;}',
      consumer,
      'console.log(JSON.stringify({result:inspect(),safe:readSafe(),',
      'source:globalThis.__domStringCaptures[0]}));'
    ].join('\n')}
  ];
}

test('consumer-side namespace imports preserve exact native DOMString source bytes',async()=>{
  for(const fixture of fixtures){
    const files=graph(fixture.domSource,fixture.consumer);
    const native=await execute(files);
    assert.equal(native.result,17,fixture.id+' native result');
    assert.equal(native.safe,29,fixture.id+' native safe helper');
    assert.ok(native.source.includes('privateSourceMarker'),
      fixture.id+' native source includes original private binding');
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const compiled=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'agent11-namespace-domstring-'+fixture.id,
        identifiers:true,properties:false,strings:false
      });
      const emitted=await execute(compiled.files);
      assert.equal(emitted.result,native.result,mode+' '+fixture.id+' result parity');
      assert.equal(emitted.safe,native.safe,mode+' '+fixture.id+' safe helper parity');
      assert.equal(emitted.source,native.source,
        mode+' '+fixture.id+' exact function-source parity');
      const safeSource=files.find(file=>file.path==='safe.mjs');
      assert.ok(safeSource);
      const positive=obfuscateFiles([safeSource],{
        mode,closedWorld:true,seed:'agent11-namespace-domstring-positive',
        identifiers:true,properties:false,strings:false
      });
      assert.ok(positive.files[0].metrics.bindings>0,
        mode+' '+fixture.id+' isolated source-free positive rewrite control');
      console.log(JSON.stringify({fixture:fixture.id,mode,
        positiveBindings:positive.files[0].metrics.bindings,sourceParity:true}));
    }
  }
});
