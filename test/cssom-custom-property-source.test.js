'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * A minimal DOMString coercion model. The real-browser counterpart must
 * independently check CSSOM parsing/serialization of custom properties.
 * @param {string} code
 * @returns {{text:string,number:number}}
 */
function execute(code) {
  const document={
    createElement() {
      const declarations=new Map();
      return {style:{
        /** @param {unknown} name @param {unknown} value */
        setProperty(name,value){declarations.set(String(name),String(value));},
        /** @param {unknown} name @returns {string} */
        getPropertyValue(name){return declarations.get(String(name))??'';}
      }};
    }
  };
  const module={exports:null};
  vm.runInNewContext(code,{document,module},{timeout:3000});
  return /** @type {{text:string,number:number}} */(module.exports);
}

/** @param {string} setter @returns {string} */
function negative(setter) {
  return 'function inspect(){const state={secretField:31};return state.secretField;}'+
    'const element=document.createElement("div");const style=element.style;'+
    setter+
    'module.exports={text:style.getPropertyValue("--observed"),number:inspect()};';
}

/** @type {Array<[string,string]>} */
const cases=[
  ['direct','style.setProperty("--observed",inspect);'],
  ['computed','style["setProperty"]("--observed",inspect);'],
  ['bound','const setter=style.setProperty.bind(style);setter("--observed",inspect);'],
  ['reflective','Reflect.apply(style.setProperty,style,["--observed",inspect]);']
];

for(const [name,setter] of cases) {
  const original=negative(setter);
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    test('CSSOM custom property function-source parity: '+name+'/'+mode,()=>{
      const native=execute(original);
      assert.equal(native.number,31);
      assert.ok(native.text.includes('secretField'));
      const emitted=obfuscateFiles([{
        path:'case.cjs',sourceType:'commonjs',code:original
      }],{mode,seed:'cssom-source/'+name+'/'+mode,
        properties:true,identifiers:true,strings:false}).files[0];
      const actual=execute(/** @type {string} */(emitted.code));
      process.stdout.write('CSSOM_SOURCE_CASE '+JSON.stringify({
        name,mode,properties:emitted.metrics.properties,
        bindings:emitted.metrics.bindings,
        equal:JSON.stringify(actual)===JSON.stringify(native)
      })+'\\n');
      assert.equal(JSON.stringify(actual),JSON.stringify(native),
        mode+'/'+name+' '+emitted.code);
      assert.equal(observesFunctionSource(parse(original,'commonjs')),true,name);
    });
  }
}

test('CSSOM primitive custom property leaves an unrelated private key eligible',()=>{
  const source='const state={secretField:43};'+
    'const element=document.createElement("div");const style=element.style;'+
    'style.setProperty("--observed","literal");'+
    'module.exports={text:style.getPropertyValue("--observed"),number:state.secretField};';
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
  const emitted=obfuscateFiles([{
    path:'case.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'cssom-primitive-positive',
    properties:true,identifiers:true,strings:false}).files[0];
  assert.equal(JSON.stringify(execute(/** @type {string} */(emitted.code))),
    JSON.stringify(execute(source)));
  assert.ok(emitted.metrics.properties>0,
    'Primitive source must retain independently eligible private-field renaming');
});
