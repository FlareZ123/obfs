'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @param {string} body */
function compile(body) {
  const files=[
    {path:'state.mjs',sourceType:'module',
      code:'export const state={hotScore:7,hotWeight:13};'},
    {path:'worker.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+body}
  ];
  return obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'direct-reflection-shape-grid',
    identifiers:false,strings:false
  }).crossFile.properties;
}

test('empirical direct-reflection proof grammar across reader and mutation contexts',()=>{
  const read='Reflect.get(state,"hotScore")+Reflect.get(state,"hotWeight")';
  const prefix='function work(){let total=0;for(let i=0;i<1000;i++){';
  const suffix='}return total;}export function run(){return work();}';
  const shapes=[
    ['top-level-reflect-get','export const value='+read+';'],
    ['top-level-reflect-has','export const value=Reflect.has(state,"hotScore")&&Object.hasOwn(state,"hotWeight");'],
    ['top-level-descriptor','export const value=Reflect.getOwnPropertyDescriptor(state,"hotScore").value+Object.getOwnPropertyDescriptor(state,"hotWeight").value;'],
    ['top-level-set','Reflect.set(state,"hotScore",7);export const value=Reflect.get(state,"hotScore")+state.hotWeight;'],
    ['function-wrap-simple','function work(){return '+read+';}export function run(){return work();}'],
    ['function-export-simple','export function run(){return '+read+';}'],
    ['top-level-loop','let total=0;for(let i=0;i<1000;i++){total+='+read+';}export const value=total;'],
    ['private-loop',prefix+'total+='+read+';'+suffix],
    ['private-loop-has',prefix+'if(Reflect.has(state,"hotScore"))total+=state.hotWeight;'+suffix],
    ['private-loop-descriptor',prefix+'total+=Reflect.getOwnPropertyDescriptor(state,"hotScore").value+state.hotWeight;'+suffix],
    ['private-loop-set',prefix+'Reflect.set(state,"hotScore",7);total+=Reflect.get(state,"hotScore")+state.hotWeight;'+suffix],
    ['private-loop-combined',prefix+'if(Reflect.has(state,"hotScore")&&Object.hasOwn(state,"hotWeight")){const d=Reflect.getOwnPropertyDescriptor(state,"hotScore");Reflect.set(state,"hotScore",7);total+=d.value+Reflect.get(state,"hotWeight");}'+suffix]
  ];
  /** @type {{shape:string,renamed:number}[]} */
  const results=[];
  for(const [shape,body] of shapes) {
    const renamed=compile(body);
    results.push({shape,renamed});
    assert.ok(renamed>=0&&renamed<=2);
  }
  assert.equal(results[0].renamed,2);
  console.log('reflection-shapes='+JSON.stringify(results));
});
