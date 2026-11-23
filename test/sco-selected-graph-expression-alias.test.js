'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedGraph}=require('../src');

const leaf={path:'private/next.mjs',
  code:'export function next(){return 7;}'};

/** @param {string} caller */
function compile(caller){
  const code=[
    'import {next} from "./private/next.mjs";',
    'export async function secret(){'+caller+'}',
    'export function local(){return 1;}'
  ].join('\n');
  return partitionScoSelectedGraph([{
    file:{path:'mixed.mjs',code,sourceType:'module'},
    options:{
      seed:'sco-private-import-expression-20261123',
      privateNames:['secret'],
      privateModuleImports:['./private/next.mjs'],
      privateModuleSources:[leaf]
    }
  }]);
}

test('selected SCO graph refuses identity escape through sequence expression',()=>{
  const caller='const alias=(0,next);alias.count=(alias.count??0)+1;return alias.count;';
  assert.throws(()=>compile(caller),
    /private imported identity escapes|shared imported member state/u);
});

test('selected SCO graph refuses identity escape through conditional expression',()=>{
  const caller='const alias=true?next:null;alias.count=(alias.count??0)+1;return alias.count;';
  assert.throws(()=>compile(caller),
    /private imported identity escapes|shared imported member state/u);
});

test('selected SCO graph refuses sequence-wrapped private return identities',()=>{
  assert.throws(()=>compile('return (0,next);'),
    /private imported identity escapes|shared imported member state/u);
});

test('selected SCO graph refuses sequence-wrapped private call arguments',()=>{
  const caller='functionInvoke((0,next));return 1;';
  // Invocation sink is rejected independently of whether the helper exists.
  assert.throws(()=>compile(caller),
    /private imported identity escapes|shared imported member state/u);
});

test('selected SCO graph refuses arrow-returned imported function identity',()=>{
  assert.throws(()=>compile('const fn=()=>next;return fn().count??0;'),
    /private imported identity escapes|shared imported member state/u);
});

test('isolated original ESM realms keep sequence-wrapped function-object counters separate',{
  timeout:15000
},async()=>{
  const fs=require('node:fs/promises');
  const os=require('node:os');
  const path=require('node:path');
  const {pathToFileURL}=require('node:url');
  const {atomicWrite}=require('../src/atomic');
  const source=[
    'import {next} from "./private/next.mjs";',
    'export async function secret(){',
    'const alias=(0,next);alias.count=(alias.count??0)+1;return alias.count;',
    '}'
  ].join('\\n');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-graph-expression-state-'));
  try{
    for(const name of ['client-a','client-b','server']){
      await atomicWrite(path.join(root,name,'mixed.mjs'),source);
      await atomicWrite(path.join(root,name,'private','next.mjs'),leaf.code);
    }
    const namespaces=await Promise.all(['client-a','client-b','server'].map(
      name=>import(pathToFileURL(path.join(root,name,'mixed.mjs')).href)));
    assert.equal(await namespaces[0].secret(),1);
    assert.equal(await namespaces[1].secret(),1);
    assert.equal(await namespaces[2].secret(),1);
    assert.equal(await namespaces[2].secret(),2);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('selected SCO graph still admits sequence alias used only for direct call',()=>{
  assert.doesNotThrow(()=>compile('const fn=(0,next);return fn();'));
});

test('selected SCO graph keeps direct stateless private function calls eligible',()=>{
  assert.doesNotThrow(()=>compile('return next();'));
});
