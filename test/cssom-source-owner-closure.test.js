'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * The observed owner's function body and the independent private owner must
 * not be conflated. Native Chromium source coercion has a separate witness.
 * @param {string} source
 * @returns {{source:string,number:number,independent:number}}
 */
function execute(source) {
  const attrs=new Map();
  const document={createElement:()=>({style:{
    /** @param {unknown} name @param {unknown} value */
    setProperty(name,value){attrs.set(String(name),String(value));},
    /** @param {unknown} name */
    getPropertyValue(name){return attrs.get(String(name))??'';}
  }})};
  const module={exports:/** @type {unknown} */(null)};
  vm.runInNewContext(source,{module,document},{timeout:3000});
  return /** @type {{source:string,number:number,independent:number}} */(module.exports);
}

/** @param {string} value @returns {string} */
function fixture(value) {
  return 'function inspect(){const observedOwner={observedSecret:31};'+
    'return observedOwner.observedSecret;}'+
    'const independentOwner={unrelatedSecret:73};'+
    'const style=document.createElement("div").style;'+
    'style.setProperty("--observed",'+value+');'+
    'module.exports={source:style.getPropertyValue("--observed"),'+
    'number:inspect(),independent:independentOwner.unrelatedSecret};';
}

/** @param {string} source @param {string} seed @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function transform(source,seed) {
  return obfuscateFiles([{
    path:'case.cjs',sourceType:'commonjs',code:source
  }],{mode:'coo',seed,properties:true,identifiers:true,strings:false}).files[0];
}

test('source-owner closure must preserve observed function and rename disjoint owner',()=>{
  const original=fixture('inspect');
  const output=transform(original,'cssom-source-closure-negative');
  const before=execute(original);
  const after=execute(/** @type {string} */(output.code));
  assert.equal(before.number,31);
  assert.equal(before.independent,73);
  assert.ok(before.source.includes('observedSecret'));
  process.stdout.write('CSSOM_SOURCE_OWNER_CLOSURE '+JSON.stringify({
    properties:output.metrics.properties,bindings:output.metrics.bindings,
    sameOutput:JSON.stringify(before)===JSON.stringify(after),
    nativeSource:before.source,emittedSource:after.source,
    privateIndependentStillComputed:after.independent===73
  })+'\n');
  // Current global refusal would keep the source but lose useful privacy.
  // Current unchecked rewrite retains privacy but changes native text.
  // A future granular closure must satisfy both invariants.
  assert.equal(JSON.stringify(after),JSON.stringify(before));
  assert.equal(output.metrics.properties,1,
    'Only the truly unrelated private owner should be renamed');
});

test('numeric call result permits both private owners to transform',()=>{
  const original=fixture('inspect()');
  const output=transform(original,'cssom-source-closure-positive');
  assert.equal(JSON.stringify(execute(/** @type {string} */(output.code))),
    JSON.stringify(execute(original)));
  assert.ok(output.metrics.properties>=2,
    'Both private owners remain eligible when source is not converted');
});
