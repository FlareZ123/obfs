'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {main} = require('../src/cli');
const {atomicWrite} = require('../src/atomic');

test('COO and SNO reject output junctions and symlink ancestors into input',async t=>{
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-output-alias-'));
  try {
    const input=path.join(parent,'input');
    const alias=path.join(parent,'redirect');
    const entry=path.join(input,'entry.cjs');
    const source='module.exports="input-must-remain-unchanged";';
    await atomicWrite(entry,source);
    try {
      await fs.symlink(input,alias,process.platform==='win32'?'junction':'dir');
    } catch (error) {
      if (['EPERM','EACCES','ENOTSUP'].includes(/** @type {NodeJS.ErrnoException} */ (error).code||'')) {
        t.skip('Runner cannot create a directory symlink or junction');
        return;
      }
      throw error;
    }
    for (const mode of ['coo','sno']) {
      for (const output of [alias,path.join(alias,'generated')]) {
        await assert.rejects(
          main(/** @type {'coo'|'sno'} */ (mode),['--root',input,'--entry','entry.cjs','--out',output]),
          /Output must be outside the input directory/
        );
      }
    }
    assert.equal(await fs.readFile(entry,'utf8'),source);
    await assert.rejects(fs.stat(path.join(input,'sno-entry.cjs')),{code:'ENOENT'});
    await assert.rejects(fs.stat(path.join(input,'generated')),{code:'ENOENT'});
  } finally {
    await fs.rm(parent,{recursive:true,force:true});
  }
});
