'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Call a generated module through a hostile host that intercepts the native
 * Function.prototype.bind intrinsic before the target module is evaluated.
 * No generated source bytes are modified.
 *
 * @param {string} moduleUrl
 * @returns {{value:number,sources:string[]}}
 */
function captureBoundTargets(moduleUrl){
  const script=[
    'const captured=[];',
    'const nativeBind=Function.prototype.bind;',
    'try {',
    '  Function.prototype.bind=function(...args){',
    '    captured.push(this);',
    '    return Reflect.apply(nativeBind,this,args);',
    '  };',
    '  const app=await import(process.argv[1]);',
    '  const value=app.hot(4,6);',
    '  const sources=captured.filter(fn=>typeof fn==="function")',
    '    .map(fn=>Function.prototype.toString.call(fn))',
    '    .filter(source=>source.includes("owner."));',
    '  process.stdout.write(JSON.stringify({value,sources}));',
    '} finally {Function.prototype.bind=nativeBind;}'
  ].join('\n');
  const processResult=spawnSync(process.execPath,['--input-type=module','-e',script,moduleUrl],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(processResult.status,0,processResult.stderr);
  return /** @type {{value:number,sources:string[]}} */(JSON.parse(processResult.stdout));
}

test('hostile bind interception recovers actual private target source despite source-stable bound export',async()=>{
  const source='const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'export const hot=internal.bind(null);';
  const emitted=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'bound-runtime-hostile-interception',
    properties:true,identifiers:true,strings:false
  });
  assert.equal(emitted.files[0].metrics.properties,2,
    'the attacker must recover a genuinely rewritten private record');
  const protectedCode=/** @type {string} */ (emitted.files[0].code);
  assert.doesNotMatch(protectedCode,/secretField|otherField/u);
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bind-interception-'));
  try{
    const nativePath=path.join(folder,'native.mjs');
    const protectedPath=path.join(folder,'protected.mjs');
    await atomicWrite(nativePath,source);
    await atomicWrite(protectedPath,protectedCode);
    const native=captureBoundTargets(pathToFileURL(nativePath).href);
    const protectedResult=captureBoundTargets(pathToFileURL(protectedPath).href);
    assert.equal(native.value,protectedResult.value);
    assert.ok(native.sources.some(s=>s.includes('owner.secretField')),
      'the instrumented host should observe the original target at bind time');
    assert.ok(protectedResult.sources.some(s=>/owner\._p[0-9a-f]{10}/u.test(s)),
      'the instrumented host must extract the actual transformed target source');
    assert.ok(!protectedResult.sources.some(s=>s.includes('secretField')),
      'the extracted protected source is from the rewritten build');
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
});
