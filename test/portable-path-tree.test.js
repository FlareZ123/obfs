'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles,createScoHandler,createSnoLauncher}=require('../src');

/** @param {string} name @returns {{path:string,sourceType:'asset',code:Buffer}} */
function asset(name) {
  return {path:name,sourceType:'asset',code:Buffer.from([0,1,2,3])};
}

const entry={path:'entry.cjs',sourceType:/** @type {const} */('commonjs'),
  code:'module.exports=17;'};

/**
 * Check the three compilation/runtime-admission surfaces with both input
 * orders. Every selected pair has distinct leaf filenames, so a full-path
 * duplicate-only preflight would incorrectly accept it.
 *
 * @param {string} first
 * @param {string} second
 * @param {RegExp} expected
 */
function assertRejectedTree(first,second,expected) {
  for(const pair of [[first,second],[second,first]]) {
    const files=[entry,asset(pair[0]),asset(pair[1])];
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      assert.throws(()=>obfuscateFiles(files,{mode,seed:'portable-tree-test'}),
        expected,mode+' '+pair.join(', '));
    }
    assert.throws(()=>createSnoLauncher(files,'entry.cjs'),expected,
      'direct SNO '+pair.join(', '));
    assert.throws(()=>createScoHandler(files),expected,
      'direct SCO '+pair.join(', '));
  }
}

test('case-folded ancestor names cannot denote distinct output directories',()=>{
  assertRejectedTree('assets/Icons/a.png','assets/icons/b.png',
    /Ambiguous directory spelling/);
});

test('canonically equivalent Unicode ancestor names cannot denote distinct directories',()=>{
  assertRejectedTree('assets/caf\u00e9/a.png','assets/cafe\u0301/b.png',
    /Ambiguous directory spelling/);
});

test('a file cannot also name an ancestor directory in an output tree',()=>{
  assertRejectedTree('assets/item.png','assets/item.png/child.png',
    /File conflicts with directory/);
});

test('SCO explicit public path inventory refuses ambiguous ancestor spelling',()=>{
  assert.throws(()=>createScoHandler([entry],{
    publicPaths:['assets/Icons/a.png','assets/icons/b.png']
  }),/Ambiguous directory spelling/);
  assert.throws(()=>createScoHandler([entry],{
    publicPaths:['assets/item.png','assets/item.png/child.png']
  }),/File conflicts with directory/);
});

test('genuinely distinct sibling paths preserve positive emission and route behavior',()=>{
  const files=[entry,asset('assets/icons/a.png'),asset('assets/icons/b.png')];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const output=obfuscateFiles(files,{mode,seed:'portable-tree-positive'});
    assert.deepEqual(output.files.map(file=>file.path),
      files.map(file=>file.path),mode);
  }
  assert.doesNotThrow(()=>createSnoLauncher(files,'entry.cjs'));
  assert.doesNotThrow(()=>createScoHandler(files,{
    publicPaths:files.map(file=>file.path)
  }));
});

test('existing canonical full-path duplicate refusal remains in force',()=>{
  const files=[entry,asset('assets/caf\u00e9.png'),asset('assets/cafe\u0301.png')];
  assert.throws(()=>createSnoLauncher(files,'entry.cjs'),/Duplicate SNO file/);
  assert.throws(()=>createScoHandler(files),/Duplicate file/);
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    assert.throws(()=>obfuscateFiles(files,{mode}),/Duplicate file/);
  }
});
