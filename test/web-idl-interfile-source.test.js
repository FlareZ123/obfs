'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

/**
 * Execute actual native/generated ESM from independent temporary directories.
 * @param {ESMFile[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'web-idl-obfs-'));
  try {
    for(const file of files)await fs.writeFile(path.join(directory,file.path),file.code,'utf8');
    const observer=await import(pathToFileURL(path.join(directory,'observer.mjs')).href);
    return await observer.observe();
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

const logic='export function inspect(){const state={secretField:19};return state.secretField;}';

/** @param {string} body @returns {ESMFile[]} */
function sources(body) {
  return [
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:
      'import {inspect} from "./logic.mjs";'+
      'export async function observe(){return {text:'+body+',value:inspect()};}'}
  ];
}

/** @param {ESMFile[]} files @returns {ESMFile[]} */
function generated(files) {
  const result=obfuscateFiles(files,{
    mode:'coo',seed:'interfile-web-idl-observer',
    closedWorld:true,strings:true,properties:true,identifiers:true
  });
  return result.files.map(file=>({
    path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
  }));
}

test('cross-file Response function-source observer preserves exact exporting module source',async()=>{
  const before=sources('await new Response(inspect).text()');
  const emitted=generated(before);
  assert.equal(emitted[0].code,before[0].code,'Source observer in another ESM file must forbid body rewrite');
  assert.equal(emitted[1].code,before[1].code,'Source-observing file must retain its spelling');
  const native=await execute(before);
  assert.ok(native.text.includes('secretField'));
  assert.equal(native.value,19);
  assert.deepEqual(await execute(emitted),native);
});

test('cross-file Response with literal input leaves independent local record transformation eligible',async()=>{
  const before=sources('await new Response("plain").text()');
  // Keep the owner and its read outside the exported function body. This is
  // a proven local-record shape; a captured owner inside an exported function
  // is intentionally more conservative in the current property analysis.
  before[0].code='const state={secretField:19};const value=state.secretField;'+
    'export function inspect(){return value;}';
  const emitted=generated(before);
  const native=await execute(before);
  assert.equal(native.text,'plain');
  assert.deepEqual(await execute(emitted),native);
  assert.ok(!emitted[0].code.includes('secretField'),
    'The unrelated local field should be renamed when observer input is proven primitive');
});

/** @type {Array<[string,string]>} */
const collectionCases=[
  ['Request.headers','(()=>{const request=new Request("https://example.test/");request.headers.append("x-observed",inspect);return request.headers.get("x-observed");})()'],
  ['Response.headers','(()=>{const response=new Response("fixed");response.headers.append("x-observed",inspect);return response.headers.get("x-observed");})()'],
  ['URL.searchParams','(()=>{const url=new URL("https://example.test/");url.searchParams.append("q",inspect);return url.searchParams.get("q");})()'],
  ['Headers.append','(()=>{const headers=new Headers();headers.append("x-observed",inspect);return headers.get("x-observed");})()'],
  ['URLSearchParams.append','(()=>{const params=new URLSearchParams();params.append("q",inspect);return params.get("q");})()']
];

for(const [name,expression] of collectionCases) {
  test('cross-file native '+name+' preserves imported function source',async()=>{
    const before=sources(expression);
    const emitted=generated(before);
    assert.equal(emitted[0].code,before[0].code,'Cross-file observer must preserve producer');
    const native=await execute(before);
    assert.ok(native.text.includes('secretField'),'Imported native function source witness');
    assert.equal(native.value,19);
    assert.deepEqual(await execute(emitted),native);
  });
}

for(const [name,expression] of [
  ['Request.headers','(()=>{const request=new Request("https://example.test/");request.headers.append("x-observed","fixed");return request.headers.get("x-observed");})()'],
  ['URL.searchParams','(()=>{const url=new URL("https://example.test/");url.searchParams.append("q","fixed");return url.searchParams.get("q");})()']
]) {
  test('cross-file native '+name+' primitive values retain unrelated rename',async()=>{
    const before=sources(expression);
    before[0].code='const state={secretField:19};const value=state.secretField;'+
      'export function inspect(){return value;}';
    const emitted=generated(before);
    const native=await execute(before);
    assert.equal(native.text,'fixed');
    assert.deepEqual(await execute(emitted),native);
    assert.ok(!emitted[0].code.includes('secretField'),'Unrelated top-level owner is eligible');
  });
}
