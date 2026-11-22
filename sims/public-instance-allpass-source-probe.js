'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{value:string,source:string,privateValue:number}} Observation */

/** @type {Input[]} */
const inputs = [
  {path:'owner.mjs', sourceType:'module', code:'export const owner={secretField:7};'},
  {path:'state.mjs', sourceType:'module', code:[
    "import {owner} from './owner.mjs';",
    'class Reader {read(){const message="answer:";const longPrivateValue=owner.secretField;return message+longPrivateValue;}}',
    'export const instance=new Reader();'
  ].join('\n')},
  {path:'private.mjs', sourceType:'module', code:[
    'const hidden={privateField:13};',
    'function readPrivate(){return hidden.privateField;}',
    'export const privateValue=readPrivate();'
  ].join('\n')}
];

const inspector = [
  "import {instance} from './state.mjs';",
  "import {privateValue} from './private.mjs';",
  'const source=Object.getPrototypeOf(instance).read.toString();',
  'console.log(JSON.stringify({value:instance.read(),source,privateValue}));'
].join('\n');

/**
 * Execute a separately distributed ESM graph with the observer *outside*
 * the input graph, approximating a subsequent consumer import.
 * @param {string} directory
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} sources
 * @returns {Promise<Observation>}
 */
async function observe(directory,sources) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of sources) {
    await atomicWrite(path.join(directory,file.path),file.code);
  }
  await atomicWrite(path.join(directory,'external-inspector.mjs'),inspector);
  const child=spawnSync(process.execPath,[path.join(directory,'external-inspector.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return /** @type {Observation} */ (JSON.parse(child.stdout));
}

/** @returns {Promise<void>} */
async function main() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-instance-source-'));
  try {
    const native=await observe(path.join(root,'native'),inputs);
    assert.deepEqual(native,{
      value:'answer:7',source:'read(){const message="answer:";const longPrivateValue=owner.secretField;return message+longPrivateValue;}',privateValue:13
    });
    let diverged=false;
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      const built=obfuscateFiles(inputs,{
        mode,closedWorld:true,properties:true,identifiers:true,
        strings:true,seed:'exported-prototype-allpass-source-contract/'+mode
      });
      const actual=await observe(path.join(root,mode),built.files);
      const propertyRenames=built.crossFile.properties+
        built.files.reduce((sum,file)=>sum+file.metrics.properties,0);
      const privatePropertyRenames=built.files.find(file=>
        file.path==='private.mjs')?.metrics.properties??0;
      const result={mode,propertyRenames,privatePropertyRenames,valuesEqual:
        actual.value===native.value&&actual.privateValue===native.privateValue,
        sourceEqual:actual.source===native.source,
        native,actual};
      console.log(JSON.stringify(result));
      if(!result.valuesEqual||!result.sourceEqual||privatePropertyRenames===0)diverged=true;
    }
    if(diverged)process.exitCode=1;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

void main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
