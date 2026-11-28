'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} code @returns {(n:number)=>number} */
function load(code){
  const entry=new Module('agent6-multituple.cjs');
  entry.filename='agent6-multituple.cjs';
  entry.paths=Module._nodeModulePaths(process.cwd());
  entry._compile(code,entry.filename);
  return /** @type {(n:number)=>number} */(entry.exports);
}

/** @param {string} source @param {'sco'|'coo'|'sno'} mode */
function compile(source,mode){
  return obfuscateFiles([{path:'tuple.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'agent6-repeated-owner-tuple-20261128',
    strings:false,identifiers:false,properties:true
  });
}

const positive=[
  'const owner={hiddenCount:17,privateDelta:3,privateNonce:8};',
  'const tuple=[owner,true,owner,13n,owner];',
  'const first=tuple[0];',
  'const second=tuple[2];',
  'const third=tuple[4];',
  'function work(n){return first.hiddenCount*n+second.privateDelta+third.privateNonce;}',
  'module.exports=function run(n){return work(n);}'
].join('\n');

test('same private owner in three distinct tuple slots retains native behavior in every mode',()=>{
  const modes=/** @type {const} */(['sco','coo','sno']);
  for(const mode of modes){
    const emitted=compile(positive,mode);
    assert.equal(emitted.files[0].metrics.properties,3,
      mode+' must rename all three own data keys after proving tuple aliases');
    const code=String(emitted.files[0].code);
    assert.doesNotMatch(code,/hiddenCount|privateDelta|privateNonce/u);
    const native=load(positive),after=load(code);
    for(let n=-125;n<=125;n++)
      assert.equal(after(n),native(n),mode+' '+n);
  }
});

test('two aliases to the same tuple owner carry cumulative numeric writes',()=>{
  const source=[
    'const owner={hiddenCount:17,privateDelta:3};',
    'const tuple=[owner,owner,0];',
    'const a=tuple[0],b=tuple[1];',
    'function privateWrite(n){a.hiddenCount+=n;return b.hiddenCount+owner.privateDelta;}',
    'module.exports=function run(n){return privateWrite(n);}'
  ].join('\n');
  for(const mode of /** @type {const} */(['sco','coo','sno'])){
    const emitted=compile(source,mode);
    assert.equal(emitted.files[0].metrics.properties,2,mode);
    const before=load(source),after=load(String(emitted.files[0].code));
    for(const n of [-12,17,-5,3,21,-100,0,1])
      assert.equal(after(n),before(n),mode+' sequence '+n);
  }
});

test('tuple carrier escape, reflection, mutation, unknown and non-owner slot refuse',()=>{
  const head='const owner={hiddenCount:17};const tuple=[owner,owner,9];const a=tuple[0];const b=tuple[1];';
  const unsafe=[
    'module.exports=()=>tuple;',
    'module.exports=()=>tuple[0].hiddenCount;',
    'Object.keys(tuple);module.exports=()=>a.hiddenCount;',
    'const copy=tuple;module.exports=()=>a.hiddenCount;',
    'tuple[1]=null;module.exports=()=>b.hiddenCount;',
    'delete tuple[0];module.exports=()=>a.hiddenCount;',
    'const unrelated=tuple[2];module.exports=()=>a.hiddenCount;',
    'const i=1;const ambiguous=tuple[i];module.exports=()=>a.hiddenCount;',
    'const fromString=tuple["0"];module.exports=()=>a.hiddenCount;',
    'const {length}=tuple;module.exports=()=>a.hiddenCount;',
    'const {0:alias}=tuple;module.exports=()=>alias.hiddenCount;',
    'tuple.push(4);module.exports=()=>a.hiddenCount;'
  ];
  for(const end of unsafe)for(const mode of /** @type {const} */(['sco','coo','sno'])){
    const emitted=compile(head+end,mode);
    assert.equal(emitted.files[0].metrics.objects,0,
      mode+' refusing holder '+end);
    assert.match(String(emitted.files[0].code),/hiddenCount/u);
  }
});

test('multiple owner tuple still declines holes, other reference expressions and oversize',()=>{
  const cases=[
    '[owner,,owner]',
    '[owner,owner,Math.random()]',
    '[owner,{tag:1},owner]',
    '[owner,...[owner]]',
    '[owner,owner,new Number(1)]',
    '[owner,owner,null,true,4,5,6,7,8]'
  ];
  for(const tuple of cases)for(const mode of /** @type {const} */(['sco','coo','sno'])){
    const source='const owner={hiddenCount:17};const t='+tuple+
      ';const a=t[0];const b=t[1];module.exports=()=>a.hiddenCount;';
    const emitted=compile(source,mode);
    assert.equal(emitted.files[0].metrics.objects,0,mode+' '+tuple);
  }
});

/** @param {{path:string,code:string,sourceType:'module'}[]} files */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent6-multituple-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const module=await import(pathToFileURL(path.join(dir,'entry.mjs')).href);
    return /** @type {(n:number)=>number} */(module.calculate);
  }finally{await fs.rm(dir,{force:true,recursive:true});}
}

