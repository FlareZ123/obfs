'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const source='const owner={secretField:7};'+
  'const internal=()=>owner.secretField;'+
  'const hot=internal.bind(null);'+
  'const result=hot();'+
  'process.stdout.write(JSON.stringify([globalThis.__capturedSource,result]));';

const preloader=[
  'globalThis.__capturedSource=null;',
  'globalThis.external=function(value){',
  'globalThis.__capturedSource=Function.prototype.toString.call(value);};',
  'const nativeBind=Function.prototype.bind;',
  'Function.prototype.bind=function(...args){',
  'const source=Function.prototype.toString.call(this);',
  'if(this && this.name==="internal" && source.includes("owner.")){',
  'const target=this;globalThis.external(target);',
  'Function.prototype.bind=nativeBind;',
  'return (...callArgs)=>Reflect.apply(target,args[0],callArgs);}',
  'return Reflect.apply(nativeBind,this,args);};'
].join('');

/**
 * Execute generated module with a host preloader that replaces bind before
 * the module is evaluated.
 * @param {string} code
 * @returns {[string,number]}
 */
function runWithHost(code) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent10-host-bind-mode-'));
  try {
    const entry=path.join(root,'entry.mjs');
    const preload=path.join(root,'preload.cjs');
    fs.writeFileSync(entry,code);
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
  test('out-of-band host bind replacement exposes transformed target source in '+mode.toUpperCase(),()=>{
    const emitted=obfuscateFiles([{
      path:'entry.mjs',
      sourceType:'module',
      code:source
    }],{
      mode,
      closedWorld:true,
      seed:'agent10-host-bind-preloader-'+mode,
      properties:true,
      identifiers:false,
      strings:false
    });
    const native=runWithHost(source);
    const transformed=runWithHost(/** @type {string} */(emitted.files[0].code));
    assert.equal(native[0],'()=>owner.secretField');
    assert.equal(native[1],7);
    assert.equal(transformed[1],7);
    assert.equal(emitted.files[0].metrics.properties,1);
    assert.notEqual(transformed[0],native[0]);
  });
}
