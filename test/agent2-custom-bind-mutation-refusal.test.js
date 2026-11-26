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
 * Run the module with a host-provided observer that is deliberately outside
 * the supplied source graph.
 * @param {string} moduleUrl
 * @returns {{value:number,sources:string[]}}
 */
function captureCustomBindTarget(moduleUrl){
  const script=[
    'const captured=[];',
    'globalThis.external=fn=>captured.push(Function.prototype.toString.call(fn));',
    'const app=await import(process.argv[1]);',
    'const value=app.hot(4,6);',
    'process.stdout.write(JSON.stringify({value,sources:captured}));'
  ].join('\n');
  const result=spawnSync(process.execPath,['--input-type=module','-e',script,moduleUrl],{
    encoding:'utf8',timeout:15000
  });
  assert.equal(result.status,0,result.stderr);
  return /** @type {{value:number,sources:string[]}} */(JSON.parse(result.stdout));
}

test('custom Function.prototype.bind that exposes its target blocks private owner renaming',async()=>{
  const source='const owner={secretField:7};'+
    'const internal=(a,b)=>owner.secretField+a+b;'+
    'Function.prototype.bind=function(thisArg,...boundArgs){'+
    'globalThis.external(this);const target=this;'+
    'return function(...args){return Reflect.apply(target,thisArg,[...boundArgs,...args]);};'+
    '};export const hot=internal.bind(null);';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'agent2-custom-bind-mutation-refusal',
    properties:true,identifiers:false,strings:false
  });
  assert.equal(output.files[0].metrics.properties,0,
    JSON.stringify(output.files[0].code));
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-custom-bind-refusal-'));
  try{
    const nativePath=path.join(folder,'native.mjs');
    const protectedPath=path.join(folder,'protected.mjs');
    await atomicWrite(nativePath,source);
    await atomicWrite(protectedPath,output.files[0].code);
    const native=captureCustomBindTarget(pathToFileURL(nativePath).href);
    const protectedResult=captureCustomBindTarget(pathToFileURL(protectedPath).href);
    assert.equal(native.value,protectedResult.value);
    assert.ok(native.sources.some(s=>s.includes('owner.secretField')));
    assert.ok(protectedResult.sources.some(s=>s.includes('owner.secretField')));
    assert.ok(!protectedResult.sources.some(s=>/_p[0-9a-f]{10}/u.test(s)));
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
});
