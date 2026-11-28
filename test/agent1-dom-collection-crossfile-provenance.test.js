'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles,hasImportedDomStringSourceSink}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,producer:string,bridge?:string,importText:string,receiver:string}} Case */

/** @type {readonly Case[]} */
const cases=[
  {name:'direct-static-NodeList',producer:'export const elements=document.querySelectorAll("div.locked");',
    importText:'import {elements} from "./state.mjs";',receiver:'elements[0]'},
  {name:'direct-live-HTMLCollection',producer:'export const elements=document.getElementsByClassName("locked");',
    importText:'import {elements} from "./state.mjs";',receiver:'elements.item(0)'},
  {name:'aliased-static-NodeList',producer:'const list=document.querySelectorAll("div.locked");export {list as elements};',
    importText:'import {elements} from "./state.mjs";',receiver:'elements.item(0)'},
  {name:'barrel-static-NodeList',producer:'export const elements=document.querySelectorAll("div.locked");',
    bridge:'export {elements} from "./state.mjs";',
    importText:'import {elements} from "./bridge.mjs";',receiver:'elements[0]'},
  {name:'namespace-live-HTMLCollection',producer:'export const elements=document.getElementsByClassName("locked");',
    bridge:'export * as collection from "./state.mjs";',
    importText:'import {collection} from "./bridge.mjs";',receiver:'collection.elements[0]'},
  {name:'factory-collection',producer:'export function make(){return document.querySelectorAll("div.locked");}',
    importText:'import {make} from "./state.mjs";const elements=make();',receiver:'elements[0]'},
  {name:'element-children-collection',producer:'export const elements=document.body.children;',
    importText:'import {elements} from "./state.mjs";',receiver:'elements[0]'}
];

/** @param {Case} fixture @returns {SourceFile[]} */
function graph(fixture) {
  /** @type {SourceFile[]} */
  const files=[{path:'state.mjs',sourceType:'module',code:fixture.producer}];
  if(fixture.bridge)files.push({path:'bridge.mjs',sourceType:'module',code:fixture.bridge});
  files.push({path:'entry.mjs',sourceType:'module',code:[
    fixture.importText,
    'const owner={privateValue:71};',
    'function inspect(){return owner.privateValue;}',
    'const element='+fixture.receiver+';',
    'element.setAttribute("data-observed",inspect);',
    'export const answer={value:inspect(),text:element.getAttribute("data-observed")};'
  ].join('\n')});
  return files;
}

/**
 * Compare the original and emitted graph against native-style DOMString
 * conversion injected outside the closed source graph. This is a semantic
 * control, distinct from the explicit graph effect oracle below.
 * @param {readonly SourceFile[]} files
 * @returns {{value:number,text:string}}
 */
function run(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-dom-collection-graph-'));
  try{
    for(const file of files)
      fs.writeFileSync(path.join(root,file.path),String(file.code),'utf8');
    fs.writeFileSync(path.join(root,'runner.mjs'),[
      'const values=new Map();',
      'const element={',
      'setAttribute(k,v){values.set(k,String(v));},',
      'getAttribute(k){return values.get(k)??null;}};',
      'const list=Object.assign([element],{item(i){return i===0?element:null}});',
      'globalThis.document={body:{children:list},querySelectorAll:()=>list,',
      'getElementsByClassName:()=>list};',
      'const entry=await import("./entry.mjs");',
      'console.log(JSON.stringify(entry.answer));'
    ].join('\n'),'utf8');
    const child=spawnSync(process.execPath,[path.join(root,'runner.mjs')],{
      encoding:'utf8',cwd:root,timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('each graph with imported native DOM collections is source observable',()=>{
  for(const fixture of cases) {
    assert.equal(hasImportedDomStringSourceSink(graph(fixture)),true,
      fixture.name+' receiver must be tracked before any source-changing rename');
  }
});

test('ordinary userland collection is not presumed a native DOMString source',()=>{
  const files=graph(cases[0]);
  files[0]={...files[0],code:'export const elements=[{setAttribute(){return 17}}];'};
  assert.equal(hasImportedDomStringSourceSink(files),false,
    'A user-owned ordinary Array of setter objects is not an actual DOM collection');
});

test('owned userland indexed array keeps genuine positive own-property rewrite yield',()=>{
  const modules=[
    {path:'state.mjs',sourceType:/** @type {const} */('module'),
      code:'export const elements=[{setAttribute(){return 17;}}];'},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:'import {elements} from "./state.mjs";'+
        'const owner={privateField:73};function inspect(){return owner.privateField;}'+
        'elements[0].setAttribute("data-source",inspect);export const value=inspect();'}
  ];
  assert.equal(hasImportedDomStringSourceSink(modules),false);
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const output=obfuscateFiles(modules,{mode,closedWorld:true,seed:'userland-collection-'+mode,
      identifiers:true,properties:true,strings:false});
    assert.ok(output.files.reduce((sum,file)=>sum+file.metrics.properties,0)>0,
      mode+': userland array should retain private-property rewrite yield');
  }
});

for(const fixture of cases){
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    test(mode+': imported DOM collection native Function source: '+fixture.name,()=>{
      const files=graph(fixture);
      const native=run(files);
      assert.equal(native.value,71,'native computation');
      const output=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'agent1-collection-crossfile-'+fixture.name+'-'+mode,
        properties:true,identifiers:true,strings:false
      });
      const emitted=run(output.files);
      const metrics=output.files.map(file=>({
        file:file.path,properties:file.metrics.properties,bindings:file.metrics.bindings
      }));
      process.stdout.write('IMPORTED_DOM_COLLECTION_SOURCE '+
        JSON.stringify({fixture:fixture.name,mode,
          sourceParity:native.text===emitted.text,metrics})+'\n');
      assert.deepEqual(emitted,native,
        'Function source text changed at native DOMString setAttribute after collection import');
    });
  }
}
