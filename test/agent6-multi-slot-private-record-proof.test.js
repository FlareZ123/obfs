'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/**
 * @param {string} code
 * @returns {(n:number)=>number}
 */
function evaluateCommonJs(code){
  const entry=new Module('agent6-multi-slot.cjs');
  entry.filename='agent6-multi-slot.cjs';
  entry.paths=Module._nodeModulePaths(process.cwd());
  entry._compile(code,entry.filename);
  return /** @type {(n:number)=>number} */ (entry.exports);
}

/**
 * @param {string} code
 * @param {'coo'|'sno'} mode
 */
function compile(code,mode){
  return obfuscateFiles([{path:'record.cjs',sourceType:'commonjs',code}],{
    mode,seed:'agent6-multi-record-owner-20261128',strings:false,
    identifiers:false,properties:true
  });
}

const multipleOwners=[
  'const vault={hiddenCount:41,secretDelta:2};',
  'const carrier={left:vault,right:vault,tag:7,nonce:13n};',
  'const aliasA=carrier.left;',
  'const aliasB=carrier["right"];',
  'const consumer=x=>x.hiddenCount;',
  'function privateRead(n){return consumer(aliasA)*n+aliasB.secretDelta+vault.hiddenCount;}',
  'module.exports=function calculate(n){return privateRead(n);}'
].join('\n');

test('two immutable carrier slots forward the same private owner under COO/SNO',()=>{
  for(const mode of ['coo','sno']){
    const result=compile(multipleOwners,mode);
    assert.equal(result.files[0].metrics.properties,2,
      mode+' must actually rename two owner data fields, not merely preserve runtime values');
    const output=String(result.files[0].code);
    assert.doesNotMatch(output,/hiddenCount|secretDelta/u);
    const native=evaluateCommonJs(multipleOwners),compiled=evaluateCommonJs(output);
    for(let n=-250;n<=250;n++)
      assert.equal(compiled(n),native(n),mode+' n='+n);
  }
});

test('three separate owner-valued fields and two aliases remain consistent',()=>{
  const source=[
    'const vault={hiddenCount:21,secretDelta:3};',
    'const carrier={first:vault,second:vault,third:vault,tag:"metadata"};',
    'const x=carrier.first;',
    'const y=carrier.third;',
    'function privateRead(n){return x.hiddenCount*n+y.secretDelta;}',
    'module.exports=function calculate(n){return privateRead(n);}'
  ].join('\n');
  for(const mode of ['coo','sno']){
    const result=compile(source,mode);
    assert.equal(result.files[0].metrics.properties,2,mode);
    const native=evaluateCommonJs(source);
    const after=evaluateCommonJs(String(result.files[0].code));
    for(let n=-70;n<=70;n++)assert.equal(after(n),native(n));
  }
});

test('multi-slot carrier conservatively refuses escapes, dynamic keys and mutations',()=>{
  const head='const vault={hiddenCount:41};const carrier={left:vault,right:vault,tag:1};const aliasA=carrier.left;const aliasB=carrier.right;';
  const invalid=[
    'module.exports=()=>carrier;',
    'carrier.left={hiddenCount:1};module.exports=()=>aliasA.hiddenCount;',
    'Object.keys(carrier);module.exports=()=>aliasA.hiddenCount;',
    'const unknown=carrier[Math.random()?"left":"right"];module.exports=()=>unknown.hiddenCount;',
    'const copy=carrier;module.exports=()=>aliasA.hiddenCount;',
    'const scalar=carrier.tag;module.exports=()=>aliasB.hiddenCount;',
    'delete carrier.left;module.exports=()=>aliasB.hiddenCount;',
    'const {left}=carrier;module.exports=()=>left.hiddenCount;',
    'module.exports=()=>carrier.left.hiddenCount;'
  ];
  for(const suffix of invalid){
    for(const mode of ['coo','sno']){
      const result=compile(head+suffix,mode);
      assert.equal(result.files[0].metrics.objects,0,mode+' '+suffix);
      assert.match(String(result.files[0].code),/hiddenCount/u);
    }
  }
});

