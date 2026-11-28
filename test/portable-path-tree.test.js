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

test('Unicode multi-stage casefold leaf aliases are refused by all three output modes',()=>{
  // Each input pair has distinct JS lower and upper keys but a common full
  // Unicode casefold; the shared output tree must refuse both input orders.
  assertRejectedTree(
    'assets/'+String.fromCodePoint(0x03d1)+'.png',
    'assets/'+String.fromCodePoint(0x03f4)+'.png',
    /Duplicate/u);
  assertRejectedTree(
    'assets/'+String.fromCodePoint(0x1e9e)+'.png',
    'assets/ss.png',
    /Duplicate/u);
});

test('all output modes refuse default-ignorable filenames, including bidi and variation controls',()=>{
  for(const cp of [0x200b,0x202e,0xfe0f]){
    const candidate='assets/icon'+String.fromCodePoint(cp)+'.png';
    const files=[entry,asset(candidate)];
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      assert.throws(()=>obfuscateFiles(files,{mode,seed:'ignorable-path-tree'} ),
        /Default-ignorable Unicode filename/u,
        mode+' '+cp.toString(16));
    }
    assert.throws(()=>createSnoLauncher(files,'entry.cjs'),
      /Default-ignorable Unicode filename/u);
    assert.throws(()=>createScoHandler([asset(candidate)]),
      /Default-ignorable Unicode filename/u);
  }
});
