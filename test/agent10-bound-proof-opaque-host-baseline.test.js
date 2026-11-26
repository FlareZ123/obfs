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
 * The host callback is injected out of band and is not part of the input.
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
 * Execute with an opaque host callback that records the passed function's
 * native source text.
 * @param {string} sourceText
 * @returns {[string,number]}
 */
function runWithHost(sourceText) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bound-baseline-'));
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
  test('bound target exposed to opaque host is not admitted: '+replacement.label,()=>{
    const source=sourceFor(replacement.install,replacement.restore);
    const emitted=obfuscateFiles([{
      path:'entry.mjs',
      sourceType:'module',
      code:source
    }],{
      mode:'coo',
      closedWorld:true,
      seed:'agent10-bound-proof-main-baseline',
      properties:true,
      identifiers:false,
      strings:false
    });
    assert.equal(emitted.files[0].metrics.properties,0);
    assert.deepEqual(
      runWithHost(/** @type {string} */(emitted.files[0].code)),
      runWithHost(source)
    );
  });
}

test('directly invoked private arrow remains eligible for local owner-key rewriting',()=>{
  const source='const owner={secretField:7,otherField:11};'+
    'const internal=(a,b)=>((a+owner.secretField)^owner.otherField)+b;'+
    'const result=internal(4,6);'+
    'process.stdout.write(String(result));';
  const emitted=obfuscateFiles([{
    path:'entry.mjs',
    sourceType:'module',
    code:source
  }],{
    mode:'coo',
    closedWorld:true,
    seed:'agent10-bound-proof-main-positive-control',
    properties:true,
    identifiers:false,
    strings:false
  });
  assert.equal(emitted.files[0].metrics.properties,2);
  const run=(code)=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-bound-positive-'));
    try {
      const file=path.join(root,'entry.mjs');
      fs.writeFileSync(file,code);
      const child=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:8000});
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    } finally {
      fs.rmSync(root,{recursive:true,force:true});
    }
  };
  assert.equal(run(/** @type {string} */(emitted.files[0].code)),run(source));
});