test('invalid record literals refuse despite multiple owner-like fields',()=>{
  const records=[
    '{left:vault,right:vault,tag:Math.random()}',
    '{left:vault,right:vault,tag:{nested:1}}',
    '{left:vault,right:vault,...{tag:2}}',
    '{left:vault,["right"]:vault,tag:2}',
    '{left:vault,right:vault,__proto__:null}',
    '{left:vault,right:vault,constructor:1}',
    '{left:vault,left:vault,right:vault}',
    '{left:vault,right:vault,get tag(){return 1}}',
    '{left:vault,right:vault,a:1,b:2,c:3,d:4,e:5,f:6,g:7}'
  ];
  for(const carrier of records){
    const source='const vault={hiddenCount:9};const record='+carrier+
      ';const a=record.left;const b=record.right;module.exports=()=>a.hiddenCount+b.hiddenCount;';
    for(const mode of ['coo','sno']){
      const result=compile(source,mode);
      assert.equal(result.files[0].metrics.objects,0,mode+' '+carrier);
    }
  }
});

/**
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @returns {Promise<(n:number)=>number>}
 */
async function executeEsm(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent6-multirecord-'));
  try{
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const app=await import(pathToFileURL(path.join(dir,'entry.mjs')).href);
    return /** @type {(n:number)=>number} */ (app.calculate);
  }finally{
    await fs.rm(dir,{force:true,recursive:true});
  }
}

test('cross-module closed-world ESM owner and two private carrier aliases', {
  timeout:30000
},async()=>{
  const files=[
    {path:'owner.mjs',sourceType:/** @type {const} */('module'),code:[
      'export const vault={hiddenCount:41,secretDelta:2};',
      'const carrier={first:vault,second:vault,tag:7};',
      'const aliasA=carrier.first;',
      'const aliasB=carrier.second;',
      'function privateRead(n){return aliasA.hiddenCount*n+aliasB.secretDelta;}',
      'export function read(n){return privateRead(n);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),code:[
      'import {vault,read} from "./owner.mjs";',
      'function privateCalculate(n){return read(n)+vault.hiddenCount;}',
      'export function calculate(n){return privateCalculate(n);}'
    ].join('\n')}
  ];
  const result=obfuscateFiles(files,{mode:'coo',closedWorld:true,
    seed:'agent6-multi-record-closed-esm',strings:false,identifiers:false,properties:true});
  assert.equal(result.crossFile.properties,2);
  const printed=result.files.map(file=>String(file.code)).join('\n');
  assert.doesNotMatch(printed,/hiddenCount|secretDelta/u);
  const before=await executeEsm(files);
  const after=await executeEsm(result.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  })));
  for(let n=-150;n<=150;n++)assert.equal(after(n),before(n));
});

test('independent carrier aliases preserve shared own-field numeric writes',()=>{
  const source=[
    'const vault={hiddenCount:41,secretDelta:2};',
    'const holder={left:vault,right:vault,nonce:0};',
    'const first=holder.left;',
    'const second=holder.right;',
    'function privateUpdate(n){first.hiddenCount+=n;return second.hiddenCount+vault.secretDelta;}',
    'module.exports=function update(n){return privateUpdate(n);}'
  ].join('\n');
  const inputs=[-21,0,2,15,-4,100,-500,1,1,1,0];
  for(const mode of ['coo','sno']){
    const output=compile(source,mode);
    assert.equal(output.files[0].metrics.properties,2);
    const emitted=String(output.files[0].code);
    assert.doesNotMatch(emitted,/hiddenCount|secretDelta/u);
    const before=evaluateCommonJs(source),after=evaluateCommonJs(emitted);
    for(const value of inputs)
      assert.equal(after(value),before(value),
        mode+' cumulative shared-alias write '+value);
  }
});
