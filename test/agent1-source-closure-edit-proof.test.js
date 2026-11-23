'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const {parse}=require('../src/ast');
const {planObservedFunctionSource,applyObservedFunctionEdits}=
  require('../workplace/agent1-source-closure-edit-proof');

/** @param {string} code @returns {{source:string,value:number,sibling:number}} */
function run(code){
  return /** @type {{source:string,value:number,sibling:number}} */ (
    vm.runInNewContext(code+
      '\n({source:observed.toString(),value:observed(),sibling:sibling()})'));
}

test('exact function source and captured lexical binding survive independent renames',()=>{
  const code='const secret=40; function observed(){return secret+2;}' +
    'function sibling(){const renameMe=3;return renameMe;}';
  const source=run(code);
  const first=code.indexOf('renameMe');
  const last=code.lastIndexOf('renameMe');
  const edits=[
    {start:first,end:first+'renameMe'.length,text:'_v1'},
    {start:last,end:last+'renameMe'.length,text:'_v1'}
  ];
  const result=applyObservedFunctionEdits(code,'commonjs','observed',edits);
  const output=run(result.code);
  assert.deepEqual(JSON.parse(JSON.stringify(output)),JSON.parse(JSON.stringify(source)));
  assert.ok(result.plan.guarded.some(span=>span.reason==='LexicalDeclaration'));
  assert.ok(result.plan.guarded.some(span=>span.reason==='LexicalReference'));
});

test('captured outer binding spelling is protected outside observed function bytes',()=>{
  const code='const secret=40; function observed(){return secret+2;}' +
    'function sibling(){return 1;}';
  const decl=code.indexOf('secret=40');
  const use=code.indexOf('secret+2');
  for(const start of [decl,use]){
    assert.throws(()=>applyObservedFunctionEdits(code,'commonjs','observed',[
      {start,end:start+6,text:'_mutated'}
    ]),/Edit touches observed source or lexical closure/);
  }
});

test('same-spelling sibling binding is independent of observed closure',()=>{
  const code='const secret=40; function observed(){return secret+2;}' +
    'function sibling(){const secret=9;return secret;}';
  const declaration=code.indexOf('secret=9');
  const reference=code.lastIndexOf('secret');
  const edits=[
    {start:declaration,end:declaration+6,text:'privateName'},
    {start:reference,end:reference+6,text:'privateName'}
  ];
  const result=applyObservedFunctionEdits(code,'commonjs','observed',edits);
  assert.deepEqual(JSON.parse(JSON.stringify(run(result.code))),
    JSON.parse(JSON.stringify(run(code))));
});

test('new outer shadow after an insertion is rejected by post-edit binding resolution',()=>{
  const code='const secret=40; function outer(){  function observed(){return secret+2;} return observed;}';
  const insertion=code.indexOf('  function observed')+1;
  const edit={start:insertion,end:insertion,text:'const secret=99; '};
  assert.throws(()=>applyObservedFunctionEdits(code,'commonjs','observed',[edit]),
    /Source-visible closure binding identity changed/);
});

test('source-position and whole-file-byte effects have stronger edit restrictions',()=>{
  const code='const prefix=1; function observed(){const own=2;return own;} '+
    'function sibling(){return 3;}';
  const prefix=code.indexOf('prefix');
  const sibling=code.indexOf('sibling');
  assert.throws(()=>applyObservedFunctionEdits(code,'commonjs','observed',[
    {start:prefix,end:prefix+6,text:'_v'}
  ],{effect:'frame'}),/FramePosition prefix cannot change/);
  assert.throws(()=>applyObservedFunctionEdits(code,'commonjs','observed',[
    {start:sibling,end:sibling+7,text:'_g'}
  ],{effect:'bytes'}),/SourceBytes requires byte-identical file/);
});

test('unproven ambient reference declines and source range respects UTF-16 offsets',()=>{
  const ambiguous='function observed(){return window.location;}';
  const ast=parse(ambiguous,'commonjs');
  const plan=planObservedFunctionSource(ambiguous,ast,'commonjs','observed');
  assert.equal(plan.declined,'unresolved-source-reference:window');
  assert.throws(()=>applyObservedFunctionEdits(ambiguous,'commonjs','observed',[]),
    /Unproven source observer closure/);
  const code='const emoji="😀";const secret=40;function observed(){return secret+2;}' +
    'function sibling(){return 3;}';
  const source=code.slice(code.indexOf('function observed'),code.indexOf('function sibling'));
  const result=applyObservedFunctionEdits(code,'commonjs','observed',[
    {start:code.indexOf('sibling'),end:code.indexOf('sibling')+7,text:'different'}
  ]);
  assert.equal(result.code.includes(source),true);
  assert.equal(result.plan.source,'function observed(){return secret+2;}');
});