test('closed-world ESM exported root and two private tuple slots are renamed together', {
  timeout:30000
},async()=>{
  const files=[
    {path:'owner.mjs',sourceType:/** @type {const} */('module'),code:[
      'export const owner={hiddenCount:23,privateDelta:3};',
      'const tuple=[owner,2,owner];',
      'const a=tuple[0],b=tuple[2];',
      'function privateRead(n){return a.hiddenCount*n+b.privateDelta;}',
      'export function read(n){return privateRead(n);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),code:[
      'import {owner,read} from "./owner.mjs";',
      'function local(n){return read(n)+owner.hiddenCount;}',
      'export function calculate(n){return local(n);}'
    ].join('\n')}
  ];
  const output=obfuscateFiles(files,{mode:'coo',closedWorld:true,
    seed:'agent6-multiowner-tuple-esm-20261128',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(output.crossFile.properties,2);
  assert.doesNotMatch(output.files.map(f=>String(f.code)).join('\n'),
    /hiddenCount|privateDelta/u);
  const before=await execute(files);
  const after=await execute(output.files.map(f=>({
    path:f.path,sourceType:'module',code:String(f.code)
  })));
  for(let n=-120;n<=120;n++)assert.equal(after(n),before(n));
});

test('seeded 128 layouts of repeated tuple references preserve positive and negative proof',()=>{
  let state=0x60bfa11e;
  /** @returns {number} */
  function random(){state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;}
  for(let iteration=0;iteration<128;iteration++){
    const size=2+(random()%5);
    const parts=Array.from({length:size},(_,i)=>
      i<2?'owner':['true','0','null','"tag"'][random()%4]);
    const count=random()%7;
    for(let i=0;i<count;i++){
      const a=random()%size,b=random()%size;
      [parts[a],parts[b]]=[parts[b],parts[a]];
    }
    const first=parts.indexOf('owner'),last=parts.lastIndexOf('owner');
    const source='const owner={hiddenCount:41,privateDelta:2};'+
      'const arr=['+parts.join(',')+'];'+
      'const a=arr['+first+'],b=arr['+last+'];'+
      'module.exports=function run(n){return a.hiddenCount*n+b.privateDelta;}';
    const before=load(source);
    for(const mode of /** @type {const} */(['sco','coo','sno'])){
      const output=compile(source,mode);
      assert.equal(output.files[0].metrics.properties,2,
        'seed '+iteration+' mode '+mode);
      const after=load(String(output.files[0].code));
      for(const n of [-11,-3,0,1,7,101])assert.equal(after(n),before(n));
    }
  }
});

test('public-only normalizer still recovers tuple-owned hashed field names',()=>{
  const {neutralizeHashedNames}=require('../sims/offline-normalize');
  const output=compile(positive,'coo');
  assert.equal(output.files[0].metrics.properties,3);
  const normalized=neutralizeHashedNames([{path:'tuple.cjs',
    sourceType:'commonjs',code:String(output.files[0].code)}]);
  assert.equal(normalized.properties,3);
  const original=load(positive),attacker=load(String(normalized.files[0].code));
  for(let n=-100;n<=100;n++)assert.equal(attacker(n),original(n));
});
