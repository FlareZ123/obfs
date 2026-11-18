'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');

const MASK=(1n<<64n)-1n;
const AUTHOR_48_TARGET=14887200154472500695n;

/**
 * @param {bigint} x
 * @param {bigint} shift
 * @returns {bigint}
 */
function rotateLeft64(x,shift){
  return ((x<<shift)|(x>>(64n-shift)))&MASK;
}

/**
 * Apply the exact unsigned 64-bit round used by the author's
 * real-world/filename.h artifact.
 *
 * @param {bigint} input
 * @param {number} rounds
 * @returns {bigint}
 */
function transform(input,rounds){
  let x=input&MASK;
  for(let round=0;round<rounds;round++){
    x=(8099674395506127609n^(8077374509611717913n*x))&MASK;
    x=(x^(x>>22n))&MASK;
    x=rotateLeft64(x,3n)^
      rotateLeft64(x,20n)^
      rotateLeft64(x,30n)^
      rotateLeft64(x,32n)^
      rotateLeft64(x,29n);
  }
  return x;
}

/**
 * @param {number} rounds
 * @returns {(code:number)=>boolean}
 */
function mbaSlash(rounds){
  const target=transform(47n,rounds);
  return code=>transform(BigInt(code),rounds)===target;
}

/**
 * Equivalent one-target predicate. The two-target Windows behavior is audited
 * separately because the public author artifact does not preserve it.
 *
 * @param {number} code
 * @returns {boolean}
 */
function nativeSlash(code){
  return code===47;
}

/**
 * @param {(code:number)=>boolean} predicate
 * @param {number} count
 * @returns {number}
 */
function work(predicate,count){
  let hits=0;
  for(let i=0;i<count;i++){
    const code=(Math.imul(i,1103515245)+12345)>>>25;
    if(predicate(code))hits++;
  }
  return hits;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values){
  return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
}

/**
 * @param {(code:number)=>boolean} predicate
 * @param {number} count
 * @param {number} trials
 * @returns {number[]}
 */
function samples(predicate,count,trials){
  /** @type {number[]} */
  const values=[];
  for(let trial=0;trial<trials;trial++){
    const start=performance.now();
    const hits=work(predicate,count);
    assert.ok(hits>0);
    values.push(performance.now()-start);
  }
  return values;
}

assert.equal(transform(47n,48),AUTHOR_48_TARGET);

const nativeCount=2000000;
const mbaCount=10000;
const trials=7;
for(let warmup=0;warmup<4;warmup++)work(nativeSlash,250000);
const nativeSamplesMs=samples(nativeSlash,nativeCount,trials);
const nativeMedianMs=median(nativeSamplesMs);
const nativeNsPerCall=nativeMedianMs*1e6/nativeCount;

/** @type {Array<Record<string,unknown>>} */
const cases=[];
for(const rounds of [1,2,4,8,16,32,48]){
  const predicate=mbaSlash(rounds);
  for(let code=0;code<128;code++)assert.equal(predicate(code),nativeSlash(code));
  for(let warmup=0;warmup<3;warmup++)work(predicate,2500);
  const mbaSamplesMs=samples(predicate,mbaCount,trials);
  const mbaMedianMs=median(mbaSamplesMs);
  const mbaNsPerCall=mbaMedianMs*1e6/mbaCount;
  const ratio=mbaNsPerCall/nativeNsPerCall;
  cases.push({
    rounds,
    mbaMedianMs,
    mbaNsPerCall,
    ratio,
    within2_5x:ratio<=2.5,
    mbaSamplesMs
  });
}

console.log(JSON.stringify({
  node:process.version,
  platform:process.platform,
  nativeCount,
  mbaCount,
  trials,
  nativeMedianMs,
  nativeNsPerCall,
  nativeSamplesMs,
  cases
},null,2));
