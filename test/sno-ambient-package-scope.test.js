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
 * Create a clean temporary fixture and always remove it.
 * @param {(directory:string)=>Promise<void>} run
 * @returns {Promise<void>}
 */
async function withFixture(run) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-ambient-package-'));
  try { await run(directory); }
  finally { await fs.rm(directory,{recursive:true,force:true}); }
}

/**
 * Execute the exported SNO or native CommonJS module in a fresh Node process.
 * @param {string} entry
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function runCommonJs(entry) {
  return spawnSync(process.execPath,[
    '--eval','process.stdout.write(String(require(process.argv[1])))',entry
  ],{encoding:'utf8',timeout:15000});
}

test('SNO refuses an ambient ESM parent for unscoped CommonJS .js before publication',async()=>{
  await withFixture(async directory=>{
    const input=path.join(directory,'source');
    const host=path.join(directory,'host');
    const output=path.join(host,'distribution');
    const entry=path.join(input,'entry.js');
    await atomicWrite(entry,'module.exports=23;');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');

    const native=runCommonJs(entry);
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'23');

    await assert.rejects(
      main('sno',['--root',input,'--entry','entry.js','--out',output]),
      /SNO output \.js inherits external ESM package scope/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  });
});

test('SNO preserves explicit CommonJS scope beneath an ambient ESM parent',async()=>{
  await withFixture(async directory=>{
    const input=path.join(directory,'source');
    const host=path.join(directory,'host');
    const output=path.join(host,'distribution');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await atomicWrite(path.join(input,'package.json'),'{"type":"commonjs"}');
    await atomicWrite(path.join(input,'entry.js'),'module.exports=29;');

    await main('sno',['--root',input,'--entry','entry.js','--out',output]);
    const result=runCommonJs(path.join(output,'sno-entry.cjs'));
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'29');
  });
});

test('SNO accepts nested explicitly scoped .js without root package metadata',async()=>{
  await withFixture(async directory=>{
    const input=path.join(directory,'source');
    const host=path.join(directory,'host');
    const output=path.join(host,'distribution');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await atomicWrite(path.join(input,'nested','package.json'),'{"type":"commonjs"}');
    await atomicWrite(path.join(input,'nested','entry.js'),'module.exports=31;');

    await main('sno',['--root',input,'--entry','nested/entry.js','--out',output]);
    const result=runCommonJs(path.join(output,'sno-entry.cjs'));
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'31');
  });
});

test('SNO .cjs-only output does not depend on an ancestor package type',async()=>{
  await withFixture(async directory=>{
    const input=path.join(directory,'source');
    const host=path.join(directory,'host');
    const output=path.join(host,'distribution');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await atomicWrite(path.join(input,'entry.cjs'),'module.exports=37;');

    await main('sno',['--root',input,'--entry','entry.cjs','--out',output]);
    const result=runCommonJs(path.join(output,'sno-entry.cjs'));
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'37');
  });
});

test('SNO does not inherit an ambient ESM scope across node_modules',async()=>{
  await withFixture(async directory=>{
    const input=path.join(directory,'source');
    const host=path.join(directory,'host');
    const output=path.join(host,'node_modules','package');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');
    await atomicWrite(path.join(input,'entry.js'),'module.exports=41;');

    await main('sno',['--root',input,'--entry','entry.js','--out',output]);
    const result=runCommonJs(path.join(output,'sno-entry.cjs'));
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'41');
  });
});

test('SNO rejects ambient ESM for a CommonJS .js dependency of a .cjs entry',async()=>{
  await withFixture(async directory=>{
    const input=path.join(directory,'source');
    const host=path.join(directory,'host');
    const output=path.join(host,'distribution');
    await atomicWrite(path.join(input,'entry.cjs'),"module.exports=require('./helper.js')*2;");
    await atomicWrite(path.join(input,'helper.js'),'module.exports=12;');
    await atomicWrite(path.join(host,'package.json'),'{"type":"module"}');

    const native=runCommonJs(path.join(input,'entry.cjs'));
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'24');

    await assert.rejects(
      main('sno',['--root',input,'--entry','entry.cjs','--out',output]),
      /SNO output \.js inherits external ESM package scope/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  });
});

test('SNO resolves output symlink target before checking ancestor package scope',async t=>{
  await withFixture(async directory=>{
    const input=path.join(directory,'source');
    const external=path.join(directory,'esm-parent');
    const actual=path.join(directory,'neutral','actual');
    const alias=path.join(external,'alias');
    await atomicWrite(path.join(external,'package.json'),'{"type":"module"}');
    await fs.mkdir(actual,{recursive:true});
    try { await fs.symlink(actual,alias,process.platform==='win32'?'junction':'dir'); }
    catch(error) {
      const code=/** @type {NodeJS.ErrnoException} */(error).code;
      if(process.platform==='win32'&&['EPERM','EACCES'].includes(code||'')) {
        t.skip('Windows junction creation unavailable');
        return;
      }
      throw error;
    }
    await atomicWrite(path.join(input,'entry.js'),'module.exports=43;');

    const output=path.join(alias,'distribution');
    await main('sno',['--root',input,'--entry','entry.js','--out',output]);
    const result=runCommonJs(path.join(output,'sno-entry.cjs'));
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'43');
  });
});
