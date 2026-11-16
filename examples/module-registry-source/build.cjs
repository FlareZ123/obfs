'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {obfuscateFiles}=require('../../src');
const {atomicWrite}=require('../../src/atomic');

/** @returns {Promise<void>} */
async function main(){
  const check=process.argv.includes('--check');
  for(const name of ['observed','private']){
    const filename=name+'.cjs';
    const source=fs.readFileSync(path.join(__dirname,'before',filename),'utf8');
    const emitted=obfuscateFiles([{path:filename,sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'module-registry-sample',strings:false,
      identifiers:false,properties:true
    }).files[0];
    assert.equal(emitted.metrics.properties,name==='private'?1:0);
    assert.equal(typeof emitted.code,'string');
    const output=path.join(__dirname,'after',filename);
    if(check)assert.equal(fs.readFileSync(output,'utf8'),emitted.code,
      'Checked-in '+filename+' differs from actual compiler output');
    else await atomicWrite(output,emitted.code);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
