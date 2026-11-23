'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * The supplied dependency exports a factory for a *descriptor entry*, not
 * a complete descriptor map. The importer installs that entry by Object.assign
 * before Object.create reads it.
 * @param {'String'|'Number'} intrinsic
 * @returns {SourceFile[]}
 */
function graph(intrinsic) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',code:[
      "const build=require('./factory.cjs');",
      'const descriptors={ref:{}};',
      'Object.assign(descriptors.ref,build());',
      'const box=Object.create(null,descriptors);',
      intrinsic==='String'?'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;',
      "process.stdout.write(require('./target.cjs'));"
    ].join('')},
    {path:'factory.cjs',sourceType:'commonjs',
      code:'module.exports=function build(){return {get:function(){return '+
        intrinsic+'.prototype}};};'},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/**
 * ESM static importer receives a factory, then dynamically imports the
 * string-bearing target *after* reading its returned accessor.
 * @param {'String'|'Number'} intrinsic
 * @returns {SourceFile[]}
 */
function moduleGraph(intrinsic) {
  return [
    {path:'entry.mjs',sourceType:'module',code:[
      "import build from './factory.mjs';",
      'const descriptors={ref:{}};',
      'Object.assign(descriptors.ref,build());',
      'const box=Object.create(null,descriptors);',
      intrinsic==='String'?'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;',
      "const {payload}=await import('./target.mjs');",
      'process.stdout.write(payload);'
    ].join('')},
    {path:'factory.mjs',sourceType:'module',
      code:'export default function build(){return {get:function(){return '+
        intrinsic+'.prototype}};}'},
    {path:'target.mjs',sourceType:'module',
      code:'export const payload='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/**
 * Load the factory itself dynamically from a literal supplied ESM path.
 * The follow-on import of target.mjs runs after the String mutation.
 * @param {'String'|'Number'} intrinsic
 * @returns {SourceFile[]}
 */
function dynamicFactoryGraph(intrinsic) {
  return moduleGraph(intrinsic).map(file=>file.path==='entry.mjs'?
    {...file,code:file.code.replace(
      "import build from './factory.mjs';",
      "const {default:build}=await import('./factory.mjs');"
    )}:file);
}

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {'entry.cjs'|'entry.mjs'} [entry]
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(directory,files,entry='entry.cjs') {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)
    await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,entry)],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

for(const mode of /** @type {const} */(['coo','sno','sco'])){
  for(const intrinsic of /** @type {const} */(['String','Number'])){
    test('imported descriptor-entry factory '+mode+' '+intrinsic,async()=>{
      const input=graph(intrinsic);
      const compiled=obfuscateFiles(input,{
        mode,properties:false,identifiers:false,strings:true,
        seed:'agent5-factory-export/'+mode+'/'+intrinsic
      });
      const target=compiled.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-export-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const transformed=await execute(path.join(root,'transformed'),compiled.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(transformed,native,
          'factory-export decoder mutation must preserve native output');
      }finally{
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,intrinsic==='String'?0:1,
        'a String getter must suppress eager decoding; benign Number must encode');
    });
  }
}


for(const mode of /** @type {const} */(['coo','sno','sco'])){
  for(const intrinsic of /** @type {const} */(['String','Number'])){
    test('imported ESM descriptor-entry factory '+mode+' '+intrinsic,async()=>{
      const input=moduleGraph(intrinsic);
      const compiled=obfuscateFiles(input,{
        mode,properties:false,identifiers:false,strings:true,
        seed:'agent5-esm-factory-export/'+mode+'/'+intrinsic
      });
      const target=compiled.files.find(file=>file.path==='target.mjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-factory-export-'));
      try{
        const native=await execute(path.join(root,'native'),input,'entry.mjs');
        const transformed=await execute(path.join(root,'transformed'),compiled.files,'entry.mjs');
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(transformed,native,
          'ESM factory export must preserve late-import decoder mutation');
      }finally{
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,intrinsic==='String'?0:1,
        'an ESM String getter must suppress eager decoding; benign Number must encode');
    });
  }
}


for(const mode of /** @type {const} */(['coo','sno','sco'])){
  for(const intrinsic of /** @type {const} */(['String','Number'])){
    test('dynamically imported ESM descriptor factory '+mode+' '+intrinsic,
      async()=>{
        const input=dynamicFactoryGraph(intrinsic);
        const compiled=obfuscateFiles(input,{
          mode,properties:false,identifiers:false,strings:true,
          seed:'agent5-dynamic-factory/'+mode+'/'+intrinsic
        });
        const target=compiled.files.find(file=>file.path==='target.mjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dynamic-factory-'));
        try{
          const native=await execute(path.join(root,'native'),input,'entry.mjs');
          const transformed=await execute(path.join(root,'transformed'),compiled.files,'entry.mjs');
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(transformed,native,
            'dynamic factory must preserve late-import behavior');
        }finally{
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,intrinsic==='String'?0:1,
          'dynamic sensitive factory must refuse; harmless factory should encode');
      });
  }
}
