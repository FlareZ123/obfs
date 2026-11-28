'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Native User Timing aliases imported from another module are a different
 * proof context from a file-local source-only AST. A shared AST cache must
 * never reuse a result from the stronger imported proof context in the
 * conservative unknown/no-import context.
 */
test('native timing import provenance cannot poison plain-AST observer cache',()=>{
  const ast=parse('holder.mark(candidate);','module');
  const nativeReceiver=new Map([['holder',new Set(['receiver'])]]);
  assert.equal(observesFunctionSource(ast),false);
  assert.equal(observesFunctionSource(
    ast,new Map(),new Set(),new Set(),new Set(),new Set(),nativeReceiver),true);
  assert.equal(observesFunctionSource(ast),false,
    'The imported-provenance result must not overwrite the plain-AST cache');
});

test('method holder import context cannot contaminate unrelated local analysis',()=>{
  const ast=parse('holders.native.call(performance,candidate);','module');
  const nativeHolder=new Map([['holders',new Set(['holder:native'])]]);
  assert.equal(observesFunctionSource(
    ast,new Map(),new Set(),new Set(),new Set(),new Set(),nativeHolder),true);
  assert.equal(observesFunctionSource(ast),false,
    'Native import aliases are not implied by a standalone source AST');
});
