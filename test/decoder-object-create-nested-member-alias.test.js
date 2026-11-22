'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
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
  const child=require('node:child_process').spawnSync(
    process.execPath,[path.join(directory,'entry.cjs')],{
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
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

/** @param {'String'|'Number'} target @returns {SourceFile[]} */
function crossFileGraph(target) {
  const mutation=target==='String'?
    'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;';
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');require('./factory.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'descriptors.cjs',sourceType:'commonjs',code:'module.exports={ref:{}};'},
    {path:'mutator.cjs',sourceType:'commonjs',
      code:"const descriptors=require('./descriptors.cjs');const entry=descriptors.ref;entry.get=()=>"+target+".prototype;"},
    {path:'factory.cjs',sourceType:'commonjs',
      code:"const descriptors=require('./descriptors.cjs');const box=Object.create(null,descriptors);"+mutation+"module.exports=box;"},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}


/** @type {{name:string,setup:string}[]} */
const variants=[
  {
    name:'single member-expression alias',
    setup:'const entry=descriptors.ref;entry.get=()=>TARGET.prototype;'
  },
  {
    name:'multi-hop member-expression alias',
    setup:'const first=descriptors.ref;const entry=first;entry.get=()=>TARGET.prototype;'
  },
  {
    name:'computed member-expression alias',
    setup:"const entry=descriptors['ref'];entry.get=()=>TARGET.prototype;"
  },
  {
    name:'assigned member-expression alias',
    setup:'let entry;entry=descriptors.ref;entry.get=()=>TARGET.prototype;'
  },
  {
    name:'Object.assign through member-expression alias',
    setup:'const entry=descriptors.ref;Object.assign(entry,{get:()=>TARGET.prototype});'
  },
  {
    name:'Object.defineProperty through member-expression alias',
    setup:"const entry=descriptors.ref;Object.defineProperty(entry,'get',{value:()=>TARGET.prototype});"
  },
  {
    name:'destructured nested descriptor alias',
    setup:'const {ref:entry}=descriptors;entry.get=()=>TARGET.prototype;'
  },
  {
    name:'direct nested member write baseline',
    setup:'descriptors.ref.get=()=>TARGET.prototype;'
  },
  {
    name:'dynamic member-expression alias',
    setup:"const key='ref';const entry=descriptors[key];entry.get=()=>TARGET.prototype;"
  },
  {
    name:'dynamic nested member write',
    setup:"const key='ref';descriptors[key].get=()=>TARGET.prototype;"
  },
  {
    name:'function-parameter nested alias',
    setup:'function install(entry){entry.get=()=>TARGET.prototype;}install(descriptors.ref);'
  },
  {
    name:'returned nested alias',
    setup:'function getEntry(){return descriptors.ref;}const entry=getEntry();entry.get=()=>TARGET.prototype;'
  }
];

/** @param {string} setup @param {'String'|'Number'} target @returns {string} */
function mutatorFor(setup,target) {
  return 'const descriptors={ref:{}};'+setup.replaceAll('TARGET',target)+
    'const box=Object.create(null,descriptors);'+
    (target==='String'?'box.ref.charCodeAt=()=>0;':'box.ref.unrelated=1;');
}

/**
 * Every mutation shape has a decoder-sensitive String case and a matched
 * harmless Number control. The direct-member baseline confirms the existing
 * obvious path is still recognized while nested aliases are varied.
 */
for(const variant of variants) {
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    test('Object.create descriptor member alias blocks String decoder: '+
      variant.name+' / '+mode,async()=>{
      const input=graph(mutatorFor(variant.setup,'String'));
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-nested-member-alias/'+variant.name+'/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-nested-alias-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Obfuscated eager decoder diverged from native source');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,0,
        'Decoder-sensitive nested descriptor alias must block eager encoding');
    });
    test('Object.create descriptor member alias Number positive yield: '+
      variant.name+' / '+mode,async()=>{
      const input=graph(mutatorFor(variant.setup,'Number'));
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-nested-member-alias-number/'+variant.name+'/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-nested-number-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Benign Number.prototype descriptor changed native behavior');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,1,
        'Harmless Number.prototype access must retain positive decoder yield');
    });
  }
}


for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test('cross-file shared descriptor map String mutation remains native: '+mode,
    async()=>{
      const input=crossFileGraph('String');
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-cross-file-nested-alias/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-cross-file-alias-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Cross-file shared descriptor alias changed native behavior');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,0,
        'Cross-file shared descriptor alias must block eager decoder encoding');
    });
  test('cross-file shared descriptor map Number control retains yield: '+mode,
    async()=>{
      const input=crossFileGraph('Number');
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-cross-file-nested-alias-number/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-cross-file-number-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.deepEqual(protectedRun,native,
          'Cross-file Number descriptor changed native behavior');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,1,
        'Cross-file Number control must retain positive decoder yield');
    });
}


/** A safe Object.create plus an unrelated getter-like property write. */
function unrelatedAccessorGraph() {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');require('./factory.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',
      code:'const unrelated={};unrelated.get=()=>String.prototype;'},
    {path:'factory.cjs',sourceType:'commonjs',
      code:'const descriptors={ref:{}};const box=Object.create(null,descriptors);box.ref.charCodeAt=()=>0;'},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('Z'.repeat(2048)+'P')+';'}
  ];
}

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  test('unrelated getter-like write must not suppress safe string encoding: '+mode,
    async()=>{
      const input=unrelatedAccessorGraph();
      const emitted=obfuscateFiles(input,{
        mode,strings:true,identifiers:false,properties:false,
        seed:'agent42-unrelated-getter-positive/'+mode
      });
      const target=emitted.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-agent42-unrelated-getter-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const protectedRun=await execute(path.join(root,'emitted'),emitted.files);
        assert.equal(native.status,0,native.stderr);
        assert.ok(protectedRun.status===native.status&&
          protectedRun.stdout===native.stdout&&protectedRun.stderr===native.stderr,
          'Unrelated getter-like write changed native behavior');
      } finally {
        await fs.rm(root,{recursive:true,force:true});
      }
      assert.equal(target.metrics.literals,1,
        'Unrelated getter-like write must retain positive string-encoding yield');
    });
}
