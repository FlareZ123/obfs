'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {hasTerminalUrlDotSegment}=require('../src/esm-url-paths');

test('terminal literal dot segments are not POSIX file identities',()=>{
  for(const specifier of ['./private.mjs/.','./private.mjs/..',
    './private.mjs/.?v=1','./private.mjs/..#module']) {
    assert.equal(hasTerminalUrlDotSegment(specifier),true,specifier);
  }
});

test('interior dot segments and canonical file paths remain admissible',()=>{
  for(const specifier of ['./private.mjs','./folder/../private.mjs',
    './folder/./private.mjs','./private.mjs/']) {
    assert.equal(hasTerminalUrlDotSegment(specifier),false,specifier);
  }
});

test('terminal-dot witness differs under POSIX and WHATWG URL resolution',()=>{
  const specifier='./private.mjs/.';
  const from='entry.mjs';
  const posix=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  const url=new URL(specifier,'https://example.test/entry.mjs');
  assert.equal(posix,'private.mjs');
  assert.equal(url.pathname,'/private.mjs/');
  assert.equal(hasTerminalUrlDotSegment(specifier),true);
});

test('interior dot normalization agrees across both path models',()=>{
  const specifier='./folder/../private.mjs';
  const from='entry.mjs';
  const posix=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  const url=new URL(specifier,'https://example.test/entry.mjs');
  assert.equal(posix,'private.mjs');
  assert.equal(url.pathname,'/private.mjs');
  assert.equal(hasTerminalUrlDotSegment(specifier),false);
});
