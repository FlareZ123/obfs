'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Run an independent CommonJS fixture against the real Node URL class.
 * Return a plain host-realm record to avoid cross-realm prototype mismatches.
 * @param {string} source
 * @returns {{observed:string,value:number}}
 */
function execute(source) {
  /** @type {{exports:{observed:string,value:number}|null}} */
  const module={exports:null};
  vm.runInNewContext(source,{module,URL},{timeout:3000});
  assert.ok(module.exports);
  return {observed:module.exports.observed,value:module.exports.value};
}

const protectedFunction='function inspect(){const owner={secretField:29};return owner.secretField;}';

/** @type {Array<[string,string,string]>} */
const observedCases=[
  ['direct parse','','URL.parse(inspect,"https://example.test/").href'],
  ['global URL','','globalThis.URL.parse(inspect,"https://example.test/").href'],
  ['constructor alias','const U=URL;','U.parse(inspect,"https://example.test/").href'],
  ['static method alias','const read=URL.parse;','read(inspect,"https://example.test/").href'],
  ['destructured static method','const {parse:read}=URL;','read(inspect,"https://example.test/").href'],
  ['method through record','const box={read:URL.parse};','box.read(inspect,"https://example.test/").href'],
  ['URL.parse.call','','URL.parse.call(URL,inspect,"https://example.test/").href'],
  ['URL.parse.apply','','URL.parse.apply(URL,[inspect,"https://example.test/"]).href'],
  ['bound URL.parse','const read=URL.parse.bind(URL);','read(inspect,"https://example.test/").href'],
  ['Reflect.apply','','Reflect.apply(URL.parse,URL,[inspect,"https://example.test/"]).href'],
  ['computed static method','const method="parse";','URL[method](inspect,"https://example.test/").href']
];

for(const [name,declarations,expression] of observedCases) {
  test('URL.parse preserves native function-source text: '+name,()=>{
    const original=protectedFunction+declarations+
      'const state={secretField:37};'+
      'module.exports={observed:'+expression+',value:state.secretField};';
    const native=execute(original);
    assert.equal(native.value,37);
    assert.match(native.observed,/secretField/u,name+' must expose original source');
    assert.notDeepEqual(execute(original.replaceAll('secretField','renamedField')),native,
      name+' must be a real source-spelling counterfactual');
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      name+' must be recognized before source rewriting');
    for(const mode of /** @type {('coo'|'sno'|'sco')[]} */(['coo','sno','sco'])) {
      const result=obfuscateFiles([{path:'url.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'url-static-source/'+name+'/'+mode,strings:true
      }).files[0];
      assert.deepEqual(execute(String(result.code)),native,name+'/'+mode);
      assert.equal(result.metrics.properties,0,name+'/'+mode+' property spelling');
      assert.equal(result.metrics.bindings,0,name+'/'+mode+' function spelling');
    }
  });
}

/** @type {Array<[string,string,string]>} */
const primitiveCases=[
  ['direct parse','','URL.parse("/fixed","https://example.test/").href'],
  ['static method alias','const read=URL.parse;','read("/fixed","https://example.test/").href'],
  ['destructured static method','const {parse:read}=URL;','read("/fixed","https://example.test/").href'],
  ['URL.parse.call','','URL.parse.call(URL,"/fixed","https://example.test/").href'],
  ['URL.parse.apply','','URL.parse.apply(URL,["/fixed","https://example.test/"]).href'],
  ['bound URL.parse','const read=URL.parse.bind(URL);','read("/fixed","https://example.test/").href'],
  ['Reflect.apply','','Reflect.apply(URL.parse,URL,["/fixed","https://example.test/"]).href'],
  ['computed static method','const method="parse";','URL[method]("/fixed","https://example.test/").href'],
  ['URL.canParse','','URL.canParse("/fixed","https://example.test/")']
];

for(const [name,declarations,expression] of primitiveCases) {
  test('URL static primitive controls retain safe property rewriting: '+name,()=>{
    const original=declarations+'const state={secretField:37};'+
      'module.exports={observed:'+expression+',value:state.secretField};';
    const native=execute(original);
    assert.equal(observesFunctionSource(parse(original,'commonjs')),false,name);
    const result=obfuscateFiles([{path:'url-positive.cjs',
      sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'url-static-primitive/'+name,
      properties:true,identifiers:false,strings:false
    }).files[0];
    assert.deepEqual(execute(String(result.code)),native,name);
    assert.equal(result.metrics.properties,1,name);
    assert.doesNotMatch(String(result.code),/secretField/u,name);
  });
}
