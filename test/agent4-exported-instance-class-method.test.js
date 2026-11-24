'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Import a module from an isolated directory and inspect its exported
 * instance's method source from a separate consumer module.
 * @param {string} source
 * @returns {Promise<{methodSource:string,value:number}>}
 */
async function inspectExportedInstance(source){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-reader-'));
  try{
    await atomicWrite(path.join(root,'reader.mjs'),source);
    await atomicWrite(path.join(root,'entry.mjs'),[
      'import {reader} from "./reader.mjs";',
      'process.stdout.write(JSON.stringify({methodSource:reader.read.toString(),value:reader.read()}));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{methodSource:string,value:number}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('exported const instance declaration must not classify its class method as private',async()=>{
  const source=[
    'const owner={privateField:7};',
    'class Reader{read(){return owner.privateField;}}',
    // The binding declaration itself is exported; no ExportSpecifier or
    // ordinary Identifier reference is present for the instance-use scan.
    'export const reader=new Reader();'
  ].join('\n');

  const native=await inspectExportedInstance(source);
  const transformed=obfuscateFiles([{
    path:'reader.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'agent4-exported-instance-class-method',
    properties:true,identifiers:false,strings:false
  });
  const output=transformed.files.find(file=>file.path==='reader.mjs');
  assert.ok(output);
  const emitted=await inspectExportedInstance(String(output.code));

  console.log('AGENT4_EXPORTED_INSTANCE_SOURCE_WITNESS '+JSON.stringify({
    properties:output.metrics.properties,
    nativeMethodSource:native.methodSource,
    emittedMethodSource:emitted.methodSource,
    nativeValue:native.value,
    emittedValue:emitted.value,
    sourceEqual:native.methodSource===emitted.methodSource
  }));

  assert.equal(output.metrics.properties,0,
    'an exported instance exposes its prototype method to external source observers');
  assert.equal(emitted.methodSource,native.methodSource,
    'reader.read.toString() from an importing module must retain native source');
  assert.equal(emitted.value,native.value);
});
