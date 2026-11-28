'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {snapshotDataGraph,captureDataCompletion}=require('../sims/semantic-data-oracle');

/** @param {string} source */
function fromRealm(source){
  const context=vm.createContext({});
  const realm=/** @type {import('../sims/semantic-data-oracle').DataRealm} */(
    vm.runInContext('({objectPrototype:Object.prototype,arrayPrototype:Array.prototype})',context));
  return snapshotDataGraph(vm.runInContext(source,context,{timeout:1000}),realm);
}

test('exact graph oracle separates JSON-colliding observable values',()=>{
  const shared={x:1};
  const hidden={};Object.defineProperty(hidden,'x',{value:1});
  const pairs=[
    [0,-0],[NaN,null],[undefined,null],[Infinity,-Infinity],
    [[,],[undefined]],[[shared,shared],[{x:1},{x:1}]],
    [hidden,{}],[Object.create(null),{}],[Object.preventExtensions({}),{}],
    [{x:1,y:2},{y:2,x:1}]
  ];
  for(const [a,b] of pairs){
    // Property-order pair is intentionally not JSON-colliding; key order is
    // an explicit part of the snapshot observation contract.
    assert.notDeepEqual(snapshotDataGraph(a),snapshotDataGraph(b));
  }
  assert.notDeepEqual(snapshotDataGraph(1n),snapshotDataGraph(1));
  assert.notDeepEqual(snapshotDataGraph('NaN'),snapshotDataGraph(NaN));
  assert.equal(JSON.stringify([shared,shared]),JSON.stringify([{x:1},{x:1}]));
  assert.equal(JSON.stringify([,]),JSON.stringify([undefined]));
  assert.equal(JSON.stringify(hidden),JSON.stringify({}));
});

test('cross-realm graphs preserve cycles, descriptors, exact scalar types and local symbol identity',()=>{
  const source=`(()=>{
    const key=Symbol('same');const other=Symbol('same');
    const child=Object.create(null);child.self=child;
    const graph=[child,child,NaN,-0,undefined,9007199254740993n,key,other,key,Symbol.for('g'),Symbol.iterator];
    Object.defineProperty(graph,key,{value:child,writable:false,enumerable:false,configurable:true});
    Object.preventExtensions(graph);return graph;
  })()`;
  const first=fromRealm(source),second=fromRealm(source);
  assert.deepEqual(first,second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)),first);
  assert.notDeepEqual(first,fromRealm(source.replace('child,child,','child,Object.create(null),')));
  assert.notDeepEqual(first,fromRealm(source.replace('key,other,key,','key,key,key,')));
  assert.notDeepEqual(first,fromRealm(source.replace('writable:false','writable:true')));
  assert.notDeepEqual(first,fromRealm(source.replace('Object.preventExtensions(graph);','')));
});

test('unsupported observation refuses instead of running accessors or Proxy traps',()=>{
  let calls=0;
  const accessor=Object.defineProperty({},'x',{get(){calls++;return 1;}});
  assert.throws(()=>snapshotDataGraph(accessor),/accessor descriptor/);
  const proxy=new Proxy({}, {ownKeys(){calls++;return [];},getPrototypeOf(){calls++;return Object.prototype;}});
  assert.throws(()=>snapshotDataGraph(proxy),/Proxy/);
  assert.equal(calls,0);
  assert.throws(()=>snapshotDataGraph(()=>1),/callable/);
  assert.throws(()=>snapshotDataGraph(new Map()),/exotic/);
  assert.throws(()=>snapshotDataGraph(Object.setPrototypeOf(new Map(),Object.prototype)),/exotic/);
  assert.throws(()=>snapshotDataGraph(new (class Example{})()),/prototype/);
});

test('symbol descriptors distinguish global, well-known and separate equal-description locals',()=>{
  const first=Symbol('a'),second=Symbol('a');
  assert.notDeepEqual(snapshotDataGraph([first,first]),snapshotDataGraph([first,second]));
  assert.notDeepEqual(snapshotDataGraph(Symbol('a')),snapshotDataGraph(Symbol.for('a')));
  assert.notDeepEqual(snapshotDataGraph(Symbol.iterator),snapshotDataGraph(Symbol('Symbol.iterator')));
  assert.notDeepEqual(snapshotDataGraph(Symbol()),snapshotDataGraph(Symbol('')));
});

test('normal and abrupt data completions remain distinct, and oracle refusals stay outside catch',()=>{
  assert.notDeepEqual(captureDataCompletion(()=>undefined),captureDataCompletion(()=>{throw undefined;}));
  assert.deepEqual(captureDataCompletion(()=>{throw -0;}),{kind:'throw',value:snapshotDataGraph(-0)});
  assert.notDeepEqual(captureDataCompletion(()=>{throw -0;}),captureDataCompletion(()=>{throw 0;}));
  assert.notDeepEqual(captureDataCompletion(()=>{throw NaN;}),captureDataCompletion(()=>{throw null;}));
  assert.deepEqual(captureDataCompletion(()=>{throw 1n;}),{kind:'throw',value:snapshotDataGraph(1n)});
  let calls=0;
  const unsupported=Object.defineProperty({},'x',{get(){throw new Error('must not execute');}});
  assert.throws(()=>captureDataCompletion(()=>{calls++;return unsupported;}),/accessor descriptor/);
  assert.throws(()=>captureDataCompletion(()=>{calls++;throw unsupported;}),/accessor descriptor/);
  assert.equal(calls,2);
  assert.throws(()=>captureDataCompletion(()=>{throw new Error('native error');}),/exotic/);
});
