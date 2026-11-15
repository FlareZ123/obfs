'use strict';

const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {obfuscateFiles}=require('../../src');

const names=['state.mjs','main.mjs'];
const source=names.map(path=>({
  path,sourceType:'module',code:readFileSync(join(__dirname,'before',path),'utf8')
}));
const output=obfuscateFiles(source,{
  mode:'coo',closedWorld:true,seed:'imported-constant-key-sample',
  strings:false,identifiers:false
});
assert.equal(output.crossFile.objects,1);
assert.equal(output.crossFile.properties,2);

if(process.argv.includes('--emit')){
  console.log('COMPILED_IMPORTED_KEY_FILES_JSON:'+JSON.stringify(
    output.files.map(file=>({path:file.path,code:file.code}))));
}else{
  for(const file of output.files){
    assert.equal(file.code,readFileSync(join(__dirname,'after',file.path),'utf8'));
  }
  console.log('Verified imported constant-key graph sample bytes');
}
