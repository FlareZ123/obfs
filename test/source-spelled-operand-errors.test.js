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
function evaluate(source){
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return JSON.stringify(context.module.exports);
}

/** @type {string[]} */
const owners=[
  'const owner={privateField:17,otherField:5};',
  'function make(){return {privateField:17,otherField:5};}const owner=make();',
  'const owner=(()=>({privateField:17,otherField:5}))();'
];

/** @type {[string,string][]} */
const sources=[
  ['construct direct','new owner.privateField();'],
  ['call nested method','owner.privateField.nope();'],
  ['call computed outer key','target[owner.privateField]();'],
  ['construct computed outer key','new target[owner.privateField]();'],
  ['call through sequence','(0,owner.privateField)();'],
  ['call through logical expression','(owner.privateField||undefined)();'],
  ['call through arithmetic','(owner.privateField+1)();'],
  ['iterate computed outer key','for(const x of target[owner.privateField]){}'],
  ['iterate through logical expression','for(const x of (owner.privateField||0)){}'],
  ['call through optional member','owner.privateField?.nope();'],
  ['tagged template','owner.privateField\x60tag\x60;']
];

/** @param {string} owner @param {string} operation @returns {string} */
function program(owner,operation){
  return owner+'const target={};let message="";'+
    'try{'+operation+'}catch(error){message=error.message;}'+
    'module.exports=[message,owner.otherField];';
}

for(let style=0;style<owners.length;style++){
  for(const [name,operation] of sources) {
    test('keep source-spelled TypeError operand: style '+style+' '+name,()=>{
      const original=program(owners[style],operation);
      const expected=evaluate(original);
      const result=/** @type {string[]} */ ([]);
      for(const mode of /** @type {const} */ (['coo','sno','sco'])){
        const output=obfuscateFiles([
          {path:'entry.cjs',sourceType:'commonjs',code:original}
        ],{mode,seed:'source-spelled-operands',strings:false,identifiers:false}).files[0];
        assert.equal(output.metrics.objects,0,mode+'/'+name);
        assert.equal(output.metrics.properties,0,mode+'/'+name);
        assert.equal(String(output.code),original,mode+'/'+name);
        assert.equal(evaluate(String(output.code)),expected,mode+'/'+name);
        result.push(expected);
      }
      assert.equal(result.length,3);
    });
  }
}

/** @param {SourceFile[]} files @returns {Promise<string>} */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-operand-error-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const run=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:7000
    });
    assert.equal(run.status,0,run.stderr);
    return run.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const [name,operation] of [
  ['new on owned field','new owner.privateField();'],
  ['computed nested call','target[owner.privateField]();'],
  ['nested method call','owner.privateField.nope();'],
  ['for-of computed source','for(const value of target[owner.privateField]){}']
]){
  test('closed-world ESM refuses source-spelled expression: '+name,async()=>{
    /** @type {SourceFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',
        code:'function make(){return {privateField:17,otherField:5};}export const owner=make();'},
      {path:'entry.mjs',sourceType:'module',
        code:'import {owner} from "./state.mjs";const target={};let message="";'+
          'try{'+operation+'}catch(error){message=error.message;}'+
          'console.log(message+"|"+owner.otherField);'}
    ];
    const transformed=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'source-echo-cross-file',
      strings:false,identifiers:false
    });
    assert.equal(transformed.crossFile.objects,0);
    assert.equal(transformed.crossFile.properties,0);
    assert.equal(await execute(transformed.files),await execute(files));
  });
}

test('array prototype tampering preserves exact source-spelled member expression',()=>{
  const original='const owner={privateField:17,otherField:5};'+
    'const previous=Array.prototype.join;let message="";'+
    'try{Array.prototype.join=undefined;[owner.privateField,owner.otherField].join(",");}'+
    'catch(error){message=error.message;}finally{Array.prototype.join=previous;}'+
    'module.exports=[message,owner.otherField];';
  const expected=evaluate(original);
  assert.match(JSON.parse(expected)[0],/owner\.privateField/u);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
      mode,seed:'prototype-spelling',strings:false,identifiers:false
    }).files[0];
    assert.equal(result.metrics.objects,0,mode);
    assert.equal(result.metrics.properties,0,mode);
    assert.equal(evaluate(result.code),expected,mode);
  }
});

test('closed-world ESM preserves array prototype failure operand spelling',async()=>{
  /** @type {SourceFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const owner={privateField:17,otherField:5};'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {owner} from "./state.mjs";const previous=Array.prototype.join;'+
        'try{Array.prototype.join=undefined;[owner.privateField,owner.otherField].join(",");}'+
        'catch(error){console.log(error.message);}finally{Array.prototype.join=previous;}'}
  ];
  const baseline=await execute(files);
  assert.match(baseline,/owner\.privateField/u);
  const transformed=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'prototype-spelling-cross',
    strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.objects,0);
  assert.equal(transformed.crossFile.properties,0);
  assert.equal(await execute(transformed.files),baseline);
});

for(const [name,operation] of [
  ['computed failed call','state["privateField"]();'],
  ['computed failed constructor','new state["privateField"]();'],
  ['computed failed tag','state["privateField"]\x60tag\x60;'],
  ['nested computed failure','target[state["privateField"]]();'],
  ['spread array operand','[...state["privateField"]];'],
  ['spread call operand','Math.max(...state["privateField"]);']
]){
  test('string decoder keeps source-spelled failed operand: '+name,()=>{
    const original='const state={};const target={};let observed="";'+
      'try{'+operation+'}catch(error){observed=error.message;}'+
      'module.exports=observed;';
    const expected=evaluate(original);
    assert.ok(JSON.parse(expected).includes('state.privateField'),expected);
    for(const mode of /** @type {const} */ (['coo','sco','sno'])){
      const generated=obfuscateFiles([{path:'failure.cjs',sourceType:'commonjs',
        code:original}],{mode,seed:'string-typeerror/'+name,
        strings:true,identifiers:false,properties:false}).files[0];
      assert.equal(evaluate(generated.code),expected,mode+'/'+name);
    }
  });
}

test('source-spelling refusal still encodes unrelated successful computed key',()=>{
  const original='const state={privateField:12};module.exports=state["privateField"];';
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    const generated=obfuscateFiles([{path:'positive.cjs',sourceType:'commonjs',
      code:original}],{mode,seed:'string-typeerror-positive',
      strings:true,identifiers:false,properties:false}).files[0];
    assert.equal(generated.metrics.literals,1,mode);
    assert.equal(evaluate(generated.code),evaluate(original),mode);
  }
});
