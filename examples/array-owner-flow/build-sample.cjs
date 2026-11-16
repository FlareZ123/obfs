'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const Module=require('node:module');
const {atomicWrite}=require('../../src/atomic');
const {obfuscateFiles}=require('../../src');

/**
 * Run the CommonJS fixture in a fresh module scope.
 * @param {string} code
 * @returns {(value:number)=>number}
 */
function execute(code){
  const current=new Module(path.join(__dirname,'sample.cjs'));
  current.filename=path.join(__dirname,'sample.cjs');
  current.paths=Module._nodeModulePaths(__dirname);
  current._compile(code,current.filename);
  return /** @type {(value:number)=>number} */(current.exports);
}

/**
 * Produce exact compiler output and compare native behavior for 2,001 inputs.
 * @param {boolean} [verify]
 * @returns {Promise<{bytes:number,objects:number,properties:number}>}
 */
async function buildSample(verify=false){
  const before=await fs.readFile(path.join(__dirname,'before.cjs'),'utf8');
  const output=obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:before
  }],{
    mode:'coo',seed:'array-owner-flow-public-20261116',
    properties:true,identifiers:false,strings:false
  }).files[0];
  const after=/** @type {string} */(output.code);
  assert.ok(output.metrics.objects>=1);
  assert.equal(output.metrics.properties,2);
  assert.doesNotMatch(after,/secretCount|privateDelta/u);
  const native=execute(before),rewritten=execute(after);
  for(let input=-1000;input<=1000;input++){
    assert.equal(rewritten(input),native(input));
  }
  if(verify){
    assert.equal(await fs.readFile(path.join(__dirname,'after.cjs'),'utf8'),after);
  }else{
    await atomicWrite(path.join(__dirname,'after.cjs'),after);
  }
  return {bytes:Buffer.byteLength(after),
    objects:output.metrics.objects,properties:output.metrics.properties};
}

if(require.main===module){
  void buildSample(process.argv.includes('--verify')).then(info=>{
    process.stdout.write(JSON.stringify(info)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={buildSample};
