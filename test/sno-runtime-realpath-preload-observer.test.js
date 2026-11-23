'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {string} preload
 * @param {string} launcher
 * @returns {number}
 */
function run(preload,launcher) {
  const code='process.stdout.write(String(require(process.argv[1])))';
  const child=spawnSync(process.execPath,[
    '--require',preload,'--eval',code,launcher
  ],{encoding:'utf8',timeout:15000});
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return Number(child.stdout);
}

test('Node --require preloads can observe extra fs.realpathSync guard calls',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-realpath-preload-'));
  try {
    const entry=path.join(dir,'entry.cjs');
    const preload=path.join(dir,'preload.cjs');
    const baseline=path.join(dir,'baseline.cjs');
    const candidate=path.join(dir,'candidate.cjs');
    await atomicWrite(entry,'module.exports=globalThis.__realpathEvents;');
    await atomicWrite(preload,
      "const fs=require('node:fs');"+
      "const original=fs.realpathSync;"+
      "globalThis.__realpathEvents=0;"+
      "fs.realpathSync=function(){globalThis.__realpathEvents++;"+
        "return original.apply(this,arguments);};");
    await atomicWrite(baseline,
      "module.exports=require('./entry.cjs');");
    await atomicWrite(candidate,
      "const fs=require('node:fs');"+
      "const path=require('node:path');"+
      "fs.realpathSync(path.join(__dirname,'entry.cjs'));"+
      "module.exports=require('./entry.cjs');");
    const native=run(preload,baseline);
    const guarded=run(preload,candidate);
    assert.ok(Number.isInteger(native)&&native>=0);
    assert.equal(guarded,native+1,
      'An accepted preload hook observes the extra filesystem call');
  }finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
