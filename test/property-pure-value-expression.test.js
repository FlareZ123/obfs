'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} code @returns {string} */
function execute(code){
  const scope={module:{exports:null}};
  vm.runInNewContext(code,scope,{timeout:2000});
  return JSON.stringify(scope.module.exports);
}

/** @param {string} code @param {number} expected */
function verify(code,expected){
  const compiled=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'pure-primitive-values-v1',
    identifiers:false,strings:false,experimentalSymbolKeys:false
  });
  assert.equal(compiled.files[0].metrics.objects,expected,compiled.files[0].code);
  assert.equal(execute(compiled.files[0].code),execute(code),compiled.files[0].code);
}

test('pure primitive arithmetic, bitwise, relational and boolean fields can rename',()=>{
  verify('const owner={count:(6*7)+(9/3),mask:(1<<4)|2,flag:true && 3>2};'+
    'module.exports=[owner.count,owner.mask,owner.flag];',1);
});

test('pure conditional, nullish, unary, sequence and string expressions can rename',()=>{
  verify('const owner={fallback:null??12,tag:"a"+"bc",'+
    'choice:false?99:8,missing:void 0,seq:(3,5),isNum:typeof 7};'+
    'module.exports=[owner.fallback,owner.tag,owner.choice,owner.missing,owner.seq,owner.isNum];',1);
});

test('ordinary untagged template interpolation of primitive expressions can rename',()=>{
  const tick=String.fromCharCode(96);
  const code='const owner={label:'+tick+'x'+String.fromCharCode(36)+'{3+4}'+tick+
    ',upper:7**2};module.exports=[owner.label,owner.upper];';
  verify(code,1);
});

test('nested inert array and record values allow pure arithmetic fields',()=>{
  verify('const owner={limits:[2*3,4<<1,{name:"ab"+"cd"}],tag:0?1:2};'+
    'module.exports=[owner.limits[0],owner.limits[1],owner.limits[2].name,owner.tag];',1);
});

test('function calls, member reads, identifiers and assignments decline',()=>{
  const negatives=[
    'const owner={secret:Math.abs(-3)};module.exports=owner.secret;',
    'const n=3;const owner={secret:n+4};module.exports=owner.secret;',
    'let n=2;const owner={secret:(n=4)};module.exports=[owner.secret,n];',
    'const owner={secret:({valueOf(){return 9}})+3};module.exports=owner.secret;',
    'const owner={secret:typeof globalThis.anything};module.exports=owner.secret;',
    'let calls=0;function fn(){calls++;return 7;}'+
      'const owner={secret:void fn()};module.exports=[owner.secret,calls];'
  ];
  for(const source of negatives)verify(source,0);
});

test('tagged templates invoke a function and must remain untransformed',()=>{
  const tick=String.fromCharCode(96);
  const source='function tag(parts){return parts[0].length;}'+
    'const owner={secret:tag'+tick+'abcd'+tick+'};module.exports=owner.secret;';
  verify(source,0);
});

test('private Symbol keys use the same proof for pure primitive values',()=>{
  const code='const obj={secret:6*7,hidden:(1<<3)};module.exports=obj.secret+obj.hidden;';
  const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'pure-symbol-values',strings:false,identifiers:false,
    experimentalSymbolKeys:true
  }).files[0];
  assert.equal(output.metrics.symbolKeys,2);
  assert.match(output.code,/=Symbol\(\)/u);
  assert.equal(execute(output.code),execute(code));
});

test('closed-world ESM imported reads preserve output on pure primitive fields',async()=>{
  const files=[
    {path:'state.mjs',sourceType:/** @type {const} */('module'),
      code:'export const state={limit:2**5,mode:"pr"+"ivate",bit:(7&3)};'},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:'import {state} from "./state.mjs";console.log(state.limit,state.mode,state.bit);'}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'pure-import-values',
    identifiers:false,strings:false
  });
  assert.equal(output.crossFile.properties,3);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-pure-value-'));
  try{
    /** @param {typeof files|ReturnType<typeof obfuscateFiles>['files']} variants */
    async function run(variants){
      for(const file of variants)await atomicWrite(path.join(dir,file.path),file.code);
      const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
        encoding:'utf8'
      });
      assert.equal(child.status,0,child.stderr);
      return child.stdout;
    }
    assert.equal(await run(output.files),await run(files));
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
});
