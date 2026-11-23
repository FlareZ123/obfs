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


test('UTF-16 mapped closures remain stable after earlier independent edits',()=>{
  const code='const emoji="😀"; function sibling(){let renameMe=3;return renameMe;} '+
    'const secret=40; function observed(){return secret+2;}';
  const first=code.indexOf('renameMe');
  const second=code.lastIndexOf('renameMe');
  const result=applyObservedFunctionEdits(code,'commonjs','observed',[
    {start:first,end:first+8,text:'x'},
    {start:second,end:second+8,text:'x'}
  ]);
  assert.ok(result.code.indexOf('function observed')<code.indexOf('function observed'));
  assert.deepEqual(JSON.parse(JSON.stringify(run(result.code))),
    JSON.parse(JSON.stringify(run(code))));
});

test('source-boundary insertions fail closed',()=>{
  const code='const secret=40;function observed(){return secret+2;}' +
    'function sibling(){return 3;}';
  const start=code.indexOf('function observed');
  const end=code.indexOf('function sibling');
  for(const pos of [start,end]){
    assert.throws(()=>applyObservedFunctionEdits(code,'commonjs','observed',[
      {start:pos,end:pos,text:'/* inserted */'}
    ]),/Edit touches observed source or lexical closure/);
  }
});


test('real ESM module retains observed callable source under independent edits',async()=>{
  const code='export const secret=40;export function observed(){return secret+2;}' +
    'export function sibling(){let renameMe=9;return renameMe;}';
  const first=code.indexOf('renameMe');
  const second=code.lastIndexOf('renameMe');
  const result=applyObservedFunctionEdits(code,'module','observed',[
    {start:first,end:first+8,text:'tmp'},
    {start:second,end:second+8,text:'tmp'}
  ]);
  /** @param {string} text */
  const spec=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
  const [original,emitted]=await Promise.all([import(spec(code)),import(spec(result.code))]);
  assert.equal(original.observed(),42);
  assert.equal(emitted.observed(),42);
  assert.equal(emitted.sibling(),9);
  assert.equal(emitted.observed.toString(),original.observed.toString());
});


test('fixed ESM provider import retains lexical closure during unrelated edits',async()=>{
  /** @param {string} text */
  const url=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
  const provider=url('export const secret=40;');
  const code='import {secret} from '+JSON.stringify(provider)+';' +
    'export function observed(){return secret+2;}' +
    'export function sibling(){let unrelated=9;return unrelated;}';
  const first=code.indexOf('unrelated');
  const second=code.lastIndexOf('unrelated');
  const result=applyObservedFunctionEdits(code,'module','observed',[
    {start:first,end:first+9,text:'_g'},
    {start:second,end:second+9,text:'_g'}
  ]);
  const [original,emitted]=await Promise.all([import(url(code)),import(url(result.code))]);
  assert.equal(original.observed(),42);
  assert.equal(emitted.observed(),42);
  assert.equal(emitted.sibling(),9);
  assert.equal(original.observed.toString(),emitted.observed.toString());
  assert.ok(result.plan.guarded.some(span=>span.reason==='LexicalDeclaration'&&
    code.slice(span.start,span.end)==='secret'));
});


test('negative control: external property rewrite can preserve source yet change behavior',()=>{
  const code='const data={value:40};function observed(){return data.value+2;}' +
    'function sibling(){return 1;}';
  const start=code.indexOf('value:40');
  const result=applyObservedFunctionEdits(code,'commonjs','observed',[
    {start,end:start+5,text:'other'}
  ]);
  const original=run(code);
  const emitted=run(result.code);
  assert.equal(original.value,42);
  assert.equal(original.source,emitted.source);
  assert.ok(Number.isNaN(emitted.value));
});

test('negative control: changing an imported provider is outside lexical source proof',async()=>{
  /** @param {string} text */
  const url=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
  const originalProvider=url('export const secret=40;');
  const otherProvider=url('export const secret=1;');
  const specifier=JSON.stringify(originalProvider);
  const code='import {secret} from '+specifier+';' +
    'export function observed(){return secret+2;}' +
    'export function sibling(){return 1;}';
  const start=code.indexOf(specifier);
  const result=applyObservedFunctionEdits(code,'module','observed',[
    {start,end:start+specifier.length,text:JSON.stringify(otherProvider)}
  ]);
  const [original,emitted]=await Promise.all([import(url(code)),import(url(result.code))]);
  assert.equal(original.observed(),42);
  assert.equal(emitted.observed(),3);
  assert.equal(original.observed.toString(),emitted.observed.toString());
});


test('negative control: captured primitive initializer is outside lexical name proof',()=>{
  const code='const secret=40;function observed(){return secret+2;}' +
    'function sibling(){return 1;}';
  const start=code.indexOf('40');
  const output=applyObservedFunctionEdits(code,'commonjs','observed',[
    {start,end:start+2,text:'41'}
  ]);
  const before=run(code);
  const after=run(output.code);
  assert.equal(output.plan.declined,null);
  assert.equal(before.value,42);
  assert.equal(after.value,43);
  assert.equal(before.source,after.source);
  assert.ok(output.plan.guarded.some(span=>
    code.slice(span.start,span.end)==='secret'));
});
