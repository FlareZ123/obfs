'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @returns {SourceFile[]} */
function graph() {
  return [
    {path:'watched.mjs',sourceType:'module',
      code:'const owner={privateA:17};const value=owner.privateA;export function watched(){return value;}'},
    {path:'dom-producer.mjs',sourceType:'module',
      code:'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'island.mjs',sourceType:'module',
      code:'const owner={privateLeaf:73};const value=owner.privateLeaf;export function safe(){return value;}'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {watched} from "./watched.mjs";',
      'import {inspect} from "./dom-producer.mjs";',
      'import {safe} from "./island.mjs";',
      'globalThis.document={createElement(){let stored="";return {',
      'set id(value){stored=String(value);},get id(){return stored;}};}};',
      'const target=document.createElement("div");',
      'target.id=inspect;',
      'console.log(JSON.stringify({watchedSource:watched.toString(),',
      'domSource:target.id,domValue:inspect(),leaf:safe()}));'
    ].join('\n')}
  ];
}

/** @param {SourceFile[]} files @returns {Promise<unknown>} */
async function execute(files) {
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dom-island-composed-'));
  try {
    for(const file of files)await fs.writeFile(path.join(folder,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  } finally {
    await fs.rm(folder,{recursive:true,force:true});
  }
}

for(const mode of /** @type {const} */ (['coo','sno'])) {
  test('DOM callable source and remote source observer compose with a proved island: '+mode,async()=>{
    const input=graph();
    const result=obfuscateFiles(input,{
      mode,closedWorld:true,seed:'agent25-dom-island-composition-'+mode,
      properties:true,identifiers:false,strings:false,
      experimentalSourceObserverIslands:['island.mjs']
    });
    const byPath=new Map(result.files.map(file=>[file.path,file]));
    assert.equal(result.crossFile.properties,0,
      'Cross-file rewrite must stay disabled for observed producer source');
    assert.equal(byPath.get('dom-producer.mjs')?.code,input[1].code,
      'DOMString-coerced callable producer must retain exact source bytes');
    assert.equal(byPath.get('watched.mjs')?.code,input[0].code,
      'Explicit Function#toString producer must retain exact source bytes');
    assert.ok((byPath.get('island.mjs')?.metrics.properties??0)>=1,
      'Independent proven primitive leaf must retain genuine local rewrite yield');
    assert.ok(!String(byPath.get('island.mjs')?.code).includes('privateLeaf'),
      'Island property name must actually be rewritten');

    const native=await execute(input);
    const emitted=await execute(/** @type {SourceFile[]} */(result.files));
    assert.deepEqual(emitted,native,'Observational behavior must remain identical');
    assert.deepEqual({watched:native.watchedSource.includes('privateA'),
      dom:native.domSource.includes('secretField'),value:native.domValue,leaf:native.leaf},
      {watched:false,dom:true,value:57,leaf:73});
  });
}
