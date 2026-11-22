'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/**
 * @param {string} entry
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function execute(entry) {
  return spawnSync(process.execPath,['-e',
    'process.stdout.write(JSON.stringify(require(process.argv[1])))',entry],
    {encoding:'utf8',timeout:15000});
}

test('default runtime-scope guard changes observable native Module._pathCache state',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-pathcache-'));
  try{
    const source=path.join(tmp,'source');
    const out=path.join(tmp,'out');
    const entry=path.join(source,'entry.cjs');
    await atomicWrite(entry,
      "const Module=require('node:module');"+
      "module.exports=Object.keys(Module._pathCache).some(key=>key.includes('helper.js'));");
    await atomicWrite(path.join(source,'helper.js'),'module.exports=99;');

    const native=execute(entry);
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'false',
      'No native code resolved the unused helper before entry evaluation');

    await main('sno',['--root',source,'--entry','entry.cjs',
      '--out',out,'--seed','runtime-scope-pathcache-observation']);
    const emitted=execute(path.join(out,'sno-entry.cjs'));
    assert.equal(emitted.status,0,emitted.stderr);
    assert.equal(emitted.stdout,'true',
      'A guard resolving every .js file mutates visible Node internal loader state');

    assert.notEqual(emitted.stdout,native.stdout,
      'Counterexample: this candidate must not ship as a default 1:1 transform');
  }finally{
    await fs.rm(tmp,{recursive:true,force:true});
  }
});
