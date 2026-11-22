'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

const target=[
  '/* TARGET-PRIVACY-WITNESS */',
  'const owner={secretField:17};',
  'const unrelated={otherField:3};',
  'const extra=unrelated.otherField;',
  'const yes=Array.isArray([1,2]);',
  'module.exports=owner.secretField+extra+(yes?1:0);'
].join('\n');

const launcher=[
  'const nativeIsArray=Array.isArray;',
  'Array.isArray=function observedIsArray(value){',
  '  const caller=arguments.callee.caller;',
  '  if(caller){',
  '    const body=Function.prototype.toString.call(caller);',
  '    if(body.includes("TARGET-PRIVACY-WITNESS"))globalThis.observedSource=body;',
  '  }',
  '  return nativeIsArray(value);',
  '};',
  'const value=require("./target.cjs");',
  'process.stdout.write(JSON.stringify({value,source:globalThis.observedSource??""}));'
].join('\n');

/**
 * Run in the authentic Node.js CommonJS loader. Its module wrapper is a
 * non-strict function and its source includes the complete target file.
 * @param {string} code
 * @returns {Promise<{value:number,source:string}>}
 */
async function execute(code) {
  const directory=await mkdtemp(path.join(tmpdir(),'obfs-host-wrapper-review-'));
  try {
    await Promise.all([
      atomicWrite(path.join(directory,'launcher.cjs'),launcher),
      atomicWrite(path.join(directory,'target.cjs'),code)
    ]);
    const child=spawnSync(process.execPath,[path.join(directory,'launcher.cjs')],{
      cwd:directory,encoding:'utf8',timeout:12000
    });
    assert.ifError(child.error);
    assert.equal(child.status,0,child.stderr);
    return /** @type {{value:number,source:string}} */ (JSON.parse(child.stdout));
  } finally {
    await rm(directory,{force:true,recursive:true});
  }
}

test('authentic CommonJS wrapper source leaks through preloaded native call',async()=>{
  const native=await execute(target);
  assert.equal(native.value,21);
  assert.match(native.source,/TARGET-PRIVACY-WITNESS/u);
  assert.match(native.source,/function\s*\(exports, require, module/u);
  assert.match(native.source,/secretField/u);
});

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test(mode+' preserves exact live CommonJS module wrapper source',async()=>{
    const native=await execute(target);
    const output=obfuscateFiles([{path:'target.cjs',sourceType:'commonjs',code:target}],{
      mode,seed:'host-wrapper-source-'+mode,closedWorld:true,
      properties:true,identifiers:false,strings:false
    }).files[0];
    const emitted=await execute(String(output.code));
    assert.equal(emitted.value,native.value);
    console.log('HOST_WRAPPER_SOURCE '+JSON.stringify({
      mode,properties:output.metrics.properties,
      original:native.source,emitted:emitted.source
    }));
    assert.equal(emitted.source,native.source,
      'A real Node module loader exposes its entire wrapper as a sloppy caller');
  });
}
