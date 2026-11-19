'use strict';

const assert = require('node:assert/strict');
const {pairedBudgetBound} = require('./paired-budget-bound');

/** @typedef {['p',null|boolean|string|number]|['u']|['n',string]|['b',string]|['r',string]} WireValue */
/** @typedef {{id:string,kind:'array'|'object'|'null-object',length?:number,entries:Array<[string,WireValue]>}} WireNode */
/** @typedef {{roots:WireValue[],nodes:WireNode[]}} WireGraph */

/** @returns {{objectToId:WeakMap<object,string>,idToObject:Map<string,object>,nextId:number}} */
function createClientSession() {
  return {objectToId: new WeakMap(), idToObject: new Map(), nextId: 1};
}

/** @param {unknown} value @returns {WireValue} */
function encodeScalar(value) {
  if(value===undefined)return ['u'];
  if(value===null||typeof value==='boolean'||typeof value==='string')return ['p',value];
  if(typeof value==='number') {
    if(Object.is(value,-0))return ['n','-0'];
    if(Number.isNaN(value))return ['n','nan'];
    if(value===Infinity)return ['n','inf'];
    if(value===-Infinity)return ['n','-inf'];
    return ['p',value];
  }
  if(typeof value==='bigint')return ['b',value.toString()];
  throw new TypeError('Unsupported scalar in identity envelope');
}

/** @param {object} value @returns {'array'|'object'|'null-object'} */
function objectKind(value) {
  if(Array.isArray(value))return 'array';
  const prototype=Object.getPrototypeOf(value);
  if(prototype===Object.prototype)return 'object';
  if(prototype===null)return 'null-object';
  throw new TypeError('Identity envelope requires Array, Object, or null-prototype objects');
}

/** @param {object} value @returns {void} */
function assertAdmittedObject(value) {
  objectKind(value);
  if(Object.getOwnPropertySymbols(value).length) {
    throw new TypeError('Identity envelope refuses symbol properties');
  }
  for(const key of Reflect.ownKeys(value)) {
    if(typeof key!=='string'||Array.isArray(value)&&key==='length')continue;
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||descriptor.enumerable!==true||!Object.hasOwn(descriptor,'value')) {
      throw new TypeError('Identity envelope requires enumerable own data properties');
    }
  }
}

/**
 * @param {unknown[]} roots
 * @param {{objectToId:WeakMap<object,string>,idToObject:Map<string,object>,nextId:number}} session
 * @returns {WireGraph}
 */
function encodeClientGraph(roots,session) {
  /** @type {WireNode[]} */
  const nodes=[];
  /** @type {Set<string>} */
  const emitted=new Set();

  /** @param {unknown} value @returns {WireValue} */
  function encode(value) {
    if((typeof value!=='object'||value===null))return encodeScalar(value);
    assertAdmittedObject(value);
    let id=session.objectToId.get(value);
    if(!id) {
      id='c'+session.nextId++;
      session.objectToId.set(value,id);
      session.idToObject.set(id,value);
    }
    if(!emitted.has(id)) {
      emitted.add(id);
      const kind=objectKind(value);
      /** @type {WireNode} */
      const node={id,kind,entries:[]};
      if(Array.isArray(value))node.length=value.length;
      nodes.push(node);
      const indexed=/** @type {Record<string,any>} */ (value);
      for(const key of Object.keys(value))node.entries.push([key,encode(indexed[key])]);
    }
    return ['r',id];
  }

  return {roots:roots.map(encode),nodes};
}

/**
 * @param {unknown[]} roots
 * @param {WeakMap<object,string>} existingIds
 * @returns {WireGraph}
 */
function encodeServerGraph(roots,existingIds) {
  /** @type {WireNode[]} */
  const nodes=[];
  /** @type {Map<object,string>} */
  const newIds=new Map();
  /** @type {Set<string>} */
  const emitted=new Set();
  let nextNew=1;

  /** @param {unknown} value @returns {WireValue} */
  function encode(value) {
    if((typeof value!=='object'||value===null))return encodeScalar(value);
    assertAdmittedObject(value);
    let id=existingIds.get(value)??newIds.get(value);
    if(!id) {
      id='r'+nextNew++;
      newIds.set(value,id);
    }
    if(!emitted.has(id)) {
      emitted.add(id);
      const kind=objectKind(value);
      /** @type {WireNode} */
      const node={id,kind,entries:[]};
      if(Array.isArray(value))node.length=value.length;
      nodes.push(node);
      const indexed=/** @type {Record<string,any>} */ (value);
      for(const key of Object.keys(value))node.entries.push([key,encode(indexed[key])]);
    }
    return ['r',id];
  }

  return {roots:roots.map(encode),nodes};
}

