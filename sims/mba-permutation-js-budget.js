'use strict';

const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');

const MASK=(1n<<64n)-1n;
const TARGET=14887200154472500695n;

/**
 * @param {bigint} x
 * @param {bigint} shift
 * @returns {bigint}
 */
function rotateLeft64(x,shift){
  return ((x<<shift)|(x>>(64n-shift)))&MASK;
}

/**
 * Faithful unsigned 64-bit JavaScript transcription of the author's
 * real-world/filename.h slash predicate.
 *
 * @param {number} code
 * @returns {boolean}
 */
function mbaSlash(code){
  let x=BigInt(code)&MASK;
  for(let round=0;round<48;round++){
    x=(8099674395506127609n^(8077374509611717913n*x))&MASK;
    x=(x^(x>>22n))&MASK;
    x=rotateLeft64(x,3n)^
      rotateLeft64(x,20n)^
      rotateLeft64(x,30n)^
      rotateLeft64(x,32n)^
      rotateLeft64(x,29n);
  }
  return x===TARGET;
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

for(let code=0;code<128;code++)assert.equal(mbaSlash(code),nativeSlash(code));
for(let warmup=0;warmup<4;warmup++){
  assert.equal(work(mbaSlash,2500),work(nativeSlash,2500));
}

/** @type {number[]} */
const nativeMs=[];
/** @type {number[]} */
const mbaMs=[];
const count=10000;
for(let trial=0;trial<9;trial++){
  /** @type {Array<[(code:number)=>boolean,number[]]>} */
  const order=trial%2===0?
    [[nativeSlash,nativeMs],[mbaSlash,mbaMs]]:
    [[mbaSlash,mbaMs],[nativeSlash,nativeMs]];
  for(const [predicate,samples] of order){
    const start=performance.now();
    const hits=work(predicate,count);
    const elapsed=performance.now()-start;
    assert.ok(hits>0);
    samples.push(elapsed);
  }
}

const nativeMedianMs=median(nativeMs);
const mbaMedianMs=median(mbaMs);
const ratio=mbaMedianMs/nativeMedianMs;

console.log(JSON.stringify({
  node:process.version,
  platform:process.platform,
  count,
  roundsPerCall:48,
  nativeMedianMs,
  mbaMedianMs,
  ratio,
  within2_5x:ratio<=2.5,
  nativeSamplesMs:nativeMs,
  mbaSamplesMs:mbaMs
},null,2));
