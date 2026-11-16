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
 * Execute the same CommonJS files in a fresh process, preserving side-effect order.
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-alias-'));
  try {
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const run=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      encoding:'utf8',timeout:10000
    });
    if(run.error)throw run.error;
    return {status:run.status,stdout:run.stdout,stderr:run.stderr};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @param {string} side @returns {CommonJsFile[]} */
function graph(side) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:side},
    {path:'target.cjs',sourceType:'commonjs',
      code:"module.exports='protected-literal-value';"}
  ];
}

for(const [title,side] of [
  ['captured Reflect.set',
    'const mutate=Reflect.set;mutate(String,"fromCharCode",()=>"?");'],
  ['captured Object.defineProperty',
    'const mutate=Object.defineProperty;mutate(String,"fromCharCode",{value:()=>"?!"});'],
  ['destructured Reflect.set',
    'const {set:mutate}=Reflect;mutate(String,"fromCharCode",()=>"?");'],
  ['destructured Object.defineProperty',
    'const {defineProperty:mutate}=Object;mutate(String,"fromCharCode",{value:()=>"?!"});'],
  ['Reflect constructor alias',
    'const R=Reflect;R.set(String,"fromCharCode",()=>"?");'],
  ['Object constructor alias',
    'const O=Object;O.defineProperty(String,"fromCharCode",{value:()=>"?!"});'],
  ['globalThis.Reflect alias',
    'const R=globalThis.Reflect;R.set(String,"fromCharCode",()=>"?");'],
  ['direct global Reflect receiver',
    'globalThis.Reflect.set(String,"fromCharCode",()=>"?");'],
  ['direct global Object receiver',
    'globalThis.Object.defineProperty(String,"fromCharCode",{value:()=>"?!"});'],
  ['transitive global Reflect receiver',
    'const Root=globalThis;Root.Reflect.set(String,"fromCharCode",()=>"?");'],
  ['destructured global Reflect receiver',
    'const {Reflect:R}=globalThis;R.set(String,"fromCharCode",()=>"?");'],
  ['static computed Reflect method',
    'Reflect["s"+"et"](String,"fromCharCode",()=>"?");'],
  ['dynamic computed Reflect method',
    'const method="set";Reflect[method](String,"fromCharCode",()=>"?");'],
  ['statically computed Object method',
    'Object["define"+"Property"](String,"fromCharCode",{value:()=>"?!"});'],
  ['Reflect.set through Function.call',
    'Reflect.set.call(null,String,"fromCharCode",()=>"?");'],
  ['Reflect.set through Reflect.apply',
    'Reflect.apply(Reflect.set,null,[String,"fromCharCode",()=>"?"]);'],
  ['direct Reflect.get of String',
    'Reflect.get(globalThis,"String").fromCharCode=()=>"?";'],
  ['computed Reflect.get of String',
    'Reflect["g"+"et"](globalThis,"String").fromCharCode=()=>"?";'],
  ['direct Reflect.get prototype mutation',
    'Reflect.get(globalThis,"String").prototype.charCodeAt=()=>0;'],
  ['Object.getPrototypeOf direct string prototype mutation',
    'Object.getPrototypeOf("").charCodeAt=()=>0;'],
  ['Reflect.getPrototypeOf direct string prototype mutation',
    'Reflect.getPrototypeOf(new String("x")).charCodeAt=()=>0;'],
  ['Object.getOwnPropertyDescriptor of global String',
    'Object.getOwnPropertyDescriptor(globalThis,"String").value.fromCharCode=()=>"?";'],
  ['Object.getOwnPropertyDescriptors of global String',
    'Object.getOwnPropertyDescriptors(globalThis).String.value.fromCharCode=()=>"?";'],
  ['Object.defineProperty through Function.call',
    'Object.defineProperty.call(null,String,"fromCharCode",{value:()=>"?!"});']
]) {
  test('SNO/COO declines reflective mutator indirection: '+title,async()=>{
    const files=graph(side);
    const native=await execute(files);
    assert.deepEqual(native,{status:0,stdout:'protected-literal-value',stderr:''},title);
    for(const mode of /** @type {const} */ (['sno','coo'])) {
      const output=obfuscateFiles(files,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'reflective-mutator/'+title
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,0,
        mode+' installed a decoder after an unmodeled reflective intrinsic mutation');
      assert.deepEqual(await execute(output.files),native,mode+' changed literal semantics');
    }
  });
}

test('single-file transformation reproduces actual corrupted runtime when a preceding mutation is omitted',async()=>{
  const files=graph('const mutate=Reflect.set;mutate(String,"fromCharCode",()=>"?");');
  const original=await execute(files);
  assert.equal(original.stdout,'protected-literal-value');

  // A single-file compile cannot inspect the omitted side module. Splicing
  // that emitted output into the larger execution graph is an intentional
  // negative control demonstrating why whole-group provenance matters.
  const isolated=obfuscateFiles([files[2]],{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'reflective-mutator/unguarded-single-file'
  });
  assert.ok(isolated.files[0].metrics.literals>0);
  const corrupted=await execute([files[0],files[1],isolated.files[0]]);
  assert.equal(corrupted.status,0,corrupted.stderr);
  assert.notEqual(corrupted.stdout,original.stdout,
    'Mutation of String.fromCharCode must corrupt the unsafe generated decoder');

  const whole=obfuscateFiles(files,{
    mode:'sno',strings:true,properties:false,identifiers:false,
    seed:'reflective-mutator/unguarded-single-file'
  });
  assert.equal(whole.files.find(file=>file.path==='target.cjs')?.metrics.literals,0);
  assert.deepEqual(await execute(whole.files),original);
});

for(const [title,side] of [
  ['direct Reflect.set on unrelated object','Reflect.set({},"answer",41);'],
  ['aliased Reflect.set on unrelated object','const R=Reflect;R.set({},"answer",41);'],
  ['direct Object.defineProperty on unrelated object',
    'Object.defineProperty({},"answer",{value:41});'],
  ['read-only Reflect.get','const value=Reflect.get({answer:41},"answer");']
]) {
  test('unrelated reflection keeps decoder enabled: '+title,()=>{
    const output=obfuscateFiles(graph(side),{
      mode:'sno',strings:true,properties:false,identifiers:false,
      seed:'reflective-mutator/control/'+title
    });
    assert.ok(output.files.find(file=>file.path==='target.cjs')?.metrics.literals);
  });
}