/** @param {WireValue} value @param {Map<string,object>} objects @returns {unknown} */
function decodeValue(value,objects) {
  if(value[0]==='p')return value[1];
  if(value[0]==='u')return undefined;
  if(value[0]==='b')return BigInt(value[1]);
  if(value[0]==='n') {
    if(value[1]==='-0')return -0;
    if(value[1]==='nan')return NaN;
    if(value[1]==='inf')return Infinity;
    if(value[1]==='-inf')return -Infinity;
    throw new TypeError('Unknown numeric tag');
  }
  const object=objects.get(value[1]);
  if(!object)throw new TypeError('Unknown graph reference');
  return object;
}

/** @param {object} object @returns {void} */
function clearAdmittedObject(object) {
  if(Array.isArray(object)) {
    for(const key of Object.keys(object))Reflect.deleteProperty(object,key);
    object.length=0;
    return;
  }
  for(const key of Object.keys(object))Reflect.deleteProperty(object,key);
}

/** @param {object} object @param {string} key @param {unknown} value @returns {void} */
function defineData(object,key,value) {
  Object.defineProperty(object,key,{
    value,enumerable:true,writable:true,configurable:true
  });
}

/**
 * @param {WireGraph} graph
 * @param {Map<string,object>} [reuse]
 * @returns {{roots:unknown[],objectIds:WeakMap<object,string>,idToObject:Map<string,object>}}
 */
function decodeGraph(graph,reuse=new Map()) {
  /** @type {Map<string,object>} */
  const objects=new Map();
  /** @type {WeakMap<object,string>} */
  const objectIds=new WeakMap();

  for(const node of graph.nodes) {
    let object=reuse.get(node.id);
    if(object) {
      const kind=objectKind(object);
      if(kind!==node.kind)throw new TypeError('Graph kind changed across RPC boundary');
      clearAdmittedObject(object);
    } else {
      object=node.kind==='array' ? [] :
        node.kind==='null-object' ? Object.create(null) : {};
    }
    if(!object)throw new TypeError('Failed to allocate graph node');
    objects.set(node.id,object);
    objectIds.set(object,node.id);
  }

  for(const node of graph.nodes) {
    const object=objects.get(node.id);
    if(!object)throw new TypeError('Missing allocated graph node');
    if(Array.isArray(object))object.length=node.length??0;
    for(const [key,encoded] of node.entries) {
      defineData(object,key,decodeValue(encoded,objects));
    }
  }

  return {roots:graph.roots.map(value=>decodeValue(value,objects)),objectIds,idToObject:objects};
}

