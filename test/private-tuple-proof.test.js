'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} code @param {'coo'|'sno'} mode */
function compile(code,mode) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode,seed:'private-tuple-20261116',properties:true,
    strings:false,identifiers:false
  });
}

/** @param {string} code @returns {(n:number)=>number} */
function load(code) {
  const module=new Module('private-tuple.cjs');
  module.filename='private-tuple.cjs';
  module.paths=Module._nodeModulePaths(process.cwd());
  module._compile(code,module.filename);
  return /** @type {(n:number)=>number} */(module.exports);
}

/** @param {number} index @returns {string} */
function sourceAt(index) {
  const parts=['null','true','"private"','false','0'];
  parts[index]='owner';
  return [
    "const owner={hiddenCount:17,privateDelta:3};",
    'const tuple=['+parts.join(',')+'];',
    'const first=tuple['+index+'];',
    'const next=tuple['+index+'];',
    'module.exports=function run(n){return first.hiddenCount*n+next.privateDelta+owner.hiddenCount;}'
  ].join('\n');
}

test('fixed private owner slot 0, 1, 2, 3 or 4 preserves native behavior in COO and SNO',()=>{
  for(const index of [0,1,2,3,4]) {
    const original=sourceAt(index);
    for(const mode of ['coo','sno']) {
      const compiled=compile(original,mode);
      const changed=String(compiled.files[0].code);
      assert.equal(compiled.files[0].metrics.properties,2,mode+' slot '+index);
      assert.doesNotMatch(changed,/hiddenCount|privateDelta/u);
      const native=load(original);
      const protectedFn=load(changed);
      for(let n=-200;n<=200;n++) {
        assert.equal(protectedFn(n),native(n),mode+' slot '+index+' input '+n);
      }
    }
  }
});

test('escaped, mutated, opaque and ambiguous tuple holders refuse property renaming',()=>{
  const cases=[
    'module.exports=()=>tuple;',
    'tuple[1]=null;module.exports=()=>alias.hiddenCount;',
    'const other=tuple;module.exports=()=>alias.hiddenCount;',
    'Object.freeze(tuple);module.exports=()=>alias.hiddenCount;',
    'const index=1;const other=tuple[index];module.exports=()=>alias.hiddenCount;',
    'const other=tuple[0];module.exports=()=>alias.hiddenCount;',
    'delete tuple[1];module.exports=()=>alias.hiddenCount;',
    'module.exports=()=>tuple[1].hiddenCount;',
    'const {length}=tuple;module.exports=()=>alias.hiddenCount;'
  ];
  const head='const owner={hiddenCount:17,privateDelta:3};const tuple=[true,owner,7];const alias=tuple[1];';
  for(const suffix of cases) {
    for(const mode of ['coo','sno']) {
      const result=compile(head+suffix,mode);
      assert.equal(result.files[0].metrics.objects,0,mode+' '+suffix);
      assert.match(String(result.files[0].code),/hiddenCount/u);
    }
  }
});

test('tuple construction declines holes, duplicate owners, non-inert expressions and oversized holders',()=>{
  const declarations=[
    '[owner, , 0]',
    '[owner,owner]',
    '[owner,Math.random()]',
    '[owner,{x:1}]',
    '[owner,...[1]]',
    '[owner,0,1,2,3,4,5,6,7]'
  ];
  for(const holder of declarations) {
    const source='const owner={hiddenCount:17};const tuple='+holder+
      ';const alias=tuple[0];module.exports=()=>alias.hiddenCount;';
    for(const mode of ['coo','sno']) {
      const result=compile(source,mode);
      assert.equal(result.files[0].metrics.objects,0,mode+' '+holder);
    }
  }
});

test('offline source-only property label recovery still succeeds for private tuple output',()=>{
  const {neutralizeHashedNames}=require('../sims/offline-normalize');
  const original=sourceAt(3);
  const compiled=compile(original,'coo');
  assert.equal(compiled.files[0].metrics.properties,2);
  const copy=neutralizeHashedNames([{
    path:'entry.cjs',sourceType:'commonjs',code:String(compiled.files[0].code)
  }]);
  assert.equal(copy.properties,2);
  const originalFn=load(original);
  const copiedFn=load(String(copy.files[0].code));
  for(let n=-400;n<=400;n++)assert.equal(copiedFn(n),originalFn(n));
});

/**
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @returns {Promise<(n:number)=>number>}
 */
async function loadEsm(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-tuple-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const mod=await import(pathToFileURL(path.join(root,'entry.mjs')).href);
    return /** @type {(n:number)=>number} */(mod.run);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('two-file ESM application preserves indexed private tuple proof',{
  timeout:30000
},async()=>{
  const files=[
    {path:'owner.mjs',sourceType:'module',code:[
      'const owner={hiddenCount:19,privateDelta:5};',
      'const tuple=[false,"metadata",owner,0];',
      'const alias=tuple[2];',
      'export function measure(n){return alias.hiddenCount*n+owner.privateDelta;}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {measure} from "./owner.mjs";',
      'export function run(n){return measure(n)+2;}'
    ].join('\n')}
  ];
  const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,
    seed:'private-tuple-interfile',properties:true,strings:false,identifiers:false});
  const emitted=result.files.map(file=>String(file.code)).join('\n');
  assert.doesNotMatch(emitted,/hiddenCount|privateDelta/u);
  const original=await loadEsm(files);
  const protectedFn=await loadEsm(result.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  })));
  for(let n=-300;n<=300;n++)assert.equal(protectedFn(n),original(n));
});
