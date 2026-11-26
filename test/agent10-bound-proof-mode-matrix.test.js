'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const source='const owner={secretField:7};'+
  'const nativeBind=Function.prototype.bind;'+
  'Function.prototype.bind=function(){'+
  'external(this);const target=this;'+
  'return (...args)=>Reflect.apply(target,null,args);};'+
  'const internal=()=>owner.secretField;'+
  'const hot=internal.bind(null);'+
  'const result=hot();'+
  'Function.prototype.bind=nativeBind;'+
  'process.stdout.write(JSON.stringify(['+
  'globalThis.__capturedSource,result]));';

const preloader='globalThis.external=function(value){'+
  'globalThis.__capturedSource=Function.prototype.toString.call(value);};';

/**
 * Execute a generated module with the same out-of-band host observer.
 * @param {string} sourceText
 * @returns {[string,number]}
 */
function runWithHost(sourceText) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bound-mode-matrix-'));
  try {
    const entry=path.join(root,'entry.mjs');
    const preload=path.join(root,'preload.cjs');
    fs.writeFileSync(entry,sourceText);
    fs.writeFileSync(preload,preloader);
    const child=spawnSync(process.execPath,['--require',preload,entry],{
      encoding:'utf8',
      timeout:8000
    });
    assert.equal(child.status,0,child.stderr);
    return /** @type {[string,number]} */(JSON.parse(child.stdout));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

for(const mode of ['coo','sno','sco']) {
  test('opaque-host bound receiver source mismatch is admitted in '+mode.toUpperCase(),()=>{
    const emitted=obfuscateFiles([{
      path:'entry.mjs',
      sourceType:'module',
      code:source
    }],{
      mode,
      closedWorld:true,
      seed:'agent10-bound-mode-'+mode,
      properties:true,
      identifiers:false,
      strings:false
    });
    assert.equal(emitted.files[0].metrics.properties,1);
    const native=runWithHost(source);
    const transformed=runWithHost(/** @type {string} */(emitted.files[0].code));
    assert.equal(native[1],7);
    assert.equal(transformed[1],native[1]);
    assert.notEqual(transformed[0],native[0]);
  });
}
