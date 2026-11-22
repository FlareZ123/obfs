'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {'optional'|'nullish'|'conditional'|'array-index'|'reflection'|'reader'} ReaderForm */

/**
 * Held-out descriptor provenance grammar for a source-visible object.
 * These forms intentionally lie outside the currently documented narrow
 * direct-object, destructured-default and literal-array admission grammars.
 * @param {ReaderForm} form
 * @returns {string}
 */
function readEntry(form) {
  switch(form){
    case 'optional':return 'const entry=descriptors?.ref;';
    case 'nullish':return 'const entry=descriptors.ref??{};';
    case 'conditional':return 'const entry=true?descriptors.ref:{};';
    case 'array-index':return 'const entry=[descriptors.ref][0];';
    case 'reflection':return 'const entry=Reflect.get(descriptors,"ref");';
    case 'reader':
      return 'function read(d){return d.ref;}const entry=read(descriptors);';
  }
}

/**
 * @param {ReaderForm} form
 * @param {'String'|'Number'} intrinsic
 * @returns {SourceFile[]}
 */
function sourceGraph(form,intrinsic) {
  const mutator=[
    'const descriptors={ref:{}};',
    readEntry(form),
    'entry.get=function(){return '+intrinsic+'.prototype};',
    'const box=Object.create(null,descriptors);',
    intrinsic==='String'?'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;'
  ].join('');
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(directory,files){
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

for(const mode of /** @type {const} */(['coo','sno','sco'])){
  for(const form of /** @type {const} */(
    ['optional','nullish','conditional','array-index','reflection','reader'])){
    for(const intrinsic of /** @type {const} */(['String','Number'])){
      test('held-out descriptor expression '+mode+'/'+form+'/'+intrinsic,
        async(t)=>{
          const input=sourceGraph(form,intrinsic);
          const output=obfuscateFiles(input,{
            mode,strings:true,identifiers:false,properties:false,
            seed:'descriptor-heldout-expression/'+mode+'/'+form+'/'+intrinsic
          });
          const target=output.files.find(file=>file.path==='target.cjs');
          assert.ok(target);
          t.diagnostic('actual protected target literal count='+target.metrics.literals);
          const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-heldout-entry-'));
          try{
            const native=await execute(path.join(root,'native'),input);
            assert.equal(native.status,0,native.stderr);
            const compiled=await execute(path.join(root,'compiled'),output.files);
            assert.deepEqual(compiled,native,
              'compiler must preserve native behavior even outside known alias grammar');
          }finally{
            await fs.rm(root,{recursive:true,force:true});
          }
        });
    }
  }
}
