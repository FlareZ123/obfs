'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const source=[
  'const owner={hiddenCount:11,privateDelta:5};',
  'const tuple=[false,"metadata",owner,null];',
  'const alias=tuple[2];',
  'function score(n){',
  '  let sum=0;',
  '  for(let i=0;i<n;i++)sum=(sum+((alias.hiddenCount+i)&255)+owner.privateDelta)|0;',
  '  return sum;',
  '}',
  'module.exports=score(operations);',
  'process.stdout.write(JSON.stringify([globalThis.__capturedSource,module.exports]));'
].join('\n');

const preloader=[
  'globalThis.__capturedSource=null;',
  'globalThis.operations={valueOf:function(){',
  'const caller=arguments.callee.caller;',
  'globalThis.__capturedSource=caller?Function.prototype.toString.call(caller):"no-caller";',
  'return 1;}};'
].join('');

/**
 * @param {string} code
 * @returns {[string,number]}
 */
function runWithHost(code) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent10-callsite-coercion-'));
  try {
    const entry=path.join(root,'entry.cjs');
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

/**
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>['files'][number]}
 */
function compile(mode) {
  return obfuscateFiles([{
    path:'private-tuple.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode,
    seed:'agent10-callsite-coercion-'+mode,
    strings:false,
    identifiers:false,
    properties:true
  }).files[0];
}

for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
  test('host coercion callback observes direct-call-only function source in '+mode.toUpperCase(),()=>{
    const emitted=compile(mode);
    const native=runWithHost(source);
    const transformed=runWithHost(/** @type {string} */(emitted.code));
    assert.match(native[0],/owner\.hiddenCount/);
    assert.match(native[0],/owner\.privateDelta/);
    assert.equal(native[1],16);
    assert.equal(transformed[1],native[1]);
    assert.equal(emitted.metrics.properties,2);
    assert.notEqual(transformed[0],native[0]);
  });
}
