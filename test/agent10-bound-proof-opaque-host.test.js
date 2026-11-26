'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const preloader='globalThis.external=function(value){'+
  'globalThis.__capturedSource=Function.prototype.toString.call(value);};';

/**
 * Build a module that installs a source-observing custom bind replacement.
 * The actual external callback is supplied only by the out-of-band preloader.
 * @param {string} install
 * @param {string} restore
 * @returns {string}
 */
function sourceFor(install,restore) {
  return 'const owner={secretField:7};'+
    'const nativeBind=Function.prototype.bind;'+
    install+
    'const internal=()=>owner.secretField;'+
    'const hot=internal.bind(null);'+
    'const result=hot();'+
    restore+
    'process.stdout.write(JSON.stringify(['+
    'globalThis.__capturedSource,result]));';
}

/**
 * Run the module with an out-of-band host callback that can inspect a
 * function's source. The callback implementation is deliberately absent
 * from the source given to the obfuscator.
 * @param {string} sourceText
 * @returns {[string,number]}
 */
function runWithHost(sourceText) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bound-opaque-host-'));
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

const replacements=[
  {
    label:'direct Function.prototype assignment',
    install:'Function.prototype.bind=function(){'+
      'external(this);const target=this;'+
      'return (...args)=>Reflect.apply(target,null,args);};',
    restore:'Function.prototype.bind=nativeBind;'
  },
  {
    label:'aliased Function.prototype assignment',
    install:'const fp=Function.prototype;fp.bind=function(){'+
      'external(this);const target=this;'+
      'return (...args)=>Reflect.apply(target,null,args);};',
    restore:'fp.bind=nativeBind;'
  },
  {
    label:'descriptor-based Function.prototype replacement',
    install:'const fp=Function.prototype;'+
      'Object.defineProperty(fp,"bind",{configurable:true,writable:true,'+
      'value:function(){external(this);const target=this;'+
      'return (...args)=>Reflect.apply(target,null,args);}});',
    restore:'Object.defineProperty(fp,"bind",{configurable:true,writable:true,'+
      'value:nativeBind});'
  }
];

for(const replacement of replacements) {
  test('custom bind exposure to an opaque host via '+replacement.label,()=>{
    const source=sourceFor(replacement.install,replacement.restore);
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
    assert.equal(emitted.files[0].metrics.properties,1,
      'the current prototype admits one private owner-key rewrite');
    const native=runWithHost(source);
    const transformed=runWithHost(/** @type {string} */(emitted.files[0].code));
    assert.equal(native[1],7);
    assert.equal(transformed[1],native[1],
      'ordinary function result remains unchanged');
    assert.equal(native[0],'()=>owner.secretField');
    assert.notEqual(transformed[0],native[0],
      'opaque host observes the transformed target source rather than the original source');
    assert.ok(transformed[0].startsWith('()=>owner.'),
      'host receives the actual transformed target, not a wrapper source');
  });
}
