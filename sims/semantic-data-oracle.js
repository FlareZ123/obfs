'use strict';

const {types} = require('node:util');

/** @typedef {Record<string,unknown>} Snapshot */
/** @typedef {{objectPrototype:object,arrayPrototype:object}} DataRealm */

/** @type {Map<symbol,string>} */
const wellKnownSymbols = new Map();
for (const name of Object.getOwnPropertyNames(Symbol)) {
  const value = Object.getOwnPropertyDescriptor(Symbol,name)?.value;
  if (typeof value === 'symbol') wellKnownSymbols.set(value,name);
}

/**
 * Exact, JSON-compatible observation of a bounded ordinary data graph.
 * Preserves primitive type/value, signed zero, NaN, infinities, BigInt, symbol
 * identity, own key order, data descriptors, holes, aliasing, cycles and object
 * extensibility. Uses the supplied realm's ordinary Object/Array prototypes.
 * Does not call getters, invoke toJSON, coerce objects or traverse prototypes.
 *
 * Contract: use for test-controlled plain records/arrays and scalar values,
 * not arbitrary host objects. Prototype contents, exotic internal slots,
 * function behavior, and runtime side effects require separate observations.
 * Unsupported accessors, proxies, callable values and known exotics throw.
 * A successful snapshot is not a proof of arbitrary program equivalence.
 *
 * @param {unknown} root
 * @param {DataRealm} [realm]
 * @returns {Snapshot}
 */
function snapshotDataGraph(root,realm={objectPrototype:Object.prototype,arrayPrototype:Array.prototype}) {
  /** @type {Map<object,number>} */
  const objects=new Map();
  /** @type {Map<symbol,number>} */
  const localSymbols=new Map();
  let properties=0;
  /** @param {unknown} value @param {number} depth @returns {Snapshot} */
  function encode(value,depth) {
    if(depth>128) throw new RangeError('data oracle depth limit');
    if(value===null) return {tag:'null'};
    switch(typeof value) {
      case 'undefined': return {tag:'undefined'};
      case 'boolean': return {tag:'boolean',value};
      case 'string': return {tag:'string',value};
      case 'bigint': return {tag:'bigint',value:value.toString(10)};
      case 'number': return {tag:'number',value:Number.isNaN(value)?'NaN':
        Object.is(value,-0)?'-0':value===Infinity?'+Infinity':
          value===-Infinity?'-Infinity':value};
      case 'symbol': {
        const wellKnown=wellKnownSymbols.get(value);
        if(wellKnown!==undefined) return {tag:'well-known-symbol',name:wellKnown};
        const global=Symbol.keyFor(value);
        if(global!==undefined) return {tag:'global-symbol',key:global};
        let id=localSymbols.get(value);
        if(id===undefined) {id=localSymbols.size;localSymbols.set(value,id);}
        return {tag:'local-symbol',id,description:value.description??null};
      }
      case 'function': throw new TypeError('data oracle refuses callable values');
      case 'object': break;
      default: throw new TypeError('data oracle unsupported type');
    }
    if(types.isProxy(value)) throw new TypeError('data oracle refuses Proxy');
    if(types.isMap(value)||types.isSet(value)||types.isWeakMap(value)||types.isWeakSet(value)||
       types.isDate(value)||types.isRegExp(value)||types.isNativeError(value)||
       types.isPromise(value)||types.isBoxedPrimitive(value)||types.isAnyArrayBuffer(value)||
       types.isArrayBufferView(value)||types.isArgumentsObject(value)||
       types.isModuleNamespaceObject(value)||types.isGeneratorObject(value))
      throw new TypeError('data oracle refuses known exotic object');
    const existing=objects.get(value);
    if(existing!==undefined) return {tag:'reference',id:existing};
    if(objects.size>=10000) throw new RangeError('data oracle object limit');
    const prototype=Object.getPrototypeOf(value);
    const prototypeTag=prototype===null?'null':prototype===realm.objectPrototype?'object':
      prototype===realm.arrayPrototype?'array':null;
    if(prototypeTag===null) throw new TypeError('data oracle refuses unsupported prototype');
    const id=objects.size;
    objects.set(value,id);
    const keys=Reflect.ownKeys(value);
    properties+=keys.length;
    if(properties>50000) throw new RangeError('data oracle property limit');
    const descriptors=keys.map(key=>{
      const descriptor=Reflect.getOwnPropertyDescriptor(value,key);
      if(!descriptor||!Object.hasOwn(descriptor,'value'))
        throw new TypeError('data oracle refuses accessor descriptor');
      return {key:encode(key,depth+1),value:encode(descriptor.value,depth+1),
        enumerable:descriptor.enumerable===true,configurable:descriptor.configurable===true,
        writable:descriptor.writable===true};
    });
    return {tag:'object',id,kind:Array.isArray(value)?'array':'record',
      prototype:prototypeTag,extensible:Object.isExtensible(value),descriptors};
  }
  return encode(root,0);
}

/**
 * Observe normal versus abrupt completion for a synchronous data-returning
 * operation. Snapshotting deliberately happens outside the catch: an oracle
 * refusal must not be misreported as an exception thrown by the program.
 * Native Error instances and other unsupported thrown values still refuse;
 * an Error name/message/stack contract needs an explicit separate observer.
 * @param {()=>unknown} operation
 * @param {DataRealm} [realm]
 * @returns {{kind:'return'|'throw',value:Snapshot}}
 */
function captureDataCompletion(operation,realm) {
  /** @type {'return'|'throw'} */
  let kind='return';
  let value;
  try { value=operation(); }
  catch(error) { kind='throw';value=error; }
  return {kind,value:snapshotDataGraph(value,realm)};
}

module.exports={snapshotDataGraph,captureDataCompletion};
