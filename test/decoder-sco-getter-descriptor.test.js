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
/** @param {string} dir @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files */
async function execute(dir,files,entry) {
  await fs.mkdir(dir,{recursive:true});
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(dir,entry)],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}
/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @type {Array<[string,string,Array<[string,'module'|'commonjs',string]>]>} */
const cases=[
  ['cjs-create-double-alias','entry.cjs',[
    ['entry.cjs','commonjs','require("./mutator.cjs");process.stdout.write(require("./target.cjs"));'],
    ['mutator.cjs','commonjs','const desc={get(){return CTOR.prototype;}};const ds={ref:desc};const box=Object.create(null,ds);box.ref.MUTATION;'],
    ['target.cjs','commonjs','module.exports='+JSON.stringify('L'.repeat(2048)+'G')+';']]],
  ['cjs-defineProperties-exported-factory','entry.cjs',[
    ['entry.cjs','commonjs','require("./mutator.cjs");process.stdout.write(require("./target.cjs"));'],
    ['factory.cjs','commonjs','const desc={get(){return CTOR.prototype;}};module.exports.make=()=>({ref:desc});'],
    ['mutator.cjs','commonjs','const make=require("./factory.cjs").make;const box={};Object.defineProperties(box,make());box.ref.MUTATION;'],
    ['target.cjs','commonjs','module.exports='+JSON.stringify('L'.repeat(2048)+'G')+';']]],
  ['esm-create-default-factory','entry.mjs',[
    ['entry.mjs','module','import "./mutator.mjs";import target from "./target.mjs";process.stdout.write(target);'],
    ['factory.mjs','module','const desc={get(){return CTOR.prototype;}};export default ()=>({ref:desc});'],
    ['mutator.mjs','module','import make from "./factory.mjs";const box=Object.create(null,make());box.ref.MUTATION;'],
    ['target.mjs','module','export default '+JSON.stringify('L'.repeat(2048)+'G')+';']]],
  ['esm-defineProperties-exported-descriptor','entry.mjs',[
    ['entry.mjs','module','import "./mutator.mjs";import target from "./target.mjs";process.stdout.write(target);'],
    ['factory.mjs','module','export const desc={get(){return CTOR.prototype;}};'],
    ['mutator.mjs','module','import {desc} from "./factory.mjs";const box={};Object.defineProperties(box,{ref:desc});box.ref.MUTATION;'],
    ['target.mjs','module','export default '+JSON.stringify('L'.repeat(2048)+'G')+';']]]
];

for(const [name,entry,parts] of cases) {
  for(const safe of [false,true]) {
    test('SCO native getter descriptor parity: '+name+'/'+
      (safe?'Number positive':'String unsafe'),async()=>{
      const sourceType=/** @type {'commonjs'|'module'} */(parts[0][1]);
      const input=parts.map(([filename,type,code])=>({
        path:filename,sourceType:/** @type {'commonjs'|'module'} */(type),
        code:code.replace('CTOR',safe?'Number':'String')
          .replace('MUTATION',safe?'unrelated=1':'charCodeAt=()=>0')
      }));
      const output=obfuscateFiles(input,{
        mode:'sco',strings:true,identifiers:false,properties:false,
        seed:'sco-getter-parity/'+name+'/'+safe
      });
      const target=output.files.find(f=>f.path===(sourceType==='module'?'target.mjs':'target.cjs'));
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-getter-'));
      try {
        const native=await execute(path.join(root,'native'),input,entry);
        const emitted=await execute(path.join(root,'emitted'),output.files,entry);
        assert.equal(native.status,0,native.stderr);
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(emitted.stderr,native.stderr);
        assert.ok(emitted.stdout===native.stdout,
          'stdout emitted='+digest(emitted.stdout)+' native='+digest(native.stdout));
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,safe?1:0,
        'SCO decoder yield changed');
    });
  }
}
