'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const acorn=require('acorn');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/**
 * A simple catch binding and a same-spelled var declaration inside the catch
 * have a special ECMAScript compatibility interaction: the var binding is
 * hoisted outside the catch, but the initializer writes the catch parameter.
 *
 * These are intentionally red-first admission tests for the experimental
 * read-only resolver. The production obfuscator does not consume its IDs.
 * @typedef {'commonjs'|'module'} SourceType
 */

/** @param {string} code @param {SourceType} sourceType */
function resolve(code,sourceType){
  const ast=acorn.parse(code,{
    ecmaVersion:'latest',
    sourceType:sourceType==='module'?'module':'script'
  });
  return resolveLexicalReferences(ast,sourceType);
}

/** @param {string} code @returns {unknown} */
function execute(code){
  return new Function(code+'\nreturn demonstration();')();
}

/** @param {string} code @returns {unknown} */
function executeStrict(code){
  return new Function('"use strict";'+code+'\nreturn demonstration();')();
}

/** @type {{name:string,source:string,independent:string}[]} */
const aliasCases=[
  {
    name:'same catch body initializer updates catch parameter',
    source:`function demonstration(){try{throw "inner";}catch(window){var window="changed";return window;}}`,
    independent:`function demonstration(){try{throw "inner";}catch(_caught){var _hoisted="changed";return _caught;}}`
  },
  {
    name:'same catch body initializer does not update outer var',
    source:`function demonstration(){try{throw "inner";}catch(window){var window="changed";}return window;}`,
    independent:`function demonstration(){try{throw "inner";}catch(_caught){var _hoisted="changed";}return _hoisted;}`
  },
  {
    name:'var initializer in nested block still assigns caught value',
    source:`function demonstration(){try{throw "inner";}catch(window){{var window="changed";}return window;}}`,
    independent:`function demonstration(){try{throw "inner";}catch(_caught){{var _hoisted="changed";}return _caught;}}`
  },
  {
    name:'destructured object var initializer also updates catch binding',
    source:`function demonstration(){try{throw "inner";}catch(window){var {window}={window:"changed"};return window;}}`,
    independent:`function demonstration(){try{throw "inner";}catch(_caught){var {window:_hoisted}={window:"changed"};return _caught;}}`
  },
  {
    name:'destructured array var initializer also updates catch binding',
    source:`function demonstration(){try{throw "inner";}catch(window){var [window]=["changed"];return window;}}`,
    independent:`function demonstration(){try{throw "inner";}catch(_caught){var [_hoisted]=["changed"];return _caught;}}`
  },
  {
    name:'for-of var loop target updates catch binding',
    source:`function demonstration(){try{throw "inner";}catch(window){for(var window of ["changed"]){}return window;}}`,
    independent:`function demonstration(){try{throw "inner";}catch(_caught){for(var _hoisted of ["changed"]){}return _caught;}}`
  },
  {
    name:'for-of destructured var target updates catch binding',
    source:`function demonstration(){try{throw "inner";}catch(window){for(var {window} of [{window:"changed"}]){}return window;}}`,
    independent:`function demonstration(){try{throw "inner";}catch(_caught){for(var {window:_hoisted} of [{window:"changed"}]){}return _caught;}}`
  }
];

test('native catch/var same-name behavior differs from independent binding renaming',()=>{
  for(const {name,source,independent} of aliasCases){
    const native=execute(source);
    const separatelyRenamed=execute(independent);
    assert.notDeepEqual(separatelyRenamed,native,name);
    assert.notDeepEqual(executeStrict(independent),executeStrict(source),'strict: '+name);
  }
});

test('lexical resolver must not expose catch+var as two independently renameable IDs',()=>{
  for(const mode of /** @type {const} */ (['commonjs','module'])){
    for(const {name,source} of aliasCases){
      const result=resolve(source,mode);
      const decl=result.declarations.filter(x=>x.name==='window');
      assert.equal(decl.length,2,name);
      assert.deepEqual(decl.map(x=>x.kind),['catch','var'],name);
      const independent=decl[0].bindingId!==null &&
        decl[1].bindingId!==null &&
        decl[0].bindingId!==decl[1].bindingId;
      assert.equal(independent,false,mode+': '+name+
        ': same-spelled catch/var initializer has a special alias dependency');
    }
  }
});

test('distinct catch and var names do not require conflating separate bindings',()=>{
  const source=`function demonstration(){try{throw "inner";}catch(window){var other="changed";return window+other;}}`;
  const result=resolve(source,'commonjs');
  const caught=result.declarations.find(x=>x.name==='window');
  const other=result.declarations.find(x=>x.name==='other');
  assert.ok(caught&&other);
  assert.notEqual(caught.bindingId,null);
  assert.notEqual(other.bindingId,null);
  assert.notEqual(caught.bindingId,other.bindingId);
  assert.equal(execute(source),'innerchanged');
});

test('nested function var is separate from enclosing catch binding',()=>{
  const source=`function demonstration(){try{throw "inner";}catch(window){function nested(){var window="nested";return window;}return nested()+window;}}`;
  const result=resolve(source,'commonjs');
  const declarations=result.declarations.filter(x=>x.name==='window');
  assert.equal(declarations.length,2);
  assert.ok(declarations.every(x=>x.bindingId!==null));
  assert.notEqual(declarations[0].bindingId,declarations[1].bindingId);
  assert.equal(execute(source),'nestedinner');
});

test('same-spelled catch names in sibling functions remain independent',()=>{
  const source=`function one(){try{throw 1;}catch(window){return window;}}function two(){try{throw 2;}catch(window){return window;}}`;
  const result=resolve(source,'commonjs');
  const decl=result.declarations.filter(x=>x.name==='window');
  assert.equal(decl.length,2);
  assert.ok(decl.every(x=>x.bindingId!==null));
  assert.notEqual(decl[0].bindingId,decl[1].bindingId);
});
