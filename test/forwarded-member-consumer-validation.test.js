'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {string} */
function evaluate(source) {
  const module={exports:null};
  vm.runInNewContext(source,{module},{timeout:1000});
  return JSON.stringify(module.exports);
}

/**
 * @param {string} source
 * @param {number} expectedRenames
 * @param {'sno'|'coo'} mode
 */
function preserves(source,expectedRenames,mode) {
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'forwarded-receiver-validation-'+mode,strings:false,identifiers:false
  }).files[0];
  assert.equal(evaluate(output.code),evaluate(source),output.code);
  assert.equal(output.metrics.properties,expectedRenames,output.code);
}

for(const mode of /** @type {('sno'|'coo')[]} */ (['sno','coo'])) {
  test('forwarded member call preserves source-spelled native TypeError in '+mode,()=>{
    preserves('const root={secretField:13};function identity(x){return x;}'+
      'let output;try{identity(root).secretField();}catch(error){output=error.message;}'+
      'module.exports=output;',0,mode);
  });

  test('forwarded member assignment cannot install a reflective method in '+mode,()=>{
    preserves('const root={secretField:13};function identity(x){return x;}'+
      'identity(root).secretField=function(){return Object.keys(this)[0];};'+
      'module.exports=identity(root).secretField();',0,mode);
  });

  test('safe forwarded scalar field read still renames in '+mode,()=>{
    preserves('const root={secretField:13};function identity(x){return x;}'+
      'module.exports=identity(root).secretField+4;',1,mode);
  });
}
