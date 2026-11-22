'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {selectedFocusedTest}=require('../sims/focused-test-dispatch');

test('selected focused CI test accepts a known repository case',()=>{
  assert.equal(selectedFocusedTest('test/focused-test-dispatch.test.js'),
    'test/focused-test-dispatch.test.js');
});

test('focused CI input cannot pass Node flags or shell expressions',()=>{
  for(const value of [
    '--test','test/valid.test.js; echo bad',
    'test/valid.test.js --inspect','test/x.test.js && node -v',
    'test/x.test.js\nnode -v'
  ])assert.throws(()=>selectedFocusedTest(value),TypeError,value);
});

test('focused CI input cannot escape the test directory',()=>{
  for(const value of [
    '../test/focused-test-dispatch.test.js',
    'test/../package.json','test/subdir/case.test.js',
    'test\\other.test.js','/tmp/private.test.js',
    'test/.hidden.test.js',''
  ])assert.throws(()=>selectedFocusedTest(value),TypeError,value);
});

test('focused CI rejects nonexistent test paths and invalid types',()=>{
  for(const value of ['test/this-file-does-not-exist.test.js',
    'test/package.json',undefined,42,null,{}]) {
    assert.throws(()=>selectedFocusedTest(value),TypeError,String(value));
  }
});
