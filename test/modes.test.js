'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, withHostGate } = require('../lib/build');
const { createScoServer } = require('../lib/sco-server');

test('COO build preserves paths, emits guard and is idempotent', () => {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-mode-'));
  try {
    const input=path.join(base,'input'), output=path.join(base,'output');
    fs.mkdirSync(path.join(input,'nested'),{recursive:true});
    fs.writeFileSync(path.join(input,'nested','main.mjs'),'const o={secret:1};console.log(o.secret);');
    const args=['--input',input,'--output',output,'--closed-world','--seed','stable','--allowed-host','example.test'];
    const first=build('coo',args);
    const source=fs.readFileSync(path.join(output,'nested','main.mjs'),'utf8');
    assert.equal(first.renamed,1);
    assert.ok(source.includes('globalThis.location?.hostname'));
    const second=build('coo',args);
    assert.deepEqual(first,second);
    assert.equal(source,fs.readFileSync(path.join(output,'nested','main.mjs'),'utf8'));
    assert.equal(fs.existsSync(path.join(output,'.obfs.lock')),false);
  } finally { fs.rmSync(base,{recursive:true,force:true}); }
});

test('SNO machine gate retains shebang', () => {
  const code=withHostGate('#!/usr/bin/env node\nconsole.log(1);','sno','node-1');
  assert.ok(code.startsWith('#!/usr/bin/env node\nif (globalThis.process?.env?.OBFS_MACHINE_ID'));
});

test('SCO requires authentication, issues per-request transformed code', async () => {
  const server=createScoServer({token:'a'.repeat(32)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/obfuscate`;
    const body=JSON.stringify({files:{'index.mjs':'const a={secret:3};console.log(a.secret);'},closedWorld:true});
    const unauthorized=await fetch(url,{method:'POST',body});
    assert.equal(unauthorized.status,401);
    const send=()=>fetch(url,{method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(32)},body}).then(r=>r.json());
    const first=await send();
    const second=await send();
    assert.equal(first.renamed,1);
    assert.notEqual(first.files['index.mjs'],second.files['index.mjs']);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
