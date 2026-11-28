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

/** @typedef {{watchedSource:string,domSource:string,domValue:number,leaf:number}} Observation */
/** @param {SourceFile[]} files @returns {Promise<Observation>} */
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
  test('DOM source and a function-source observer conservatively forbid selected islands: '+mode,async()=>{
    const input=graph();
    const options={
      mode,closedWorld:true,seed:'agent25-dom-island-composition-'+mode,
      properties:true,identifiers:false,strings:false
    };
    assert.throws(()=>obfuscateFiles(input,{
      ...options,experimentalSourceObserverIslands:['island.mjs']
    }),/Source observer island/,
    'A claimed primitive island cannot be certified when the host DOM capability is visible');

    const result=obfuscateFiles(input,options);
    assert.equal(result.crossFile.properties,0,
      'Cross-file rewrite must stay disabled when the graph observes function source');
    assert.equal(result.files.reduce((count,file)=>count+file.metrics.properties,0),0,
      'Refused source islands must not be silently counted as positive rewrite yield');

    const native=await execute(input);
    const emitted=await execute(/** @type {SourceFile[]} */(result.files));
    assert.deepEqual(emitted,native,'Exact native and transformed function-source parity is required');
    assert.equal(native.domValue,57);
    assert.equal(native.leaf,73);
    assert.ok(native.domSource.includes('secretField'));
  });
}
