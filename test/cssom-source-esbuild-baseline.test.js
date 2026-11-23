'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');

/**
 * Simulate the CSSOMString conversion without relying on Chromium in a
 * Node-only control. Separate native-browser evidence is source-pinned in
 * test/cssom-custom-property-source-browser.js.
 * @param {string} code
 * @returns {{source:string,number:number}}
 */
function execute(code) {
  const attrs=new Map();
  const document={createElement:()=>({style:{
    /** @param {unknown} name @param {unknown} value */
    setProperty(name,value){attrs.set(String(name),String(value));},
    /** @param {unknown} name */
    getPropertyValue(name){return attrs.get(String(name))??'';}
  }})};
  const module={exports:null};
  vm.runInNewContext(code,{document,module},{timeout:3000});
  return /** @type {{source:string,number:number}} */(module.exports);
}

test('equal-trust esbuild and COO both alter observable CSSOM function source',()=>{
  const original='function inspect(){const state={secretField:31};return state.secretField;}'+
    'const style=document.createElement("div").style;'+
    'style.setProperty("--observed",inspect);'+
    'module.exports={source:style.getPropertyValue("--observed"),number:inspect()};';
  const minified=transformSync(original,{
    loader:'js',minify:true,target:'es2022',legalComments:'none'
  }).code;
  const emitted=obfuscateFiles([{
    path:'cssom.cjs',sourceType:'commonjs',code:original
  }],{mode:'coo',seed:'cssom-matched-esbuild-baseline',
    properties:true,identifiers:true,strings:false}).files[0];
  const baseline=execute(original);
  const equalTrust=execute(minified);
  const obfuscated=execute(/** @type {string} */(emitted.code));
  assert.equal(baseline.number,31);
  assert.equal(equalTrust.number,31);
  assert.equal(obfuscated.number,31);
  assert.ok(baseline.source.includes('secretField'));
  assert.notEqual(baseline.source,equalTrust.source,
    'Ordinary minification also modifies JS-visible exact callable source');
  assert.notEqual(baseline.source,obfuscated.source,
    'COO transformation modifies the same observed original function');
  assert.ok(emitted.metrics.properties>0,
    'COO witness must exercise an actual private-property rewrite');
  process.stdout.write('CSSOM_MINIFIER_EQUAL_TRUST '+JSON.stringify({
    nativeSource:baseline.source,
    minifiedSource:equalTrust.source,
    emittedSource:obfuscated.source,
    nativeValue:baseline.number,minifiedValue:equalTrust.number,
    emittedValue:obfuscated.number,
    compilerPrivateRenames:emitted.metrics.properties
  })+'\n');
});
