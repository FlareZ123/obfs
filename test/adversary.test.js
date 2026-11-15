'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles,createSnoLauncher} = require('../src');
const {atomicWrite} = require('../src/atomic');

test('attacker-controlled browser context bypasses hostname check',()=>{
  const script='globalThis.protectedOperation="secret-token-not-for-host";';
  const generated=obfuscateFiles([{path:'browser.js',code:script,sourceType:'script'}],{
    mode:'coo',allowedHosts:['authorized.example'],seed:'threat-browser'
  }).files[0].code;
  const actualUnauthorized={location:{hostname:'untrusted.example'}};
  assert.throws(()=>vm.runInNewContext(generated,actualUnauthorized),/Unauthorized execution host/);
  // The stated adversary can impersonate the browser's global object.
  const forged={location:{hostname:'authorized.example'}};
  vm.runInNewContext(generated,forged);
  assert.equal(forged.protectedOperation,'secret-token-not-for-host');
});

test('obfuscated strings can be extracted through a debugger-visible decoder array',()=>{
  const original='hidden-secret-from-uninvoked-function';
  const source=`const secret=${JSON.stringify(original)};module.exports=()=>secret;`;
  const generated=obfuscateFiles([{path:'entry.cjs',code:source}],{
    mode:'sno',strings:true,properties:false,identifiers:false,seed:'decoder-observation'
  }).files[0].code;
  const helper=/const (_o[0-9a-f]{12})=\[/u.exec(generated);
  assert.ok(helper,'Expected XOR decoder table');
  const sandbox={module:{exports:null}};
  vm.runInNewContext(`${generated}\nglobalThis.__observed=${helper[1]};`,sandbox);
  assert.ok(Array.from(sandbox.__observed).includes(original));
});

test('a filesystem-owner attacker bypasses SNO self-check by replacing the launcher',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-threat-sno-'));
  try {
    const outputs=obfuscateFiles([{path:'entry.cjs',code:'module.exports=8;'}],{
      mode:'sno',seed:'threat-sno',properties:false,strings:false
    }).files;
    await atomicWrite(path.join(dir,'entry.cjs'),outputs[0].code);
    const launcher=createSnoLauncher(outputs,'entry.cjs');
    const runner=path.join(dir,'sno-entry.cjs');
    await atomicWrite(runner,launcher);
    const run=()=>spawnSync(process.execPath,['-e',`console.log(require(${JSON.stringify(runner)}))`],{encoding:'utf8'});
    assert.equal(run().stdout.trim(),'8');
    await atomicWrite(path.join(dir,'entry.cjs'),'module.exports=99;');
    assert.notEqual(run().status,0,'Untampered launcher detects file change');
    // Threat model expressly permits rewriting the launcher itself.
    await atomicWrite(runner,"'use strict';module.exports=require('./entry.cjs');");
    const bypass=run();
    assert.equal(bypass.status,0,bypass.stderr);
    assert.equal(bypass.stdout.trim(),'99');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
