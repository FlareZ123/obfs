'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {main} = require('../src/cli');
const {createSnoLauncher} = require('../src/sno');
const {atomicWrite} = require('../src/atomic');

test('SNO direct API rejects its reserved output path in the protected manifest',()=>{
  for (const reserved of ['sno-entry.cjs','SNO-ENTRY.CJS','sno-entry.cjſ','SNO-ENTRY.CJſ']) {
    assert.throws(()=>createSnoLauncher([
      {path:'entry.cjs',code:'module.exports=1;'},
      {path:reserved,code:'module.exports=2;'}
    ],'entry.cjs'),/SNO launcher (?:path is reserved|filename collides)/);
  }
});

test('SNO CLI refuses launcher collisions before producing an output directory',async()=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-launcher-collision-'));
  try {
    const input=path.join(parent,'input');
    const output=path.join(parent,'output');
    await atomicWrite(path.join(input,'entry.cjs'),'module.exports=42;');
    await atomicWrite(path.join(input,'sno-entry.cjs'),'module.exports=13;');
    await assert.rejects(
      main('sno',['--root',input,'--entry','entry.cjs','--out',output]),
      /SNO launcher (?:path is reserved|filename collides)/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
    // This spelling remains distinct under lowercase conversion but shares
    // the reserved launcher's uppercase portable identity.
    await fs.rm(path.join(input,'sno-entry.cjs'));
    await atomicWrite(path.join(input,'sno-entry.cjſ'),Buffer.from('plain asset'));
    await assert.rejects(
      main('sno',['--root',input,'--entry','entry.cjs','--out',output]),
      /SNO launcher (?:path is reserved|filename collides)/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  } finally {
    await fs.rm(parent,{recursive:true,force:true});
  }
});


test('a non-equivalent Unicode source filename does not shadow the SNO launcher',()=>{
  const launcher=createSnoLauncher([
    {path:'entry.cjs',code:'module.exports=19;'},
    {path:'sno-entry.cjτ',code:Buffer.from('plain asset')}
  ],'entry.cjs');
  assert.match(launcher,/Integrity check failed/);
});
