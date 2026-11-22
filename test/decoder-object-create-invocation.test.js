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
      code:'module.exports='+JSON.stringify('A'.repeat(2048)+'K')+';'}
  ];
}

const cases=[
  ['Object.create.call',
    'const box=Object.create.call(null,null,DESCRIPTORS);'],
  ['Object.create.apply',
    'const box=Object.create.apply(null,[null,DESCRIPTORS]);'],
  ['Reflect.apply(Object.create)',
    'const box=Reflect.apply(Object.create,null,[null,DESCRIPTORS]);'],
  ['immediate native bind',
    'const box=Object.create.bind(null)(null,DESCRIPTORS);'],
  ['captured native bind',
    'const maker=Object.create.bind(null);const box=maker(null,DESCRIPTORS);'],
  ['native method object holder',
    'const holder={factory:Object.create};const box=holder.factory(null,DESCRIPTORS);'],
  ['native method assigned holder',
    'const holder={};holder.factory=Object.create;const box=holder.factory(null,DESCRIPTORS);'],
  ['native method destructuring',
    'const {create}=Object;const box=create(null,DESCRIPTORS);'],
  ['two-hop captured alias',
    'const make=Object.create;const alias=make;const box=alias(null,DESCRIPTORS);'],
  ['prebound descriptor map',
    'const create=Object.create;const maker=create.bind(null,null,DESCRIPTORS);'+
    'const box=maker();'],
  ['prebound prototype with invocation-time descriptor map',
    'const create=Object.create;const maker=create.bind(null,null);'+
    'const box=maker(DESCRIPTORS);'],
  ['prebound prototype via bound callable call',
    'const create=Object.create;const maker=create.bind(null,null);'+
    'const box=maker.call(null,DESCRIPTORS);'],
  ['prebound prototype via bound callable apply',
    'const create=Object.create;const maker=create.bind(null,null);'+
    'const box=maker.apply(null,[DESCRIPTORS]);'],
  ['prebound prototype via Reflect.apply bound callable',
    'const create=Object.create;const maker=create.bind(null,null);'+
    'const box=Reflect.apply(maker,null,[DESCRIPTORS]);'],
  ['prebound prototype through nested bind',
    'const create=Object.create;const maker=create.bind(null,null);'+
    'const twice=maker.bind(null);const box=twice(DESCRIPTORS);'],
  ['prebound prototype through holder field',
    'const create=Object.create;const holder={maker:create.bind(null,null)};'+
    'const box=holder.maker(DESCRIPTORS);'],
  ['prebound prototype through copied holder field',
    'const create=Object.create;const first={maker:create.bind(null,null)};'+
    'const holder=first;const box=holder.maker(DESCRIPTORS);'],
  ['captured method in array holder',
    'const create=Object.create;const methods=[create];'+
    'const box=methods[0](null,DESCRIPTORS);'],
  ['captured method in local helper',
    'const create=Object.create;const helper=fn=>fn(null,DESCRIPTORS);'+
    'const box=helper(create);']
];

for(const [name,expression] of cases) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    for(const safe of [false,true]) {
      test('first-class Object.create call: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const ctor=safe?'Number':'String';
        const descriptor='{ref:{get(){return '+ctor+'.prototype;}}}';
        const source=expression.replace('DESCRIPTORS',descriptor)+
          'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
        const input=graph(source);
        const output=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'create-invoke/'+name+'/'+mode+'/'+safe
        });
        const target=output.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-create-invoke-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const emitted=await execute(path.join(root,'emitted'),output.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(emitted,native,'native/emitted call behavior diverged');
        } finally {
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,safe?1:0,
          'unexpected decoder yield for first-class Object.create call');
      });
    }
  }
}
