'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {parse,observesFunctionSource}=require('../src/ast');

/** @returns {import('../src/ast').AstNode} */
function moduleAst() {
  return parse(
    'import {payload} from "./producer.mjs";'+
    'export const joined=payload.join(",");',
    'module'
  );
}

test('function-bearing ESM array provenance cannot poison opaque-source cache',()=>{
  const ast=moduleAst();
  const arrays=new Set(['payload']);
  assert.equal(observesFunctionSource(ast,new Map(),new Set(),arrays),true,
    'Proven array of functions may reveal each function source');
  assert.equal(observesFunctionSource(ast),false,
    'A later no-proof analysis must not inherit the earlier proof');
  assert.equal(observesFunctionSource(moduleAst()),false,
    'Fresh AST without provenance establishes the expected reference');
});

test('opaque analysis can be reused before function-array provenance',()=>{
  const ast=moduleAst();
  assert.equal(observesFunctionSource(ast),false);
  assert.equal(observesFunctionSource(ast,new Map(),new Set(),new Set(['payload'])),true);
  assert.equal(observesFunctionSource(ast),false);
});
