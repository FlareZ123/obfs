'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {types}=require('node:util');
const {snapshotDataGraph,serializeDataSnapshot}=require('../sims/semantic-data-oracle');

test('trusted oracle is invariant to subject-side mutable intrinsic replacement',()=>{
  const shared={privateValue:-0};
  const symbol=Symbol('genuine');
  /** @type {unknown[]} */
  const graph=[NaN,-0,9007199254740993n,symbol,symbol,
    Symbol.for('registry'),shared,shared];
  graph.push(graph);
  const baseline=snapshotDataGraph(graph);
  const expectedWire=serializeDataSnapshot(baseline);
  const nativeMap=new Map();
  const originalObject=globalThis.Object;
  const originalArray=globalThis.Array;
  const originalString=globalThis.String;
  const originalTypeError=globalThis.TypeError;
  const originalRangeError=globalThis.RangeError;
  let globalsRebound=false;
  /** @type {{target:object,key:PropertyKey,original:PropertyDescriptor}[]} */
  const saved=[];
  let unexpectedGetterCalls=0;
  /**
   * @param {object} target
   * @param {PropertyKey} key
   * @param {PropertyDescriptor} replacement
   */
  function patch(target,key,replacement){
    const original=Object.getOwnPropertyDescriptor(target,key);
    if(!original||!original.configurable)
      throw new TypeError('expected configurable intrinsic '+String(key));
    saved.push({target,key,original});
    Object.defineProperty(target,key,{configurable:true,...replacement});
  }
  /** @type {ReturnType<typeof snapshotDataGraph>|undefined} */
  let observed;
  /** @type {string|undefined} */
  let observedWire;
  /** @type {unknown} */
  let proxyError;
  /** @type {unknown} */
  let exoticError;
  try {
    patch(Number,'isNaN',{value:()=>false,writable:true});
    patch(Object,'is',{value:()=>false,writable:true});
    patch(Object,'getPrototypeOf',{value:()=>null,writable:true});
    patch(Object,'isExtensible',{value:()=>false,writable:true});
    patch(Object,'hasOwn',{value:()=>false,writable:true});
    patch(Reflect,'ownKeys',{value:()=>[],writable:true});
    patch(Reflect,'getOwnPropertyDescriptor',{value:()=>undefined,writable:true});
    patch(Reflect,'apply',{value:()=>{throw Error('mutated apply');},writable:true});
    patch(Symbol,'keyFor',{value:()=> 'spoofed',writable:true});
    patch(Symbol.prototype,'description',{get(){unexpectedGetterCalls++;return 'spoof';}});
    patch(BigInt.prototype,'toString',{value:()=> '0',writable:true});
    patch(Map.prototype,'get',{value:()=>undefined,writable:true});
    patch(Map.prototype,'set',{value:()=>undefined,writable:true});
    patch(Map.prototype,'size',{get:()=>0});
    patch(Array.prototype,'map',{value:()=>[],writable:true});
    patch(types,'isProxy',{value:()=>false,writable:true});
    patch(types,'isMap',{value:()=>false,writable:true});
    // Replacement of the global constructor bindings must not change the
    // previously captured ordinary-realm prototypes or refusal constructors.
    Reflect.set(globalThis,'Object',function FakeObject(){});
    Reflect.set(globalThis,'Array',function FakeArray(){});
    Reflect.set(globalThis,'String',function FakeString(){throw Error('host String may not run');});
    Reflect.set(globalThis,'TypeError',function FakeTypeError(){});
    Reflect.set(globalThis,'RangeError',function FakeRangeError(){});
    globalsRebound=true;

    observed=snapshotDataGraph(graph);
    observedWire=serializeDataSnapshot(observed);
    try{
      snapshotDataGraph(new Proxy({}, {
        ownKeys(){unexpectedGetterCalls++;return [];},
        getPrototypeOf(){unexpectedGetterCalls++;return Object.prototype;}
      }));
    }catch(error){proxyError=error;}
    try{snapshotDataGraph(nativeMap);}
    catch(error){exoticError=error;}
  }finally{
    if(globalsRebound){
      Reflect.set(globalThis,'Object',originalObject);
      Reflect.set(globalThis,'Array',originalArray);
      Reflect.set(globalThis,'String',originalString);
      Reflect.set(globalThis,'TypeError',originalTypeError);
      Reflect.set(globalThis,'RangeError',originalRangeError);
    }
    for(let i=saved.length-1;i>=0;i--){
      const item=saved[i];
      Object.defineProperty(item.target,item.key,item.original);
    }
  }
  assert.deepEqual(observed,baseline,
    'snapshot must not trust mutably replaced global intrinsics after loading');
  assert.equal(observedWire,expectedWire,
    'serialized snapshot must ignore rebound global String and other primordials');
  assert.equal(unexpectedGetterCalls,0,
    'neither user Symbol.description nor Proxy traps may execute');
  assert.match(String(proxyError),/Proxy/);
  assert.match(String(exoticError),/exotic/);
});
