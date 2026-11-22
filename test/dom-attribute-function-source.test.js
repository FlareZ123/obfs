'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * The host mock captures DOMString input conversion, not HTML attribute-name
 * syntax. The browser counterpart validates native Element.setAttribute.
 * @param {string} source
 * @returns {{observed:string,value:number}}
 */
function execute(source) {
  const document={createElement:()=>{
    const attributes=new Map();
    return {
      /** @param {unknown} name @param {unknown} value */
      setAttribute(name,value){attributes.set(String(name),String(value));},
      /** @param {unknown} namespace @param {unknown} name @param {unknown} value */
      setAttributeNS(namespace,name,value){
        attributes.set(String(name),String(value));
      },
      /** @param {unknown} name */
      getAttribute(name){return attributes.get(String(name))??null;}
    };
  }};
  const module={exports:null};
  vm.runInNewContext(source,{module,document},{timeout:3000});
  const out=/** @type {{observed:string,value:number}} */(module.exports);
  return {observed:out.observed,value:out.value};
}

const owner='function inspect(){const state={secretField:31};return state.secretField;}';

/** @type {Array<[string,string]>} */
const cases=[
  ['direct setAttribute','(()=>{const el=document.createElement("div");el.setAttribute("data-observed",inspect);return el.getAttribute("data-observed");})()'],
  ['computed setAttribute','(()=>{const el=document.createElement("div");el["setAttribute"]("data-observed",inspect);return el.getAttribute("data-observed");})()'],
  ['aliased element setAttribute','(()=>{const el=document.createElement("div");const other=el;other.setAttribute("data-observed",inspect);return other.getAttribute("data-observed");})()'],
  ['setAttributeNS value','(()=>{const el=document.createElement("div");el.setAttributeNS(null,"data-observed",inspect);return el.getAttribute("data-observed");})()']
];

for(const [name,expression] of cases) {
  test('native DOMString function-source observation: '+name,()=>{
    const source=owner+'module.exports={observed:'+expression+',value:inspect()};';
    const native=execute(source);
    assert.ok(native.observed.includes('secretField'),name);
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      const emitted=obfuscateFiles([
        {path:'input.cjs',sourceType:'commonjs',code:source}
      ],{mode,seed:'domstring-native/'+name,
        properties:true,identifiers:true,strings:true}).files[0];
      if(mode==='coo')process.stdout.write('DOMSTRING_FOCUSED_METRICS '+JSON.stringify({
        name,properties:emitted.metrics.properties,
        originalSpellingKept:String(emitted.code).includes('secretField')
      })+'\\n');
      assert.deepEqual(execute(/** @type {string} */(emitted.code)),native,mode+'/'+name);
      assert.equal(emitted.metrics.properties,0,mode+'/'+name);
      assert.equal(emitted.metrics.bindings,0,mode+'/'+name);
      assert.equal(emitted.metrics.literals,0,mode+'/'+name);
    }
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,name);
  });
}

test('primitive Element.setAttribute leaves unrelated private key eligible',()=>{
  const source='const state={secretField:43};'+
    'const el=document.createElement("div");'+
    'el.setAttribute("data-observed","literal");'+
    'module.exports={observed:el.getAttribute("data-observed"),value:state.secretField};';
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
  const emitted=obfuscateFiles([
    {path:'input.cjs',sourceType:'commonjs',code:source}
  ],{mode:'sno',seed:'domstring-native-positive',
    properties:true,identifiers:true,strings:true}).files[0];
  assert.deepEqual(execute(/** @type {string} */(emitted.code)),execute(source));
  assert.ok(emitted.metrics.properties>0,'Private record must be renamed');
});
