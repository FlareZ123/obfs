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

/** @param {string} mutator @returns {SourceFile[]} */
function graph(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('B'.repeat(2048)+'T')+';'}
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

const cases=[
  ['array spread bind prototype',
    'const args=[null];const make=Object.create.bind(null,...args);const box=make(DESCRIPTORS);'],
  ['inline spread bind prototype',
    'const make=Object.create.bind(null,...[null]);const box=make(DESCRIPTORS);'],
  ['array spread bind descriptor',
    'const args=[null,DESCRIPTORS];const make=Object.create.bind(null,...args);const box=make();'],
  ['inline spread bind descriptor',
    'const make=Object.create.bind(null,...[null,DESCRIPTORS]);const box=make();'],
  ['interleaved spread bound descriptor',
    'const make=Object.create.bind(null,...[null],DESCRIPTORS);const box=make();'],
  ['array spread bound suffix descriptor',
    'const suffix=[DESCRIPTORS];const make=Object.create.bind(null,null,...suffix);const box=make();'],
  ['call with argument array spread',
    'const args=[null,DESCRIPTORS];const box=Object.create.call(null,...args);'],
  ['apply with aliased argument array',
    'const args=[null,DESCRIPTORS];const box=Object.create.apply(null,args);'],
  ['reflect apply with aliased argument array',
    'const args=[null,DESCRIPTORS];const box=Reflect.apply(Object.create,null,args);'],
  ['ordinary native argument spread',
    'const args=[null,DESCRIPTORS];const box=Object.create(...args);'],
  ['rest-forwarded direct call',
    'function make(...args){return Object.create(...args);}const box=make(null,DESCRIPTORS);'],
  ['factory-returned argument spread',
    'function args(){return [null,DESCRIPTORS];}const box=Object.create(...args());']
];

for(const [name,expression] of cases) {
  for(const mode of /** @type {const} */ (['coo','sno'])) {
    for(const safe of [false,true]) {
      test('spread Object.create descriptor: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const ctor=safe?'Number':'String';
        const descriptor='{ref:{get(){return '+ctor+'.prototype;}}}';
        const source=expression.replace('DESCRIPTORS',descriptor)+
          'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
        const input=graph(source);
        const output=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'object-create-spread/'+name+'/'+mode+'/'+safe
        });
        const target=output.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-create-spread-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const emitted=await execute(path.join(root,'emitted'),output.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(emitted,native,'spread native/emitted parity changed');
        } finally {
          await fs.rm(root,{recursive:true,force:true});
        }
        assert.equal(target.metrics.literals,safe?1:0,
          'spread decoder transformation yield diverged');
      });
    }
  }
}
