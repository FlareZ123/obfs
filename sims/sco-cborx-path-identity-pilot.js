'use strict';

const assert=require('node:assert/strict');
const {Encoder}=require('cbor-x');
const {pairedBudgetBound}=require('./paired-budget-bound');

const encoder=new Encoder({
  structuredClone:true,
  useRecords:false,
  alwaysUseFloat:true
});

/** @typedef {{arg:number,keys:string[]}} PathToken */

/** @template T @param {T} value @returns {T} */
function cborWire(value){
  return /** @type {T} */ (encoder.decode(encoder.encode(value)));
}

/** @param {object} value @returns {boolean} */
function isLeafObject(value){
  return value instanceof Date||value instanceof RegExp||
    value instanceof Set||value instanceof Map;
}

/** @param {object} value @returns {void} */
function assertPathContainer(value){
  const prototype=Object.getPrototypeOf(value);
  if(!Array.isArray(value)&&prototype!==Object.prototype&&prototype!==null){
    throw new TypeError('Path identity requires Array, Object, null-prototype, or admitted leaf objects');
  }
  if(Object.getOwnPropertySymbols(value).length){
    throw new TypeError('Path identity refuses symbol properties');
  }
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string')continue;
    if(Array.isArray(value)&&key==='length')continue;
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||descriptor.enumerable!==true||!Object.hasOwn(descriptor,'value')){
      throw new TypeError('Path identity requires enumerable own string data properties');
    }
  }
}

/**
 * @param {unknown[]} args
 * @returns {WeakMap<object,PathToken>}
 */
function buildPathIndex(args){
  /** @type {WeakMap<object,PathToken>} */
  const index=new WeakMap();
  /** @type {Array<{value:object,path:PathToken}>} */
  const queue=[];
  for(let arg=0;arg<args.length;arg++){
    const value=args[arg];
    if(typeof value!=='object'||value===null)continue;
    if(isLeafObject(value))continue;
    assertPathContainer(value);
    if(!index.has(value)){
      const path={arg,keys:[]};
      index.set(value,path);
      queue.push({value,path});
    }
  }
  for(let cursor=0;cursor<queue.length;cursor++){
    const current=queue[cursor];
    assertPathContainer(current.value);
    const record=/** @type {Record<string,unknown>} */ (current.value);
    for(const key of Object.keys(current.value)){
      const child=record[key];
      if(typeof child!=='object'||child===null||isLeafObject(child))continue;
      assertPathContainer(child);
      if(index.has(child))continue;
      const path={arg:current.path.arg,keys:[...current.path.keys,key]};
      index.set(child,path);
      queue.push({value:child,path});
    }
  }
  return index;
}

/**
 * @param {unknown[]} args
 * @param {PathToken} token
 * @returns {object}
 */
function resolvePath(args,token){
  if(!Number.isInteger(token.arg)||token.arg<0||token.arg>=args.length){
    throw new TypeError('Invalid path argument index');
  }
  let value=args[token.arg];
  for(const key of token.keys){
    if(typeof value!=='object'||value===null){
      throw new TypeError('Path traversed a non-object');
    }
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||descriptor.enumerable!==true||!Object.hasOwn(descriptor,'value')){
      throw new TypeError('Path requires enumerable own data property');
    }
    value=descriptor.value;
  }
  if(typeof value!=='object'||value===null){
    throw new TypeError('Path result must be an object');
  }
  return value;
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @returns {unknown}
 */
function invokeCborValue(task,args){
  const serverArgs=/** @type {unknown[]} */ (cborWire(args));
  return cborWire(task(...serverArgs));
}

/**
 * Prior root-token behavior: nested results fall back to value response.
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @returns {unknown}
 */
function invokeRootToken(task,args){
  const serverArgs=/** @type {unknown[]} */ (cborWire(args));
  const result=task(...serverArgs);
  let index=-1;
  if(typeof result==='object'&&result!==null){
    index=serverArgs.findIndex(value=>value===result);
  }
  const envelope=index>=0?{kind:'arg',index}:{kind:'value',value:result};
  const decoded=/** @type {{kind:'arg',index:number}|{kind:'value',value:unknown}} */ (cborWire(envelope));
  if(decoded.kind==='arg'){
    const original=args[decoded.index];
    if(original===undefined)throw new TypeError('Invalid root-token argument index');
    return original;
  }
  return decoded.value;
}

/**
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @returns {unknown}
 */
