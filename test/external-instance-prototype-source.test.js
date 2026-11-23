'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{value:number,source:string,privateValue:number}} Observation */

/** @type {Input[]} */
const inputs = [
  {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
  {path:'state.mjs',sourceType:'module',code:[
    "import {owner} from './owner.mjs';",
    'class Reader {read(){return owner.secretField;}}',
    'export const instance=new Reader();'
  ].join('\n')},
  {path:'private.mjs',sourceType:'module',code:[
    'const hidden={privateField:13};',
    'function readPrivate(){return hidden.privateField;}',
    'export const privateValue=readPrivate();'
  ].join('\n')}
];

const consumer = [
  "import {instance} from './state.mjs';",
  "import {privateValue} from './private.mjs';",
  'const source=Object.getPrototypeOf(instance).read.toString();',
  'console.log(JSON.stringify({value:instance.read(),source,privateValue}));'
].join('\n');

/**
 * The consumer is deliberately outside the protected input graph.
 * @param {string} directory
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<Observation>}
 */
async function observe(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)
    await atomicWrite(path.join(directory,file.path),file.code);
  await atomicWrite(path.join(directory,'consumer.mjs'),consumer);
  const executed=spawnSync(process.execPath,[path.join(directory,'consumer.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(executed.error)throw executed.error;
  assert.equal(executed.status,0,executed.stderr);
  return /** @type {Observation} */ (JSON.parse(executed.stdout));
}

test('COO/SNO external instance prototype method source is public API',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-instance-contract-'));
  try {
    const native=await observe(path.join(directory,'native'),inputs);
    assert.deepEqual(native,{
      value:7,source:'read(){return owner.secretField;}',privateValue:13
    });
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const output=obfuscateFiles(inputs,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'external-instance-method/'+mode
        });
        const transformed=await observe(path.join(directory,mode),output.files);
        const renamed=output.crossFile.properties+
          output.files.reduce((sum,file)=>sum+file.metrics.properties,0);
        t.diagnostic(mode+' property rewrites: '+renamed);
        assert.deepEqual(transformed,native,
          mode+' changed an externally observable prototype method source');
      });
    }
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});
