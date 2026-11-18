'use strict';

/**
 * Minimal nonlinear permutation polynomial over 32-bit residues.
 *
 * Rivest's characterization makes P(x)=x+2*x^2 a permutation modulo 2^32.
 * JavaScript's bitwise operators and Math.imul preserve the low 32 bits.
 *
 * @param {number} value
 * @returns {number}
 */
function permuteInt32(value) {
  const x=value|0;
  return (x+(Math.imul(x,x)<<1))|0;
}

/**
 * @param {number} size
 * @param {number} constant
 * @returns {Int32Array}
 */
function makeValues(size,constant) {
  const values=new Int32Array(size);
  let state=0x6d2b79f5|0;
  for(let index=0;index<size;index++){
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    values[index]=(index%257===0)?constant:state;
  }
  return values;
}

/**
 * @param {Int32Array} values
 * @param {number} constant
 * @param {number} loops
 * @returns {{hits:number,checksum:number}}
 */
function runNative(values,constant,loops) {
  let hits=0;
  let checksum=0;
  for(let round=0;round<loops;round++){
    for(let index=0;index<values.length;index++){
      const value=values[index]|0;
      if(value===constant)hits++;
      checksum=(checksum+value)|0;
    }
  }
  return {hits,checksum};
}

/**
 * @param {Int32Array} values
 * @param {number} encodedConstant
 * @param {number} loops
 * @returns {{hits:number,checksum:number}}
 */
function runProtected(values,encodedConstant,loops) {
  let hits=0;
  let checksum=0;
  for(let round=0;round<loops;round++){
    for(let index=0;index<values.length;index++){
      const value=values[index]|0;
      if(permuteInt32(value)===encodedConstant)hits++;
      checksum=(checksum+value)|0;
    }
  }
  return {hits,checksum};
}

/**
 * @param {() => {hits:number,checksum:number}} task
 * @returns {{elapsedNs:number,hits:number,checksum:number}}
 */
function timed(task) {
  const start=process.hrtime.bigint();
  const result=task();
  const elapsedNs=Number(process.hrtime.bigint()-start);
  return {elapsedNs,...result};
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  const sorted=[...values].sort((left,right)=>left-right);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Measure a minimal nonlinear equality guard against the native equality.
 *
 * This is deliberately a strict selected-work benchmark. It does not claim
 * whole-application performance or reproduce the 2026 composite MBA scheme.
 *
 * @param {{size?:number,loops?:number,samples?:number}=} options
 * @returns {{
 *   node:string,
 *   size:number,
 *   loops:number,
 *   samples:number,
 *   nativeMedianNs:number,
 *   protectedMedianNs:number,
 *   ratio:number,
 *   hits:number,
 *   checksum:number
 * }}
 */
function benchmarkEquality(options={}) {
  const size=options.size??16384;
  const loops=options.loops??900;
  const samples=options.samples??5;
  const constant=0x13579bdf|0;
  const encodedConstant=permuteInt32(constant);
  const values=makeValues(size,constant);

  runNative(values,constant,120);
  runProtected(values,encodedConstant,120);

  /** @type {number[]} */
  const nativeTimes=[];
  /** @type {number[]} */
  const protectedTimes=[];
  let expected=null;

  for(let sample=0;sample<samples;sample++){
    const firstProtected=(sample&1)===1;
    const first=firstProtected?
      timed(()=>runProtected(values,encodedConstant,loops)):
      timed(()=>runNative(values,constant,loops));
    const second=firstProtected?
      timed(()=>runNative(values,constant,loops)):
      timed(()=>runProtected(values,encodedConstant,loops));

    const native=firstProtected?second:first;
    const protectedRun=firstProtected?first:second;
    if(native.hits!==protectedRun.hits||native.checksum!==protectedRun.checksum)
      throw new Error('native/protected benchmark behavior diverged');

    if(expected===null)expected={hits:native.hits,checksum:native.checksum};
    nativeTimes.push(native.elapsedNs);
    protectedTimes.push(protectedRun.elapsedNs);
  }

  const nativeMedianNs=median(nativeTimes);
  const protectedMedianNs=median(protectedTimes);
  return {
    node:process.version,
    size,
    loops,
    samples,
    nativeMedianNs,
    protectedMedianNs,
    ratio:protectedMedianNs/nativeMedianNs,
    hits:expected?.hits??0,
    checksum:expected?.checksum??0
  };
}

if(require.main===module){
  console.log('MBA_PERM_EQUALITY_BASELINE '+JSON.stringify(benchmarkEquality()));
}

module.exports={benchmarkEquality,permuteInt32};
