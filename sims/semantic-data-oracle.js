'use strict';

const {types} = require('node:util');

// A trusted host loads this helper before the subject. Snapshotting uses
// captured original primordials, not mutable intrinsics the subject may patch.
const SafeMap=Map;
const apply=Reflect.apply;
const isNumberNaN=Number.isNaN;
const objectIs=Object.is;
const getPrototypeOf=Object.getPrototypeOf;
const isExtensible=Object.isExtensible;
const hasOwn=Object.hasOwn;
const arrayIsArray=Array.isArray;
const ownKeys=Reflect.ownKeys;
const ownDescriptor=Reflect.getOwnPropertyDescriptor;
const defineProperty=Reflect.defineProperty;
const keyFor=Symbol.keyFor;
const bigIntToString=BigInt.prototype.toString;
const mapGet=Map.prototype.get;
const mapSet=Map.prototype.set;
const sizeGetter=Object.getOwnPropertyDescriptor(Map.prototype,'size')?.get;
const descriptionGetter=Object.getOwnPropertyDescriptor(Symbol.prototype,'description')?.get;
if(!sizeGetter||!descriptionGetter) throw new Error('data oracle requires Map size and Symbol description');
const isProxy=types.isProxy;
const exoticChecks=[
  types.isMap,types.isSet,types.isWeakMap,types.isWeakSet,
  types.isDate,types.isRegExp,types.isNativeError,
  types.isPromise,types.isBoxedPrimitive,types.isAnyArrayBuffer,
  types.isArrayBufferView,types.isArgumentsObject,
  types.isModuleNamespaceObject,types.isGeneratorObject
];

/** @typedef {Record<string,unknown>} Snapshot */
/** @typedef {{objectPrototype:object,arrayPrototype:object}} DataRealm */

/** @type {Map<symbol,string>} */
const wellKnownSymbols = new SafeMap();
for (const name of Object.getOwnPropertyNames(Symbol)) {
  const value = Object.getOwnPropertyDescriptor(Symbol,name)?.value;
  if (typeof value === 'symbol') apply(mapSet,wellKnownSymbols,[value,name]);
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
  const objects=new SafeMap();
  /** @type {Map<symbol,number>} */
  const localSymbols=new SafeMap();
  let properties=0;
  /** @param {unknown} value @param {number} depth @returns {Snapshot} */
  function encode(value,depth) {
    if(depth>128) throw new RangeError('data oracle depth limit');
    if(value===null) return {tag:'null'};
    switch(typeof value) {
      case 'undefined': return {tag:'undefined'};
      case 'boolean': return {tag:'boolean',value};
      case 'string': return {tag:'string',value};
      case 'bigint': return {tag:'bigint',value:apply(bigIntToString,value,[10])};
      case 'number': return {tag:'number',value:isNumberNaN(value)?'NaN':
        objectIs(value,-0)?'-0':value===Infinity?'+Infinity':
          value===-Infinity?'-Infinity':value};
      case 'symbol': {
        const wellKnown=apply(mapGet,wellKnownSymbols,[value]);
        if(wellKnown!==undefined) return {tag:'well-known-symbol',name:wellKnown};
        const global=keyFor(value);
        if(global!==undefined) return {tag:'global-symbol',key:global};
        let id=apply(mapGet,localSymbols,[value]);
        if(id===undefined) {id=apply(sizeGetter,localSymbols,[]);apply(mapSet,localSymbols,[value,id]);}
        return {tag:'local-symbol',id,description:apply(descriptionGetter,value,[])??null};
      }
      case 'function': throw new TypeError('data oracle refuses callable values');
      case 'object': break;
      default: throw new TypeError('data oracle unsupported type');
    }
    if(apply(isProxy,types,[value])) throw new TypeError('data oracle refuses Proxy');
    for(let i=0;i<exoticChecks.length;i++){
      if(apply(exoticChecks[i],types,[value]))
        throw new TypeError('data oracle refuses known exotic object');
    }
    const existing=apply(mapGet,objects,[value]);
    if(existing!==undefined) return {tag:'reference',id:existing};
    if(apply(sizeGetter,objects,[])>=10000) throw new RangeError('data oracle object limit');
    const prototype=getPrototypeOf(value);
    const prototypeTag=prototype===null?'null':prototype===realm.objectPrototype?'object':
      prototype===realm.arrayPrototype?'array':null;
    if(prototypeTag===null) throw new TypeError('data oracle refuses unsupported prototype');
    const id=apply(sizeGetter,objects,[]);
    apply(mapSet,objects,[value,id]);
    const keys=ownKeys(value);
    properties+=keys.length;
    if(properties>50000) throw new RangeError('data oracle property limit');
    /** @type {Snapshot[]} */
    const descriptors=[];
    for(let i=0;i<keys.length;i++){
      const key=keys[i];
      const descriptor=ownDescriptor(value,key);
      if(!descriptor||!hasOwn(descriptor,'value'))
        throw new TypeError('data oracle refuses accessor descriptor');
      // Define an own index; patched Array.prototype.map/push or an inherited
      // numeric setter must not corrupt the independent snapshot.
      defineProperty(descriptors,i,{value:{
        key:encode(key,depth+1),value:encode(descriptor.value,depth+1),
        enumerable:descriptor.enumerable===true,configurable:descriptor.configurable===true,
        writable:descriptor.writable===true
      },writable:true,enumerable:true,configurable:true});
    }
    return {tag:'object',id,kind:arrayIsArray(value)?'array':'record',
      prototype:prototypeTag,extensible:isExtensible(value),descriptors};
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
