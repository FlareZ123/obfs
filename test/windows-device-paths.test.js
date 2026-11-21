'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {safePath,obfuscateFiles} = require('../src/core');

test('Windows reserved device names include ISO-8859-1 superscript digits',()=>{
  for (const candidate of [
    'COM¹','COM²','COM³','com¹.txt','Com².data',
    'LPT¹','LPT²','LPT³','lpt³.js',
    'nested/COM¹/file.js','nested/LPT².log',
    'CON.txt','AUX/file.js'
  ]) {
    assert.throws(()=>safePath(candidate),/Unsafe Windows filename segment/,candidate);
    assert.throws(()=>obfuscateFiles([
      {path:candidate,code:'module.exports=1;',sourceType:'commonjs'}
    ],{mode:'sno',seed:'reserved-paths'}),/Unsafe Windows filename segment/,candidate);
  }
  for (const candidate of [
    'com10.js','COM⁴.txt','lpt10.js','comic.js','auxiliary/file.js'
  ]) {
    assert.equal(safePath(candidate),candidate);
  }
});


test('DOS 8.3 tilde-number spellings are conservatively refused at all output boundaries',()=>{
  const {createSnoLauncher,createScoHandler}=require('../src');
  const entry={path:'entry.cjs',code:'module.exports=17;',sourceType:/** @type {const} */('commonjs')};
  const longName={path:'privateLongOriginal.mjs',code:'export const marker=7;',sourceType:/** @type {const} */('module')};
  const aliases=[
    'PRIVAT~1.MJS','SECRET~1.CJS','ABCDEF~1.JS','LONGFI~9.JS',
    'assets/PRIVAT~1.MJS','ASSETS~1/image.png',
    'nested/asset~0.png'
  ];
  for(const name of aliases) {
    assert.throws(()=>safePath(name),/Unsafe Windows short-name alias segment/,name);
    const files=[entry,longName,{path:name,code:Buffer.from([4,5]),sourceType:/** @type {const} */('asset')}];
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      assert.throws(()=>obfuscateFiles(files,{mode}),/Unsafe Windows short-name alias segment/,
        mode+' '+name);
    }
    assert.throws(()=>createSnoLauncher(files,'entry.cjs'),
      /Unsafe Windows short-name alias segment/,name);
    assert.throws(()=>createScoHandler(files.slice(1)),
      /Unsafe Windows short-name alias segment/,name);
    assert.throws(()=>createScoHandler([longName],{publicPaths:[name]}),
      /Unsafe Windows short-name alias segment/,name);
  }
});

test('ordinary tilde names and a true long filename preserve safe output admission',()=>{
  const {createSnoLauncher,createScoHandler}=require('../src');
  const names=['asset~draft.png','assets/backup~v2/file.png','asset~1x.png','notes~.md'];
  for(const name of names)assert.equal(safePath(name),name);
  const entry={path:'entry.cjs',code:'module.exports=17;',sourceType:/** @type {const} */('commonjs')};
  const files=[entry,...names.map(name=>({
    path:name,code:Buffer.from([0x0,0xf1,0x34]),
    sourceType:/** @type {const} */('asset')
  })),{
    path:'privateLongOriginal.mjs',code:'export const marker=7;',
    sourceType:/** @type {const} */('module')
  }];
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const compiled=obfuscateFiles(files,{mode,seed:'shortname-alias-safe-control'});
    assert.deepEqual(compiled.files.map(file=>file.path),files.map(file=>file.path));
  }
  assert.doesNotThrow(()=>createSnoLauncher(files,'entry.cjs'));
  assert.doesNotThrow(()=>createScoHandler(files.slice(1)));
});


test('Windows console devices, port-zero variants and padded device stems refuse',()=>{
  const {createSnoLauncher,createScoHandler}=require('../src');
  const rejected=[
    'CONIN$','CONOUT$','conin$.txt','conout$.txt',
    'COM0','lpt0.log','CON .txt','AuX  .data','PRN .txt',
    'nested/CONOUT$/file.txt','nested/LPT0 /sample.js','nested/COM¹ .mjs'
  ];
  for(const name of rejected) {
    assert.throws(()=>safePath(name),/Unsafe Windows filename segment/,name);
    const files=[
      {path:'entry.cjs',code:'module.exports=17;',sourceType:/** @type {const} */('commonjs')},
      {path:name,code:Buffer.from([0x22,0x33]),sourceType:/** @type {const} */('asset')}
    ];
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      assert.throws(()=>obfuscateFiles(files,{mode}),
        /Unsafe Windows filename segment/,mode+' '+name);
    }
    assert.throws(()=>createSnoLauncher(files,'entry.cjs'),
      /Unsafe Windows filename segment/,name);
    assert.throws(()=>createScoHandler(files.slice(1)),
      /Unsafe Windows filename segment/,name);
  }
});

test('ordinary device-like filenames remain eligible for publication',()=>{
  const candidates=[
    'coninside.txt','conoutbound.txt','com10.js','lpt10.dat','com⁴.txt',
    'auxiliary/file.js','console .txt','nonconsole/COM0extra.txt'
  ];
  for(const file of candidates)assert.equal(safePath(file),file);
  const files=candidates.map(name=>({
    path:name,code:Buffer.from([3,0xff]),sourceType:/** @type {const} */('asset')
  }));
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    assert.deepEqual(obfuscateFiles(files,{mode,seed:'dos-device-controls'}).files.map(f=>f.path),
      candidates,mode);
  }
});
