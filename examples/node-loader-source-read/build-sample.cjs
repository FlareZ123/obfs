'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obfuscateFiles}=require('../../src/core');

/** @typedef {{code:string,properties:number,bindings:number,literals:number}} Emitted */
/**
 * Compile a single CommonJS source under the pinned SNO sample settings.
 * @param {string} name
 * @param {string} source
 * @returns {Emitted}
 */
function compile(name,source) {
  const output=obfuscateFiles([{path:name,sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'node-loader-source-read-pinned-v1',
    identifiers:true,properties:true,strings:true
  }).files[0];
  assert.equal(typeof output.code,'string');
  return {
    code:/** @type {string} */ (output.code),
    properties:output.metrics.properties,
    bindings:output.metrics.bindings,
    literals:output.metrics.literals
  };
}

async function main() {
  const dir=__dirname;
  const unsafeOriginal=await fs.readFile(path.join(dir,'unsafe-original.cjs'),'utf8');
  const safeOriginal=await fs.readFile(path.join(dir,'safe-original.cjs'),'utf8');
  const unsafe=compile('unsafe.cjs',unsafeOriginal);
  const safe=compile('safe.cjs',safeOriginal);
  assert.equal(unsafe.code,unsafeOriginal,
    'A source-reading loader cannot have its original bytes changed');
  assert.notEqual(safe.code,safeOriginal,'Unobserved source should be transformable');
  assert.ok(safe.properties>0||safe.bindings>0,
    'Sample must show actual obfuscation for the unobserved application');
  if(process.argv.includes('--emit-base64')) {
    console.log('UNSAFE_BASE64='+Buffer.from(unsafe.code).toString('base64'));
    console.log('SAFE_BASE64='+Buffer.from(safe.code).toString('base64'));
    console.log('SAFE_METRICS='+JSON.stringify({
      properties:safe.properties,bindings:safe.bindings,literals:safe.literals
    }));
    return;
  }
  assert.equal(await fs.readFile(path.join(dir,'unsafe-after.cjs'),'utf8'),unsafe.code);
  assert.equal(await fs.readFile(path.join(dir,'safe-after.cjs'),'utf8'),safe.code);
  console.log('Pinned Node loader before/after files match compiler output');
}
main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
