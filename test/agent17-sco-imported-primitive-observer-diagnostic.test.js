'use strict';

const assert=require('node:assert/strict');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');

const entrySource=[
  "import { helperValue } from './lib/helper.mjs';",
  'const privateOffset = 3;',
  'export const finalValue = helperValue + privateOffset;'
].join('\n');
const ast=parse(entrySource,'module');
const withoutPrimitiveProof=observesFunctionSource(ast);
const withPrimitiveProof=observesFunctionSource(
  ast,new Map(),new Set(),new Set(),new Set(['helperValue']),new Set()
);
const distributedObserver=observesDistributedSource(ast);

assert.equal(distributedObserver,false,
  'A static import of a primitive export should not itself be a distributed-source observer');
assert.equal(withoutPrimitiveProof,true,
  'An unproven imported binding used by + must remain conservatively source-observable');
assert.equal(withPrimitiveProof,false,
  'A verified immutable primitive import should not be treated as a possible function value');
