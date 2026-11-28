'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {snapshotDataGraph,serializeDataSnapshot}=require('../sims/semantic-data-oracle');

test('exact-data wire transport ignores subject-patched JSON and inherited toJSON',()=>{
  const shared={publicValue:-0};
  const input=[NaN,-0,Infinity,-Infinity,undefined,9007199254740993n,
    shared,shared,Symbol('same'),Symbol('same'),Symbol.for('global'),Symbol.iterator];
  const expected=JSON.stringify(snapshotDataGraph(input));
  const originalJSONStringify=JSON.stringify;
  const originalObjectToJSON=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON');
  const originalArrayToJSON=Object.getOwnPropertyDescriptor(Array.prototype,'toJSON');
  const originalStringToJSON=Object.getOwnPropertyDescriptor(String.prototype,'toJSON');
  let hostileInvocations=0;
  /** @type {string|undefined} */
  let observed;
  try{
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,
      value(){hostileInvocations++;return 'forged-object';}});
    Object.defineProperty(Array.prototype,'toJSON',{configurable:true,
      value(){hostileInvocations++;return 'forged-array';}});
    Object.defineProperty(String.prototype,'toJSON',{configurable:true,
      value(){hostileInvocations++;return 'forged-string';}});
    JSON.stringify=()=>{hostileInvocations++;return '"forged-json"';};
    // Snapshot the same original root AFTER installing the hostile inherited
    // methods; a trusted observer must never consult those methods.
    observed=serializeDataSnapshot(snapshotDataGraph(input));
  }finally{
    JSON.stringify=originalJSONStringify;
    for(const [target,descriptor] of /** @type {Array<[object,PropertyDescriptor|undefined]>} */([
      [Object.prototype,originalObjectToJSON],
      [Array.prototype,originalArrayToJSON],
      [String.prototype,originalStringToJSON]
    ])){
      if(descriptor)Object.defineProperty(target,'toJSON',descriptor);
      else Reflect.deleteProperty(target,'toJSON');
    }
  }
  assert.equal(hostileInvocations,0,'subject toJSON or JSON.stringify must not run');
  assert.equal(observed,expected,'tampered and untouched serializations must match exactly');
  assert.deepEqual(JSON.parse(/** @type {string} */(observed)),
    snapshotDataGraph(input));
});

test('trusted snapshot serializer rejects value traps and untagged exotics',()=>{
  let trapCalls=0;
  const accessor={get foo(){trapCalls++;return 41;}};
  assert.throws(()=>serializeDataSnapshot(accessor),/accessor/);
  const proxy=new Proxy({a:1},{ownKeys(){trapCalls++;return ['a'];}});
  assert.throws(()=>serializeDataSnapshot(proxy),/Proxy/);
  assert.throws(()=>serializeDataSnapshot(1n),/non-JSON/);
  assert.throws(()=>serializeDataSnapshot([,]),/hole/);
  assert.throws(()=>serializeDataSnapshot(NaN),/nonfinite/);
  assert.equal(trapCalls,0,'no hostile accessor/proxy callback should be executed');
});
