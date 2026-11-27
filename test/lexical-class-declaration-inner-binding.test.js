'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const acorn=require('acorn');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/** @param {string} code @param {'commonjs'|'module'} sourceType */
function inspect(code,sourceType){
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:sourceType==='module'?'module':'script'});
  return resolveLexicalReferences(ast,sourceType);
}

/** @param {string} source @returns {unknown} */
function execute(source){
  return new Function(source+'\nreturn demonstration();')();
}

test('named class declaration retains inner constructor after mutable outer binding changes',()=>{
  const source='function demonstration(){class window {static own(){return window;}}'+
    'const original=window;window="changed";return [original.own()===original,window];}';
  assert.deepEqual(execute(source),[true,'changed']);
  // In contrast, an arrow closure reading the *outer* binding tracks updates.
  const outer='function demonstration(){class window {static own(){return window;}}'+
    'const original=window;const capture=()=>window;window="changed";'+
    'return [original.own()===original,capture()];}';
  assert.deepEqual(execute(outer),[true,'changed']);
});

test('Stage 1 must not conflate hidden inner class binding with mutable outer BindingId',()=>{
  for(const sourceType of /** @type {const} */ (['commonjs','module'])){
    const source='function demonstration(){class window {static own(){return window;}}'+
      'const original=window;window="changed";return original.own()===original;}';
    const resolved=inspect(source,sourceType);
    const references=resolved.references.filter(ref=>ref.name==='window');
    assert.equal(references.length,3,sourceType);
    const inner=references[0],outerRead=references[1],outerWrite=references[2];
    assert.equal(outerRead.resolution.kind,'local',sourceType);
    assert.equal(outerWrite.resolution.kind,'local',sourceType);
    if(outerRead.resolution.kind==='local'&&outerWrite.resolution.kind==='local')
      assert.equal(outerRead.resolution.bindingId,outerWrite.resolution.bindingId);
    assert.equal(inner.resolution.kind==='unknown' ||
      inner.resolution.kind==='local' &&
      outerRead.resolution.kind==='local' &&
      inner.resolution.bindingId!==outerRead.resolution.bindingId,
      true,sourceType+': inner self-name is not the same mutable outer identity');
  }
});

test('class declaration inner self-assignment is immutable even though outer name can be assigned',()=>{
  const source='function demonstration(){class window{static mutate(){window="inner";}}'+
    'const saved=window;let innerFailed=false;try{saved.mutate();}'+
    'catch(error){innerFailed=error instanceof TypeError;}'+
    'window="outer";return [innerFailed,saved===window];}';
  assert.deepEqual(execute(source),[true,false]);
  const resolved=inspect(source,'commonjs');
  const writes=resolved.references.filter(item=>item.name==='window'&&item.role==='write');
  assert.equal(writes.length,2);
  const [innerWrite,outerWrite]=writes;
  assert.equal(innerWrite.role,'write');
  assert.equal(outerWrite.role,'write');
  assert.equal(outerWrite.resolution.kind,'local');
  assert.equal(innerWrite.resolution.kind==='unknown' ||
    innerWrite.resolution.kind==='local' &&
    outerWrite.resolution.kind==='local' &&
    innerWrite.resolution.bindingId!==outerWrite.resolution.bindingId,true);
});

test('named class declaration extends and static field self-references have separate provenance',()=>{
  for(const source of [
    'function demonstration(){class window extends window {} return window;}',
    'function demonstration(){class window { static own=window; }return window;}',
    'function demonstration(){class window { static {this.own=window;} }return window;}',
    'function demonstration(){class window { [window.name](){return 1;} }return window;}'
  ]){
    const resolved=inspect(source,'commonjs');
    const refs=resolved.references.filter(ref=>ref.name==='window');
    assert.ok(refs.length>=2,source);
    const inner=refs[0],outer=refs[refs.length-1];
    assert.equal(inner.resolution.kind,'local',source);
    assert.equal(outer.resolution.kind,'local',source);
    if(inner.resolution.kind==='local'&&outer.resolution.kind==='local')
      assert.notEqual(inner.resolution.bindingId,
        outer.resolution.bindingId,source);
  }
});

test('class declaration exposes explicit one-token coupling between two distinct bindings',()=>{
  for(const sourceType of /** @type {const} */ (['commonjs','module'])){
    const source='function demonstration(){class window {static own(){return window;}}'+
      'const original=window;return original.own();}';
    const result=inspect(source,sourceType);
    const declared=result.declarations.filter(entry=>entry.name==='window');
    const reads=result.references.filter(entry=>entry.name==='window');
    assert.equal(declared.length,1,sourceType+': only one source declaration name');
    assert.equal(reads.length,2,sourceType);
    assert.equal(reads[0].resolution.kind,'local',sourceType);
    assert.equal(reads[1].resolution.kind,'local',sourceType);
    assert.equal(result.classSpellingCouplings.length,1,sourceType);
    const coupling=result.classSpellingCouplings[0];
    assert.equal(coupling.sourceStart,source.indexOf('class window')+'class '.length);
    assert.equal(coupling.sourceEnd,coupling.sourceStart+'window'.length);
    assert.equal(coupling.outerBindingId,declared[0].bindingId);
    if(reads[0].resolution.kind==='local'&&reads[1].resolution.kind==='local'){
      assert.equal(coupling.innerBindingId,reads[0].resolution.bindingId);
      assert.equal(coupling.outerBindingId,reads[1].resolution.bindingId);
      assert.notEqual(coupling.innerBindingId,coupling.outerBindingId);
    }
  }
});

test('named class expressions keep their distinct and explicitly spelled inner BindingId',()=>{
  const source='function demonstration(){const window=class window{static own(){return window;}};return window;}';
  const resolved=inspect(source,'commonjs');
  assert.deepEqual(resolved.classSpellingCouplings,[],'class expressions spell inner name independently');
  const declarations=resolved.declarations.filter(item=>item.name==='window');
  const refs=resolved.references.filter(ref=>ref.name==='window');
  assert.equal(declarations.length,2);
  assert.ok(declarations.every(item=>item.bindingId!==null));
  assert.notEqual(declarations[0].bindingId,declarations[1].bindingId);
  assert.equal(refs[0].resolution.kind,'local');
  assert.equal(refs[1].resolution.kind,'local');
  if(refs[0].resolution.kind==='local'&&refs[1].resolution.kind==='local')
    assert.notEqual(refs[0].resolution.bindingId,refs[1].resolution.bindingId);
  assert.equal(typeof execute(source),'function');
});
