'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{source:string,value:number}} Observation */

/** @param {'direct'|'alias'} style @returns {SourceFile[]} */
function graph(style) {
  return [
    {path:'logic.mjs',sourceType:'module',
      code:'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {inspect} from "./logic.mjs";',
      style==='direct'?
        'const node=document.createElement("div");':
        'const doc=document;const node=doc.createElement("div");',
      'node.id=inspect;',
      'console.log(JSON.stringify({source:node.id,value:inspect()}));'
    ].join('\n')}
  ];
}

/** @param {SourceFile[]} files @returns {Promise<Observation>} */
async function execute(files) {
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dom-alias-'));
  try {
    for(const file of files)await fs.writeFile(path.join(folder,file.path),file.code);
    // The trusted host shim is *not* part of the supplied obfuscation graph.
    // It models the native DOMString setter's observable Function#toString.
    const preload=path.join(folder,'host.mjs');
    await fs.writeFile(preload,
      'globalThis.document={createElement(){let value="";return {'+
      'set id(input){value=String(input)},get id(){return value}}}};');
    const job=spawnSync(process.execPath,['--import',preload,path.join(folder,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(job.error)throw job.error;
    assert.equal(job.status,0,job.stderr);
    return JSON.parse(job.stdout);
  } finally {
    await fs.rm(folder,{recursive:true,force:true});
  }
}

for(const style of /** @type {const} */ (['direct','alias'])) {
  test('ESM DOMString imported-callable source observed through '+style+' document',async()=>{
    const originals=graph(style);
    const candidate=obfuscateFiles(originals,{
      mode:'coo',closedWorld:true,seed:'agent25-dom-alias-'+style,
      strings:false,properties:true,identifiers:false
    });
    const native=await execute(originals);
    const emitted=await execute(/** @type {SourceFile[]} */(candidate.files));
    assert.equal(native.value,57);
    assert.ok(native.source.includes('secretField'));
    assert.deepEqual(emitted,native,
      'DOMString sink must not expose a renamed callable source through '+style);
    assert.equal(candidate.files[0].code,originals[0].code,
      'Source-producing imported function must remain byte-exact');
    assert.equal(candidate.files[0].metrics.properties,0);
  });
}
