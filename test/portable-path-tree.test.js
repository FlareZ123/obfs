'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles,createScoHandler,createSnoLauncher}=require('../src');
const {unicodeCaseFold}=require('../src/unicode-casefold');

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
    assert.throws(()=>createScoHandler(files.slice(1)),expected,
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

test('SNO package scopes cannot be split across aliases of one parent directory',()=>{
  const files=[
    {path:'package.json',sourceType:/** @type {const} */('asset'),
      code:'{"type":"commonjs"}'},
    {path:'caf\u00e9/entry.js',sourceType:/** @type {const} */('commonjs'),
      code:'module.exports=19;'},
    {path:'cafe\u0301/package.json',sourceType:/** @type {const} */('asset'),
      code:'{"type":"module"}'}
  ];
  assert.throws(()=>createSnoLauncher(files,'caf\u00e9/entry.js'),
    /Ambiguous directory spelling/);
  assert.throws(()=>obfuscateFiles(files,{mode:'sno'}),
    /Ambiguous directory spelling/);
});

test('SCO explicit public path inventory refuses ambiguous ancestor spelling',()=>{
  const files=[asset('base.png')];
  assert.throws(()=>createScoHandler(files,{
    publicPaths:['base.png','assets/Icons/a.png','assets/icons/b.png']
  }),/Ambiguous directory spelling/);
  assert.throws(()=>createScoHandler(files,{
    publicPaths:['base.png','assets/item.png','assets/item.png/child.png']
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
  assert.doesNotThrow(()=>createScoHandler(files.slice(1),{
    publicPaths:files.slice(1).map(file=>file.path)
  }));
});

test('existing canonical full-path duplicate refusal remains in force',()=>{
  const files=[entry,asset('assets/caf\u00e9.png'),asset('assets/cafe\u0301.png')];
  assert.throws(()=>createSnoLauncher(files,'entry.cjs'),/Duplicate SNO file/);
  assert.throws(()=>createScoHandler(files.slice(1)),/Duplicate file/);
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    assert.throws(()=>obfuscateFiles(files,{mode}),/Duplicate file/);
  }
});


test('uppercase-equivalent Unicode directory names cannot split an output tree',()=>{
  const examples=[
    ['σ','ς'], // Greek sigma and final sigma
    ['s','ſ']  // Latin s and long s
  ];
  for(const [first,second] of examples) {
    assert.notEqual(first.toLowerCase(),second.toLowerCase());
    assert.equal(first.toUpperCase(),second.toUpperCase());
    assertRejectedTree('assets/'+first+'/a.png','assets/'+second+'/b.png',
      /Ambiguous directory spelling/);
  }
});

test('uppercase-equivalent Unicode filenames cannot overwrite each other',()=>{
  for(const [first,second] of [['σ','ς'],['s','ſ']]) {
    const files=[entry,asset('assets/'+first+'.png'),asset('assets/'+second+'.png')];
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      assert.throws(()=>obfuscateFiles(files,{mode}),/Duplicate file/);
    }
    assert.throws(()=>createSnoLauncher(files,'entry.cjs'),/Duplicate SNO file/);
    assert.throws(()=>createScoHandler(files.slice(1)),/Duplicate file/);
  }
});

test('upper-then-lower Greek theta aliases cannot split output trees or filenames',()=>{
  const first='ϑ',second='ϴ';
  assert.notEqual(first.toLowerCase(),second.toLowerCase());
  assert.notEqual(first.toUpperCase(),second.toUpperCase());
  assert.equal(first.toUpperCase().toLowerCase(),second.toUpperCase().toLowerCase());
  assertRejectedTree('assets/'+first+'/a.png','assets/'+second+'/b.png',
    /Ambiguous directory spelling/);
  const files=[entry,asset('assets/'+first+'.png'),asset('assets/'+second+'.png')];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    assert.throws(()=>obfuscateFiles(files,{mode}),/Duplicate file/);
  }
  assert.throws(()=>createSnoLauncher(files,'entry.cjs'),/Duplicate SNO file/);
  assert.throws(()=>createScoHandler(files.slice(1)),/Duplicate file/);
  const distinct=[entry,asset('assets/'+first+'/a.png'),asset('assets/ϕ/b.png')];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    assert.deepEqual(obfuscateFiles(distinct,{mode,seed:'greek-theta-positive'})
      .files.map(file=>file.path),distinct.map(file=>file.path),mode);
  }
});

test('lowercase-only aliases remain refused and distinct Unicode siblings emit',()=>{
  assertRejectedTree('assets/ẞ/a.png','assets/ß/b.png',
    /Ambiguous directory spelling/);
  const files=[entry,asset('assets/σ/a.png'),asset('assets/τ/b.png')];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const output=obfuscateFiles(files,{mode,seed:'greek-distinct-positive'});
    assert.deepEqual(output.files.map(file=>file.path),files.map(file=>file.path));
  }
  assert.doesNotThrow(()=>createSnoLauncher(files,'entry.cjs'));
  assert.doesNotThrow(()=>createScoHandler(files.slice(1)));
});


test('full Unicode case folding catches compound aliases without the composite-key false positive',()=>{
  const first='ßϑ',second='ẞϴ';
  assert.equal(unicodeCaseFold(first),'ssθ');
  assert.equal(unicodeCaseFold(second),'ssθ');
  assertRejectedTree('assets/'+first+'/a.png','assets/'+second+'/b.png',
    /Ambiguous directory spelling/);
  const files=[entry,asset('assets/'+first+'.png'),asset('assets/'+second+'.png')];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    assert.throws(()=>obfuscateFiles(files,{mode}),/Duplicate file/);
  }
  assert.throws(()=>createSnoLauncher(files,'entry.cjs'),/Duplicate SNO file/);
  assert.throws(()=>createScoHandler(files.slice(1)),/Duplicate file/);

  // Full case folding keeps dotless-I distinct; a lower→upper→lower
  // composite heuristic would incorrectly collapse this pair.
  assert.notEqual(unicodeCaseFold('ıß'),unicodeCaseFold('iẞ'));
  const distinct=[entry,asset('assets/ıß.png'),asset('assets/iẞ.png')];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    assert.deepEqual(obfuscateFiles(distinct,{mode,seed:'full-fold-negative-control'})
      .files.map(file=>file.path),distinct.map(file=>file.path),mode);
  }
  assert.doesNotThrow(()=>createSnoLauncher(distinct,'entry.cjs'));
  assert.doesNotThrow(()=>createScoHandler(distinct.slice(1)));
});
