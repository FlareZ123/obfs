'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {pairedBudgetBound}=require('./paired-budget-bound');

/** @typedef {{index:number,label:string,quantity:number}} RecordValue */
/** @typedef {{category:string,records:RecordValue[]}} Payload */

/** @param {number} count @returns {Payload} */
function payload(count){
  return {category:'json-value-tree',records:Array.from({length:count},(_,index)=>({
    index,label:'event-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':''),
    quantity:Math.imul(index+1,2654435761)|0
  }))};
}

/**
 * @param {Payload} data
 * @param {boolean} heavy
 * @returns {number}
 */
function task(data,heavy){
  let value=0x13579bdf;
  for(const row of data.records){
    value=Math.imul((value^row.quantity^row.index)|0,0x45d9f3b)|0;
    value=(value+row.label.length)|0;
  }
  if(heavy)for(let j=0;j<25000;j++)
    value=Math.imul((value^j)|0,0x27d4eb2d)|0;
  return value|0;
}

/**
 * @param {(value:Payload)=>Payload} codec
 * @param {Payload} data
 * @param {number} count
 * @param {boolean} heavy
 * @returns {{ms:number,checksum:number}}
 */
function sample(codec,data,count,heavy){
  const start=performance.now();
  let checksum=0;
  for(let i=0;i<count;i++){
    const revived=codec(data);
    assert.equal(revived.records.length,data.records.length);
    checksum=(checksum+task(revived,heavy))|0;
  }
  return {ms:performance.now()-start,checksum};
}

/**
 * @param {Payload} data
 * @param {number} repeats
 * @param {boolean} heavy
 * @param {(input:Payload)=>Payload} devalueWire
 * @returns {{native:number[],json:number[],graph:number[],checksums:{native:number[],json:number[],graph:number[]}}}
 */
function paired(data,repeats,heavy,devalueWire){
  /** @type {{native:number[],json:number[],graph:number[]}} */
  const times={native:[],json:[],graph:[]};
  /** @type {{native:number[],json:number[],graph:number[]}} */
  const checksums={native:[],json:[],graph:[]};
  /** @type {Record<'native'|'json'|'graph',(data:Payload)=>Payload>} */
  const funcs={
    native:value=>value,
    json:value=>JSON.parse(JSON.stringify(value)),
    graph:devalueWire
  };
  for(let i=0;i<6;i++)for(const codec of Object.values(funcs))sample(codec,data,1,heavy);
  const orders=/** @type {('native'|'json'|'graph')[][]} */ ([
    ['native','json','graph'],['json','graph','native'],
    ['graph','native','json'],['graph','json','native'],
    ['json','native','graph'],['native','graph','json']
  ]);
  for(let trial=0;trial<9;trial++){
    for(const variant of orders[trial%orders.length]){
      const observation=sample(funcs[variant],data,repeats,heavy);
      times[variant].push(observation.ms);
      checksums[variant].push(observation.checksum);
    }
  }
  assert.deepEqual(checksums.native,checksums.json);
  assert.deepEqual(checksums.native,checksums.graph);
  return {...times,checksums};
}

/** @returns {Promise<object>} */
async function run(){
  // Exact version is installed explicitly by a manually dispatched workflow.
  const {stringify,parse}=await import('devalue');
  const wire=/** @type {(value:unknown)=>unknown} */ (
    value=>parse(stringify(value)));

  const shared={marker:'same'};
  /** @type {{refs:typeof shared[],nan:number,negative:number,missing?:undefined,large:bigint,self?:unknown}} */
  const cyclic={refs:[shared,shared],nan:NaN,negative:-0,missing:undefined,large:123n};
  cyclic.self=cyclic;
  const restored=/** @type {typeof cyclic} */ (wire(cyclic));
  assert.strictEqual(restored.self,restored);
  assert.strictEqual(restored.refs[0],restored.refs[1]);
  assert.ok(Object.hasOwn(restored,'missing'));
  assert.equal(restored.missing,undefined);
  assert.equal(Number.isNaN(restored.nan),true);
  assert.equal(Object.is(restored.negative,-0),true);
  assert.equal(restored.large,123n);
  assert.notStrictEqual(restored,cyclic);
  assert.notStrictEqual(restored.refs[0],shared);

  const backing=new Uint8Array([1,2,3,4]).buffer;
  const bufferPair=/** @type {ArrayBuffer[]} */ (wire([backing,backing]));
  assert.strictEqual(bufferPair[0],bufferPair[1],
    'Graph codec must preserve duplicated binary references');
  assert.deepEqual([...new Uint8Array(bufferPair[0])],[1,2,3,4]);

  // An unknown serialized type label must never invoke an ambient
  // constructor on the trusted server. No network or privileged functions
  // are used in this local-only probe.
  const key='__obfsDevalueLocalProbe';
  let invocations=0;
  class LocalProbe{
    /** @param {unknown} marker */
    constructor(marker){invocations++;void marker;}
  }
  Object.defineProperty(globalThis,key,{value:LocalProbe,configurable:true});
  try{
    assert.throws(()=>parse('[["__obfsDevalueLocalProbe",1],"marker"]'),
      /Unknown type/u);
    assert.equal(invocations,0);
  }finally{
    Reflect.deleteProperty(globalThis,key);
  }

  const rows=[];
  for(const count of [1,32,256,1024]){
    const input=payload(count);
    assert.deepEqual(/** @type {Payload} */ (wire(input)),input);
    const repeats=Math.max(4,Math.min(96,Math.floor(8192/count)));
    const originalBytes=Buffer.byteLength(JSON.stringify(input));
    const encodedBytes=Buffer.byteLength(stringify(input));
    for(const heavy of [false,true]){
      const raw=paired(input,repeats,heavy,
        value=>/** @type {Payload} */ (wire(value)));
      rows.push({
        count,repeats,workload:heavy?'25000-round-CPU-task':'small-state-task',
        originalBytes,encodedBytes,
        jsonVsNative:pairedBudgetBound(raw.native,raw.json),
        graphVsNative:pairedBudgetBound(raw.native,raw.graph),
        graphVsJson:pairedBudgetBound(raw.json,raw.graph),
        rawTimingMs:{native:raw.native,json:raw.json,graph:raw.graph}
      });
    }
  }
  return {
    node:process.version,platform:process.platform,
    candidate:'devalue@6.0.3 stringify/parse',
    verdict:'FEASIBILITY-ONLY',
    graphShapesPreserved:true,bufferAliasesPreserved:true,
    globalUnknownConstructorsRefused:true,crossBoundaryOriginalIdentityLost:true,
    boundary:'in-process parse/serialize/CPU work only; no HTTP, browser boot, WAN or attacker fuzz',
    rows
  };
}

if(require.main===module)run().then(result=>{
  process.stdout.write('SCO_DEVALUE_WIRE_PILOT '+JSON.stringify(result)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={run,payload,task,paired};
