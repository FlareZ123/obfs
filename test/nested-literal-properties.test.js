'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {string} code @returns {unknown} */
function evaluate(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return context.module.exports;
}

/** @param {string} code @returns {ReturnType<typeof obfuscateFiles>['files'][number]} */
function obfuscateLocal(code) {
  return obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'nested-literal-property-proof',strings:false,identifiers:false
  }).files[0];
}

for(const [name,source,properties] of [
  ['nested statically named object',
    "const root={secret:{nested:7},fallback:2};module.exports=root.secret.nested+root.fallback;",2],
  ['nested arrays and object literals',
    "const root={items:[{id:7},{id:9}],other:null};module.exports=root.items[0].id+root.items[1].id;",2],
  ['nested static computed string',
    "const root={secret:{['nested']:7}};module.exports=Object.keys(root.secret)[0];",1],
  ['nested null-prototype literal',
    "const root={secret:{__proto__:null,nested:7}};module.exports=root.secret.nested;",1],
  ['nested own shape introspection',
    "const root={secret:{child:7}};module.exports=Object.keys(root.secret);",1]
]) {
  test('safe nested literal value permits outer-key mangling: '+name,()=>{
    const output=obfuscateLocal(source);
    assert.equal(JSON.stringify(evaluate(output.code)),JSON.stringify(evaluate(source)),output.code);
    assert.equal(output.metrics.properties,properties,output.code);
  });
}

for(const [name,source] of [
  ['nested method',
    "const root={secret:{inspect(){return Object.keys(root)[0]}}};module.exports=root.secret.inspect();"],
  ['nested getter',
    "const root={secret:{get inspect(){return 7}}};module.exports=root.secret.inspect;"],
  ['nested spread',
    "const value={child:7};const root={secret:{...value}};module.exports=root.secret.child;"],
  ['nested constructor call',
    "const root={secret:{value:Date.now()}};module.exports=root.secret.value;"],
  ['dynamic computed nested key',
    "const key='child';const root={secret:{[key]:7}};module.exports=root.secret.child;"]
]) {
  test('unproven nested initializer remains unchanged: '+name,()=>{
    const output=obfuscateLocal(source);
    assert.equal(JSON.stringify(evaluate(output.code)),JSON.stringify(evaluate(source)),output.code);
    assert.equal(output.metrics.objects,0,output.code);
  });
}

/**
 * Execute a native two-module ESM graph and report its stdout.
 * @param {ReturnType<typeof obfuscateFiles>['files']|{path:string,code:string,sourceType:'module'}[]} files
 * @returns {Promise<string>}
 */
async function runModules(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nested-proof-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const result=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:10000
    });
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('closed-world named ESM import keeps nested object data and renames outer field',async()=>{
  const files=[
    {path:'model.mjs',sourceType:'module',code:
      "export const data={secret:{nested:11,items:[1,2]},other:3};"},
    {path:'entry.mjs',sourceType:'module',code:
      "import {data} from './model.mjs';process.stdout.write(JSON.stringify([data.secret.nested,data.secret.items[1],data.other]));"}
  ];
  const original=await runModules(files);
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'nested-literal-cross-file',closedWorld:true,
    strings:false,identifiers:false
  });
  assert.equal(result.crossFile.objects,1);
  assert.equal(result.crossFile.properties,2);
  assert.equal(await runModules(result.files),original);
});
