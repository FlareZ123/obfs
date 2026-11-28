'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,state:string,bridge?:string,relay?:string,expression:string,importText:string}} Variant */

/**
 * The host handles an element method like a native DOMString setter.
 * An unknown runtime observer is not part of the obfuscator's static inputs.
 * @param {readonly SourceFile[]} modules
 * @returns {{source:string,value:number}}
 */
function run(modules){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-dom-ns-source-'));
  try {
    for(const module of modules)fs.writeFileSync(path.join(root,module.path),
      String(module.code),'utf8');
    fs.writeFileSync(path.join(root,'runner.mjs'),[
      'globalThis.document={createElement(){',
      'const values=new Map();',
      'return {setAttribute(k,v){values.set(k,String(v))},',
      'getAttribute(k){return values.get(k)??null}};',
      '}};',
      'const output=await import("./entry.mjs");',
      'console.log(JSON.stringify(output.answer));'
    ].join('\n'),'utf8');
    const child=spawnSync(process.execPath,[path.join(root,'runner.mjs')],{
      encoding:'utf8',cwd:root,timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally {fs.rmSync(root,{force:true,recursive:true});}
}

/** @type {readonly Variant[]} */
const cases=[
  {name:'direct namespace import',
    state:'export const element=document.createElement("div");',
    importText:'import * as holder from "./state.mjs";',
    expression:'holder.element'},
  {name:'named namespace reexport',
    state:'export const element=document.createElement("div");',
    bridge:'export * as holder from "./state.mjs";',
    importText:'import {holder} from "./bridge.mjs";',
    expression:'holder.element'},
  {name:'nested namespace reexport',
    state:'export const element=document.createElement("div");',
    bridge:'export * as holder from "./state.mjs";',
    relay:'export * as outer from "./bridge.mjs";',
    importText:'import {outer} from "./relay.mjs";',
    expression:'outer.holder.element'},
  {name:'local alias through namespace',
    state:'export const element=document.createElement("div");',
    importText:'import * as holder from "./state.mjs";const alias=holder.element;',
    expression:'alias'},
  {name:'default export through namespace',
    state:'export default document.createElement("div");',
    importText:'import * as holder from "./state.mjs";',
    expression:'holder.default'}
];

/** @param {Variant} variant @returns {SourceFile[]} */
function graph(variant){
  /** @type {SourceFile[]} */
  const files=[{path:'state.mjs',sourceType:'module',code:variant.state}];
  if(variant.bridge)files.push({path:'bridge.mjs',sourceType:'module',code:variant.bridge});
  if(variant.relay)files.push({path:'relay.mjs',sourceType:'module',code:variant.relay});
  files.push({path:'entry.mjs',sourceType:'module',code:[
    variant.importText,
    'const owner={hiddenValue:29};',
    'function observe(){return owner.hiddenValue;}',
    'const element='+variant.expression+';',
    'element.setAttribute("data-source",observe);',
    'export const answer={source:element.getAttribute("data-source"),value:observe()};'
  ].join('\n')});
  return files;
}

for(const fixture of cases){
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    test(mode+': DOMString native source through ESM namespace: '+fixture.name,()=>{
      const native=run(graph(fixture));
      const output=obfuscateFiles(graph(fixture),{
        mode,closedWorld:true,seed:'agent1-native-domstring-ns-'+fixture.name+'-'+mode,
        properties:true,identifiers:true,strings:false
      });
      const emitted=run(output.files);
      const metrics=output.files.map(f=>({
        path:f.path,bindings:f.metrics.bindings,properties:f.metrics.properties
      }));
      process.stdout.write('DOM_NAMESPACE_SOURCE '+JSON.stringify({
        fixture:fixture.name,mode,metrics,sourceParity:emitted.source===native.source
      })+'\n');
      assert.deepEqual(emitted,native,fixture.name+' '+mode+
        ': host String(Function) differed under namespace-carried DOM element');
    });
  }
}
