'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @type {SourceFile[]} */
const sources=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={visibleA:17};const v=a.visibleA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {watched} from "./watched.mjs";\n'+
      'import {unrelated} from "./independent.mjs";\n'+
      'console.log(watched.toString());console.log(unrelated());'}
];

/**
 * Every mode should use a proven pure ESM island for *only* local literal own
 * property renaming, not a blanket bypass of a source-observer veto.
 * Independent safe property yield is required; a source-preserving zero-yield
 * output is not a successful obfuscation result.
 */
for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  const options={mode,seed:'agent3-island-property-only-'+mode,closedWorld:true,
    properties:true,identifiers:true,strings:true,
    experimentalSourceObserverIslands:['independent.mjs']};
  test(mode+': pure primitive selected island rewrites own record but no identifier source',()=>{
    const result=obfuscateFiles(sources,options);
    const selected=result.files.find(f=>f.path==='independent.mjs');
    assert.ok(selected,'missing selected leaf');
    assert.ok(selected.metrics.properties>=1,'missing independently proved safe rename');
    assert.equal(selected.metrics.bindings,0,'source-observer exception must not rename identifiers');
    assert.equal(selected.metrics.literals,0,'source-observer exception must not rewrite string literals');
    assert.ok(!String(selected.code).includes('privateB'),'own property did not change');
    assert.equal(result.files.find(f=>f.path==='watched.mjs')?.code,sources[0].code);
    assert.equal(result.files.find(f=>f.path==='entry.mjs')?.code,sources[2].code);
  });
  test(mode+': selected island does not enable source-sensitive Register VM',()=>{
    assert.throws(()=>obfuscateFiles(sources,{
      ...options,
      experimentalRegisterVm:{'independent.mjs':['unrelated']}
    }),/Register VM requires a module\/CommonJS without cross-file source observation/);
  });
}
