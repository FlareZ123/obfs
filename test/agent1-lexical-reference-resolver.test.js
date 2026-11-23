'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const acorn=require('acorn');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

/**
 * This independent, read-only binder prototype has no compiler integration.
 * Source-type and dynamic-scope cases are intended as a bounded admission gate.
 * @typedef {'script'|'module'|'commonjs'} SourceType
 * @typedef {{name:string,source:string,sourceType:SourceType,expected:string[]}} Case
 */

/** @type {Case[]} */
const fixtures=[
  {name:'window',source:'export {}; window.onerror = handler;',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; function f(window, handler) { window.onerror = handler; }',sourceType:'module',expected:['local']},
  {name:'window',source:'export {}; try { throw 1; } catch (window) { window.onerror = handler; }',sourceType:'module',expected:['local']},
  {name:'window',source:'export {}; function outer() { class window {} return window; }',sourceType:'module',expected:['local']},
  {name:'window',source:'export {}; const f = function window() { return window; };',sourceType:'module',expected:['local']},
  {name:'window',source:'export {}; function f() { { var window = local; } return window; }',sourceType:'module',expected:['local']},
  {name:'window',source:'export {}; function f({window}) { return window; }',sourceType:'module',expected:['local']},
  {name:'window',source:'export {}; function f() { { let window = local; return window; } }',sourceType:'module',expected:['local']},
  {name:'localStorage',source:'export {}; function f(localStorage) { localStorage.setItem("x", 1); } localStorage.setItem("y", 2);',sourceType:'module',expected:['local','free-host-candidate']},
  {name:'sessionStorage',source:'export {}; sessionStorage.setItem("x", 1);',sourceType:'module',expected:['free-host-candidate']},
  {name:'Storage',source:'export {}; function f(Storage) { return new Storage(); } new Storage();',sourceType:'module',expected:['local','free-host-candidate']},
  {name:'self',source:'export {}; self.location.href;',sourceType:'module',expected:['free-host-candidate']},
  {name:'globalThis',source:'export {}; globalThis.window;',sourceType:'module',expected:['free-host-candidate']},
  {name:'globalThis',source:'export {}; function f(globalThis) { return globalThis.window; }',sourceType:'module',expected:['local']},
  {name:'window',source:'function f(o) { with (o) { window.onerror = handler; } }',sourceType:'script',expected:['unknown']},
  {name:'window',source:'function f() { eval("var window = local"); window.onerror = handler; }',sourceType:'script',expected:['unknown']},
  {name:'window',source:'function outer() { eval("var window = local"); return function inner() { window.onerror = handler; }; }',sourceType:'script',expected:['unknown']},
  {name:'window',source:'function outer() { function sibling() { eval("var window = local"); } return function inner() { window.onerror = handler; }; }',sourceType:'script',expected:['free-host-candidate']},
  {name:'window',source:'function f(eval) { eval("var window = local"); window.onerror = handler; }',sourceType:'script',expected:['unknown']},
  {name:'window',source:'var window; window.onerror = handler;',sourceType:'script',expected:['unknown']},
  {name:'window',source:'export {}; var window; window.onerror = handler;',sourceType:'module',expected:['local']},
  {name:'window',source:'const f=(window)=>()=>window; window.onerror=handler;',sourceType:'module',expected:['local','free-host-candidate']},
  {name:'window',source:'function f(window){return window} function g(){return window}',sourceType:'module',expected:['local','free-host-candidate']},
  {name:'window',source:'function f({a: window = globalThis}){ return window }',sourceType:'module',expected:['local']},
  {name:'window',source:'export {}; class C { static { var window = 1; } } window.onerror = handler;',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; const { [window]: local } = object;',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; const r = {window};',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; for (let window of values) { window.foo; } window.onerror = handler;',sourceType:'module',expected:['local','free-host-candidate']},
  {name:'window',source:'export {}; switch (x) { case 1: let window=2; window.foo; } window.onerror=handler;',sourceType:'module',expected:['local','free-host-candidate']},
  {name:'window',source:'export {}; const x = class window { method(){return window;} }; window.onerror=handler;',sourceType:'module',expected:['local','free-host-candidate']},
  {name:'window',source:'export {}; let value=window; {let window=1;value=window;}',sourceType:'module',expected:['free-host-candidate','local']},
  {name:'window',source:'export {window as externalName} from "./dep.mjs"; window.onerror=handler;',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; function f(){ return window; let window=1; }',sourceType:'module',expected:['local']},
  {name:'window',source:'function f() { eval("var window=1") } function g(){return window}',sourceType:'script',expected:['free-host-candidate']},
  {name:'window',source:'export {}; function f(value=window){var window="body";return value;}',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; function f(value=window){var window="body";return window;}',sourceType:'module',expected:['free-host-candidate','local']},
  {name:'window',source:'export {}; function f(value=window){function window(){} return value;}',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; const f=(value=window)=>{var window="body";return value;};',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'export {}; function f(value=window){eval("var window = 1");return value;}',sourceType:'module',expected:['free-host-candidate']},
  {name:'window',source:'function outer(eval){eval("var window=1");return function inner(){return window;};}',sourceType:'script',expected:['unknown']}
];

test('bounded Acorn lexical-root identity and dynamic-scope candidates',()=>{
  for(const fixture of fixtures){
    const ast=acorn.parse(fixture.source,{
      ecmaVersion:'latest',
      sourceType:fixture.sourceType==='commonjs'?'script':fixture.sourceType,
      allowReturnOutsideFunction:fixture.sourceType==='commonjs'
    });
    const result=resolveLexicalReferences(ast,fixture.sourceType);
    const refs=result.references.filter(reference=>reference.name===fixture.name);
    assert.deepEqual(refs.map(reference=>reference.resolution.kind),fixture.expected,fixture.source);
    assert.equal(new Set(refs.map(reference=>reference.start)).size,refs.length,fixture.source);
  }
  assert.equal(fixtures.length,40);
});

test('distinct lexical declarations retain separate binding identities',()=>{
  const code='export {}; function f(window){ return window; } function g(window){ return window; }';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const refs=resolveLexicalReferences(ast,'module').references.filter(reference=>reference.name==='window');
  assert.equal(refs.length,2);
  assert.equal(refs[0].resolution.kind,'local');
  assert.equal(refs[1].resolution.kind,'local');
  assert.notEqual(refs[0].resolution.bindingId,refs[1].resolution.bindingId);
});

test('CommonJS scope is wrapper-local but bare host roots remain candidates',()=>{
  const code='var window = {x:1}; window.x; (function(){ return globalThis.window; })();';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});
  const refs=resolveLexicalReferences(ast,'commonjs').references;
  assert.deepEqual(refs.filter(r=>r.name==='window').map(r=>r.resolution.kind),['local']);
  assert.deepEqual(refs.filter(r=>r.name==='globalThis').map(r=>r.resolution.kind),['free-host-candidate']);
});


test('declaration identities: var/function merge is order-independent',()=>{
  const sources=[
    'export {}; function f(){ var window; function window(){}; return window; }',
    'export {}; function f(){ function window(){}; var window; return window; }',
    'export {}; function f(window){ var window; return window; }',
    'export {}; function f(window){ function window(){} return window; }'
  ];
  for(const code of sources){
    const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
    const resolved=resolveLexicalReferences(ast,'module');
    const decl=resolved.declarations.filter(item=>item.name==='window');
    const refs=resolved.references.filter(item=>item.name==='window');
    assert.equal(decl.length,2,code);
    assert.equal(refs.length,1,code);
    assert.equal(decl[0].bindingId,decl[1].bindingId,code);
    assert.equal(refs[0].resolution.kind,'local',code);
    if(refs[0].resolution.kind==='local')assert.equal(refs[0].resolution.bindingId,decl[0].bindingId,code);
  }
});

test('with receiver resolves outside the injected object scope',()=>{
  const code='with ({ key: window }) { window.value; }';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});
  const refs=resolveLexicalReferences(ast,'script').references.filter(r=>r.name==='window');
  assert.deepEqual(refs.map(r=>r.resolution.kind),['free-host-candidate','unknown']);
  assert.equal(refs[1].resolution.kind,'unknown');
  if(refs[1].resolution.kind==='unknown')assert.equal(refs[1].resolution.reason,'with-object-environment');
});

test('role annotations preserve reads, writes and computed lookup sites',()=>{
  const code='export {}; const window={}; window; window=1; window++; window(); new window(); const a=box[window]; const b={[window]:1}; ({window}=box); for(window of xs) {} export {window as external};';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const refs=resolveLexicalReferences(ast,'module').references.filter(r=>r.name==='window');
  assert.deepEqual(refs.map(r=>r.role),[
    'read','write','read-write','call','construct','computed-key',
    'computed-key','write','write','export-local'
  ]);
});


test('same-name sibling declaration records remain separate',()=>{
  const code='export {}; function f(window){return window;} function g(window){return window;}';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const result=resolveLexicalReferences(ast,'module');
  const decl=result.declarations.filter(d=>d.name==='window');
  const refs=result.references.filter(r=>r.name==='window');
  assert.equal(decl.length,2);
  assert.equal(refs.length,2);
  assert.notEqual(decl[0].bindingId,decl[1].bindingId);
  assert.equal(refs[0].resolution.kind,'local');
  assert.equal(refs[1].resolution.kind,'local');
  if(refs[0].resolution.kind==='local'&&refs[1].resolution.kind==='local'){
    assert.equal(refs[0].resolution.bindingId,decl[0].bindingId);
    assert.equal(refs[1].resolution.bindingId,decl[1].bindingId);
  }
});

test('with-object root is outside dynamic resolution and body remains unknown',()=>{
  const code='with(window){window.value;}';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});
  const refs=resolveLexicalReferences(ast,'script').references.filter(r=>r.name==='window');
  assert.deepEqual(refs.map(r=>r.resolution.kind),['free-host-candidate','unknown']);
});

