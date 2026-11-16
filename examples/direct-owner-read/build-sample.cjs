'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../../src');

const seed='agent15-direct-owner-call-example';
const files=['state.mjs','entry.mjs'].map(name=>({
  path:name,
  sourceType:/** @type {'module'} */ ('module'),
  code:fs.readFileSync(path.join(__dirname,'before',name),'utf8')
}));
const output=obfuscateFiles(files,{
  mode:'coo',seed,closedWorld:true,strings:false,identifiers:false
});
assert.equal(output.crossFile.objects,1);
assert.equal(output.crossFile.properties,2);
for(const file of output.files) {
  assert.equal(file.code,fs.readFileSync(path.join(__dirname,'after',file.path),'utf8'),
    'Recorded after file diverged from actual compiler output: '+file.path);
}

/** @param {string} directory @returns {string} */
function run(directory) {
  const processResult=spawnSync(process.execPath,[path.join(__dirname,directory,'entry.mjs')],{
    encoding:'utf8',timeout:15000
  });
  if(processResult.error)throw processResult.error;
  assert.equal(processResult.status,0,processResult.stderr);
  return processResult.stdout;
}
assert.equal(run('before'),'24\n');
assert.equal(run('after'),run('before'));

const reflective=obfuscateFiles([
  files[0],
  {path:'entry.mjs',sourceType:'module',
    code:"import {state} from './state.mjs';console.log(Object.keys(state).join(','));"}
],{mode:'coo',seed,closedWorld:true,strings:false,identifiers:false});
assert.equal(reflective.crossFile.properties,0,'Reflection must veto property renaming');
assert.equal(reflective.files[0].code,files[0].code,'Rejected owner must stay unchanged');
console.log(JSON.stringify({
  positive:{eligibleProperties:2,renamedProperties:output.crossFile.properties,output:run('after').trim()},
  reflectiveNegative:{eligibleProperties:2,renamedProperties:reflective.crossFile.properties}
}));