function invokePathIdentity(task,args){
  const serverArgs=/** @type {unknown[]} */ (cborWire(args));
  const index=buildPathIndex(serverArgs);
  const result=task(...serverArgs);
  const token=typeof result==='object'&&result!==null?index.get(result):undefined;
  const envelope=token?
    {kind:'path',arg:token.arg,keys:token.keys}:
    {kind:'value',value:result};
  const decoded=/** @type {{kind:'path',arg:number,keys:string[]}|{kind:'value',value:unknown}} */ (
    cborWire(envelope)
  );
  if(decoded.kind==='path'){
    return resolvePath(args,{arg:decoded.arg,keys:decoded.keys});
  }
  return decoded.value;
}

/**
 * Use compile-time return-path metadata and verify it against the executed
 * result without indexing the request graph.
 * @param {(...args:any[])=>unknown} task
 * @param {unknown[]} args
 * @param {PathToken} token
 * @returns {unknown}
 */
function invokeStaticPath(task,args,token){
  const serverArgs=/** @type {unknown[]} */ (cborWire(args));
  const result=task(...serverArgs);
  const expected=resolvePath(serverArgs,token);
  if(result!==expected){
    throw new TypeError('Static return-path proof mismatch');
  }
  const decoded=/** @type {{kind:'path',arg:number,keys:string[]}} */ (
    cborWire({kind:'path',arg:token.arg,keys:token.keys})
  );
  return resolvePath(args,{arg:decoded.arg,keys:decoded.keys});
}

/** @returns {object} */
function semanticProbe(){
  const shared={marker:'shared'};
  const first={index:0,label:'first',quantity:7};
  const second={index:1,label:'second',quantity:11};
  /** @type {any} */
  const root={
    records:[first,second],
    left:shared,
    right:shared,
    missing:undefined,
    nan:NaN,
    negativeZero:-0,
    bigint:12345678901234567890n
  };
  root.self=root;

  const echo=invokePathIdentity(value=>value,[root]);
  assert.strictEqual(echo,root);

  const nested=invokePathIdentity(value=>value.records[0],[root]);
  assert.strictEqual(nested,first);

  const staticNested=invokeStaticPath(
    value=>value.records[0],
    [root],
    {arg:0,keys:['records','0']}
  );
  assert.strictEqual(staticNested,first);
  assert.throws(
    ()=>invokeStaticPath(value=>value.records[1],[root],{arg:0,keys:['records','0']}),
    TypeError
  );

  const alias=invokePathIdentity(value=>value.right,[root]);
  assert.strictEqual(alias,shared);

  const observed=/** @type {any} */ (invokePathIdentity(value=>({
    cycle:value.self===value,
    alias:value.left===value.right,
    ownUndefined:Object.hasOwn(value,'missing')&&value.missing===undefined,
    nan:Number.isNaN(value.nan),
    negativeZero:Object.is(value.negativeZero,-0),
    bigint:value.bigint===12345678901234567890n
  }),[root]));
  assert.equal(Object.values(observed).every(Boolean),true);

  const created=/** @type {{value:number}} */ (invokePathIdentity(()=>({value:13}),[root]));
  assert.equal(created.value,13);
  assert.notStrictEqual(created,root);

  return {
    contract:'static-path-v3',
    echoIdentity:echo===root,
    nestedIdentity:nested===first,
    staticNestedIdentity:staticNested===first,
    staticMismatchRejected:true,
    aliasIdentity:alias===shared,
    observations:observed,
    independentValue:created.value===13
  };
}

/** @param {number} count @returns {{records:Array<{index:number,label:string,quantity:number}>}} */
function payload(count){
  return {
    records:Array.from({length:count},(_,index)=>({
      index,
      label:'event-'+index,
      quantity:Math.imul(index+1,2654435761)|0
    }))
  };
}

/** @param {ReturnType<typeof payload>} data @returns {{index:number,label:string,quantity:number}} */
function task(data){
  let state=0x13579bdf;
  for(const record of data.records){
    state=Math.imul((state^record.quantity^record.index)|0,0x45d9f3b)|0;
    state=(state+record.label.length)|0;
  }
  for(let round=0;round<25000;round++){
    state=Math.imul((state^round)|0,0x27d4eb2d)|0;
  }
  if(state===0x7fffffff)throw new Error('Unreachable state guard');
  const first=data.records[0];
  if(!first)throw new RangeError('Payload must contain at least one record');
  return first;
}

/**
 * @param {'native'|'cborValue'|'pathIdentity'|'staticPath'} variant
 * @param {ReturnType<typeof payload>} data
 * @param {number} repeats
 * @returns {{cpuMicros:number,checksum:number,identityPreserved:boolean|null}}
 */
