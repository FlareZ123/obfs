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
    'import {inspect,independentValue} from "./logic.mjs";',
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
    'import {independentValue} from "./logic.mjs";',
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


/**
 * Compile an imported callable through additional DOM coercion dispatch forms.
 * Same-realm native coercion for these sinks is covered by the historical
 * Chromium DOMString matrix; this regression checks only cross-file producer
 * closure.
 * @param {'reflect'|'assign'|'html-method'} sink
 */
function compileDispatchGraph(sink) {
  const logic=[
    'const observedOwner={secretField:57};',
    'export function inspect(){return observedOwner.secretField;}'
  ].join('\n');
  const operation=sink==='reflect'?
    'Reflect.set(target,"id",inspect);':
    sink==='assign'?'Object.assign(target,{id:inspect});':
      'target.insertAdjacentHTML("beforeend",inspect);';
  const observer=[
    'import {inspect} from "./logic.mjs";',
    'const target=document.createElement("div");',
    operation,
    'export const value=inspect();'
  ].join('\n');
  return obfuscateFiles([
    {path:'relocated-logic.mjs',sourceType:'module',code:logic},
    {path:'relocated-observer.mjs',sourceType:'module',code:observer}
  ],{mode:'coo',seed:'esm-dom-dispatch-'+sink,closedWorld:true,
    properties:true,identifiers:true,strings:false});
}

for(const sink of /** @type {const} */ (['reflect','assign','html-method'])) {
  test('ESM DOM '+sink+' dispatch freezes imported callable producer',()=>{
    const result=compileDispatchGraph(sink);
    const logic=result.files.find(file=>file.path==='relocated-logic.mjs');
    assert.ok(logic);
    assert.equal(logic.metrics.properties,0);
    assert.equal(logic.metrics.bindings,0);
    assert.ok(String(logic.code).includes('secretField'),
      'source-observed producer property spelling must stay byte-stable');
  });
}


test('ESM DOM imported callable const alias remains source-protected',()=>{
  const result=obfuscateFiles([
    {path:'producer.mjs',sourceType:'module',code:
      'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'consumer.mjs',sourceType:'module',code:[
      'import {inspect} from "./producer.mjs";',
      'const alias=inspect;',
      'const target=document.createElement("div");',
      'target.id=alias;'
    ].join('\n')}
  ],{mode:'coo',seed:'esm-dom-import-alias',closedWorld:true,
    properties:true,identifiers:true,strings:false});
  const producer=result.files.find(file=>file.path==='producer.mjs');
  assert.ok(producer);
  assert.equal(producer.metrics.properties,0);
  assert.ok(String(producer.code).includes('secretField'));
});

for(const sink of /** @type {const} */ (['reflect','assign','html-method'])) {
  test('userland '+sink+' lookalike does not freeze imported producer',()=>{
    const logic='const owner={secretField:57};export function inspect(){return owner.secretField;}';
    const op=sink==='reflect'?
      'Reflect.set(target,"id",inspect);':
      sink==='assign'?'Object.assign(target,{id:inspect});':
        'target.insertAdjacentHTML("beforeend",inspect);';
    const consumer=[
      'import {inspect} from "./producer.mjs";',
      'const target='+(
        sink==='html-method'?
          '{insertAdjacentHTML(_where,value){this.value=value;}};':'{};'
      ),
      op
    ].join('\n');
    const result=obfuscateFiles([
      {path:'producer.mjs',sourceType:'module',code:logic},
      {path:'consumer.mjs',sourceType:'module',code:consumer}
    ],{mode:'coo',seed:'esm-dom-userland-'+sink,closedWorld:true,
      properties:true,identifiers:true,strings:false});
    const producer=result.files.find(file=>file.path==='producer.mjs');
    assert.ok(producer);
    assert.ok(!String(producer.code).includes('secretField'),
      'userland receiver must not trigger DOM source-producer freeze');
  });
}
