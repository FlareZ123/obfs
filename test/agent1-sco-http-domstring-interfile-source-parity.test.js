'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {createScoHandler}=require('../src/sco');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,state:string,bridge?:string,entryImport:string,receiver?:string}} Fixture */

/** @type {readonly Fixture[]} */
const fixtures=[
  {name:'direct',state:'export const element=document.createElement("main");',
    entryImport:'import {element} from "./state.mjs";'},
  {name:'direct-reexport',state:'export const element=document.createElement("main");',
    bridge:'export {element} from "./state.mjs";',
    entryImport:'import {element} from "./bridge.mjs";'},
  {name:'named-alias',state:'export const element=document.createElement("main");',
    bridge:'import {element as DOM} from "./state.mjs";export {DOM as element};',
    entryImport:'import {element} from "./bridge.mjs";'},
  {name:'star',state:'export const element=document.createElement("main");',
    bridge:'export * from "./state.mjs";',
    entryImport:'import {element} from "./bridge.mjs";'},
  {name:'default',state:'const root=document.createElement("main");export default root;',
    bridge:'export {default as element} from "./state.mjs";',
    entryImport:'import {element} from "./bridge.mjs";'},
  {name:'static-nodelist-import',
    state:'export const collection=document.querySelectorAll("main.locked");',
    entryImport:'import {collection} from "./state.mjs";',
    receiver:'collection[0]'},
  {name:'htmlcollection-item-barrel',
    state:'export const collection=document.getElementsByClassName("locked");',
    bridge:'export {collection} from "./state.mjs";',
    entryImport:'import {collection} from "./bridge.mjs";',
    receiver:'collection.item(0)'},
  {name:'nodelist-factory',
    state:'export function make(){return document.querySelectorAll("main.locked");}',
    entryImport:'import {make} from "./state.mjs";',
    receiver:'make()[0]'},
  {name:'namespace-collection',
    state:'export const collection=document.querySelectorAll("main.locked");',
    bridge:'export * as carrier from "./state.mjs";',
    entryImport:'import {carrier} from "./bridge.mjs";',
    receiver:'carrier.collection[0]'},
  {name:'parameter-index-forwarder',
    state:'export const collection=document.querySelectorAll("main.locked");',
    entryImport:'import {collection} from "./state.mjs";function pick(values){return values[0];}',
    receiver:'pick(collection)'}
];

/** @param {Fixture} fixture @returns {SourceFile[]} */
function graph(fixture) {
  /** @type {SourceFile[]} */
  const out=[{path:'state.mjs',sourceType:'module',code:fixture.state}];
  if(fixture.bridge)out.push({path:'bridge.mjs',sourceType:'module',code:fixture.bridge});
  out.push({path:'entry.mjs',sourceType:'module',code:[
    fixture.entryImport,
    'const owner={privateKey:37};',
    'function inspected(){return owner.privateKey;}',
    fixture.receiver?'const element='+fixture.receiver+';':'',
    'element.setAttribute("data-source",inspected);',
    'export const answer={value:inspected(),source:element.getAttribute("data-source")};'
  ].join('\n')});
  return out;
}

/**
 * Request exactly the public file bytes through the real SCO HTTP handler.
 * Do not substitute the core obfuscateFiles(mode=sco) in this integration
 * test: the SCO GET endpoint obfuscates each file separately at request time.
 *
 * @param {SourceFile[]} files
 * @returns {Promise<SourceFile[]>}
 */
async function getPublished(files) {
  const server=http.createServer(createScoHandler(files,{closedWorld:true}));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  try{
    /** @type {SourceFile[]} */
    const result=[];
    for(const file of files){
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+file.path);
      assert.equal(response.status,200,file.path+' status');
      assert.match(response.headers.get('content-type')??'',/text\/javascript/i);
      result.push({...file,code:await response.text()});
    }
    return result;
  }finally{
    server.close();
    await once(server,'close');
  }
}

/**
 * Native Node ESM with an external DOMString coercion host and a record
 * of both numeric result and exact String(Function) observed by setAttribute.
 * @param {readonly SourceFile[]} files
 * @returns {{value:number,source:string}}
 */
function execute(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-sco-domstring-http-'));
  try{
    for(const file of files)fs.writeFileSync(path.join(root,file.path),
      String(file.code),'utf8');
    fs.writeFileSync(path.join(root,'runner.mjs'),[
      'const values=new Map();',
      'const element={setAttribute(k,v){values.set(String(k),String(v));},',
      'getAttribute(k){return values.get(String(k))??null;}};',
      'const collection=Object.assign([element],{item(i){return i===0?element:null}});',
      'globalThis.document={createElement(){return element;},',
      'querySelectorAll(){return collection;},getElementsByClassName(){return collection;}};',
      'const main=await import("./entry.mjs");',
      'console.log(JSON.stringify(main.answer));'
    ].join('\n'),'utf8');
    const child=spawnSync(process.execPath,[path.join(root,'runner.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
}

for(const fixture of fixtures)test(
  'SCO HTTP public per-file compiler preserves DOMString source: '+fixture.name,async()=>{
    const original=graph(fixture);
    const native=execute(original);
    assert.equal(native.value,37);
    const emitted=await getPublished(original);
    const received=execute(emitted);
    process.stdout.write('SCO_NATIVE_DOM_SOURCE '+JSON.stringify({
      fixture:fixture.name,
      changedFiles:emitted.filter((file,index)=>file.code!==original[index].code).
        map(file=>file.path),
      numericParity:received.value===native.value,
      sourceParity:received.source===native.source
    })+'\n');
    assert.deepEqual(received,native,
      'Actual SCO HTTP endpoint must carry the same graph-wide native DOMString proof as core');
  }
);

test('actual SCO route refuses a host lock that would rewrite observed source',()=>{
  for(const fixture of fixtures){
    assert.throws(()=>createScoHandler(graph(fixture),{
      closedWorld:true,allowedHosts:['example.com']
    }),/Host locking cannot preserve observable source bytes/,
    'SCO publication with '+fixture.name+' cannot claim a source-preserving host lock');
  }
});

test('unobserved private SCO file still gains genuine per-request protected rewriting',async()=>{
  const files=[{path:'safe.mjs',sourceType:'module',
    code:'const owner={protectedField:17};export const result=owner.protectedField;'}];
  const output=await getPublished(files);
  assert.notEqual(output[0].code,files[0].code,
    'SCO cannot satisfy protection yield by serving every file unchanged');
});
