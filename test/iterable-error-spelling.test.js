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

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @param {string} source @returns {string} */
function run(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} source @param {'coo'|'sco'|'sno'} mode */
function local(source,mode){
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'iterable-error-message-spelling',strings:false,identifiers:false
  }).files[0];
}

const owners=[
  'const owner={secretField:17,otherField:5};',
  'function make(){return {secretField:17,otherField:5};}const owner=make();',
  'const owner=(()=>({secretField:17,otherField:5}))();'
];

/** @type {[string,string][]} */
const iterationUses=[
  ['for-of source','for(const value of owner.secretField){}'],
  ['array spread','[...owner.secretField];'],
  ['array pattern declaration','const [value]=owner.secretField;'],
  ['array pattern assignment','let value;[value]=owner.secretField;'],
  ['delegated yield','function* read(){yield* owner.secretField;}[...read()];']
];

for(let ownerIndex=0;ownerIndex<owners.length;ownerIndex++){
  for(const [label,consume] of iterationUses){
    test('source-dependent iterable error declines own-key renaming: owner '+ownerIndex+', '+label,()=>{
      const source=owners[ownerIndex]+
        'let message="";try{'+consume+'}catch(error){message=error.message;}'+
        'module.exports=[message,owner.otherField];';
      const expected=run(source);
      for(const mode of /** @type {const} */ (['coo','sco','sno'])){
        const output=local(source,mode);
        assert.equal(output.metrics.objects,0,label+'/'+mode);
        assert.equal(output.metrics.properties,0,label+'/'+mode);
        assert.equal(String(output.code),source,label+'/'+mode);
        assert.equal(run(String(output.code)),expected,label+'/'+mode);
      }
    });
  }
}

test('Node V8 embeds source operand spelling in for-of and spread errors',()=>{
  for(const consume of ['for(const value of owner.secretField){}',
                        '[...owner.secretField];']){
    const source=owners[0]+'let message="";try{'+consume+
      '}catch(error){message=error.message;}module.exports=message;';
    const baseline=JSON.parse(run(source));
    assert.ok(String(baseline).includes('owner.secretField'),String(baseline));
  }
});

test('ordinary known own-field read still has positive key-rename coverage',()=>{
  const source=owners[0]+'module.exports=owner.secretField+owner.otherField;';
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    const output=local(source,mode);
    assert.equal(output.metrics.objects,1);
    assert.equal(output.metrics.properties,2);
    assert.equal(run(String(output.code)),run(source));
  }
});

/** @param {SourceFile[]} files @returns {Promise<string>} */
async function execute(files){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-iterable-error-'));
  try{
    for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
    const processResult=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
      encoding:'utf8',timeout:7000
    });
    assert.equal(processResult.status,0,processResult.stderr);
    return processResult.stdout.trim();
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}

for(const [label,initializer] of [
  ['direct object','export const owner={secretField:17,otherField:5};'],
  ['named factory','function make(){return {secretField:17,otherField:5};}export const owner=make();'],
  ['immediate factory','export const owner=(()=>({secretField:17,otherField:5}))();']
]){
  test('closed-world ESM preserves operand source spelling: '+label,async()=>{
    /** @type {SourceFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',code:initializer},
      {path:'entry.mjs',sourceType:'module',code:
        'import {owner} from "./state.mjs";let message="";'+
        'try{for(const value of owner.secretField){}}catch(error){message=error.message;}'+
        'console.log(message+"|"+owner.otherField);'}
    ];
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'iterable-error-cross-file',
      strings:false,identifiers:false
    });
    assert.equal(output.crossFile.objects,0);
    assert.equal(output.crossFile.properties,0);
    assert.equal(await execute(output.files),await execute(files));
  });
}
