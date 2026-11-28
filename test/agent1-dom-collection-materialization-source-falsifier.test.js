'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
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
      'export const output=reader();'
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
