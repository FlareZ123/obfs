'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');

/** @param {string} source @returns {string} */
function evaluateCommonJs(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} source @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function localOutput(source) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'standalone-destructuring-assignment',
    strings:false,identifiers:false
  }).files[0];
}

test('discarded own-field destructuring assignment is rewritten with the owner',()=>{
  const source=[
    'const owner={privateField:17,otherField:5};',
    'let captured=0;',
    '({privateField:captured}=owner);',
    'module.exports=[captured,owner.otherField];'
  ].join('');
  const output=localOutput(source);
  assert.equal(output.metrics.objects,1);
  assert.equal(output.metrics.properties,2);
  assert.doesNotMatch(String(output.code),/privateField|otherField/u);
  assert.equal(evaluateCommonJs(String(output.code)),evaluateCommonJs(source));
});

test('constant computed assignment key is safely rewritten',()=>{
  const source=[
    'const owner={privateField:17};',
    'let captured=0;',
    '({["private"+"Field"]:captured}=owner);',
    'module.exports=[captured,owner.privateField];'
  ].join('');
  const output=localOutput(source);
  assert.equal(output.metrics.objects,1);
  assert.equal(output.metrics.properties,1);
  assert.equal(evaluateCommonJs(String(output.code)),evaluateCommonJs(source));
});

test('assignment expression result must be discarded before private-field renaming',()=>{
  const source=[
    'const owner={privateField:17};',
    'let captured=0;',
    'const escaped=({privateField:captured}=owner);',
    'module.exports=[captured,Object.keys(escaped)];'
  ].join('');
  const output=localOutput(source);
  assert.equal(output.metrics.objects,0);
  assert.equal(evaluateCommonJs(String(output.code)),evaluateCommonJs(source));
});

for(const [name,pattern] of [
  ['default field value','({privateField:captured=9}=owner);'],
  ['rest field','({privateField:captured,...rest}=owner);'],
  ['nested target','({privateField:[captured]}=owner);']
]) {
  test('unproved assignment pattern is refused: '+name,()=>{
    const source=[
      'const owner={privateField:17};',
      'let captured=0;let rest;',
      pattern,
      'module.exports=owner.privateField;'
    ].join('');
    const output=localOutput(source);
    assert.equal(output.metrics.objects,0);
  });
}

test('closed-world ESM assignment rewrite preserves cross-file behavior',async()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const inputs=[
    {path:'state.mjs',sourceType:'module',code:'export const shared={privateField:17,otherField:5};'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {shared} from "./state.mjs";',
      'let captured=0;',
      '({privateField:captured}=shared);',
      'console.log([captured,shared.otherField].join(","));'
    ].join('')}
  ];
  const transformed=obfuscateFiles(inputs,{
    mode:'coo',seed:'cross-file-assignment',closedWorld:true,
    strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.objects,1);
  assert.equal(transformed.crossFile.properties,2);
  assert.doesNotMatch(String(transformed.files[1].code),/privateField|otherField/u);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-assignment-flow-'));
  try {
    /** @param {import('../src/core').SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files */
    async function run(files) {
      for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
      const result=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
        encoding:'utf8',timeout:7000
      });
      assert.equal(result.status,0,result.stderr);
      return result.stdout.trim();
    }
    assert.equal(await run(inputs),'17,5');
    assert.equal(await run(transformed.files),'17,5');
    const attacked=normalizeDistributedFiles(transformed.files.map(file=>({
      path:file.path,code:String(file.code),sourceType:'module'
    })));
    assert.equal(attacked.properties,2);
    assert.doesNotMatch(attacked.files[0].code,/_p[a-f0-9]{12}\\b/u);
    assert.equal(await run(attacked.files),'17,5');
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('closed-world export refuses assignment results that escape to reflection',()=>{
  /** @type {import('../src/core').SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const shared={privateField:17};'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {shared} from "./state.mjs";',
      'let captured=0;',
      'const escaped=({privateField:captured}=shared);',
      'console.log(Object.keys(escaped));'
    ].join('')}
  ];
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'cross-file-assignment-escape',closedWorld:true,
    strings:false,identifiers:false
  });
  assert.equal(output.crossFile.properties,0);
});
