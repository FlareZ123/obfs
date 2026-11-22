'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Emulate the CSSOMString argument conversion in CSS.escape. This is a
 * Node-side parity witness, not an implementation of CSS identifier escaping.
 * The companion browser check must validate the native CSS.escape behavior.
 * @param {string} source
 * @returns {{observed:string,value:number}}
 */
function execute(source) {
  const module={exports:null};
  const CSS={escape:/** @param {unknown} value */value=>String(value)};
  vm.runInNewContext(source,{module,CSS},{timeout:3000});
  const result=/** @type {{observed:string,value:number}} */(module.exports);
  return {observed:result.observed,value:result.value};
}

const declaration='function inspect(){const inner={secretField:19};return inner.secretField;}';
const privateState='const state={secretField:37};';

/** @type {Array<[string,string]>} */
const consumers=[
  ['direct CSS.escape','CSS.escape(inspect)'],
  ['globalThis CSS.escape','globalThis.CSS.escape(inspect)'],
  ['Reflect.apply CSS.escape','Reflect.apply(CSS.escape,CSS,[inspect])'],
  ['CSS.escape.call','CSS.escape.call(CSS,inspect)'],
  ['CSS.escape.apply','CSS.escape.apply(CSS,[inspect])'],
  ['sequence-wrapper CSS.escape','(0,CSS.escape)(inspect)'],
  ['immutable alias','(()=>{const escape=CSS.escape;return escape(inspect);})()'],
  ['transitive immutable alias','(()=>{const one=CSS.escape;const two=one;return two(inspect);})()'],
  ['bound CSS.escape alias','(()=>{const escape=CSS.escape.bind(CSS);return escape(inspect);})()'],
  ['direct bound CSS.escape call','CSS.escape.bind(CSS)(inspect)'],
  ['CSS.escape destructuring alias','(()=>{const {escape:selector}=CSS;return selector(inspect);})()']
];

for(const [name,expression] of consumers) {
  test('CSSOMString function source observation: '+name,()=>{
    const source=declaration+privateState+
      'module.exports={observed:'+expression+',value:state.secretField};';
    const native=execute(source);
    assert.match(native.observed,/secretField/u);
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,name);
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      const output=obfuscateFiles([
        {path:'case.cjs',sourceType:'commonjs',code:source}
      ],{mode,seed:'css-escape-source/'+name,strings:true}).files[0];
      assert.deepEqual(execute(/** @type {string} */(output.code)),native,mode+'/'+name);
      assert.equal(output.metrics.properties,0,mode+'/'+name);
      assert.equal(output.metrics.bindings,0,mode+'/'+name);
      assert.equal(output.metrics.literals,0,mode+'/'+name);
    }
  });
}

test('literal CSS.escape input leaves unrelated private key eligible',()=>{
  const source=privateState+
    'module.exports={observed:CSS.escape("literal"),value:state.secretField};';
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
  const output=obfuscateFiles([
    {path:'case.cjs',sourceType:'commonjs',code:source}
  ],{mode:'sno',seed:'css-escape-primitive',strings:false}).files[0];
  assert.deepEqual(execute(/** @type {string} */(output.code)),execute(source));
  assert.ok(output.metrics.properties>0,'Private field must remain provably eligible');
});
