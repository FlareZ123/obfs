'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');
const {createScoHandler,createSnoLauncher}=require('../src');

/** @type {Array<'coo'|'sno'|'sco'>} */
const modes=['coo','sno','sco'];
const composed='modules/caf\u00e9.png';
const decomposed='modules/cafe\u0301.png';

/** @param {string} path @returns {{path:string,code:Buffer,sourceType:'asset'}} */
function asset(path) {
  return {path,code:Buffer.from([0x00,0xff,0x42]),sourceType:'asset'};
}

test('canonical Unicode equivalents have distinct source bytes',()=>{
  assert.notEqual(composed,decomposed);
  assert.notDeepEqual(Buffer.from(composed,'utf8'),Buffer.from(decomposed,'utf8'));
  assert.equal(composed.normalize('NFC'),decomposed.normalize('NFC'));
});

test('all compiler modes refuse cross-filesystem Unicode aliases before emission',()=>{
  const files=[asset(composed),asset(decomposed)];
  for(const mode of modes){
    assert.throws(()=>obfuscateFiles(files,{mode,seed:'canonical-path-collision'}),
      /Duplicate file modules\/cafe\u0301\.png/,mode);
  }
});

test('SCO direct route inventory and public allowlist refuse canonical aliases',()=>{
  assert.throws(()=>createScoHandler([asset(composed),asset(decomposed)]),
    /Duplicate file modules\/cafe\u0301\.png/);
  assert.throws(()=>createScoHandler([asset(composed)],{
    publicPaths:[composed,decomposed]
  }),/Duplicate SCO publicPaths entry/);
});

test('SCO private path alias cannot publish a canonically equivalent public file',()=>{
  const privateName='modules/caf\u00e9.js';
  const publicAlias='modules/cafe\u0301.js';
  assert.throws(()=>createScoHandler([{
    path:publicAlias,code:'globalThis.ready=true;',sourceType:'script',
    privateModulePaths:[privateName]
  }]),/SCO must not serve private source/);
});

test('SNO direct launcher rejects aliases while accepting distinct Unicode filenames',()=>{
  const entry={path:'entry.cjs',code:'module.exports=1;'};
  assert.throws(()=>createSnoLauncher([entry,asset(composed),asset(decomposed)],'entry.cjs'),
    /Duplicate SNO file/);
  assert.doesNotThrow(()=>createSnoLauncher([entry,asset(composed),asset('modules/other.png')],'entry.cjs'));
});

test('non-colliding UTF-8 paths still retain raw opaque assets',()=>{
  const files=[asset(composed),asset('modules/other.png')];
  for(const mode of modes){
    const out=obfuscateFiles(files,{mode,seed:'canonical-path-positive'});
    assert.deepEqual(out.files.map(file=>file.path),files.map(file=>file.path));
    assert.deepEqual(out.files[0].code,files[0].code);
  }
});
