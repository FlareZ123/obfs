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

/** @param {string} source @returns {SourceFile[]} */
function graph(source) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:source},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

const variants=[
  ['local descriptor map',
    'const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const box=Object.create(null,descriptors);'],
  ['local descriptor map alias',
    'const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const other=descriptors;const box=Object.create(null,other);'],
  ['first-class Object.create',
    'const create=Object.create;'+
    'const box=create(null,{ref:{get(){return TARGET.prototype}}});'],
  ['first-class create with mapped descriptor',
    'const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const create=Object.create;const box=create(null,descriptors);'],
  ['computed descriptor key',
    'const key="ref";const descriptors={[key]:{get(){return TARGET.prototype}}};'+
    'const box=Object.create(null,descriptors);'],
  ['destructured Object.create',
    'const {create}=Object;'+
    'const box=create(null,{ref:{get(){return TARGET.prototype}}});'],
  ['multi-hop first-class Object.create',
    'const create=Object.create;const capture=create;'+
    'const box=capture(null,{ref:{get(){return TARGET.prototype}}});'],
  ['computed getter name',
    'const key="get";const descriptors={ref:{[key](){return TARGET.prototype}}};'+
    'const box=Object.create(null,descriptors);'],
  ['map entry assigned before create',
    'const descriptors={};descriptors.ref={get(){return TARGET.prototype}};'+
    'const box=Object.create(null,descriptors);'],
  ['getter assigned to descriptor',
    'const descriptor={};descriptor.get=()=>TARGET.prototype;'+
    'const descriptors={ref:descriptor};'+
    'const box=Object.create(null,descriptors);'],
  ['map Object.assign construction',
    'const descriptors=Object.assign({},{ref:{get(){return TARGET.prototype}}});'+
    'const box=Object.create(null,descriptors);'],
  ['first-class method called with call',
    'const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const box=Object.create.call(Object,null,descriptors);'],
  ['destructured assignment of create',
    'let create;({create}=Object);'+
    'const box=create(null,{ref:{get(){return TARGET.prototype}}});'],
  ['computed destructure capture',
    'const key="create";const {[key]:create}=Object;'+
    'const box=create(null,{ref:{get(){return TARGET.prototype}}});'],
  ['captured create.call',
    'const create=Object.create;const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const box=create.call(null,null,descriptors);'],
  ['captured create.apply',
    'const create=Object.create;const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const box=create.apply(null,[null,descriptors]);'],
  ['Reflect.apply captured create',
    'const create=Object.create;const descriptors={ref:{get(){return TARGET.prototype}}};'+
    'const box=Reflect.apply(create,null,[null,descriptors]);'],
  ['sequence callee alias',
    'const create=Object.create;'+
    'const box=(0,create)(null,{ref:{get(){return TARGET.prototype}}});'],
  ['local descriptor factory',
    'function make(){return {ref:{get(){return TARGET.prototype}}}};'+
    'const box=Object.create(null,make());'],
  ['descriptor map alias write',
    'const descriptors={};const alias=descriptors;'+
    'alias.ref={get(){return TARGET.prototype}};'+
    'const box=Object.create(null,descriptors);'],
  ['inner descriptor object alias write',
    'const descriptor={};const alias=descriptor;'+
    'alias.get=function(){return TARGET.prototype};'+
    'const descriptors={ref:descriptor};'+
    'const box=Object.create(null,descriptors);'],
  ['descriptor-map member-read alias write',
    'const descriptors={ref:{}};const entry=descriptors.ref;'+
    'entry.get=function(){return TARGET.prototype};'+
    'const box=Object.create(null,descriptors);']
];

for(const [name,mutator] of variants) {
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    for(const safe of [false,true]) {
      test('Object.create alias descriptor parity: '+name+'/'+mode+'/'+
        (safe?'Number positive':'String unsafe'),async()=>{
        const source=mutator.replace('TARGET',safe?'Number':'String')+
          'box.ref.'+(safe?'unrelated=1;':'charCodeAt=()=>0;');
        const input=graph(source);
        const emitted=obfuscateFiles(input,{
          mode,strings:true,identifiers:false,properties:false,
          seed:'object-create-aliased-map/'+name+'/'+mode+'/'+safe
        });
        const target=emitted.files.find(file=>file.path==='target.cjs');
        assert.ok(target);
        const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-create-descriptor-alias-'));
        try {
          const native=await execute(path.join(root,'native'),input);
          const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
          assert.equal(native.status,0,native.stderr);
          assert.deepEqual(protectedRun,native,
            'Obfuscated eager decoder diverged from native source');
        } finally {
          await fs.rm(root,{recursive:true,force:true});
        }
        // A computed Object destructuring key is still unproved in the
        // broader scanner, so its benign path conservatively declines too.
        const expectedYield=safe&&name!=='computed destructure capture'?1:0;
        assert.equal(target.metrics.literals,expectedYield,
          'Documented native-parity and decoder-yield boundary');
      });
    }
  }
}

test('unrelated String getter and empty Object.create retain positive decoder work',async()=>{
  const input=graph(
    'const unused={get(){return String.prototype}};'+
    'const box=Object.create(null,{});box.unrelated=17;');
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const out=obfuscateFiles(input,{mode,strings:true,identifiers:false,
      properties:false,seed:'object-create-precision-positive'});
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-create-independent-'));
    try{
      assert.deepEqual(await execute(path.join(root,'native'),input),
        await execute(path.join(root,'emitted'),out.files));
    } finally {
      await fs.rm(root,{recursive:true,force:true});
    }
    assert.equal(out.files.find(file=>file.path==='target.cjs')?.metrics.literals,1,
      mode+' must retain genuine encoding for unrelated getter');
  }
});
