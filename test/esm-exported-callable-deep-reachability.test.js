'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const pathModule=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Run an external ESM observer that is not part of the compiler input group.
 * @param {SourceFile[]} files
 * @param {string} observer
 * @returns {Promise<string>}
 */
async function observe(files,observer){
  const root=await fs.mkdtemp(pathModule.join(os.tmpdir(),'obfs-callable-deep-'));
  try{
    for(const file of files){
      const target=pathModule.join(root,file.path);
      await fs.mkdir(pathModule.dirname(target),{recursive:true});
      await fs.writeFile(target,String(file.code),'utf8');
    }
    const target=pathModule.join(root,'observer.mjs');
    await fs.writeFile(target,observer,'utf8');
    const child=spawnSync(process.execPath,[target],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @type {Array<{name:string,files:SourceFile[],observer:string}>} */
const fixtures=[
  {
    name:'inherited methods and accessors expose base-class callables',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function hidden(secretParam){return secretParam+9;}'+
      'class Base{get reader(){return hidden;}read(secretParam){return secretParam+10;}}'+
      'export class Derived extends Base{}'}],
    observer:'import {Derived} from "./private.mjs";const instance=new Derived();'+
      'const reader=instance.reader;const method=instance.read;'+
      'console.log(JSON.stringify([Function.prototype.toString.call(Derived),'+
      'Function.prototype.toString.call(reader),reader(4),'+
      'Function.prototype.toString.call(method),method.call(instance,5)]));'
  },
  {
    name:'constructor-returned aggregate exposes callable members',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function hidden(secretParam){return secretParam+5;}'+
      'export class Api{constructor(){return {read:hidden};}}'}],
    observer:'import {Api} from "./private.mjs";const instance=new Api();'+
      'console.log(JSON.stringify([Function.prototype.toString.call(Api),'+
      'Function.prototype.toString.call(instance.read),instance.read(3)]));'
  },
  {
    name:'static block publishes a private callable',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function hidden(secretParam){return secretParam+6;}'+
      'export class Api{static{this.read=hidden;}}'}],
    observer:'import {Api} from "./private.mjs";'+
      'console.log(JSON.stringify([Function.prototype.toString.call(Api),'+
      'Function.prototype.toString.call(Api.read),Api.read(3)]));'
  },
  {
    name:'generator yield publishes a private callable',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function hidden(secretParam){return secretParam+7;}'+
      'export function* stream(){yield hidden;}'}],
    observer:'import {stream} from "./private.mjs";const fn=stream().next().value;'+
      'console.log(JSON.stringify([Function.prototype.toString.call(stream),'+
      'Function.prototype.toString.call(fn),fn(3)]));'
  },
  {
    name:'async factory result publishes a private callable',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function hidden(secretParam){return secretParam+8;}'+
      'async function make(){return hidden;}'+
      'export async function get(){return await make();}'}],
    observer:'import {get} from "./private.mjs";const fn=await get();'+
      'console.log(JSON.stringify([Function.prototype.toString.call(get),'+
      'Function.prototype.toString.call(fn),fn(3)]));'
  }
];

for(const mode of /** @type {const} */ (['coo','sco','sno'])){
  for(const fixture of fixtures){
    test('deep exported callable reachability: '+mode+' / '+fixture.name,async()=>{
      const native=await observe(fixture.files,fixture.observer);
      const transformed=obfuscateFiles(fixture.files,{
        mode,closedWorld:true,seed:'deep-callable-source-'+mode+'-'+fixture.name,
        strings:false,properties:false,identifiers:true
      });
      const emitted=await observe(transformed.files,fixture.observer);
      assert.equal(emitted,native,
        'external Function.prototype.toString and callable results must remain identical');
    });
  }
}

module.exports={observe};
