'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {(n:number)=>number} */
function load(source){
  const module=new Module('private-record-proof.cjs');
  module.filename='private-record-proof.cjs';
  module.paths=Module._nodeModulePaths(process.cwd());
  module._compile(source,module.filename);
  return /** @type {(n:number)=>number} */ (module.exports);
}

/**
 * @param {string} source
 * @param {'coo'|'sno'} mode
 */
function compile(source,mode){
  return obfuscateFiles([{path:'record.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'record-ownership-test-20261116',
    identifiers:false,strings:false,properties:true
  });
}

const positive=[
  'const vault={hiddenCount:17,secretDelta:3};',
  'const record={tag:"metadata",owner:vault,nonce:9n};',
  'const left=record.owner;',
  'const right=record["owner"];',
  'function identity(v){return v;}',
  'const reader=v=>v.hiddenCount;',
  'module.exports=function run(n){return reader(identity(left))*n+right.secretDelta+vault.hiddenCount;}'
].join('\n');

test('private record slot forwards one owner through dot and bracket access in COO and SNO',()=>{
  for(const mode of ['coo','sno']){
    const result=compile(positive,mode);
    const emitted=String(result.files[0].code);
    assert.equal(result.files[0].metrics.properties,2,mode);
    assert.doesNotMatch(emitted,/hiddenCount|secretDelta/u);
    const before=load(positive),after=load(emitted);
    for(let n=-250;n<=250;n++)assert.equal(after(n),before(n),mode+' input '+n);
  }
});

test('record escape, write, reflection, ambiguous lookup and noncanonical use all refuse',{
  timeout:30000
},()=>{
  const head='const vault={hiddenCount:17,secretDelta:3};const record={tag:1,owner:vault};const alias=record.owner;';
  const unsafe=[
    'module.exports=()=>record;',
    'record.owner={hiddenCount:9,secretDelta:3};module.exports=()=>alias.hiddenCount;',
    'const copy=record;module.exports=()=>alias.hiddenCount;',
    'const sibling=record.tag;module.exports=()=>alias.hiddenCount;',
    'Object.keys(record);module.exports=()=>alias.hiddenCount;',
    'delete record.owner;module.exports=()=>alias.hiddenCount;',
    'const key="owner";const second=record[key];module.exports=()=>alias.hiddenCount;',
    'module.exports=()=>record.owner.hiddenCount;',
    'const {owner}=record;module.exports=()=>alias.hiddenCount;',
    'record["tag"]=2;module.exports=()=>alias.hiddenCount;'
  ];
  for(const suffix of unsafe){
    for(const mode of ['coo','sno']){
      const result=compile(head+suffix,mode);
      assert.equal(result.files[0].metrics.objects,0,mode+' '+suffix);
      assert.match(String(result.files[0].code),/hiddenCount/u);
    }
  }
});

test('record literals with duplicate owner, dynamic or special keys and observable siblings refuse',()=>{
  const cases=[
    '{owner:vault,also:vault}',
    '{owner:vault,tag:Math.random()}',
    '{owner:vault,tag:{nested:1}}',
    '{owner:vault,...{tag:3}}',
    '{["owner"]:vault,tag:1}',
    '{__proto__:vault,tag:1}',
    '{constructor:vault,tag:1}',
    '{owner:vault,owner:vault}',
    '{owner:vault,tag:1,a:2,b:3,c:4,d:5,e:6,f:7,g:8}'
  ];
  for(const record of cases){
    const source='const vault={hiddenCount:17};const record='+record+
      ';const alias=record.owner;module.exports=()=>alias.hiddenCount;';
    for(const mode of ['coo','sno']){
      const result=compile(source,mode);
      assert.equal(result.files[0].metrics.objects,0,mode+' '+record);
    }
  }
});

test('static independent attacker neutralizes all private record hashed labels',()=>{
  const {neutralizeHashedNames}=require('../sims/offline-normalize');
  const encoded=compile(positive,'coo');
  const copied=neutralizeHashedNames([{
    path:'record.cjs',sourceType:'commonjs',code:String(encoded.files[0].code)
  }]);
  assert.equal(copied.properties,2);
  const native=load(positive),attacker=load(String(copied.files[0].code));
  for(let n=-250;n<=250;n++)assert.equal(attacker(n),native(n));
});

/**
 * @param {{path:string,sourceType:'module',code:string}[]} files
 * @returns {Promise<(n:number)=>number>}
 */
async function loadGroup(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-record-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const app=await import(pathToFileURL(path.join(directory,'entry.mjs')).href);
    return /** @type {(n:number)=>number} */ (app.calculate);
  }finally{
    await fs.rm(directory,{force:true,recursive:true});
  }
}

test('private-record alias retains behavior in a two-module native ESM app',{
  timeout:30000
},async()=>{
  const original=[
    {path:'owner.mjs',sourceType:'module',code:[
      'const vault={hiddenCount:41,secretDelta:2};',
      'const record={tag:"x",owner:vault,metadata:0};',
      'const alias=record["owner"];',
      'export function read(n){return alias.hiddenCount*n+vault.secretDelta;}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {read} from "./owner.mjs";',
      'export function calculate(n){return read(n)+5;}'
    ].join('\n')}
  ];
  const result=obfuscateFiles(original,{mode:'coo',closedWorld:true,
    seed:'record-intermodule-20261116',identifiers:false,strings:false,properties:true});
  const generated=result.files.map(file=>String(file.code)).join('\n');
  assert.doesNotMatch(generated,/hiddenCount|secretDelta/u);
  const native=await loadGroup(original);
  const changed=await loadGroup(result.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  })));
  for(let n=-120;n<=120;n++)assert.equal(changed(n),native(n));
});
