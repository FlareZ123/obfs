'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,files:SourceFile[],observer:string}} Fixture */

/**
 * The importer is intentionally absent from the compiler's source-file group.
 * It inspects a callable reached through an exported aggregate or return value.
 * @param {SourceFile[]} files
 * @param {string} observer
 * @returns {Promise<string>}
 */
async function observe(files,observer) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-exported-callable-aggregate-'));
  try {
    for(const file of files) {
      const target=path.join(root,file.path);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,String(file.code),'utf8');
    }
    const observerPath=path.join(root,'observer.mjs');
    await fs.writeFile(observerPath,observer,'utf8');
    const child=spawnSync(process.execPath,[observerPath],{
      cwd:root,encoding:'utf8',timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return child.stdout.trim();
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @type {Fixture[]} */
const fixtures=[
  {
    name:'exported object shorthand references a private function binding',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function read(secretParam){return secretParam+1;}export const api={read};'}],
    observer:'import {api} from "./private.mjs";const fn=api.read;console.log(JSON.stringify([fn.toString(),fn(3)]));'
  },
  {
    name:'exported object member references a private alias',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function read(secretParam){return secretParam+2;}const local=read;export const api={read:local};'}],
    observer:'import {api} from "./private.mjs";const fn=api.read;console.log(JSON.stringify([fn.toString(),fn(3)]));'
  },
  {
    name:'exported array contains a private function binding',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function read(secretParam){return secretParam+3;}export const api=[read];'}],
    observer:'import {api} from "./private.mjs";const fn=api[0];console.log(JSON.stringify([fn.toString(),fn(3)]));'
  },
  {
    name:'exported instance exposes a method on a private class',
    files:[{path:'private.mjs',sourceType:'module',code:
      'class Api{read(secretParam){return secretParam+4;}}export const instance=new Api();'}],
    observer:'import {instance} from "./private.mjs";const fn=instance.read;console.log(JSON.stringify([fn.toString(),fn.call(instance,3)]));'
  },
  {
    name:'exported function returns a private callable',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function hidden(secretParam){return secretParam+5;}export function make(){return hidden;}'}],
    observer:'import {make} from "./private.mjs";const fn=make();console.log(JSON.stringify([fn.toString(),fn(3)]));'
  },
  {
    name:'exported getter returns a private callable',
    files:[{path:'private.mjs',sourceType:'module',code:
      'function hidden(secretParam){return secretParam+6;}export const api={get read(){return hidden;}};'}],
    observer:'import {api} from "./private.mjs";const fn=api.read;console.log(JSON.stringify([fn.toString(),fn(3)]));'
  }
];

/**
 * Check external callable source text and ordinary results across all modes.
 * A safe compiler refusal is valid; positive yield is measured separately.
 */
for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  for(const fixture of fixtures) {
    test('external callable source parity: '+mode+' / '+fixture.name,async()=>{
      const native=await observe(fixture.files,fixture.observer);
      const transformed=obfuscateFiles(fixture.files,{
        mode,closedWorld:true,seed:'exported-callable-aggregate-'+mode+'-'+fixture.name,
        strings:false,properties:false,identifiers:true
      });
      const bindings=transformed.files.reduce((sum,file)=>sum+file.metrics.bindings,0);
      const emitted=await observe(transformed.files,fixture.observer);
      const sourceEqual=emitted===native;
      const valueEqual=JSON.parse(emitted)[1]===JSON.parse(native)[1];
      console.log('EXPORTED_CALLABLE_AGGREGATE '+JSON.stringify({
        mode,case:fixture.name,bindings,sourceEqual,valueEqual
      }));
      assert.equal(valueEqual,true,'ordinary callable result must remain equal');
      assert.equal(sourceEqual,true,
        'an external importer can inspect the source of this exported callable');
    });
  }
}

for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
  test('private nonescaping helper retains positive identifier yield: '+mode,async()=>{
    /** @type {SourceFile[]} */
    const files=[{path:'private.mjs',sourceType:'module',code:
      'function privateRead(privateParam){return privateParam+7;}const value=privateRead(3);export {value};'}];
    const observer='import {value} from "./private.mjs";console.log(String(value));';
    const native=await observe(files,observer);
    const transformed=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'exported-callable-private-helper-'+mode,
      strings:false,properties:false,controlFlow:false,identifiers:true
    });
    const bindings=transformed.files.reduce((sum,file)=>sum+file.metrics.bindings,0);
    assert.ok(bindings>0,'private nonescaping helper should remain eligible');
    assert.equal(await observe(transformed.files,observer),native);
  });
}

module.exports={observe};
