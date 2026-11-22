'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

/**
 * @param {string} mutator
 * @returns {CommonJsFile[]}
 */
function graph(mutator){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='protected-literal-value';"}
  ];
}

/**
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-node-vm-parity-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',timeout:10000,windowsHide:true
    });
    if(child.error)throw child.error;
    return {status:child.status,stdout:child.stdout,stderr:child.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

const compiledSource='String.fromCharCode=()=>"?";';
const written=JSON.stringify(compiledSource);

for(const [name,side] of [
  ['vm.runInThisContext','const vm=require("node:vm");vm.runInThisContext('+written+');'],
  ['vm.Script.runInThisContext','const vm=require("node:vm");new vm.Script('+written+').runInThisContext();'],
  ['vm.compileFunction','const vm=require("node:vm");vm.compileFunction('+written+')();']
]){
  test('Node vm dynamic intrinsic mutation preserves cross-file string semantics: '+name,async()=>{
    const input=graph(side);
    const native=await execute(input);
    assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''});
    for(const mode of /** @type {const} */ (['sno','coo'])){
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'node-vm-ambient-mutation/'+name+'/'+mode
      });
      const emitted=await execute(output.files);
      assert.deepEqual(emitted,native,mode+' changed behavior after VM-originated ambient mutation');
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0,
        mode+' encoded a literal after VM-originated ambient String mutation');
    }
  });
}

test('read-only Node vm use retains unrelated string encoding',async()=>{
  const input=graph('const vm=require("node:vm");const isContext=vm.isContext({});if(isContext)throw Error("unexpected");');
  const native=await execute(input);
  assert.equal(native.status,0,native.stderr);
  const output=obfuscateFiles(input,{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'node-vm-ambient-mutation/read-only'
  });
  assert.ok((output.files.find(file=>file.path==='target.cjs')?.metrics.literals??0)>0,
    'Read-only vm usage must preserve positive literal rewrite coverage');
  assert.deepEqual(await execute(output.files),native);
});