function sample(variant,data,repeats){
  let checksum=0;
  let identityPreserved=null;
  const expected=data.records[0];
  const started=process.cpuUsage();
  for(let index=0;index<repeats;index++){
    let result;
    if(variant==='native')result=task(data);
    else if(variant==='cborValue')result=/** @type {ReturnType<typeof task>} */ (
      invokeCborValue(task,[data])
    );
    else if(variant==='pathIdentity')result=/** @type {ReturnType<typeof task>} */ (
      invokePathIdentity(task,[data])
    );
    else result=/** @type {ReturnType<typeof task>} */ (
      invokeStaticPath(task,[data],{arg:0,keys:['records','0']})
    );
    checksum=(checksum+result.quantity+result.label.length)|0;
    if(variant==='pathIdentity'||variant==='staticPath'){
      const same=result===expected;
      identityPreserved=identityPreserved===null?same:identityPreserved&&same;
    }
  }
  const elapsed=process.cpuUsage(started);
  return {
    cpuMicros:elapsed.user+elapsed.system,
    checksum,
    identityPreserved
  };
}

/** @param {number[]} native @param {number[]} candidate @returns {number} */
function strictBreaches(native,candidate){
  return candidate.filter((value,index)=>value/native[index]>2.5).length;
}

/** @param {ReturnType<typeof payload>} data @returns {object} */
function profile(data){
  const repeats=4096;
  /** @type {Record<'native'|'cborValue'|'pathIdentity'|'staticPath',number[]>} */
  const values={native:[],cborValue:[],pathIdentity:[],staticPath:[]};
  for(const variant of /** @type {const} */ (['native','cborValue','pathIdentity','staticPath'])){
    sample(variant,data,16);
  }
  const orders=[
    /** @type {const} */ (['native','cborValue','pathIdentity','staticPath']),
    /** @type {const} */ (['staticPath','native','cborValue','pathIdentity']),
    /** @type {const} */ (['pathIdentity','staticPath','native','cborValue']),
    /** @type {const} */ (['cborValue','pathIdentity','staticPath','native'])
  ];
  for(let trial=0;trial<12;trial++){
    /** @type {Record<string,number>} */
    const checksums={};
    for(const variant of orders[trial%orders.length]){
      const observation=sample(variant,data,repeats);
      if(observation.cpuMicros<=0)throw new TypeError('CPU sample must be positive');
      values[variant].push(observation.cpuMicros);
      checksums[variant]=observation.checksum;
      if((variant==='pathIdentity'||variant==='staticPath')&&observation.identityPreserved!==true){
        throw new TypeError(variant+' failed to return original nested object');
      }
    }
    assert.equal(checksums.cborValue,checksums.native);
    assert.equal(checksums.pathIdentity,checksums.native);
    assert.equal(checksums.staticPath,checksums.native);
  }
  return {
    repeats,
    rawCpuMicros:values,
    cborValueVsNative:pairedBudgetBound(values.native,values.cborValue),
    pathIdentityVsNative:pairedBudgetBound(values.native,values.pathIdentity),
    staticPathVsNative:pairedBudgetBound(values.native,values.staticPath),
    staticPathVsCborValue:pairedBudgetBound(values.cborValue,values.staticPath),
    strictBreaches:{
      cborValueVsNative:strictBreaches(values.native,values.cborValue),
      pathIdentityVsNative:strictBreaches(values.native,values.pathIdentity),
      staticPathVsNative:strictBreaches(values.native,values.staticPath)
    }
  };
}

/** @returns {object} */
function run(){
  return {
    node:process.version,
    platform:process.platform,
    package:'cbor-x@1.6.9',
    contract:'dense-plain-v2',
    options:{structuredClone:true,useRecords:false,alwaysUseFloat:true},
    semanticProbe:semanticProbe(),
    rows:[1,32].map(count=>({count,profile:profile(payload(count))})),
    boundary:'in-process cbor-x request, full path-index or compile-time static-path token, response, and task CPU'
  };
}

if(require.main===module){
  process.stdout.write('SCO_CBORX_PATH_IDENTITY '+JSON.stringify(run())+'\n');
}

module.exports={
  cborWire,
  buildPathIndex,
  resolvePath,
  invokeCborValue,
  invokeRootToken,
  invokePathIdentity,
  invokeStaticPath,
  semanticProbe,
  payload,
  task,
  profile,
  run
};
