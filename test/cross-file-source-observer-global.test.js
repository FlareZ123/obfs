'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * A second ESM file can observe the source of a function declared in the
 * first. Every local transform of that function must respect observation.
 * @param {string} utilCode
 * @param {{properties:boolean,identifiers:boolean,strings:boolean}} flags
 * @param {'objects'|'bindings'|'literals'} metric
 * @returns {Promise<void>}
 */
async function compare(utilCode,flags,metric){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-source-observer-global-'));
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const files=[
    {path:'util.mjs',sourceType:'module',code:utilCode},
    {path:'entry.mjs',sourceType:'module',code:'import {inspect} from "./util.mjs";console.log(inspect.toString());'}
  ];
  try{
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} sources */
    async function execute(sources){
      for(const file of sources)await atomicWrite(path.join(dir,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    }
    const expected=await execute(files);
    const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:'cross-module-source-'+metric,...flags});
    assert.equal(output.files[0].metrics[metric],0);
    assert.equal(await execute(output.files),expected);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}

test('source observer in another module refuses private-property key rewriting',async()=>{
  await compare('const privateState={secretField:3};export function inspect(){return privateState.secretField;}',
    {properties:true,identifiers:false,strings:false},'objects');
});

test('source observer in another module refuses private lexical identifier rewriting',async()=>{
  await compare('const privateLabel=17;export function inspect(){return privateLabel;}',
    {properties:false,identifiers:true,strings:false},'bindings');
});

test('source observer in another module refuses function-body literal encoding',async()=>{
  await compare('export function inspect(){return "protected-literal-value";}',
    {properties:false,identifiers:false,strings:true},'literals');
});
