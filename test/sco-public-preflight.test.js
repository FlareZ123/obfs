'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

/**
 * Validate a CLI refusal in an isolated process. Unexpectedly successful
 * servers are killed by the child-process timeout instead of leaking a socket
 * or hanging the suite.
 * @param {string} root
 * @param {string[]} args
 * @param {RegExp} message
 */
function rejectsSco(root,args,message) {
  const child=spawnSync(process.execPath,[
    path.join(__dirname,'../bin/sco.js'),'--root',root,
    '--entry','entry.mjs','--port','62421',...args
  ],{encoding:'utf8',timeout:5000});
  assert.notEqual(child.status,0,'SCO unexpectedly accepted an unsafe publication');
  assert.match(child.stderr,message);
}

test('SCO CLI refuses unsafe explicit publications and noncanonical imports',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-preflight-'));
  try {
    await atomicWrite(path.join(root,'entry.mjs'),
      'globalThis.ready=true;');
    await atomicWrite(path.join(root,'private.mjs'),
      'export const secret="SERVER_ONLY_SECRET";');
    await atomicWrite(path.join(root,'config.json'),
      '{"secret":"SERVER_ONLY_SECRET"}');
    rejectsSco(root,['--client','../private.mjs'],/SCO public file must not be hidden/);
    rejectsSco(root,['--client','.hidden.mjs'],/SCO public file must not be hidden/);
    rejectsSco(root,['--client','missing.mjs'],/SCO client JavaScript not found/);
    rejectsSco(root,['--client','config.json'],/SCO client JavaScript not found/);
    rejectsSco(root,['--asset','private.mjs'],/SCO public asset not found/);
    rejectsSco(root,['--asset','missing.json'],/SCO public asset not found/);

    await atomicWrite(path.join(root,'entry.mjs'),
      'import "./a%2Fb.mjs";');
    rejectsSco(root,[],/SCO encoded import path unsupported/);

    await atomicWrite(path.join(root,'entry.mjs'),
      'import "./outside.mjs";');
    rejectsSco(root,[],/SCO dependency missing from root/);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
