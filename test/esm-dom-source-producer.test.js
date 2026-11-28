'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @param {'property'|'stream'} sink @returns {ReturnType<typeof obfuscateFiles>} */
function compileGraph(sink) {
  const negativeLogic=[
    'const observedOwner={secretField:57};',
    'export function inspect(){return observedOwner.secretField;}',
    'const independent={independentSecret:73};',
    'export const independentValue=independent.independentSecret;'
  ].join('\n');
  const negativeObserver=sink==='property'?[
    'import {inspect,independentValue} from "./negative-logic.mjs";',
    'const target=document.createElement("div");',
    'target.id=inspect;',
    'export const observed={source:target.id,value:inspect(),independent:independentValue};'
  ].join('\n'):[
    'import {inspect,independentValue} from "./negative-logic.mjs";',
    'const target=document.createElement("div");',
    'const stream=target.streamHTML();',
    'const writer=stream.getWriter();',
    'await writer.write(inspect);',
    'await writer.close();',
    'export const observed={source:target.innerHTML,value:inspect(),independent:independentValue};'
  ].join('\n');
  const positiveLogic=[
    'const owner={privateField:73};',
    'export const independentValue=owner.privateField;'
  ].join('\n');
  const positiveObserver=[
    'import {independentValue} from "./positive-logic.mjs";',
    'const target=document.createElement("div");',
    sink==='property'?'target.id="literal";':
      'const stream=target.streamHTML();const writer=stream.getWriter();await writer.write("literal");await writer.close();',
    'export const observed={independent:independentValue};'
  ].join('\n');
  return obfuscateFiles([
    {path:'negative-logic.mjs',sourceType:'module',code:negativeLogic},
    {path:'negative-observer.mjs',sourceType:'module',code:negativeObserver},
    {path:'positive-logic.mjs',sourceType:'module',code:positiveLogic},
    {path:'positive-observer.mjs',sourceType:'module',code:positiveObserver}
  ],{
    mode:'coo',seed:'esm-dom-source-producer-'+sink,closedWorld:true,
    properties:true,identifiers:true,strings:false
  });
}

for(const sink of /** @type {const} */ (['property','stream'])) {
  test('ESM DOM '+sink+' sink freezes only imported callable producer',()=>{
    const result=compileGraph(sink);
    const negative=result.files.find(file=>file.path==='negative-logic.mjs');
    const positive=result.files.find(file=>file.path==='positive-logic.mjs');
    assert.ok(negative&&positive);
    assert.equal(String(negative.code),[
      'const observedOwner={secretField:57};',
      'export function inspect(){return observedOwner.secretField;}',
      'const independent={independentSecret:73};',
      'export const independentValue=independent.independentSecret;'
    ].join('\n'));
    assert.equal(negative.metrics.properties,0);
    assert.equal(negative.metrics.bindings,0);
    assert.ok(positive.metrics.properties>=1,
      'unrelated primitive-control producer must retain local property rewrite yield');
    assert.ok(!String(positive.code).includes('privateField'),
      'positive-control private property must actually be rewritten');
  });
}
