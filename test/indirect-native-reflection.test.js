'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleInput */

/**
 * @param {string} body
 * @returns {ModuleInput[]}
 */
function sources(body) {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={hotScore:7,hotWeight:13};'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";\n'+body}
  ];
}

/**
 * @param {string} dir
 * @param {{path:string,code:string|Buffer}[]} files
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(dir,files) {
  for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(dir,'entry.mjs')],{
    encoding:'utf8',timeout:10000
  });
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * A closed-world static source graph can still use the Function constructor
 * recovered through a builtin function's .constructor property. The
 * dynamically recovered native object is not a lexical Object/Reflect alias.
 * These tests require safe refusal if the source analyzer cannot prove its
 * native method is unchanged, while a normal direct read must retain yield.
 */
test('direct reflection proof checks indirectly mutated native methods',async()=>{
  const cases=[
    {
      name:'unaltered Reflect.has control',
      body:'console.log(Reflect.has(state,"hotScore"),state.hotWeight);',
      expectedRenames:2
    },
    {
      name:'Function-constructor recovered Reflect.has',
      body:[
        'const nativeReflect=[].filter.constructor("return "+"Reflect")();',
        'const original=nativeReflect.has;',
        'nativeReflect.has=(owner,key)=>key==="hotScore"&&original(owner,key);',
        'console.log(Reflect.has(state,"hotScore"),state.hotWeight);'
      ].join(''),
      expectedRenames:0
    },
    {
      name:'Function-constructor recovered Object.hasOwn',
      body:[
        'const nativeObject=[].filter.constructor("return "+"Object")();',
        'const original=nativeObject.hasOwn;',
        'nativeObject.hasOwn=(owner,key)=>key==="hotWeight"&&original(owner,key);',
        'console.log(Object.hasOwn(state,"hotWeight"),state.hotScore);'
      ].join(''),
      expectedRenames:0
    }
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflect-indirect-'));
  try {
    const nativeDir=path.join(root,'native');
    const protectedDir=path.join(root,'protected');
    await fs.mkdir(nativeDir);
    await fs.mkdir(protectedDir);
    for(const fixture of cases){
      const input=sources(fixture.body);
      const transformed=obfuscateFiles(input,{
        mode:'coo',closedWorld:true,
        seed:'indirect-reflect-host/'+fixture.name,
        identifiers:false,strings:false
      });
      const native=await execute(nativeDir,input);
      const protectedRun=await execute(protectedDir,transformed.files);
      assert.equal(native.status,0,fixture.name+': '+native.stderr);
      assert.equal(protectedRun.status,0,fixture.name+': '+protectedRun.stderr);
      console.log(JSON.stringify({
        name:fixture.name,
        rewritten:transformed.crossFile.properties,
        native:native.stdout.trim(),
        protected:protectedRun.stdout.trim()
      }));
      assert.equal(protectedRun.stdout,native.stdout,
        fixture.name+': original/protected output diverged');
      assert.equal(transformed.crossFile.properties,fixture.expectedRenames,
        fixture.name+': unexpected closed-world reflection admission');
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
