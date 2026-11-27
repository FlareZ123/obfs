'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const acorn=require('acorn');
const {resolveLexicalReferences}=require('../workplace/agent1-lexical-reference-resolver');

const ownerSource=[
  'export class window { static own(){return window;} }',
  'export function changeOuter(){window="changed";}'
].join('\n');

test('native two-module ESM: live exported class name changes, inner class self does not',{
  timeout:30000
},async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-class-inner-live-'));
  try{
    await fs.writeFile(path.join(dir,'owner.mjs'),ownerSource+'\n');
    await fs.writeFile(path.join(dir,'consumer.mjs'),[
      'import {window,changeOuter} from "./owner.mjs";',
      'const original=window;',
      'changeOuter();',
      'export const proof={stable:original.own()===original,',
      '  importedLiveValue:window,originalName:original.name};'
    ].join('\n'));
    const consumer=await import(pathToFileURL(path.join(dir,'consumer.mjs')).href);
    assert.equal(consumer.proof.stable,true);
    assert.equal(consumer.proof.importedLiveValue,'changed');
    assert.equal(consumer.proof.originalName,'window');
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('owner Stage 1 links immutable inner and mutable outer names for exported class',()=>{
  const root=acorn.parse(ownerSource,{sourceType:'module',ecmaVersion:'latest'});
  const r=resolveLexicalReferences(root,'module');
  const refs=r.references.filter(ref=>ref.name==='window');
  const decl=r.declarations.filter(d=>d.name==='window');
  assert.equal(decl.length,1);
  assert.equal(r.classSpellingCouplings.length,1);
  assert.equal(refs.length,2,'inner read and outer mutation');
  assert.equal(refs[0].role,'read');
  assert.equal(refs[1].role,'write');
  assert.equal(refs[0].resolution.kind,'local');
  assert.equal(refs[1].resolution.kind,'local');
  if(refs[0].resolution.kind==='local'&&refs[1].resolution.kind==='local'){
    const coupling=r.classSpellingCouplings[0];
    assert.equal(coupling.outerBindingId,decl[0].bindingId);
    assert.equal(coupling.innerBindingId,refs[0].resolution.bindingId);
    assert.equal(coupling.outerBindingId,refs[1].resolution.bindingId);
    assert.notEqual(coupling.innerBindingId,coupling.outerBindingId);
  }
});
