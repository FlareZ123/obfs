'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

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
  /** @returns {(typeof element)[] & {item:(index:number)=>typeof element|null}} */
  function elements(){
    return Object.assign([element],{item(index){return index===0?element:null;}});
  }
  const document={
    querySelectorAll:elements,getElementsByName:elements,
    getElementsByClassName:elements,getElementsByTagName:elements
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
  assert.equal(execute(String(generated.code)),execute(source));
  assert.notEqual(generated.code,source,'unrelated private work must remain transformable');
});

for(const [name,receiver] of /** @type {const} */ ([
  ['querySelectorAll indexed item','document.querySelectorAll("input[name=locked]")[0]'],
  ['getElementsByName indexed item','document.getElementsByName("locked")[0]'],
  ['querySelectorAll item method','document.querySelectorAll("input").item(0)'],
  ['getElementsByClassName indexed item','document.getElementsByClassName("locked")[0]'],
  ['getElementsByTagName item method','document.getElementsByTagName("input").item(0)']
])) {
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    test(mode+' indexed DOMString setter preserves native function-source text: '+name,()=>{
      const source=fixture(receiver);
      const generated=compile(source,mode);
      const native=execute(source);
      const emitted=execute(String(generated.code));
      process.stdout.write('INDEXED_DOM_SOURCE_PROBE '+JSON.stringify({mode,name,metrics:generated.metrics,changed:String(generated.code)!==source})+'\n');
      assert.equal(emitted,native,
        'Native setAttribute String(fn) differs after a source-changing rewrite; mode='+
        mode+' receiver='+receiver+' properties='+generated.metrics.properties+
        ' bindings='+generated.metrics.bindings);
    });
  }
}

test('userland indexed Array is not a native DOMString source observer',()=>{
  const source='function reader(){return 17;}'+
    'const box=[{setAttribute(){return 17;}}];'+
    'box[0].setAttribute("data-src",reader);';
  assert.equal(observesFunctionSource(parse(source,'script')),false,
    'The source guard should not infer native DOM element identity from any Array');
});

// The AST classifier is used upstream to authorize source-changing renames.
// An indexed HTMLCollection/NodeList is a genuine native DOM target, so an
// argument callable is text-coerced through the DOMString Web IDL boundary.
for(const [name,receiver] of /** @type {const} */ ([
  ['querySelectorAll indexed item','document.querySelectorAll("input")[0]'],
  ['getElementsByName indexed item','document.getElementsByName("locked")[0]'],
  ['querySelectorAll item method','document.querySelectorAll("input").item(0)']
])) {
  test('source-observer proof recognizes indexed native DOMString sink: '+name,()=>{
    const code='function secretReader(){return 17;}const element='+receiver+';'+
      'element.setAttribute("data-src",secretReader);';
    assert.equal(observesFunctionSource(parse(code,'script')),true,
      'A native element from an indexed DOM collection converts secretReader to source');
  });
}