test('non-simple parameter and body var conflict refuses independent identity',()=>{
  const code='export {}; function f(window=1){var window;return window;}';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const result=resolveLexicalReferences(ast,'module');
  const decl=result.declarations.filter(d=>d.name==='window');
  assert.equal(decl.length,2);
  assert.equal(decl[0].kind,'param');
  assert.equal(decl[1].kind,'var');
  assert.ok(decl[0].bindingId!==null);
  assert.equal(decl[1].bindingId,null);
  const references=result.references.filter(r=>r.name==='window');
  assert.equal(references.length,1);
  assert.deepEqual(references.map(r=>r.resolution.kind),['unknown']);
});


test('shadowed direct eval can still execute the intrinsic and introduce a binding',()=>{
  const execute=new Function(
    'function f(eval){eval("var window=37");return window;}return f(eval);'
  );
  assert.equal(execute(),37);
  const code='function f(eval){eval("var window=37");return window;}';
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});
  const refs=resolveLexicalReferences(ast,'script').references.filter(r=>r.name==='window');
  assert.equal(refs.length,1);
  assert.equal(refs[0].resolution.kind,'unknown');
  if(refs[0].resolution.kind==='unknown')
    assert.equal(refs[0].resolution.reason,'direct-eval-in-lexical-ancestor');
});
