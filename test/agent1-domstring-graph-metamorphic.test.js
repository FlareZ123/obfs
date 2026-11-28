'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {hasImportedDomStringSourceSink}=require('../src/core');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * Fixed seed permits identical transport shapes on all CI operating systems.
 * Avoid global Math.random so additions to unrelated tests cannot change the
 * sampled graph corpus.
 * @returns {()=>number}
 */
function random(){
  let state=0x7f0a2c19;
  return ()=>{
    state^=(state<<13);
    state^=(state>>>17);
    state^=(state<<5);
    return state>>>0;
  };
}

/** @type {readonly ((file:string)=>string)[]} */
const edges=[
  file=>'export {element} from "./'+file+'";',
  file=>'export * from "./'+file+'";',
  file=>'import {element as x} from "./'+file+'";export {x as element};',
  file=>'import {element as x} from "./'+file+'";const alias=x;export {alias as element};',
  file=>'import {element as x} from "./'+file+'";export const element=x;',
  file=>'import * as ns from "./'+file+'";export const element=ns.element;',
  file=>'import * as ns from "./'+file+'";const alias=ns.element;export {alias as element};'
];

/**
 * Build a closed declarative ESM graph, with every intermediate module
 * exporting the same live "element" binding under a different syntax form.
 * The native and userland controls differ ONLY in the initial receiver
 * expression; all 1..6 dependent module edges are otherwise identical.
 *
 * @param {number[]} choices
 * @param {boolean} native
 * @returns {SourceFile[]}
 */
function graph(choices,native){
  /** @type {SourceFile[]} */
  const modules=[{path:'state.mjs',sourceType:'module',code:native?
    'export const element=document.createElement("main");':
    'export const element={setAttribute(){return 17;}};'}];
  let prev='state.mjs';
  for(let i=0;i<choices.length;i++){
    const filename='hop'+i+'.mjs';
    modules.push({path:filename,sourceType:'module',
      code:edges[choices[i]](prev)});
    prev=filename;
  }
  modules.push({path:'entry.mjs',sourceType:'module',code:[
    'import {element} from "./'+prev+'";',
    'const owner={internalKey:17};',
    'function observed(){return owner.internalKey;}',
    'element.setAttribute("data-source",observed);',
    'export const result=observed();'
  ].join('\n')});
  return modules;
}

test('256 seeded ESM alias/export graphs have sound native DOMString source provenance',()=>{
  const next=random();
  /** @type {number[][]} */
  const shapes=edges.map((_,index)=>[index]);
  while(shapes.length<256){
    const length=1+(next()%6);
    /** @type {number[]} */
    const sequence=[];
    for(let i=0;i<length;i++)sequence.push(next()%edges.length);
    shapes.push(sequence);
  }
  for(const [index,choices] of shapes.entries()){
    const native=graph(choices,true);
    const userland=graph(choices,false);
    assert.equal(hasImportedDomStringSourceSink(native),true,
      'False negative in native DOM provenance: case '+index+
      ' edge sequence '+JSON.stringify(choices));
    assert.equal(hasImportedDomStringSourceSink(userland),false,
      'False positive in userland method: case '+index+
      ' edge sequence '+JSON.stringify(choices));
  }
  process.stdout.write('DOM_GRAPH_SEEDED '+JSON.stringify({
    seed:'0x7f0a2c19',graphs:shapes.length,
    distinctEdges:edges.length,
    maxEdges:6,classified:shapes.length*2
  })+'\n');
});
