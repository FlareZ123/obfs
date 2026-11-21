'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
const payload='V'.repeat(2048)+'X';

/**
 * Keep mutation and decode in separate CommonJS modules so a decoder that
 * assumes pristine String.prototype methods is exercised after startup.
 * @param {string} mutator
 * @returns {SourceFile[]}
 */
function graph(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify(payload)+';'}
  ];
}

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/** @param {string} s @returns {string} */
function digest(s) {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * @param {string} mutator
 * @param {'coo'|'sno'} mode
 * @param {number} expectedLiterals
 * @returns {Promise<void>}
 */
async function compare(mutator,mode,expectedLiterals) {
  const input=graph(mutator);
  const output=obfuscateFiles(input,{
    mode,seed:'decoder-object-create-provenance/'+mode,
    strings:true,properties:false,identifiers:false
  });
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-objectcreate-provenance-'));
  try {
    const native=await execute(path.join(root,'native'),input);
    const emitted=await execute(path.join(root,'emitted'),output.files);
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,payload);
    assert.equal(emitted.status,native.status,emitted.stderr);
    assert.equal(digest(emitted.stdout),digest(native.stdout),
      'Object.create descriptor read changed cross-module decode behavior');
    const target=output.files.find(file=>file.path==='target.cjs');
    assert.equal(target?.metrics.literals,expectedLiterals,
      'Unexpected string encoding yield in Object.create provenance case');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const unsafe=[
  ['descriptor map const alias',
    "const descriptors={ref:{get(){return String.prototype;}}};const box=Object.create(null,descriptors);box.ref.charCodeAt=()=>0;"],
  ['descriptor map returned from factory',
    "function descriptors(){return {ref:{get(){return String.prototype;}}};}const box=Object.create(null,descriptors());box.ref.charCodeAt=()=>0;"],
  ['nested descriptor alias',
    "const descriptor={get(){return String.prototype;}};const box=Object.create(null,{ref:descriptor});box.ref.charCodeAt=()=>0;"],
  ['literal computed descriptor key',
    "const box=Object.create(null,{['ref']:{get(){return String.prototype;}}});box.ref.charCodeAt=()=>0;"],
  ['const computed descriptor key',
    "const key='ref';const box=Object.create(null,{[key]:{get(){return String.prototype;}}});box.ref.charCodeAt=()=>0;"],
  ['native Object.create const alias',
    "const create=Object.create;const box=create(null,{ref:{get(){return String.prototype;}}});box.ref.charCodeAt=()=>0;"],
  ['mutable intrinsic alias returned from getter',
    "let intrinsic=String.prototype;const box=Object.create(null,{ref:{get(){return intrinsic;}}});box.ref.charCodeAt=()=>0;"],
  ['factory returning accessor-bearing box',
    "function box(){return Object.create(null,{ref:{get(){return String.prototype;}}});}box().ref.charCodeAt=()=>0;"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    test('Object.create accessor provenance refuses unsafe encoding: '+name+'/'+mode,
      async()=>compare(mutator,mode,0));
  }
}

const safe=[
  ['Number descriptor map alias',
    "const descriptors={ref:{get(){return Number.prototype;}}};const box=Object.create(null,descriptors);box.ref.unrelated=1;"],
  ['Number descriptor factory',
    "function descriptors(){return {ref:{get(){return Number.prototype;}}};}const box=Object.create(null,descriptors());box.ref.unrelated=1;"],
  ['Number computed descriptor key',
    "const key='ref';const box=Object.create(null,{[key]:{get(){return Number.prototype;}}});box.ref.unrelated=1;"],
  ['Number aliased Object.create',
    "const create=Object.create;const box=create(null,{ref:{get(){return Number.prototype;}}});box.ref.unrelated=1;"]
];

for(const [name,mutator] of safe) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    test('Object.create safe Number descriptor keeps encoding yield: '+name+'/'+mode,
      async()=>compare(mutator,mode,1));
  }
}
