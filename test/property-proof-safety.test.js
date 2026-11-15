'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} source @returns {string} */
function execute(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} source @param {number} expected */
function preserves(source,expected) {
  const output=obfuscateFiles([{path:'case.cjs',code:source}],{mode:'sno',seed:'unknown-members',strings:false});
  assert.equal(execute(output.files[0].code),execute(source),output.files[0].code);
  assert.equal(output.files[0].metrics.objects,expected,output.files[0].code);
}

test('inherited getter can observe original own key names',()=>{
  preserves(`Object.defineProperty(Object.prototype,'inspect',{get(){return Object.keys(this)[0]}});
    const a={secretField:2};module.exports=a.inspect;`,0);
});

test('delete of an own key reveals original inherited fallback',()=>{
  preserves(`Object.prototype.secretField=91;const a={secretField:3};
    delete a.secretField;module.exports=a.secretField;`,0);
});

test('inherited hasOwnProperty probes the unmangled field',()=>{
  preserves(`const a={secretField:7};module.exports=a.hasOwnProperty('secretField');`,0);
});

test('destructuring assignment to a tracked member can install a method',()=>{
  preserves(`const a={secretField:4};({x:a.secretField}={x:function(){return Object.keys(this)[0]}});
    module.exports=a.secretField();`,0);
});

test('for-of member lvalues can install a method',()=>{
  preserves(`const a={secretField:4};for(a.secretField of [function(){return Object.keys(this)[0]}]){}
    module.exports=a.secretField();`,0);
});

test('safe direct own-field reads and numeric mutations remain renameable',()=>{
  preserves(`const a={secretField:4};a.secretField+=5;module.exports=a.secretField;`,1);
});

test('closed-world imported object unknown getter rejects property renaming',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-unknown-member-'));
  const original=[
    {path:'state.mjs',code:'export const state={secretField:9};'},
    {path:'main.mjs',code:`import {state} from './state.mjs';
      Object.defineProperty(Object.prototype,'inspect',{get(){return Object.keys(this)[0]}});
      console.log(state.inspect);`}
  ];
  try {
    /** @param {typeof original} files @returns {Promise<string>} */
    async function run(files) {
      for(const f of files)await atomicWrite(path.join(dir,f.path),f.code);
      const p=spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
      assert.equal(p.status,0,p.stderr);
      return p.stdout;
    }
    const expected=await run(original);
    const transformed=obfuscateFiles(original,{mode:'coo',closedWorld:true,seed:'unknown-member-graph',strings:false});
    assert.equal(transformed.crossFile.properties,0);
    assert.equal(await run(transformed.files),expected);
  }finally {await fs.rm(dir,{recursive:true,force:true});}
});
