'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/**
 * @param {string} root
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function execute(root,files) {
  await fs.mkdir(root,{recursive:true});
  for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return child.stdout;
}

/**
 * @param {string} mutation
 * @returns {SourceFile[]}
 */
function graph(mutation) {
  const literal='A'.repeat(2048)+'Z';
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');const value=require('./target.cjs');process.stdout.write(value);"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutation},
    {path:'target.cjs',sourceType:'commonjs',code:'module.exports='+JSON.stringify(literal)+';'}
  ];
}

const accessor='const shim={get 0(){return 0;},set 0(value){}};';
for(const [name,mutate] of [
  ['direct','Array.prototype.__proto__=shim;'],
  ['aliased','const proto=Array.prototype;proto.__proto__=shim;'],
  ['computed',"Array.prototype['__proto__']=shim;"]
]) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('inherited Array index setter must disable chunked decoding: '+name+'/'+mode,async()=>{
      const files=graph(accessor+mutate);
      const generated=obfuscateFiles(files,{
        mode,seed:'inherited-array-index-setter/'+name+'/'+mode,properties:false,
        identifiers:false,strings:true
      });
      const target=generated.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-array-proto-decoder-'));
      try{
        const native=await execute(path.join(root,'native'),files);
        const emitted=await execute(path.join(root,'generated'),generated.files);
        assert.equal(native,'A'.repeat(2048)+'Z');
        assert.equal(emitted.charCodeAt(0),native.charCodeAt(0),
          'First chunk may not read inherited Array[0]');
        assert.equal(createHash('sha256').update(emitted).digest('hex'),
          createHash('sha256').update(native).digest('hex'),
          'Chunked decoder must preserve the full original literal');
        assert.equal(target.metrics.literals,0,
          'Compiler must refuse decoder after an Array prototype chain write');
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

test('ordinary graph still emits a working chunked decoder',async()=>{
  const files=graph("module.exports='unrelated';");
  const generated=obfuscateFiles(files,{
    mode:'sno',seed:'baseline-array-index-unmodified',properties:false,
    identifiers:false,strings:true
  });
  const target=generated.files.find(file=>file.path==='target.cjs');
  assert.ok(target);
  assert.equal(target.metrics.literals,1);
  assert.match(String(target.code),/String\.fromCharCode\(\.\.\./u);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-array-proto-control-'));
  try{
    assert.equal(await execute(path.join(root,'native'),files),
      await execute(path.join(root,'generated'),generated.files));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
