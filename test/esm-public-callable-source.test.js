'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Execute an ESM entry in a fresh Node process and serialize a public view.
 * @param {string} code
 * @param {string} expression
 * @returns {Promise<unknown>}
 */
async function observe(code,expression) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-public-source-'));
  try {
    const file=path.join(dir,'entry.mjs');
    await fs.writeFile(file,code,'utf8');
    const url=pathToFileURL(file).href;
    const script='import('+JSON.stringify(url)+').then(m=>process.stdout.write(JSON.stringify('+expression+')))'; 
    const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('exported ESM function source preserves captured owner and property spellings',async()=>{
  const source='const owner={secretField:3};export function read(){return owner.secretField;}';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-function-source',
    strings:false,properties:true,identifiers:true
  });
  assert.equal(output.files[0].metrics.properties,0);
  assert.deepEqual(await observe(output.files[0].code,'[m.read.toString(),m.read()]'),
    await observe(source,'[m.read.toString(),m.read()]'));
});

test('exported object method source preserves captured owner and property spellings',async()=>{
  const source='const owner={secretField:5};export const api={read(){return owner.secretField;}};';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-method-source',
    strings:false,properties:true,identifiers:true
  });
  assert.deepEqual(await observe(output.files[0].code,'[m.api.read.toString(),m.api.read()]'),
    await observe(source,'[m.api.read.toString(),m.api.read()]'));
});

test('callable aliased through an exported object keeps its function source',async()=>{
  const source='const owner={secretField:6};function privateRead(){return owner.secretField;}const api={read:privateRead};export {api};';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-object-alias-source',
    strings:false,properties:true,identifiers:true
  });
  assert.deepEqual(await observe(output.files[0].code,'[m.api.read.toString(),m.api.read()]'),
    await observe(source,'[m.api.read.toString(),m.api.read()]'));
});

test('exported class source and methods preserve captured owner spellings',async()=>{
  const source='const owner={secretField:7};class Api{read(){return owner.secretField;}}export {Api};';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-class-source',
    strings:false,properties:true,identifiers:true
  });
  assert.deepEqual(await observe(output.files[0].code,'[m.Api.toString(),m.Api.prototype.read.toString(),new m.Api().read()]'),
    await observe(source,'[m.Api.toString(),m.Api.prototype.read.toString(),new m.Api().read()]'));
});

test('nested functions inside an exported callable retain their captured source',async()=>{
  const source='const owner={secretField:9};export function read(){function nested(){return owner.secretField;}return nested();}';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-nested-source',
    strings:false,properties:true,identifiers:true
  });
  assert.deepEqual(await observe(output.files[0].code,'[m.read.toString(),m.read()]'),
    await observe(source,'[m.read.toString(),m.read()]'));
});

test('string encoding preserves exported callable source but retains private-helper yield',async()=>{
  const source='function privateHelper(){return "privateSecretString";}export function publicRead(){return 1;}export const privateValue=privateHelper();';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-string-source',
    strings:true,properties:false,identifiers:false
  });
  assert.equal(output.files[0].metrics.literals,1);
  assert.deepEqual(await observe(output.files[0].code,'[m.publicRead.toString(),m.publicRead(),m.privateValue]'),
    await observe(source,'[m.publicRead.toString(),m.publicRead(),m.privateValue]'));
});

test('identifier renaming keeps exported parameter names and renames a private helper',async()=>{
  const source='function privateHelper(privateParam){return privateParam+1;}export function publicRead(publicParam){return publicParam;}export const privateResult=privateHelper(3);';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-identifier-source',
    strings:false,properties:false,identifiers:true
  });
  assert.match(output.files[0].code,/export function publicRead\(publicParam\)/);
  assert.doesNotMatch(output.files[0].code,/privateParam/);
  assert.deepEqual(await observe(output.files[0].code,'[m.publicRead.toString(),m.publicRead(9),m.privateResult]'),
    ['function publicRead(publicParam){return publicParam;}',9,4]);
});

test('statement-flow refuses an exported callable while leaving private-helper transforms available',()=>{
  const source='export function read(value){let result=value+1;if(result>2){result+=3;}return result;}';
  assert.throws(()=>obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-flow-source',
    experimentalStatementFlow:{'entry.mjs':['read']}
  }),/Statement flow declined/);
});


test('callable returned by an exported function keeps its captured source',async()=>{
  const source='const owner={secretField:8};function helper(){return owner.secretField;}export function get(){return helper;}';
  const output=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'esm-exported-returned-callable-source',
    strings:false,properties:true,identifiers:true
  });
  assert.deepEqual(await observe(output.files[0].code,'[m.get.toString(),m.get().toString(),m.get()()]'),
    await observe(source,'[m.get.toString(),m.get().toString(),m.get()()]'));
});

test('cross-file owner reads inside an exported callable retain source while private readers remain eligible',async()=>{
  const owner='export const owner={secretField:13};';
  const publicReader='import {owner} from "./owner.mjs";export function read(){return owner.secretField;}';
  const protectedOutput=obfuscateFiles([
    {path:'owner.mjs',sourceType:'module',code:owner},
    {path:'reader.mjs',sourceType:'module',code:publicReader}
  ],{mode:'coo',closedWorld:true,seed:'esm-exported-cross-file-source',strings:false,identifiers:false,properties:true});
  assert.equal(protectedOutput.files[0].metrics.properties,0);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-cross-source-'));
  try {
    await fs.writeFile(path.join(dir,'owner.mjs'),protectedOutput.files[0].code,'utf8');
    await fs.writeFile(path.join(dir,'reader.mjs'),protectedOutput.files[1].code,'utf8');
    const url=pathToFileURL(path.join(dir,'reader.mjs')).href;
    const child=spawnSync(process.execPath,['--input-type=module','-e',
      'import('+JSON.stringify(url)+').then(m=>process.stdout.write(JSON.stringify([m.read.toString(),m.read()])))'
    ],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    assert.deepEqual(JSON.parse(child.stdout),['function read(){return owner.secretField;}',13]);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }

  const privateReader='import {owner} from "./owner.mjs";function read(){return owner.secretField;}export const value=read();';
  const privateOutput=obfuscateFiles([
    {path:'owner.mjs',sourceType:'module',code:owner},
    {path:'reader.mjs',sourceType:'module',code:privateReader}
  ],{mode:'coo',closedWorld:true,seed:'esm-private-cross-file-source',strings:false,identifiers:false,properties:true});
  assert.equal(privateOutput.files[0].metrics.properties,1,
    'a genuinely private cross-file reader remains eligible for property rewriting');
});
