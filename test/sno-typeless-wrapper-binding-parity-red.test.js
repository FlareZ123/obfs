'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/** @param {(root:string)=>Promise<void>} action @returns {Promise<void>} */
async function fixture(action) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-wrapper-type-'));
  try { await action(root); }
  finally { await fs.rm(root,{recursive:true,force:true}); }
}

/**
 * @param {string} runner
 * @param {string} entry
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function run(runner,entry) {
  return spawnSync(process.execPath,[runner,entry],
    {encoding:'utf8',timeout:15000});
}

for(const packaged of [false,true]){
  test((packaged?'explicit ESM package control':'RED candidate: typeless wrapper redeclaration')+
    ' preserves SNO module namespace behavior',async()=>{
    await fixture(async root=>{
      const source=path.join(root,'source');
      const output=path.join(root,'output');
      const runner=path.join(root,'runner.cjs');
      const entry=path.join(source,'entry.cjs');
      await atomicWrite(runner,
        "require(process.argv[2]).then(value=>process.stdout.write(JSON.stringify(value))).catch(e=>{console.error(e);process.exitCode=1;});");
      if(packaged)await atomicWrite(path.join(source,'package.json'),'{"type":"module"}');
      await atomicWrite(entry,
        "module.exports=import('./feature.js').then(ns=>({keys:Object.keys(ns).sort(),marker:globalThis.__obfsWrapperMarker}));");
      await atomicWrite(path.join(source,'feature.js'),
        "const require=173;globalThis.__obfsWrapperMarker=require+2;");

      const native=run(runner,entry);
      assert.equal(native.status,0,native.stderr);
      assert.deepEqual(JSON.parse(native.stdout),{keys:[],marker:175});
      await main('sno',['--root',source,'--entry','entry.cjs','--out',output,
        '--seed','wrapper-type-parity']);
      const compiled=run(runner,path.join(output,'sno-entry.cjs'));
      assert.equal(compiled.status,0,compiled.stderr);
      assert.equal(compiled.stdout,native.stdout,
        'Node typeless ESM wrapper redeclaration must not become CommonJS after obfuscation');
    });
  });
}
