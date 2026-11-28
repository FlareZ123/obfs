'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {collectImportedTimingAliases}=require('../src/cross-properties');
const {parse,observesFunctionSource}=require('../src/ast');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
/** @param {string} path @param {string} code @returns {Source} */
function file(path,code){return {path,sourceType:'module',code};}
/**
 * Use the proof returned for a single ESM consumer, with none of the
 * unrelated strings/primitive/clone/URL import proofs asserted.
 * @param {string} code
 * @param {Map<string,Set<string>>} proof
 * @returns {boolean}
 */
function observed(code,proof) {
  return observesFunctionSource(
    parse(code,'module'),new Map(),new Set(),new Set(),new Set(),new Set(),proof
  );
}

test('named exports, renamed reexports and star barrel forward true timing provenance',()=>{
  const consumer='import {clock as timing,method as native,hooks,makeClock} from "./barrel.mjs";'+
    'function inspect(){const o={secretField:57};return o.secretField;}'+
    'export const view=[timing.mark(inspect).name,native.call(performance,inspect).name,'+
      'hooks.native.call(performance,inspect).name,makeClock().mark(inspect).name];';
  const files=[
    file('host.mjs','export const clock=performance;'+
      'export const method=performance.mark;'+
      'export const hooks={native:performance.mark};'+
      'export function makeClock(){return performance;}'),
    file('proxy.mjs','export {clock,method,hooks,makeClock} from "./host.mjs";'),
    file('barrel.mjs','export * from "./proxy.mjs";'),
    file('consumer.mjs',consumer)
  ];
  const graph=collectImportedTimingAliases(files);
  const proof=graph.get('consumer.mjs');
  assert.ok(proof,'Expected static consumer proof');
  assert.ok(proof.get('timing')?.has('receiver'));
  assert.ok(proof.get('native')?.has('method'));
  assert.ok(proof.get('hooks')?.has('holder:native'));
  assert.ok(proof.get('makeClock')?.has('returnReceiver'));
  assert.equal(observed(consumer,proof),true);
  assert.equal(observed(consumer,new Map()),false,
    'The receiver is imported rather than locally resolved');
});

test('native perf_hooks namespace and ESM exports transmit timing receiver provenance',()=>{
  const files=[
    file('host.mjs','import * as perfHooks from "node:perf_hooks";'+
      'export const clock=perfHooks.performance;'),
    file('observer.mjs','import {clock as timing} from "./host.mjs";'+
      'function inspect(){return 19;}export const view=timing.mark(inspect).name;')
  ];
  const proof=collectImportedTimingAliases(files).get('observer.mjs');
  assert.ok(proof?.get('timing')?.has('receiver'));
  assert.equal(observed(files[1].code,proof??new Map()),true);
});

test('unrelated user-defined mark method is not misclassified as native',()=>{
  const files=[
    file('host.mjs','export const timing={mark(fn){return {name:"local"};}};'),
    file('observer.mjs','import {timing} from "./host.mjs";'+
      'function inspect(){return 19;}export const result=timing.mark(inspect).name;')
  ];
  const proof=collectImportedTimingAliases(files).get('observer.mjs');
  assert.ok(proof);
  assert.ok(!proof.get('timing')?.has('receiver'));
  assert.equal(observed(files[1].code,proof),false);
});

test('unresolved import specifiers never manufacture timing provenance',()=>{
  const files=[
    file('host.mjs','export const clock=performance;'),
    file('observer.mjs','import {clock} from "./host.mjs?dynamic";'+
      'function inspect(){return 19;}export const view=clock.mark(inspect).name;')
  ];
  const proof=collectImportedTimingAliases(files).get('observer.mjs');
  assert.ok(proof);
  assert.ok(!proof.get('clock')?.has('receiver'));
});

test('one-level object-carried native timing receiver and returning factory are tracked',()=>{
  const consumer='import {services,makeServices} from "./host.mjs";'+
    'function inspect(){return 61;}'+
    'export const source=[services.clock.mark(inspect).name,'+
      'makeServices().clock.mark(inspect).name];';
  const files=[
    file('host.mjs','export const services={clock:performance};'+
      'export function makeServices(){return {clock:performance};}'),
    file('consumer.mjs',consumer)
  ];
  const proof=collectImportedTimingAliases(files).get('consumer.mjs');
  assert.ok(proof?.get('services')?.has('receiverHolder:clock'));
  assert.ok(proof?.get('makeServices')?.has('returnsReceiverHolder:clock'));
  assert.equal(observed(consumer,proof??new Map()),true);
  assert.equal(observed(consumer,new Map()),false);
});
