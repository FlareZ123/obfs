'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,code:string|Buffer,sourceType:'script'|'module'|'asset'}} Source */

/**
 * A module provides a DOM script; its imported factory is invoked elsewhere.
 * Another module attaches a runtime-assembled SRI hash through an opaque key.
 */
test('imported DOM script factory receives runtime-built SRI without a literal full hash',()=>{
  const clientCode='globalThis.importedDynamicDigestSRI="original script bytes matter across modules";';
  const digest=createHash('sha256').update(clientCode).digest('base64');
  const html={path:'index.html',code:Buffer.from(
    '<script type="module" src="./entry.mjs"></script>'),sourceType:/** @type {const} */('asset')};
  const script={path:'client.js',sourceType:/** @type {const} */('script'),code:clientCode};
  const factories=[
    ['direct function','export function build(){return document.createElement("script");}'],
    ['constant arrow','export const build=()=>document.createElement("script");'],
    ['export alias','function make(){return document.createElement("script");}export {make as build};']
  ];
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,closedWorld:true,strings:true,
      identifiers:false,properties:false,seed:'imported-runtime-sri/'+mode};
    for(const [name,factory] of factories){
      const prefix='import {build} from "./factory.mjs";'+
        'const target=build();target.src="./client.js";'+
        'const attr=globalThis.injectedAttribute||"integrity";';
      const harmless=prefix+'document.head.append(target);';
      const guarded=prefix+'const digest=globalThis.injectedDigest||'+
        JSON.stringify(digest)+';target[attr]="sha256-"+digest;'+
        'document.head.append(target);';
      const control=obfuscateFiles([
        script,{path:'factory.mjs',sourceType:'module',code:factory},
        {path:'entry.mjs',sourceType:'module',code:harmless},html
      ],options);
      assert.notEqual(control.files[0].code,clientCode,
        name+' must preserve unpinned cross-file transformation yield in '+mode);
      const output=obfuscateFiles([
        script,{path:'factory.mjs',sourceType:'module',code:factory},
        {path:'entry.mjs',sourceType:'module',code:guarded},html
      ],options);
      assert.equal(output.files[0].code,clientCode,
        name+' may publish a runtime-composed SRI hash in '+mode);
    }
  }
});
