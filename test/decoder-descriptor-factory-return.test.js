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

/** @param {string} mutator @returns {SourceFile[]} */
function graph(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Q'.repeat(2048)+'X')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const cases=[
  ['create returned alias map',
    'const desc={get(){return CTOR.prototype;}};function make(){return {ref:desc};}const box=Object.create(null,make());'],
  ['create returned local map alias',
    'const desc={get(){return CTOR.prototype;}};function make(){const m={ref:desc};return m;}const ds=make();const box=Object.create(null,ds);'],
  ['defineProperties returned alias map',
    'const desc={get(){return CTOR.prototype;}};function make(){return {ref:desc};}const box={};Object.defineProperties(box,make());'],
  ['defineProperties returned local map alias',
    'const desc={get(){return CTOR.prototype;}};function make(){const m={ref:desc};return m;}const ds=make();const box={};Object.defineProperties(box,ds);']
];

for(const [name,expression] of cases) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    for(const safe of [false,true]) {
      test('interprocedural descriptor getter: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const input=graph(expression.replace('CTOR',safe?'Number':'String')+
          'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;'));
        const output=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'descriptor-function-return/'+name+'/'+mode+'/'+safe
        });
        const target=output.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-desc-factory-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const emitted=await execute(path.join(root,'emitted'),output.files);
          assert.equal(native.status,0,native.stderr);
          assert.equal(emitted.status,native.status,emitted.stderr);
          assert.equal(emitted.stderr,native.stderr);
          assert.ok(emitted.stdout===native.stdout,
            'output mismatch emitted='+digest(emitted.stdout)+
            ' native='+digest(native.stdout));
        }finally {
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,safe?1:0,
          'decoder transform yield differs');
      });
    }
  }
}
