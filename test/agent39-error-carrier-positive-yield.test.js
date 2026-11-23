'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');

const producer="const owner={longPrivateField:73};function privateRead(){return owner.longPrivateField;}export function calculate(){return privateRead();}";

/**
 * Proved non-Error catch/rejection values cannot expose a native Error stack.
 * The consuming module's computed member is intentionally opaque to a simple
 * key-string evaluator. Global name-only Error alias sets will overrefuse it.
 * @type {{name:string,consumer:string}[]}
 */
const safeScenarios=[
  {
    name:'caught primitive',
    consumer:"import {calculate} from './producer.mjs';"+
      "let output;try{throw 1;}catch(caught){const key=['st','ack'].join('');"+
      "output=caught[key]===undefined?calculate():-1;}console.log(output);"
  },
  {
    name:'rejected primitive',
    consumer:"import {calculate} from './producer.mjs';"+
      "const output=await Promise.reject(1).catch(caught=>{"+
      "const key=['st','ack'].join('');return caught[key]===undefined?calculate():-1;});"+
      "console.log(output);"
  },
  {
    name:'rejected plain record',
    consumer:"import {calculate} from './producer.mjs';"+
      "const output=await Promise.reject({stack:'ordinary'}).catch(caught=>{"+
      "const key=['st','ack'].join('');return caught[key]==='ordinary'?calculate():-1;});"+
      "console.log(output);"
  }
];

for(const scenario of safeScenarios){
  test('safe Error-carrier precision retains private renaming: '+scenario.name,async()=>{
    const observes=observesFunctionSource(parse(scenario.consumer,'module'));
    /** @type {import('../src/core').SourceFile[]} */
    const originals=[
      {path:'producer.mjs',sourceType:'module',code:producer},
      {path:'consumer.mjs',sourceType:'module',code:scenario.consumer}
    ];
    const emitted=obfuscateFiles(originals,{
      mode:'coo',closedWorld:true,seed:'agent39-carrier-positive-'+scenario.name
    });
    const propertyRewrites=emitted.files.reduce((sum,file)=>sum+file.metrics.properties,0);
    console.log('CARRIER_PRECISION_EVIDENCE '+JSON.stringify({
      scenario:scenario.name,observes,propertyRewrites
    }));
    assert.equal(observes,false,
      scenario.name+' cannot be classified as a native Error stack observer');
    assert.equal(propertyRewrites,1,
      scenario.name+' must retain one genuinely renamed private own field');
    const directory=await mkdtemp(path.join(tmpdir(),'obfs-carrier-positive-'));
    try{
      /** @param {string} subdir @param {{path:string,code:string|Buffer}[]} files */
      async function run(subdir,files){
        for(const file of files){
          await atomicWrite(path.join(directory,subdir,file.path),file.code);
        }
        const result=spawnSync(process.execPath,[
          path.join(directory,subdir,'consumer.mjs')
        ],{encoding:'utf8',timeout:10000});
        assert.equal(result.error,undefined);
        assert.equal(result.status,0,result.stderr);
        return result.stdout;
      }
      const native=await run('native',originals);
      const compiled=await run('compiled',emitted.files);
      assert.equal(native,'73\n',scenario.name);
      assert.equal(compiled,native,scenario.name);
    }finally{
      await rm(directory,{recursive:true,force:true});
    }
  });
}
