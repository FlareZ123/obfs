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

/**
 * @param {string} source
 * @returns {SourceFile[]}
 */
function graph(source) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:source},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('M'.repeat(2048)+'Q')+';'}
  ];
}

/** @param {string} value @returns {string} */
function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

const unsafe=[
  ['array literal spread',
    "function poison(p){p.charCodeAt=()=>0;}poison(...[String.prototype]);"],
  ['nested object property',
    "function poison(o){o.inner.ref.charCodeAt=()=>0;}poison({inner:{ref:String.prototype}});"],
  ['array literal and destructured formal',
    "function poison([p]){p.charCodeAt=()=>0;}poison([String.prototype]);"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('wrapped intrinsic escape must preserve decoder output: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-wrapped-escape/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wrapped-decoder-'));
      try{
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'M'.repeat(2048)+'Q');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(digest(emitted.stdout),digest(native.stdout),
          'Unproved call or tag leaked mutable decoder intrinsic');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

const harmless=[
  ['array spread Number prototype',
    "function read(p){return p.unrelated}read(...[Number.prototype]);"],
  ['nested object Number prototype',
    "function read(o){return o.inner.ref.unrelated}read({inner:{ref:Number.prototype}});"],
  ['array destructuring Number prototype',
    "function read([p]){return p.unrelated}read([Number.prototype]);"]
];

for(const [name,mutator] of harmless) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('safe wrapped Number prototype keeps decoder yield: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'decoder-wrapped-escape/positive/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wrapped-decoder-safe-'));
      try {
        assert.deepEqual(await execute(path.join(root,'native'),input),
          await execute(path.join(root,'emitted'),output.files));
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

for(const mode of /** @type {const} */ (['sno','coo'])) {
  test('existing tagged-template source guard declines encoding: '+mode,async()=>{
    const input=graph("function tag(strings,p){return typeof p}tag\`input\${Number.prototype}\`;");
    const output=obfuscateFiles(input,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'decoder-tagged-template-existing-guard/'+mode
    });
    assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-decoder-tagged-'));
    try{
      assert.deepEqual(await execute(path.join(root,'native'),input),
        await execute(path.join(root,'emitted'),output.files));
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
}
