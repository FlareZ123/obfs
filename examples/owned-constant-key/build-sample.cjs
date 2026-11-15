'use strict';

const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {obfuscateFiles}=require('../../src');

const source=readFileSync(join(__dirname,'before.cjs'),'utf8');
const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
  mode:'sno',seed:'owned-constant-key-sample',strings:false
}).files[0];

assert.equal(output.metrics.objects,1);
assert.equal(output.metrics.properties,2);

if(process.argv.includes('--emit')){
  console.log('COMPILED_OWNED_KEY_JSON:'+JSON.stringify(output.code));
}else{
  assert.equal(output.code,readFileSync(join(__dirname,'after.cjs'),'utf8'));
  console.log('Verified constant-key compiler sample bytes');
}
