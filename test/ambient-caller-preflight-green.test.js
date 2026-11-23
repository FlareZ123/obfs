'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/**
 * This is an uncompiled Node preload, not a second obfuscator input.
 * The normal application invokes its ambient function while a non-strict
 * CommonJS caller is on the stack. The host can inspect its caller source
 * without the caller function escaping by value or identifier.
 */
const ambientPreload=[
  'function inspectCaller(){',
  '  return Function.prototype.toString.call(inspectCaller.caller);',
  '}',
  'globalThis.inspectCaller=inspectCaller;'
].join('\n');

const entry=[
  'function compute(){',
  '  const privateRecord={secretField:17,bonusField:5};',
  '  const conspicuousLongString="a-source-visible-long-string-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";',
  '  const computedTotal=privateRecord.secretField+privateRecord.bonusField;',
  '  return [computedTotal,conspicuousLongString,globalThis.inspectCaller()];',
  '}',
  'process.stdout.write(JSON.stringify(compute()));'
].join('\n');

/**
 * @param {string} directory
 * @param {string} code
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function run(directory,code){
  await fs.mkdir(directory,{recursive:true});
  const host=path.join(directory,'host.cjs');
  const entryPath=path.join(directory,'entry.cjs');
  await fs.writeFile(host,ambientPreload,'utf8');
  await fs.writeFile(entryPath,code,'utf8');
  const child=spawnSync(process.execPath,['--require',host,entryPath],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * @param {string} label
 * @param {import('../src/core').ObfuscationOptions} overrides
 * @param {'bindings'|'literals'|'properties'} metric
 * @param {boolean} expectedEmit
 */
function check(label,overrides,metric,expectedEmit){
  test('ambient global caller-source parity / '+label,async()=>{
    const result=obfuscateFiles([
      {path:'entry.cjs',sourceType:'commonjs',code:entry}
    ],{
      mode:'sno',seed:'ambient-global-caller-source/'+label,
      ...overrides
    });
    assert.equal(result.files.length,1);
    const emitted=result.files[0];
    const yieldValue=emitted.metrics[metric];
    assert.equal(yieldValue>0,expectedEmit,'Unexpected source-transform yield for '+label);
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ambient-caller-'));
    try{
      const native=await run(path.join(root,'native'),entry);
      const protectedRun=await run(path.join(root,'emitted'),String(emitted.code));
      assert.equal(native.status,0,native.stderr);
      assert.equal(protectedRun.status,0,protectedRun.stderr);
      assert.deepEqual(protectedRun,native,
        'Foreign global caller-source observer must see native function source');
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}

// The property-only pilot knows the selected owner executes an unproved host
// callback and declines its keys; the independent other passes do not.
check('property-only guarded',{strings:false,identifiers:false,properties:true},
  'properties',false);
check('identifier-only',{strings:false,identifiers:true,properties:false},
  'bindings',false);
check('string-only',{strings:true,identifiers:false,properties:false,
  minimumStringLength:20},'literals',false);
test('ambient global caller-source parity / combined default pipeline',async()=>{
  const result=obfuscateFiles([
    {path:'entry.cjs',sourceType:'commonjs',code:entry}
  ],{mode:'sno',seed:'ambient-global-caller-source/combined'});
  const emitted=result.files[0];
  assert.equal(emitted.metrics.bindings+emitted.metrics.literals+
    emitted.metrics.properties,0,'Uncompiled ambient callback must guard all source-changing passes');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ambient-caller-default-'));
  try{
    const native=await run(path.join(root,'native'),entry);
    const protectedRun=await run(path.join(root,'emitted'),String(emitted.code));
    assert.equal(native.status,0,native.stderr);
    assert.equal(protectedRun.status,0,protectedRun.stderr);
    assert.deepEqual(protectedRun,native);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
