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
 * Verify that SNO honors Node's nearest package.json type for every .js file,
 * including dynamically imported ESM dependencies of a CommonJS entry point.
 * @param {'commonjs'|'module'} rootType
 * @returns {Promise<void>}
 */
async function exercise(rootType) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-mixed-sno-'));
  try {
    const input=path.join(directory,'input');
    const output=path.join(directory,'output');
    await atomicWrite(path.join(input,'package.json'),JSON.stringify({type:rootType}));
    await atomicWrite(path.join(input,'entry.cjs'),
      "module.exports=import('./modern/value.js').then(mod=>mod.value+':'+require('./legacy/value.js').value);");
    await atomicWrite(path.join(input,'modern','package.json'),'{"type":"module"}');
    await atomicWrite(path.join(input,'modern','value.js'),
      "export const value='modern-export-value';");
    await atomicWrite(path.join(input,'legacy','package.json'),'{"type":"commonjs"}');
    await atomicWrite(path.join(input,'legacy','value.js'),
      "module.exports={value:'legacy-commonjs-value'};");

    await main('sno',['--root',input,'--entry','entry.cjs','--out',output]);

    // The generated loader alone is required at runtime, with no obfuscator
    // library dependency. Its CommonJS export resolves after dynamic ESM import.
    const runner=[
      "require(process.argv[1]).then(value=>process.stdout.write(value))",
      ".catch(error=>{console.error(error);process.exitCode=1;});"
    ].join('');
    const launched=spawnSync(process.execPath,['--eval',runner,path.join(output,'sno-entry.cjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(launched.status,0,launched.stderr);
    assert.equal(launched.stdout,'modern-export-value:legacy-commonjs-value');
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('SNO CJS entry loads nested module and CommonJS .js dependencies under CJS root',async()=>{
  await exercise('commonjs');
});

test('SNO CJS entry loads nested module and CommonJS .js dependencies under ESM root',async()=>{
  await exercise('module');
});
