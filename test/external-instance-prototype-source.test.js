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
  if(!files.some(file=>file.path==='consumer.mjs'))
    await atomicWrite(path.join(directory,'consumer.mjs'),consumer);
  const executed=spawnSync(process.execPath,[path.join(directory,'consumer.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(executed.error)throw executed.error;
  assert.equal(executed.status,0,executed.stderr);
  return /** @type {Observation} */ (JSON.parse(executed.stdout));
}

test('undeclared external inspector: value parity without source-closure premise',async t=>{
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
        assert.equal(transformed.value,native.value);
        assert.equal(transformed.privateValue,native.privateValue);
        t.diagnostic(mode+' undeclared-inspector source equal: '+
          String(transformed.source===native.source));
      });
    }
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('declared ESM consumer method-source observation stays unchanged',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-declared-instance-'));
  try {
    /** @type {Input[]} */
    const declared=[...inputs,{path:'consumer.mjs',sourceType:'module',code:consumer}];
    const native=await observe(path.join(directory,'native'),declared);
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const built=obfuscateFiles(declared,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'declared-instance-method/'+mode
        });
        const transformed=await observe(path.join(directory,mode),built.files);
        const renamed=built.crossFile.properties+
          built.files.reduce((sum,file)=>sum+file.metrics.properties,0);
        t.diagnostic(mode+' declared-observer graph property rewrites: '+renamed);
        assert.deepEqual(transformed,native);
      });
    }
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('source-observer-free standalone module retains positive private field yield',()=>{
  for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
    const built=obfuscateFiles([inputs[2]],{
      mode,closedWorld:true,properties:true,identifiers:false,
      strings:false,seed:'isolated-private-yield/'+mode
    });
    const rewritten=built.crossFile.properties+
      built.files.reduce((sum,file)=>sum+file.metrics.properties,0);
    assert.ok(rewritten>0,mode+' lost private-field rewrite yield');
  }
});

test('without a closed-world promise, external method-source clients retain source',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-open-instance-'));
  try {
    const native=await observe(path.join(directory,'native'),inputs);
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const built=obfuscateFiles(inputs,{
          mode,closedWorld:false,properties:true,identifiers:false,
          strings:false,seed:'open-graph-external-instance/'+mode
        });
        const actual=await observe(path.join(directory,mode),built.files);
        assert.deepEqual(actual,native,
          mode+' must preserve an unknown consumer method-source contract');
        t.diagnostic(mode+' open-graph rewrites: '+
          (built.crossFile.properties+
            built.files.reduce((sum,file)=>sum+file.metrics.properties,0)));
      });
    }
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
});

test('declared ESM prototype method toLocaleString retains exact original source',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-instance-locale-'));
  try {
    const localeConsumer=consumer.replace('.read.toString();','.read.toLocaleString();');
    assert.notEqual(localeConsumer,consumer);
    /** @type {Input[]} */
    const declared=[...inputs,{
      path:'consumer.mjs',sourceType:'module',code:localeConsumer
    }];
    const native=await observe(path.join(directory,'native'),declared);
    assert.deepEqual(native,{
      value:7,source:'read(){return owner.secretField;}',privateValue:13
    });
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      await t.test(mode,async()=>{
        const output=obfuscateFiles(declared,{
          mode,closedWorld:true,properties:true,identifiers:false,
          strings:false,seed:'declared-instance-method-locale/'+mode
        });
        const actual=await observe(path.join(directory,mode),output.files);
        assert.deepEqual(actual,native,
          mode+' must retain native method toLocaleString spelling');
      });
    }
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
});
