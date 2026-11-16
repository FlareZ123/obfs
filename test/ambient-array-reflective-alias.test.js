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
const literal='v'.repeat(2048);

/**
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-array-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const proc=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
      encoding:'utf8',timeout:10000
    });
    if(proc.error)throw proc.error;
    return {status:proc.status,stdout:proc.stdout,stderr:proc.stderr};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} side
 * @returns {CommonJsFile[]}
 */
function graph(side){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:side},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify(literal)+';'}
  ];
}

const patch='[Symbol.iterator]=function*(){yield 0;};';
for(const [name,expression] of [
  ['Reflect.getPrototypeOf array literal','Reflect.getPrototypeOf([])'],
  ['captured Reflect.getPrototypeOf','(()=>{const reflect=Reflect.getPrototypeOf;return reflect([]);})()'],
  ['Reflect.get Array prototype','Reflect.get(Array,"prototype")'],
  ['Reflect.get global Array constructor','Reflect.get(globalThis,"Array").prototype'],
  ['Object.getOwnPropertyDescriptor Array prototype',
    'Object.getOwnPropertyDescriptor(Array,"prototype").value'],
  ['Object.getOwnPropertyDescriptors Array prototype',
    'Object.getOwnPropertyDescriptors(Array).prototype.value'],
  ['Object.getOwnPropertyDescriptor global Array constructor',
    'Object.getOwnPropertyDescriptor(globalThis,"Array").value.prototype']
]){
  test('chunked decoder declines reflective Array iterator change: '+name,async()=>{
    const files=graph(expression+patch);
    const native=await execute(files);
    assert.equal(native.status,0,name+': '+native.stderr);
    assert.equal(native.stdout,literal);
    for(const mode of /** @type {const} */ (['sno','coo'])){
      const output=obfuscateFiles(files,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'reflective-array-iterator/'+name
      });
      const target=output.files.find(file=>file.path==='target.cjs');
      assert.equal(target?.metrics.literals,0,
        mode+' emitted a spread-based decoder after a mutated iterator');
      assert.deepEqual(await execute(output.files),native);
    }
  });
}

test('single-file chunked decoder visibly corrupts output when an earlier Array iterator patch is omitted',async()=>{
  const files=graph('Reflect.get(Array,"prototype")[Symbol.iterator]=function*(){yield 0;};');
  const native=await execute(files);
  assert.equal(native.stdout,literal);
  const solo=obfuscateFiles([files[2]],{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'reflective-array-iterator/negative-control'
  });
  assert.ok(solo.files[0].metrics.literals>0);
  const corrupted=await execute([files[0],files[1],solo.files[0]]);
  assert.equal(corrupted.status,0,corrupted.stderr);
  assert.notEqual(corrupted.stdout,native.stdout);
  const whole=obfuscateFiles(files,{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'reflective-array-iterator/negative-control'
  });
  assert.equal(whole.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
  assert.deepEqual(await execute(whole.files),native);
});

for(const [name,source] of [
  ['Reflect.get unrelated data','const x=Reflect.get({foo:12},"foo");'],
  ['Reflect.getPrototypeOf unrelated object','const p=Reflect.getPrototypeOf({});'],
  ['Object.getOwnPropertyDescriptor unrelated field',
    'const desc=Object.getOwnPropertyDescriptor({foo:12},"foo");']
]){
  test('unrelated reflective operations retain chunked string encoding: '+name,()=>{
    const output=obfuscateFiles(graph(source),{
      mode:'sno',strings:true,properties:false,identifiers:false,
      seed:'reflective-array-iterator/control/'+name
    });
    assert.ok(output.files.find(file=>file.path==='target.cjs')?.metrics.literals);
  });
}
