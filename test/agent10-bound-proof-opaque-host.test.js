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
 * Run the module with an out-of-band host callback that can inspect a
 * function's source. The callback implementation is deliberately absent
 * from the source given to the obfuscator.
 * @param {string} sourceText
 * @param {string} preloadText
 * @returns {string}
 */
function runWithHost(sourceText,preloadText) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bound-opaque-host-'));
  try {
    const entry=path.join(root,'entry.mjs');
    const preload=path.join(root,'preload.cjs');
    fs.writeFileSync(entry,sourceText);
    fs.writeFileSync(preload,preloadText);
    const child=spawnSync(process.execPath,['--require',preload,entry],{
      encoding:'utf8',
      timeout:8000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

test('a custom bind replacement cannot leak the target to an opaque host while it remains classified private',()=>{
  const emitted=obfuscateFiles([{
    path:'entry.mjs',
    sourceType:'module',
    code:source
  }],{
    mode:'coo',
    closedWorld:true,
    seed:'agent10-bound-proof-opaque-host',
    properties:true,
    identifiers:false,
    strings:false
  });
  assert.equal(emitted.files[0].metrics.properties,0,
    'the bound-only proof must refuse a target that custom bind can expose');
  assert.equal(
    runWithHost(/** @type {string} */(emitted.files[0].code),preloader),
    runWithHost(source,preloader),
    'the host-observed source and the function result must remain identical'
  );
});