/** @param {WireGraph} graph @returns {WireGraph} */
function jsonTransport(graph) {
  return /** @type {WireGraph} */ (JSON.parse(JSON.stringify(graph)));
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @param {ReturnType<typeof createClientSession>} session
 * @returns {unknown}
 */
function invokeIdentity(task,args,session) {
  const request=jsonTransport(encodeClientGraph(args,session));
  const server=decodeGraph(request);
  const result=task(...server.roots);
  const response=jsonTransport(encodeServerGraph([result,...server.roots],server.objectIds));
  const client=decodeGraph(response,session.idToObject);
  for(const [id,object] of client.idToObject) {
    if(id.startsWith('c')&&!session.idToObject.has(id))session.idToObject.set(id,object);
  }
  return client.roots[0];
}

/** @returns {object} */
function semanticProbe() {
  const session=createClientSession();
  /** @type {any[]} */
  const shared=[];
  shared.push(shared,-0,undefined,NaN,12345678901234567890n);
  Object.defineProperty(shared,'__proto__',{
    value:'own-proto-data',enumerable:true,writable:true,configurable:true
  });

  const echo=invokeIdentity(value=>value,[shared],session);
  assert.strictEqual(echo,shared);
  assert.strictEqual(shared[0],shared);
  assert.equal(Object.is(shared[1],-0),true);
  assert.equal(shared[2],undefined);
  assert.equal(Number.isNaN(shared[3]),true);
  assert.equal(shared[4],12345678901234567890n);
  assert.equal(Object.hasOwn(shared,'__proto__'),true);
  assert.equal(/** @type {any} */ (shared).__proto__,'own-proto-data');

  const alias={count:1};
  const aliasResult=invokeIdentity((a,b)=>({same:a===b}),[alias,alias],session);
  assert.deepEqual(aliasResult,{same:true});

  const sparse=new Array(3);
  sparse[2]=7;
  invokeIdentity(value=>{value[2]=9;return value;},[sparse],session);
  assert.equal(Object.hasOwn(sparse,0),false);
  assert.equal(Object.hasOwn(sparse,1),false);
  assert.equal(sparse[2],9);

  /** @type {{count:number,nested:{value:number},added?:number}} */
  const mutable={count:1,nested:{value:2}};
  const mutationResult=invokeIdentity(value=>{
    value.count=3;
    value.nested.value=5;
    value.added=-0;
    return value.nested;
  },[mutable],session);
  assert.strictEqual(mutationResult,mutable.nested);
  assert.deepEqual({count:mutable.count,nested:mutable.nested.value},
    {count:3,nested:5});
  assert.equal(Object.is(mutable.added,-0),true);

  const created=/** @type {any} */ (invokeIdentity(value=>{
    /** @type {any} */
    const root={copy:value.count};
    root.self=root;
    root.left={x:1};
    root.right=root.left;
    return root;
  },[mutable],session));
  assert.notStrictEqual(created,mutable);
  assert.strictEqual(created.self,created);
  assert.strictEqual(created.left,created.right);

  const negative={};
  Object.defineProperty(negative,'getter',{enumerable:true,get(){return 1;}});
  let getterRejected=false;
  try {
    encodeClientGraph([negative],createClientSession());
  } catch(error) {
    assert.ok(error instanceof TypeError);
    getterRejected=true;
  }
  assert.equal(getterRejected,true);
  /** @type {Record<PropertyKey,unknown>} */
  const symbolObject={};
  symbolObject[Symbol('x')]=1;
  assert.throws(()=>encodeClientGraph([symbolObject],createClientSession()),TypeError);
  const custom=Object.create({inherited:1});
  custom.own=2;
  assert.throws(()=>encodeClientGraph([custom],createClientSession()),TypeError);

  return {
    echoIdentity: echo===shared,
    cycle: shared[0]===shared,
    aliasObservedServerSide: aliasResult.same===true,
    sparseHolePreserved: !Object.hasOwn(sparse,0)&&!Object.hasOwn(sparse,1),
    mutationReconciled: mutable.count===3&&mutable.nested.value===5,
    nestedResultIdentity: mutationResult===mutable.nested,
    createdCycle: created.self===created,
    createdAlias: created.left===created.right,
    getterRejected,
    ownProtoPreserved: Object.hasOwn(shared,'__proto__')&&/** @type {any} */ (shared).__proto__==='own-proto-data'
  };
}

/** @param {number} count @returns {{category:string,records:Array<{index:number,label:string,quantity:number}>}} */
function payload(count) {
  return {
    category:'identity-envelope',
    records:Array.from({length:count},(_,index)=>({
      index,label:'event-'+index,quantity:Math.imul(index+1,2654435761)|0
    }))
  };
}

/** @param {ReturnType<typeof payload>} data @returns {number} */
function task(data) {
  let state=0x13579bdf;
  for(const record of data.records) {
    state=Math.imul((state^record.quantity^record.index)|0,0x45d9f3b)|0;
    state=(state+record.label.length)|0;
  }
  for(let round=0;round<25000;round++)
    state=Math.imul((state^round)|0,0x27d4eb2d)|0;
  return state|0;
}

/**
 * @param {'native'|'json'|'identity'} variant
 * @param {ReturnType<typeof payload>} data
 * @param {number} repeats
 * @param {ReturnType<typeof createClientSession>} session
 * @returns {{cpuMicros:number,checksum:number}}
 */
function sample(variant,data,repeats,session) {
  let checksum=0;
  const started=process.cpuUsage();
  for(let index=0;index<repeats;index++) {
    const result=variant==='native' ? task(data) :
      variant==='json' ? task(JSON.parse(JSON.stringify(data))) :
      invokeIdentity(task,[data],session);
    checksum=(checksum+Number(result))|0;
  }
  const elapsed=process.cpuUsage(started);
  return {cpuMicros:elapsed.user+elapsed.system,checksum};
}

/** @param {ReturnType<typeof payload>} data @returns {object} */
function profile(data) {
  const repeats=2048;
  const session=createClientSession();
  /** @type {Record<'native'|'json'|'identity',number[]>} */
  const values={native:[],json:[],identity:[]};
  for(const variant of /** @type {const} */ (['native','json','identity']))
    sample(variant,data,32,session);
  const orders=[
    /** @type {const} */ (['native','json','identity']),
    /** @type {const} */ (['identity','native','json']),
    /** @type {const} */ (['json','identity','native'])
  ];
  for(let trial=0;trial<12;trial++) {
    /** @type {Record<string,number>} */
    const checksums={};
    for(const variant of orders[trial%orders.length]) {
      const observation=sample(variant,data,repeats,session);
      values[variant].push(observation.cpuMicros);
      checksums[variant]=observation.checksum;
    }
    assert.equal(checksums.json,checksums.native);
    assert.equal(checksums.identity,checksums.native);
  }
  return {
    repeats,
    rawCpuMicros:values,
    jsonVsNative:pairedBudgetBound(values.native,values.json),
    identityVsNative:pairedBudgetBound(values.native,values.identity),
    identityVsJson:pairedBudgetBound(values.json,values.identity)
  };
}

/** @returns {object} */
function run() {
  return {
    node:process.version,
    platform:process.platform,
    semanticProbe:semanticProbe(),
    rows:[1,32].map(count=>({count,profile:profile(payload(count))})),
    boundary:'in-process two-way JSON graph envelope and reconciliation plus task; no HTTP/browser/auth/network'
  };
}

if(require.main===module) {
  process.stdout.write('SCO_JSON_IDENTITY_ENVELOPE '+JSON.stringify(run())+'\n');
}

module.exports={
  createClientSession,encodeClientGraph,encodeServerGraph,decodeGraph,jsonTransport,
  invokeIdentity,semanticProbe,payload,task,profile,run
};
