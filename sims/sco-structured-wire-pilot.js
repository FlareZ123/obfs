'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {serialize,deserialize}=require('@ungap/structured-clone');
const {pairedBudgetBound}=require('./paired-budget-bound');

/**
 * This research-only comparison uses the supported @ungap/structured-clone
 * 1.4.0 serialize/deserialize API with an ordinary JSON wire envelope.
 * A bare JSON transport remains the current production SCO behavior.
 *
 * @typedef {{index:number,label:string,quantity:number}} RecordValue
 * @typedef {{records:RecordValue[],category:string}} Payload
 */

/** @param {number} count @returns {Payload} */
function payload(count){
  return {category:'synthetic-json-tree',records:Array.from({length:count},(_,index)=>({
    index,label:'event-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':''),
    quantity:Math.imul(index+1,2654435761)|0
  }))};
}

/** @param {unknown} value @returns {unknown} */
function jsonWire(value){
  return JSON.parse(JSON.stringify(value));
}

/** @param {unknown} value @returns {unknown} */
function graphWire(value){
  return deserialize(JSON.parse(JSON.stringify(serialize(value))));
}

/**
 * A deterministic, original CPU task to prevent the candidate's serializer
 * from being mistaken for the entire application. This intentionally allows
 * both near-zero-work and repeated-work comparisons.
 *
 * @param {Payload} data
 * @param {boolean} heavy
 * @returns {number}
 */
function task(data,heavy){
  let state=0x13579bdf;
  for(const record of data.records){
    state=Math.imul(state^record.quantity^record.index,0x45d9f3b)|0;
    state=(state+(record.label.length|0))|0;
  }
  if(heavy){
    for(let round=0;round<25000;round++)
      state=Math.imul((state^round)|0,0x27d4eb2d)|0;
  }
  return state|0;
}

/**
 * @param {(value:unknown)=>unknown} roundtrip
 * @param {Payload} data
 * @param {number} repeats
 * @param {boolean} heavy
 * @returns {{ms:number,checksum:number}}
 */
function sample(roundtrip,data,repeats,heavy){
  let checksum=0;
  const started=performance.now();
  for(let i=0;i<repeats;i++){
    const parsed=/** @type {Payload} */ (roundtrip(data));
    assert.equal(parsed.records.length,data.records.length);
    checksum=(checksum+task(parsed,heavy))|0;
  }
  return {ms:performance.now()-started,checksum};
}

/**
 * @param {Payload} data
 * @param {number} repeats
 * @param {boolean} heavy
 * @returns {{baseline:number[],graph:number[],baselineChecksum:number[],graphChecksum:number[]}}
 */
function pairedSamples(data,repeats,heavy){
  /** @type {number[]} */
  const baseline=[],graph=[],baselineChecksum=[],graphChecksum=[];
  for(let warm=0;warm<5;warm++){
    sample(jsonWire,data,1,heavy);
    sample(graphWire,data,1,heavy);
  }
  for(let trial=0;trial<9;trial++){
    const order=trial%2===0?
      /** @type {const} */ (['baseline','graph']):
      /** @type {const} */ (['graph','baseline']);
    for(const name of order){
      const observation=sample(name==='baseline'?jsonWire:graphWire,data,repeats,heavy);
      (name==='baseline'?baseline:graph).push(observation.ms);
      (name==='baseline'?baselineChecksum:graphChecksum).push(observation.checksum);
    }
  }
  assert.deepEqual(baselineChecksum,graphChecksum,'Plain JSON tree must preserve workload output');
  return {baseline,graph,baselineChecksum,graphChecksum};
}

