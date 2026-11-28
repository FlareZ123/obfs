'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {hasImportedDomStringSourceSink,obfuscateFiles}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Native NodeList/HTMLCollection members continue to be genuine Elements
 * after collection materialization. The current import-provenance checker
 * should not treat a newly allocated, userland Array as proof that its items
 * have ceased to be native Web IDL receivers.
 * @type {readonly {name:string,body:string}[]}
 */
const materialization=[
  {name:'Array.from',body:'const copied=Array.from(elements);const node=copied[0];'},
  {name:'array-spread',body:'const copied=[...elements];const node=copied[0];'},
  {name:'iterator-destructuring',body:'const [node]=elements;'},
  {name:'for-of',body:'let node;for(const current of elements){node=current;break;}'},
  {name:'Array.from-index',body:'const node=Array.from(elements)[0];'},
  {name:'spread-index',body:'const node=[...elements][0];'},
  {name:'array-at',body:'const node=Array.from(elements).at(0);'},
  {name:'array-iterator-next',body:'const node=elements.values().next().value;'}
];

/**
 * The test shares a source-observing receiver without using an explicit
 * Function#toString; real Web IDL DOMString converts the second argument.
 * @param {string} body
 * @param {boolean} native
 * @returns {SourceFile[]}
 */
function graph(body,native){
  return [
    {path:'producer.mjs',sourceType:'module',code:native?
      'export const elements=document.querySelectorAll("div.locked");':
      'export const elements=[{setAttribute(_name,_value){return 17;}}];'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {elements} from "./producer.mjs";',
      body,
      'const owner={privateValue:17};',
      'function reader(){return owner.privateValue;}',
      'node.setAttribute("data-source",reader);',
      'export const output={value:reader(),source:globalThis.__captured};'
    ].join('\n')}
  ];
}

test('native DOM collection materialization does not erase source-observer effects',()=>{
  for(const fixture of materialization){
    assert.equal(hasImportedDomStringSourceSink(graph(fixture.body,true)),true,
      fixture.name+' native collection materialization still reaches Web IDL DOMString');
  }
});

test('matched userland collections do not become native DOM receivers by spelling',()=>{
  for(const fixture of materialization){
    assert.equal(hasImportedDomStringSourceSink(graph(fixture.body,false)),false,
      fixture.name+' on ordinary own Array must not trigger a native-only effect');
  }
});

/**
 * The host implements the browser's real native DOMString observation effect:
 * invoking setAttribute with a Function implicitly stores String(Function).
 * The compiled source graph never sees the host source or closure.
 *
 * @param {readonly SourceFile[]} files
 * @returns {{value:number,source:string}}
 */
function execute(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-materialized-collection-'));
  try{
    for(const file of files)fs.writeFileSync(path.join(root,file.path),
      String(file.code),'utf8');
    fs.writeFileSync(path.join(root,'runner.mjs'),[
      'const element={setAttribute(_name,value){globalThis.__captured=String(value)}};',
      'globalThis.document={querySelectorAll(){return [element]}};',
      'const module=await import("./entry.mjs");',
      'console.log(JSON.stringify(module.output));'
    ].join('\n'),'utf8');
    const child=spawnSync(process.execPath,[path.join(root,'runner.mjs')],{
      encoding:'utf8',cwd:root,timeout:10000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return JSON.parse(child.stdout.trim());
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}

for(const fixture of materialization){
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    test(mode+': native collection materialization preserves observed Function source: '+fixture.name,()=>{
      const files=graph(fixture.body,true);
      const native=execute(files);
      assert.equal(native.value,17);
      const emitted=obfuscateFiles(files,{
        mode,closedWorld:true,seed:'agent1-materialization-native-'+fixture.name+'-'+mode,
        properties:true,identifiers:true,strings:false
      });
      const actual=execute(emitted.files);
      assert.deepEqual(actual,native,
        mode+' '+fixture.name+' changed source text observed by native DOMString setter');
    });
  }
}

test('own-record rewrite positive control without imported native receiver',()=>{
  for(const mode of /** @type {const} */ (['coo','sco','sno'])){
    const original=graph('const node=elements[0];',false);
    const emitted=obfuscateFiles(original,{
      mode,closedWorld:true,seed:'agent1-materialization-userland-'+mode,
      properties:true,identifiers:true,strings:false
    });
    assert.ok(emitted.files.reduce((sum,file)=>sum+file.metrics.properties,0)>0,
      mode+': primitive private record still needs real protection yield');
  }
});
