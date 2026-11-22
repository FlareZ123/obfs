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

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Local CommonJS oracle that does not stringify raw BigInt values.
 * @param {string} source
 * @returns {unknown}
 */
function evaluate(source){
  const sandbox={module:{exports:null}};
  vm.runInNewContext(source,sandbox,{timeout:2000});
  return sandbox.module.exports;
}

/** @param {string} source @param {number} owners @returns {void} */
function checkLocal(source,owners){
  const output=obfuscateFiles([{path:'entry.cjs',code:source}],{
    mode:'sno',seed:'safe-direct-unary-bigint',identifiers:false,strings:false
  });
  assert.equal(output.files[0].metrics.objects,owners);
  assert.equal(evaluate(/** @type {string} */(output.files[0].code)),evaluate(source));
}

/**
 * Test one closed ESM graph in a fresh native child process, preserving
 * actual linker behavior and avoiding JSON's rejection of BigInt values.
 * @param {ModuleFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bigint-unary-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:12000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{await fs.rm(root,{recursive:true,force:true});}
}

/**
 * @param {string} initializer
 * @param {string} expected
 * @returns {Promise<void>}
 */
async function checkEsm(initializer,expected){
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:'+initializer+',otherField:17};'},
    {path:'entry.mjs',sourceType:'module',
      code:"import {state} from './state.mjs';"+
        'console.log(state.secretField==='+expected+',state.otherField);'}
  ];
  const baseline=await execute(files);
  const emitted=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'bigint-unary-crossfile',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(emitted.crossFile.properties,2,
    'An inert unary BigInt literal should allow both owner keys to change');
  assert.equal(await execute(emitted.files),baseline);
}

/** @type {[string,string][]} */
const accepted=[
  ['-1n','-1n'],
  ['~1n','-2n'],
  ['!0n','true'],
  ['typeof 1n','"bigint"'],
  ['void 1n','undefined']
];
for(const [expression,expected] of accepted){
  test('local inert unary BigInt property initializer: '+expression,()=>{
    checkLocal('const owner={field:'+expression+'};'+
      'module.exports=owner.field==='+expected+';',1);
  });
  test('cross-file inert unary BigInt property initializer: '+expression,async()=>{
    await checkEsm(expression,expected);
  });
}

test('nested inert BigInt literal expressions in an array remain admissible',()=>{
  checkLocal('const owner={items:[-1n,~0n,!0n]};'+
    'module.exports=owner.items[0]===-1n&&'+
    'owner.items[1]===-1n&&owner.items[2]===true;',1);
});

for(const [name,expression] of /** @type {[string,string][]} */([
  ['unary plus cannot convert BigInt','+1n'],
  ['mixed BigInt Number throws','1n+2'],
  ['division by zero throws','1n/0n'],
  ['negative exponent throws','2n**-1n']
])){
  test('throwing BigInt initializer remains outside the proof: '+name,()=>{
    const source='const owner={field:'+expression+'};module.exports=0;';
    const emitted=obfuscateFiles([{path:'entry.cjs',code:source}],{
      mode:'sno',seed:'reject-throwing-unary-bigint',
      strings:false,identifiers:false
    });
    assert.equal(emitted.files[0].metrics.objects,0);
    assert.throws(()=>evaluate(source));
    assert.throws(()=>evaluate(/** @type {string} */(emitted.files[0].code)));
  });
}
