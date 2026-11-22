'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Execute the same external ESM importer against original and emitted modules.
 * The external observer itself is never compiled or renamed.
 * @param {string} base
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {string} expression
 * @returns {Promise<string>}
 */
async function externalObservation(base,files,expression){
  await fs.mkdir(base,{recursive:true});
  for(const file of files){
    await atomicWrite(path.join(base,file.path),file.code);
  }
  const runner='const m=await import("./entry.mjs");'+
    'process.stdout.write(JSON.stringify('+expression+'));';
  const runnerPath=path.join(base,'outside.mjs');
  await atomicWrite(runnerPath,runner);
  const child=spawnSync(process.execPath,[runnerPath],{
    encoding:'utf8',timeout:15000,windowsHide:true,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

const examples=[
  {
    name:'local function reexported under public alias',
    code:'function privateRead(secretParam){return secretParam+1;}export {privateRead as read};',
    expression:'[m.read.toString(),m.read(2)]'
  },
  {
    name:'method reachable through a named-export object alias',
    code:'const api={read(secretParam){return secretParam+1;}};export {api};',
    expression:'[m.api.read.toString(),m.api.read(2)]'
  },
  {
    name:'default exported named callable',
    code:'export default function named(secretParam){return secretParam+1;}',
    expression:'[m.default.toString(),m.default(2)]'
  },
  {
    name:'default exported object method',
    code:'export default {read(secretParam){return secretParam+1;}};',
    expression:'[m.default.read.toString(),m.default.read(2)]'
  },
  {
    name:'exported factory returns a separately observed nested function',
    code:'export function make(){return function nested(secretParam){return secretParam+1;};}',
    expression:'[m.make.toString(),m.make().toString(),m.make()(2)]'
  }
];

for(const example of examples){
  test('ESM external source observer: '+example.name,async()=>{
    const sources=[{path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:example.code}];
    const output=obfuscateFiles(sources,{
      mode:'coo',closedWorld:true,seed:'external-observer/'+example.name,
      identifiers:true,properties:false,strings:false,controlFlow:false
    });
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-export-source-alias-'));
    try{
      const native=await externalObservation(path.join(root,'native'),sources,example.expression);
      const emitted=await externalObservation(path.join(root,'emitted'),output.files,example.expression);
      assert.equal(emitted,native,'Public ESM callable source differs despite equivalent return values');
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
}

test('ESM external importer observes a local function reexported by a sibling module',async()=>{
  const sources=[
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:'export {read} from "./origin.mjs";'},
    {path:'origin.mjs',sourceType:/** @type {const} */('module'),
      code:'function privateRead(secretParam){return secretParam+1;}export {privateRead as read};'}
  ];
  const output=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'external-observer/reexport',
    identifiers:true,properties:false,strings:false,controlFlow:false
  });
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-export-source-reexport-'));
  try{
    const expr='[m.read.toString(),m.read(2)]';
    const native=await externalObservation(path.join(root,'native'),sources,expr);
    const emitted=await externalObservation(path.join(root,'emitted'),output.files,expr);
    assert.equal(emitted,native,'Reexported callable has an externally observable source');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('unexposed local helper parameter retains safe renaming yield',async()=>{
  const sources=[{path:'entry.mjs',sourceType:/** @type {const} */('module'),
    code:'function localHelper(privateParam){return privateParam+1;}export const value=localHelper(2);'}];
  const output=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'external-observer/private-positive',
    identifiers:true,properties:false,strings:false,controlFlow:false
  });
  assert.doesNotMatch(String(output.files[0].code),/privateParam/);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-export-source-positive-'));
  try{
    const expr='m.value';
    const native=await externalObservation(path.join(root,'native'),sources,expr);
    const emitted=await externalObservation(path.join(root,'emitted'),output.files,expr);
    assert.equal(native,'3');
    assert.equal(emitted,native);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
