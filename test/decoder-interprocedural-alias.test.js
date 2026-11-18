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

/**
 * @param {string} mutator
 * @returns {SourceFile[]}
 */
function graph(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('X'.repeat(2048)+'Z')+';'}
  ];
}

const unsafe=[
  ['String prototype forwarded into a local function',
    "function poison(p){p.charCodeAt=()=>0;}poison(String.prototype);"],
  ['String constructor forwarded into a local function',
    "function poison(C){C.fromCharCode=()=>'?';}poison(String);"],
  ['opaque String prototype forwarded into a local function',
    "function owner(){return 'u'}function poison(p){p.charCodeAt=()=>0;}poison(Object.getPrototypeOf(owner()));"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('interprocedural ambient decoder mutation must refuse: '+name+'/'+mode,async()=>{
      const input=graph(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'interprocedural-decoder/'+name+'/'+mode
      });
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-param-decoder-'));
      try {
        const native=await execute(path.join(root,'native'),input);
        const emitted=await execute(path.join(root,'emitted'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'X'.repeat(2048)+'Z');
        assert.equal(emitted.status,native.status,emitted.stderr);
        assert.equal(emitted.stdout,native.stdout,
          'Generated decoder must preserve a source-visible prototype mutation');
        assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0,
          'Sensitive intrinsic escaping into an opaque function must refuse decoding');
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

for(const mode of /** @type {const} */ (['sno','coo'])) {
  test('known unrelated Number prototype parameter retains encoded work: '+mode,async()=>{
    const input=graph("function poison(p){p.charCodeAt=()=>0;}poison(Number.prototype);");
    const output=obfuscateFiles(input,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'interprocedural-decoder/safe-number/'+mode
    });
    assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-param-decoder-safe-'));
    try{
      assert.deepEqual(await execute(path.join(root,'native'),input),
        await execute(path.join(root,'emitted'),output.files));
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
}
