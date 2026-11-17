'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {safePath,obfuscateFiles}=require('../src/core');
const {createScoHandler,createSnoLauncher}=require('../src');

/** @type {Array<'coo'|'sno'|'sco'>} */
const obfuscationModes=['coo','sno','sco'];

const badPaths=[
  'module\uD800.js',
  'module\uDC00.js',
  'folder/half\uDFFF.mjs',
  'folder/\uDC00\uD800.js',
  'assets/\uD800\uD800.map'
];

test('Node UTF-8 encoding aliases a lone surrogate with a different filename',()=>{
  const lone='module\uD800.js';
  const replacement='module\uFFFD.js';
  assert.notEqual(lone,replacement);
  assert.deepEqual(Buffer.from(lone,'utf8'),Buffer.from(replacement,'utf8'));
  assert.notDeepEqual(Buffer.from('module\uD83D\uDE80.js','utf8'),Buffer.from(replacement,'utf8'));
});

test('POSIX filesystem treats lone-surrogate spelling as replacement-character path',{
  skip:process.platform==='win32'
},async()=>{
  const fs=require('node:fs/promises');
  const os=require('node:os');
  const path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-utf8-alias-'));
  try{
    const first=path.join(root,'module\uFFFD.js');
    const second=path.join(root,'module\uD800.js');
    await fs.writeFile(first,'first',{flag:'wx'});
    await assert.rejects(fs.writeFile(second,'second',{flag:'wx'}),
      error=>/** @type {NodeJS.ErrnoException} */(error).code==='EEXIST');
    assert.equal(await fs.readFile(second,'utf8'),'first');
    assert.deepEqual(await fs.readdir(root),['module\uFFFD.js']);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('path preflight rejects lossy surrogate filenames in COO, SNO and SCO',()=>{
  for(const candidate of badPaths){
    assert.throws(()=>safePath(candidate),/non-well-formed Unicode/,candidate);
    for(const mode of obfuscationModes){
      assert.throws(()=>obfuscateFiles([{
        path:candidate,code:'module.exports=1;',sourceType:'commonjs'
      }],{mode,seed:'utf8-alias-preflight'}),/non-well-formed Unicode/,
      mode+' '+candidate);
    }
    assert.throws(()=>createScoHandler([{
      path:candidate,code:'globalThis.ready=true;',sourceType:'script'
    }]),/non-well-formed Unicode/,'SCO handler '+candidate);
    assert.throws(()=>createSnoLauncher([{
      path:candidate,code:'module.exports=1;'
    }],candidate),/non-well-formed Unicode/,'SNO launcher '+candidate);
  }
});

test('well-formed astral characters and literal U+FFFD remain distinct valid paths',()=>{
  for(const candidate of ['folder/rocket\uD83D\uDE80.js','folder/replacement\uFFFD.js']){
    assert.equal(safePath(candidate),candidate);
    for(const mode of obfuscationModes){
      const result=obfuscateFiles([{
        path:candidate,code:'module.exports=7;',sourceType:'commonjs'
      }],{mode,seed:'utf8-alias-positive'});
      assert.equal(result.files[0].path,candidate);
    }
    assert.doesNotThrow(()=>createScoHandler([{
      path:candidate,code:'globalThis.ready=true;',sourceType:'script'
    }]));
    assert.match(createSnoLauncher([{
      path:candidate,code:'module.exports=7;'
    }],candidate),/Integrity check failed/);
  }
});
