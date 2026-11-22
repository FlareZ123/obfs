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
      code:'module.exports='+JSON.stringify('Y'.repeat(2048)+'F')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const cases=[
  ['dual alias direct',
    'const desc={get(){return CTOR.prototype;}};const descs={ref:desc};const box={};Object.defineProperties(box,descs);'],
  ['dual alias two-hop map',
    'const desc={get(){return CTOR.prototype;}};const ds0={ref:desc};const descs=ds0;const box={};Object.defineProperties(box,descs);'],
  ['dual alias captured receiver',
    'const desc={get(){return CTOR.prototype;}};const descs={ref:desc};const box={};const define=Object.defineProperties;define(box,descs);']
];

for(const [name,expression] of cases) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    for(const safe of [false,true]) {
      test('Object.defineProperties dual-alias: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const ctor=safe?'Number':'String';
        const input=graph(expression.replace('CTOR',ctor)+
          'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;'));
        const output=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'defineproperties-dual-alias/'+name+'/'+mode+'/'+safe
        });
        const target=output.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-defineprops-alias-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const emitted=await execute(path.join(root,'emitted'),output.files);
          assert.equal(native.status,0,native.stderr);
          assert.equal(emitted.status,native.status,emitted.stderr);
          assert.equal(emitted.stderr,native.stderr);
          assert.ok(emitted.stdout===native.stdout,
            'stdout mismatch: emitted='+digest(emitted.stdout)+
            ' native='+digest(native.stdout));
        }finally{
          await fs.rm(root,{recursive:true,force:true});
        }
        // A detached native mutator remains conservatively unproved: no
        // positive rewrite is required for that first-class call shape.
        const expectYield=safe&&name!=='dual alias captured receiver'?1:0;
        assert.equal(target.metrics.literals,expectYield,
          'unexpected decoder transformation yield');
      });
    }
  }
}
