'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');

/** @returns {Promise<void>} */
async function main(){
  const source=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:/** @type {'module'} */ ('module'),
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const checks=source.map(file=>{
    const ast=parse(file.code,'module');
    return {file:file.path,
      observesFunctionSource:observesFunctionSource(ast),
      observesDistributedSource:observesDistributedSource(ast)
    };
  });
  const positive=obfuscateFiles([
    {path:'proof.mjs',sourceType:'module',
      code:'export const item={secretField:19};export function read(x){return x.secretField;}'},
    {path:'probe.mjs',sourceType:'module',
      code:'import {item,read} from "./proof.mjs";console.log(read(item));'}
  ],{mode:'coo',closedWorld:true,seed:SEED,strings:false,identifiers:false});
  const full=obfuscateFiles(source,{mode:'coo',closedWorld:true,seed:SEED,
    strings:false,identifiers:false});
  process.stdout.write(JSON.stringify({
    sourceChecks:checks,
    positiveControlProperties:positive.crossFile.properties,
    completeApplicationProperties:full.crossFile.properties,
    conclusion:'Flags and proof coverage are observational, not a security test'
  })+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