/** @returns {Promise<object>} */
async function run(){
  // Demonstrate the narrow compatibility gain on one exact graph.
  const shared={marker:'preserve shared identity'};
  /** @type {{refs:{marker:string}[],missing?:undefined,nan:number,negative:number,large:bigint,self?:unknown}} */
  const cyclic={refs:[shared,shared],missing:undefined,nan:NaN,negative:-0,large:123n};
  cyclic.self=cyclic;
  assert.throws(()=>jsonWire(cyclic),TypeError);
  const restored=/** @type {typeof cyclic} */ (graphWire(cyclic));
  const graphFeatures={
    cyclePreserved:restored.self===restored,
    sharedReferencePreserved:restored.refs[0]===restored.refs[1],
    undefinedValuePreserved:Object.hasOwn(restored,'missing')&&restored.missing===undefined,
    nanPreserved:Number.isNaN(restored.nan),
    negativeZeroPreserved:Object.is(restored.negative,-0),
    bigintPreserved:restored.large===123n,
    originalReferenceDetached:restored!==cyclic&&restored.refs[0]!==shared
  };

  // The package's typed-buffer branch is audited separately; sharing a
  // backing buffer is more demanding than sharing an ordinary object.
  const backing=new Uint8Array([1,2,3,4]).buffer;
  const binary=/** @type {{left:ArrayBuffer,right:ArrayBuffer}} */ (
    graphWire({left:backing,right:backing}));
  assert.deepEqual([...new Uint8Array(binary.left)],[1,2,3,4]);
  assert.deepEqual([...new Uint8Array(binary.right)],[1,2,3,4]);
  const binaryReferencePreserved=binary.left===binary.right;

  // Never enable an untrusted network deserializer solely on a successful
  // roundtrip test. A crafted wire type label must be checked for unsafe
  // dynamic constructors. This harmless custom constructor probe performs
  // no I/O, changes no prototype and is removed from the global immediately.
  const probeName='__obfsStructuredWireLocalProbe';
  let constructorCalls=0;
  class LocalProbe {
    /** @param {string} marker */
    constructor(marker){constructorCalls++;this.marker=marker;}
  }
  Object.defineProperty(globalThis,probeName,{
    configurable:true,value:LocalProbe
  });
  try{
    const probed=deserialize([[probeName,'local-only']]);
    assert.ok(probed instanceof LocalProbe);
    assert.equal(probed.marker,'local-only');
  }finally{
    Reflect.deleteProperty(globalThis,probeName);
  }
  assert.equal(constructorCalls,1,
    'Parser must reveal its ambient constructor trust boundary');

  const rows=[];
  for(const count of [1,32,256,1024]){
    const input=payload(count);
    assert.deepEqual(jsonWire(input),graphWire(input));
    const repeats=Math.max(4,Math.min(96,Math.floor(8192/count)));
    const baselineBytes=Buffer.byteLength(JSON.stringify(input));
    const graphBytes=Buffer.byteLength(JSON.stringify(serialize(input)));
    for(const heavy of [false,true]){
      const raw=pairedSamples(input,repeats,heavy);
      rows.push({
        count,repeats,workload:heavy?'25000-round-CPU-task':'small-state-task',
        baselineBytes,graphBytes,
        bound:pairedBudgetBound(raw.baseline,raw.graph),
        rawTimingMs:raw
      });
    }
  }
  return {
    node:process.version,platform:process.platform,
    encoder:'@ungap/structured-clone@1.4.0 (serialize/deserialize)',
    graphFeatures,graphSemanticContractMet:Object.values(graphFeatures).every(Boolean),
    crossBoundaryIdentityStillLost:graphFeatures.originalReferenceDetached,
    binaryReferencePreserved,untrustedConstructorInvocationObserved:constructorCalls===1,
    safeForUntrustedRequests:false,
    baseline:'JSON.parse(JSON.stringify(value))',
    measurementBoundary:'in-process serialization, parse, task; no HTTP, browser module load or network',
    rows
  };
}

if(require.main===module)run().then(report=>{
  process.stdout.write('SCO_STRUCTURED_WIRE_PILOT '+JSON.stringify(report)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={run,payload,jsonWire,graphWire,task,pairedSamples};
