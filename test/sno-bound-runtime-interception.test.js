'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Load one SNO CommonJS entry in a fresh hostile Node runtime and intercept
 * its bound private function at module evaluation, without rewriting output.
 * @param {string} file
 * @returns {{value:number,boundSource:string,targets:string[]}}
 */
function captureTarget(file){
  const script=[
    'const targets=[];',
    'const nativeBind=Function.prototype.bind;',
    'try{',
    '  Function.prototype.bind=function(...args){',
    '    targets.push(this);return Reflect.apply(nativeBind,this,args);',
    '  };',
    '  const app=require(process.argv[1]);',
    '  const value=app.hot(4,6);',
    '  const boundSource=app.hot.toString();',
    '  const sources=targets.filter(fn=>typeof fn==="function")',
    '    .map(fn=>Function.prototype.toString.call(fn))',
    '    .filter(body=>body.includes("owner."));',
    '  process.stdout.write(JSON.stringify({value,boundSource,targets:sources}));',
    '}finally{Function.prototype.bind=nativeBind;}'
  ].join('\n');
  const child=spawnSync(process.execPath,['-e',script,file],{encoding:'utf8',timeout:15000});
  assert.equal(child.status,0,child.stderr);
  return /** @type {{value:number,boundSource:string,targets:string[]}} */(
    JSON.parse(child.stdout)
  );
}

test('SNO cannot conceal a nonconstructible bound private target from host before requiring entry',async()=>{
  const source="'use strict';"+
    'const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'module.exports.hot=internal.bind(null);';
  const obfuscated=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'sno-bound-host-instrumentation',closedWorld:true,
    strings:false,identifiers:true,properties:true
  });
  const file=obfuscated.files[0];
  assert.equal(file.metrics.properties,2,'the SNO private record must actually change');
  const protectedCode=/** @type {string} */ (file.code);
  assert.doesNotMatch(protectedCode,/secretField|otherField/u);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-host-bind-'));
  try{
    const originalPath=path.join(root,'native.cjs');
    const protectedPath=path.join(root,'protected.cjs');
    await atomicWrite(originalPath,source);
    await atomicWrite(protectedPath,protectedCode);
    const original=captureTarget(originalPath);
    const protectedResult=captureTarget(protectedPath);
    assert.equal(protectedResult.value,original.value);
    assert.equal(protectedResult.boundSource,original.boundSource);
    assert.ok(original.targets.some(code=>code.includes('owner.secretField')));
    assert.ok(protectedResult.targets.some(code=>/owner\._p[0-9a-f]{10}/u.test(code)));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
