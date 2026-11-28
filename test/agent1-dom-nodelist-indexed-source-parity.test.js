'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Emulates the native Web IDL DOMString conversion boundary exactly for a
 * Function argument: the stored value is String(fn), not the function object.
 * The two collection lookup forms return an indexed element like real
 * querySelectorAll()/getElementsByName() results.
 *
 * @param {string} code
 * @returns {string}
 */
function execute(code) {
  /** @type {Map<string,string>} */
  const attributes=new Map();
  const element={
    /** @param {string} key @param {unknown} value */
    setAttribute(key,value){attributes.set(key,String(value));},
    /** @param {string} key */
    getAttribute(key){return attributes.get(key)??null;}
  };
  const document={
    querySelectorAll(){return [element];},
    getElementsByName(){return [element];}
  };
  const context={document,module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} receiver
 * @returns {string}
 */
function fixture(receiver) {
  return [
    'const owner={secretField:17};',
    'function privateRead(){return owner.secretField;}',
    'const element='+receiver+';',
    'element.setAttribute("data-source",privateRead);',
    'module.exports={value:privateRead(),source:element.getAttribute("data-source")};'
  ].join('\n');
}

/**
 * @param {string} source
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(source,mode) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'agent1-native-nodelist-string-source-'+mode,
    properties:true,identifiers:true,strings:false
  }).files[0];
}

test('non-source-observing private reader still gives a real native rewrite control',()=>{
  const source='const owner={secretField:17};function privateRead(){return owner.secretField;}module.exports=privateRead();';
  const generated=compile(source,'sno');
  assert.equal(execute(generated.code),execute(source));
  assert.notEqual(generated.code,source,'unrelated private work must remain transformable');
});

for(const [name,receiver] of /** @type {const} */ ([
  ['querySelectorAll indexed item','document.querySelectorAll("input[name=locked]")[0]'],
  ['getElementsByName indexed item','document.getElementsByName("locked")[0]']
])) {
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    test(mode+' indexed DOMString setter preserves native function-source text: '+name,()=>{
      const source=fixture(receiver);
      const generated=compile(source,mode);
      const native=execute(source);
      const emitted=execute(String(generated.code));
      assert.equal(emitted,native,
        'Native setAttribute String(fn) differs after a source-changing rewrite; mode='+
        mode+' receiver='+receiver+' properties='+generated.metrics.properties+
        ' bindings='+generated.metrics.bindings);
    });
  }
}
