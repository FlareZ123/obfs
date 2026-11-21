'use strict';

/**
 * Chosen-query inversion of F(x)=b XOR A*x XOR U*g(V*x) over GF(2).
 * This standalone proof witness exhausts small finite domains and also
 * checks selected unsigned 32-bit oracles. It does not import the obfuscator.
 */
const assert = require('node:assert/strict');
const {randomInt}=require('node:crypto');

/** @param {number} seed @returns {()=>number} */
function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

/** @param {number} v @returns {number} */
function parity(v) {
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v ^= v >>> 2;
  v ^= v >>> 1;
  return v & 1;
}

/** @param {number[]} rows @param {number} input @returns {number} */
function applyRows(rows, input) {
  let out = 0;
  for (let i = 0; i < rows.length; i++) out |= parity(rows[i] & input) << i;
  return out;
}

/** @param {number[]} columns @param {number} input @returns {number} */
function applyColumns(columns, input) {
  let out = 0;
  for (let i = 0; i < columns.length; i++) if ((input >>> i) & 1) out ^= columns[i];
  return out;
}

/**
 * Insert into a GF(2) span. Retain the original vector for explicit
 * reconstruction of the unknown low-dimensional residual space.
 * @param {{pivots:number[],vectors:number[]}} span
 * @param {number} value
 * @returns {boolean}
 */
function addToSpan(span, value) {
  let reduced = value;
  for (let i = span.pivots.length - 1; i >= 0; i--) {
    if (!((reduced >>> i) & 1)) continue;
    if (span.pivots[i]) reduced ^= span.pivots[i];
    else {
      span.pivots[i] = reduced;
      span.vectors.push(value);
      return true;
    }
  }
  return false;
}

/** @param {number} bits @returns {{pivots:number[],vectors:number[]}} */
function newSpan(bits) {
  return {pivots: Array(bits).fill(0), vectors: []};
}

/** @param {bigint} value @returns {number} */
function parityBig(value) {
  let p = 0;
  while (value) {
    p ^= 1;
    value &= value - 1n;
  }
  return p;
}

/**
 * Solve B*(x,c)=rhs with B=[Ahat W] and enumerate all its solutions.
 * When W is complete, each x solving this affine envelope is checked
 * independently. Nonbijective functions can have a deficient B matrix,
 * but every candidate remains in one unknown r-dimensional coset,
 * giving at most 2^r inputs even if F is not injective.
 * @param {number[]} columns
 * @param {number} rhs
 * @param {number} n
 * @returns {number[]}
 */
function solveAffinePreimageCandidates(columns, rhs, n) {
  const width = columns.length;
  /** @type {{mask:bigint,rhs:number}[]} */
  const equations = [];
  for (let bit = 0; bit < n; bit++) {
    let mask = 0n;
    for (let col = 0; col < width; col++) {
      if ((columns[col] >>> bit) & 1) mask |= 1n << BigInt(col);
    }
    equations.push({mask, rhs: (rhs >>> bit) & 1});
  }
  /** @type {number[]} */
  const pivotColumns = [];
  let row = 0;
  for (let col = 0; col < width && row < n; col++) {
    const bit = 1n << BigInt(col);
    let pivot = row;
    while (pivot < n && !(equations[pivot].mask & bit)) pivot++;
    if (pivot === n) continue;
    [equations[row], equations[pivot]] = [equations[pivot], equations[row]];
    for (let j = 0; j < n; j++) {
      if (j !== row && (equations[j].mask & bit)) {
        equations[j].mask ^= equations[row].mask;
        equations[j].rhs ^= equations[row].rhs;
      }
    }
    pivotColumns.push(col);
    row++;
  }
  for (let i = row; i < n; i++) if (equations[i].rhs) return [];
  /** @type {number[]} */
  const freeColumns = [];
  for (let col = 0; col < width; col++) if (!pivotColumns.includes(col)) freeColumns.push(col);
  const candidates = [];
  for (let assignment = 0; assignment < 2 ** freeColumns.length; assignment++) {
    let solution = 0n;
    for (let i = 0; i < freeColumns.length; i++) {
      if ((assignment >>> i) & 1) solution |= 1n << BigInt(freeColumns[i]);
    }
    for (let i = 0; i < row; i++) {
      const value = equations[i].rhs ^ parityBig(equations[i].mask & solution);
      if (value) solution |= 1n << BigInt(pivotColumns[i]);
    }
    candidates.push(Number(solution & ((1n << BigInt(n)) - 1n)));
  }
  return candidates;
}

/**
 * @param {(x:number)=>number} oracle
 * @param {number} n
 * @param {number} rankBound
 * @param {number} failureProbability
 * @param {(()=>number)=} random  Defaults to independent uniform crypto samples.
 *   Deterministic seeded test generators prove only their fixed transcript.
 * @returns {{base:number,columns:number[],residual:number[],observed:Map<number,number>,samples:number}}
 */
function learn(oracle, n, rankBound, failureProbability, random = () => randomInt(0,2**n)) {
  if(!Number.isInteger(n)||n<1||n>32)throw new RangeError('Expected 1..32 GF(2) bits');
  const mask=n===32?0xffffffff:2**n-1;
  /** @type {Map<number,number>} */
  const observed = new Map();
  /** @param {number} x */
  function ask(x) {
    const key=x>>>0;
    if (!observed.has(key)) observed.set(key, oracle(key)>>>0);
    return /** @type {number} */ (observed.get(key));
  }
  const base = ask(0);
  const columns = Array.from({length:n}, (_,i) => ask((2**i)>>>0) ^ base);
  const residual = newSpan(n);
  const samples = rankBound ? Math.ceil(2 ** rankBound *
    Math.log((2 ** rankBound - 1) / failureProbability)) : 0;
  for (let i = 0; i < samples; i++) {
    const x=((random()>>>0)&mask)>>>0;
    const rest = ask(x) ^ base ^ applyColumns(columns, x);
    addToSpan(residual, rest);
  }
  return {base, columns, residual: residual.vectors, observed, samples};
}

/**
 * Deterministically span every residual of algebraic degree <= degreeBound
 * using the Hamming-weight <= degreeBound interpolation set. No random
 * sampling, guessed projection, or bijectivity assumption is needed.
 * @param {(x:number)=>number} oracle
 * @param {number} n
 * @param {number} degreeBound
 * @returns {{base:number,columns:number[],residual:number[],observed:Map<number,number>,samples:number}}
 */
function learnLowDegree(oracle,n,degreeBound) {
  if(!Number.isInteger(degreeBound)||degreeBound<1||degreeBound>n)
    throw new RangeError('Invalid algebraic-degree bound');
  const observed=new Map();
  /** @param {number} x */
  function ask(x){
    const key=x>>>0;
    if(!observed.has(key))observed.set(key,oracle(key)>>>0);
    return /** @type {number} */ (observed.get(key));
  }
  const base=ask(0);
  const columns=Array.from({length:n},(_,i)=>ask(1<<i)^base);
  const span=newSpan(n);
  let samples=0;
  /** @param {number} start @param {number} remaining @param {number} value */
  function visit(start,remaining,value){
    if(remaining===0){
      addToSpan(span,ask(value)^base^applyColumns(columns,value));
      samples++;
      return;
    }
    for(let i=start;i<=n-remaining;i++)visit(i+1,remaining-1,value|(1<<i));
  }
  for(let weight=2;weight<=degreeBound;weight++)visit(0,weight,0);
  return {base,columns,residual:span.vectors,observed,samples};
}

/**
 * Public nullity of the affine residual envelope B=[M | W]. Every
 * nonempty consistent target envelope has exactly 2^nullity possible
 * preimage inputs because W's basis columns are independent.
 * @param {{columns:number[],residual:number[]}} learned
 * @returns {number}
 */
function envelopeNullity(learned) {
  const bits=learned.columns.length;
  const span=newSpan(bits);
  for(const column of [...learned.columns,...learned.residual])addToSpan(span,column);
  return bits+learned.residual.length-span.vectors.length;
}

/**
 * @param {(x:number)=>number} oracle
 * @param {{base:number,columns:number[],residual:number[]}} learned
 * @param {number} target
 * @returns {{answer:number|null,candidates:number}}
 */
function invert(oracle, learned, target) {
  const candidates = solveAffinePreimageCandidates(
    [...learned.columns, ...learned.residual], target ^ learned.base,
    learned.columns.length);
  for (const x of candidates) if (oracle(x) === target) return {answer:x, candidates:candidates.length};
  return {answer:null, candidates:candidates.length};
}

/** @param {number} n @param {()=>number} random @returns {number[]} */
function invertibleRows(n, random) {
  for (;;) {
    const rows = Array.from({length:n}, () => random() & ((1 << n) - 1));
    const span = newSpan(n);
    rows.forEach(v => addToSpan(span,v));
    if (span.vectors.length === n) return rows;
  }
}

/**
 * @param {number} n @param {number} r @param {'shear'|'quotient'|'nonbijective'} kind
 * @param {()=>number} random
 * @returns {(x:number)=>number}
 */
function generate(n, r, kind, random) {
  const A = invertibleRows(n, random);
  /** @type {number[]} */
  const V = [];
  const rankV = newSpan(n);
  while (V.length < r) {
    const candidate = random() & ((1 << n) - 1);
    if (addToSpan(rankV, candidate)) V.push(candidate);
  }
  const K = [];
  const rankK = newSpan(n);
  for (let bit = 0; bit < r; bit++) {
    const desired = kind === 'shear' ? 0 : 1 << bit;
    for (;;) {
      const candidate = random() & ((1 << n) - 1);
      if (applyRows(V, candidate) === desired && addToSpan(rankK, candidate)) {
        K.push(candidate);
        break;
      }
    }
  }
  const U = K.map(v => applyRows(A, v));
  const g = Array.from({length:1 << r}, () => random() & ((1 << r) - 1));
  if (kind === 'quotient') {
    const P = Array.from({length:1 << r}, (_,i) => i);
    for (let i = P.length - 1; i > 0; i--) {
      const j = random() % (i + 1);
      [P[i], P[j]] = [P[j], P[i]];
    }
    for (let z = 0; z < P.length; z++) g[z] = z ^ P[z];
  }
  const b = random() & ((1 << n) - 1);
  return x => (b ^ applyRows(A, x) ^ applyColumns(U, g[applyRows(V,x)])) >>> 0;
}

/**
 * Deliberately violate the low-dimensional *input* projection promise.
 * Two rare modifications live in a two-dimensional output subspace, but
 * detecting their support needs many input coordinates. A deterministic
 * sampler that misses both produces an incomplete residual span and an
 * incorrect image-membership answer. This is an out-of-promise negative
 * control, not a random-tail falsification under the promised model.
 * @returns {{inputProjectionPromiseBroken:true,hiddenPreimage:number,missedTarget:number,sampledResidualRank:number}}
 */
function outOfPromiseControl() {
  const n=12;
  const hiddenPreimage=0x5a8;
  const missedTarget=hiddenPreimage^1;
  const movedAgain=hiddenPreimage^2;
  /** @param {number} x @returns {number} */
  const oracle=x=>x===hiddenPreimage?missedTarget:x===missedTarget?movedAgain:x;
  const learned=learn(oracle,n,2,1e-10,()=>0);
  assert.equal(learned.residual.length,0);
  assert.equal(oracle(hiddenPreimage),missedTarget);
  assert.equal(oracle(missedTarget),movedAgain);
  assert.equal(invert(oracle,learned,missedTarget).answer,null);
  return {inputProjectionPromiseBroken:true,hiddenPreimage,missedTarget,
    sampledResidualRank:learned.residual.length};
}

/**
 * A black-box rank-two *output*-only lower-bound witness at width eight.
 * The baseline lacks output zero; each hidden variant maps one candidate
 * address to zero and otherwise has an identical public input/output map.
 * All variants retain A=I and nonlinear output span rank at most two.
 * @returns {{bits:number,hiddenLocations:number,fullTruthTableEvaluations:number,basisTranscriptMatches:number,unqueriedLocationsAfter30:number}}
 */
function outputRankTwoLowerBoundWitness() {
  const bits=8, domain=1<<bits;
  const baseline=/** @param {number} x */(x)=>x===0?1:x;
  const hiddenLocations=Array.from({length:domain},(_,x)=>x)
    .filter(x=>x!==0 && (x & (x-1))!==0);
  const basisQueries=[0,...Array.from({length:bits},(_,i)=>1<<i)];
  const sampleQueries=[...basisQueries,...hiddenLocations.slice(0,30)];
  let fullTruthTableEvaluations=0,basisTranscriptMatches=0;
  const seenBaseline=new Uint16Array(domain);
  for(let x=0;x<domain;x++)seenBaseline[baseline(x)]++;
  assert.equal(seenBaseline[0],0);
  for(const hidden of hiddenLocations){
    const oracle=/** @param {number} x */(x)=>x===0?1:x===hidden?0:x;
    const seen=new Uint16Array(domain);
    const span=newSpan(bits);
    for(let x=0;x<domain;x++){
      const value=oracle(x);
      seen[value]++;
      addToSpan(span,value^x);
      fullTruthTableEvaluations++;
    }
    assert.equal(seen[0],1);
    assert.equal(span.vectors.length,2);
    for(const q of basisQueries){
      assert.equal(oracle(q),baseline(q));
      basisTranscriptMatches++;
    }
    if(!sampleQueries.includes(hidden)){
      for(const q of sampleQueries)assert.equal(oracle(q),baseline(q));
    }
  }
  assert.equal(hiddenLocations.length,domain-bits-1);
  return {bits,hiddenLocations:hiddenLocations.length,
    fullTruthTableEvaluations,basisTranscriptMatches,
    unqueriedLocationsAfter30:hiddenLocations.length-30};
}

/**
 * Independent quadratic, full-input-dependent output-rank-two family.
 * Choosing random quadratic terms produces degree two while remaining
 * independent of the input-projection-rank condition.
 * @param {number} n
 * @param {()=>number} random
 * @param {number} zeroOutputRows
 * @returns {(x:number)=>number}
 */
function generateQuadratic(n,random,zeroOutputRows=0) {
  const A=invertibleRows(n,random);
  for(let row=n-zeroOutputRows;row<n;row++)A[row]=0;
  /** @type {number[]} */
  const U=[];
  const basis=newSpan(n);
  while(U.length<2){
    const vector=random()&((1<<n)-1);
    if(addToSpan(basis,vector))U.push(vector);
  }
  /** @type {{left:number,right:number,mask:number}[]} */
  const terms=[];
  for(let left=0;left<n;left++)for(let right=left+1;right<n;right++){
    const mask=random()&3;
    if(mask)terms.push({left,right,mask});
  }
  return x=>{
    let nonlinear=0;
    for(const t of terms){
      if(((x>>>t.left)&1)&&((x>>>t.right)&1))nonlinear^=t.mask;
    }
    return (applyRows(A,x)^applyColumns(U,nonlinear))>>>0;
  };
}

/**
 * Degree-d residuals are determined by samples of weight <= d. Verify
 * that their observed span is the complete oracle-residual span, then
 * exhaustively test inverse/image membership even for noninjective maps.
 * @returns {{projectionFixtures:number,quadraticFixtures:number,allOutputClassifications:number,verifiedFullInputDependence:number,maxDeterministicQueries:number}}
 */
function deterministicDegreeWitness() {
  const n=12;
  let projectionFixtures=0,quadraticFixtures=0,allOutputClassifications=0;
  let verifiedFullInputDependence=0,maxDeterministicQueries=0;
  const trainingByRank=[0,13,79,299];
  /**
   * @param {(x:number)=>number} oracle
   * @param {number} rank
   * @param {number} degree
   * @param {boolean} fullClassify
   */
  function verify(oracle,rank,degree,fullClassify){
    const learned=learnLowDegree(oracle,n,degree);
    assert.equal(learned.observed.size,trainingByRank[degree]);
    const exact=newSpan(n);
    const seen=new Uint16Array(1<<n);
    for(let x=0;x<(1<<n);x++){
      const value=oracle(x);
      seen[value]++;
      addToSpan(exact,value^learned.base^applyColumns(learned.columns,x));
    }
    assert.equal(learned.residual.length,exact.vectors.length);
    const targets=fullClassify?Array.from({length:1<<n},(_,i)=>i):
      [0,1,128,512,1023,2047,4095];
    for(const y of targets){
      const verdict=invert(oracle,learned,y);
      assert.equal(verdict.answer===null,seen[y]===0);
      if(verdict.answer!==null)assert.equal(oracle(verdict.answer),y);
      assert.ok(verdict.candidates<=2**rank);
      maxDeterministicQueries=Math.max(maxDeterministicQueries,
        learned.observed.size+verdict.candidates);
      allOutputClassifications++;
    }
  }
  for(let rank=1;rank<=3;rank++)for(const kind of /** @type {const} */ (['shear','quotient','nonbijective'])){
    for(let instance=0;instance<20;instance++){
      const random=randomFromSeed(0xabe7633^(rank*997)^(instance*9973)^(kind==='shear'?7:kind==='quotient'?13:29));
      verify(generate(n,rank,kind,random),rank,rank,kind==='nonbijective'&&rank>=2&&instance===0);
      projectionFixtures++;
    }
  }
  for(let instance=0;instance<12;instance++){
    const random=randomFromSeed(0x527a318^Math.imul(instance+1,0x19660d));
    const oracle=generateQuadratic(n,random);
    verify(oracle,2,2,instance<2);
    quadraticFixtures++;
    // For degree two, checking derivative at zero and every basis vector
    // certifies whether the derivative is constant on the whole domain.
    let constantDirections=0;
    for(let shift=1;shift<(1<<n);shift++){
      const base=oracle(shift)^oracle(0);
      let constant=true;
      for(let bit=0;bit<n;bit++){
        const unit=1<<bit;
        if((oracle(shift^unit)^oracle(unit))!==base){constant=false;break;}
      }
      if(constant)constantDirections++;
    }
    if(constantDirections===0)verifiedFullInputDependence++;
  }
  assert.ok(verifiedFullInputDependence>=10);
  return {projectionFixtures,quadraticFixtures,allOutputClassifications,
    verifiedFullInputDependence,maxDeterministicQueries};
}

/**
 * Verify the degree-two deterministic rank-two target classifier on a
 * truly 32-bit quadratic family. The reference image-membership oracle
 * enumerates the hidden four-point displacement coset independently.
 * @returns {{bits:number,trainingQueries:number,targetChecks:number,reachable:number,unreachable:number,maxCandidateCount:number}}
 */
function width32DeterministicQuadratic() {
  const U0=0x9e3779b9,U1=0x85ebca6b,constant=0x13579bdf;
  /** @param {number} x @param {number} steps @returns {number} */
  function rotate(x,steps){return ((x<<steps)|(x>>>(32-steps)))>>>0;}
  /** @param {number} x @returns {number} */
  function affine(x){return rotate((x^((x&65535)<<16))>>>0,9);}
  /** @param {number} y @returns {number} */
  function invertAffine(y){
    const v=rotate(y,23);
    return (v^((v&65535)<<16))>>>0;
  }
  /** @param {number} x @param {number} offset @returns {number} */
  function pairQuadratic(x,offset){
    let bit=0;
    for(let i=0;i<16;i++){
      const a=(2*i+offset)%32,b=(2*i+offset+1)%32;
      bit^=((x>>>a)&1)&((x>>>b)&1);
    }
    return bit;
  }
  /** @param {number} x @returns {number} */
  const oracle=x=>(constant^affine(x)^(pairQuadratic(x,0)?U0:0)^
    (pairQuadratic(x,1)?U1:0))>>>0;
  const roundtrip=randomFromSeed(0x8419673a);
  for(let i=0;i<2048;i++){
    const x=roundtrip();
    assert.equal(invertAffine(affine(x)),x);
  }
  const learned=learnLowDegree(oracle,32,2);
  assert.equal(learned.observed.size,529);
  const random=randomFromSeed(0x88325ca1);
  let reachable=0,unreachable=0,maxCandidateCount=0;
  const targetChecks=2048;
  for(let i=0;i<targetChecks;i++){
    const x=random();
    const target=i%2===0?oracle(x):x;
    const independentPreimages=[target^constant,target^constant^U0,
      target^constant^U1,target^constant^U0^U1].map(value=>invertAffine(value>>>0));
    const expected=independentPreimages.some(candidate=>oracle(candidate)===target);
    const verdict=invert(oracle,learned,target);
    assert.equal(verdict.answer!==null,expected,
      `width32 target=${target} iteration=${i}`);
    if(verdict.answer!==null)assert.equal(oracle(verdict.answer),target);
    maxCandidateCount=Math.max(maxCandidateCount,verdict.candidates);
    if(expected)reachable++; else unreachable++;
  }
  assert.ok(reachable>0&&unreachable>0);
  return {bits:32,trainingQueries:learned.observed.size,targetChecks,
    reachable,unreachable,maxCandidateCount};
}

/**
 * Exhaust the complete 2-bit -> 2-bit nonlinear truth table for each
 * rank-two 3-bit input projection and all independent output bases.
 * The omitted high-weight training point is never queried in advance.
 * @returns {{bits:number,outputBases:number,inputProjections:number,oracleMaps:number,classifiedTargets:number,nonbijectiveMaps:number,singularInterpolants:number,maxCandidateCount:number}}
 */
function width3ExhaustiveNonbijective() {
  const bits=3,domain=1<<bits;
  /** @type {number[][]} */
  const outputBases=[];
  for(let left=1;left<domain;left++)for(let right=1;right<domain;right++){
    if(left!==right)outputBases.push([left,right]);
  }
  let oracleMaps=0,classifiedTargets=0,nonbijectiveMaps=0,singularInterpolants=0,maxCandidateCount=0;
  let inputProjections=0;
  for(let left=1;left<domain;left++)for(let right=1;right<domain;right++){
    if(left===right)continue;
    const inputRows=[left,right];
    inputProjections++;
    const projections=Array.from({length:domain},(_,x)=>applyRows(inputRows,x));
    for(const outputs of outputBases)for(let truth=0;truth<256;truth++){
      /** @param {number} x @returns {number} */
      const oracle=x=>x^applyColumns(outputs,(truth>>>(2*projections[x]))&3);
      const seen=new Uint8Array(domain);
      for(let x=0;x<domain;x++)seen[oracle(x)]++;
      if(seen.some(count=>count!==1))nonbijectiveMaps++;
      const learned=learnLowDegree(oracle,bits,2);
      assert.equal(learned.observed.size,7);
      const publicNullity=envelopeNullity(learned);
      assert.ok(publicNullity<=2);
      const span=newSpan(bits);
      for(const column of learned.columns)addToSpan(span,column);
      if(span.vectors.length<bits)singularInterpolants++;
      for(let target=0;target<domain;target++){
        const verdict=invert(oracle,learned,target);
        assert.equal(verdict.answer===null,seen[target]===0,
          `width3 U=${outputs.join(',')} V=${inputRows.join(',')} g=${truth} y=${target}`);
        if(verdict.answer!==null)assert.equal(oracle(verdict.answer),target);
        assert.ok(verdict.candidates<=4);
        if(verdict.candidates)assert.equal(verdict.candidates,2**publicNullity);
        maxCandidateCount=Math.max(maxCandidateCount,verdict.candidates);
        classifiedTargets++;
      }
      oracleMaps++;
    }
  }
  assert.equal(inputProjections,42);
  assert.equal(oracleMaps,42*42*256);
  return {bits,outputBases:outputBases.length,inputProjections,oracleMaps,
    classifiedTargets,nonbijectiveMaps,singularInterpolants,maxCandidateCount};
}

/**
 * Relax A invertibility: a hidden affine nullity k adds at most k
 * dimensions to the rank-r nonlinear image-membership candidate coset.
 * The exact candidate count is computable as nullity of public [M W].
 * @returns {{singularAffineFixtures:number,fullOutputChecks:number,targetChecks:number,nonbijectiveFixtures:number,maxEnvelopeNullity:number,maxCandidateCount:number}}
 */
function singularAffineDegreeWitness() {
  const n=12,rank=2;
  let singularAffineFixtures=0,fullOutputChecks=0,targetChecks=0;
  let nonbijectiveFixtures=0,maxEnvelopeNullity=0,maxCandidateCount=0;
  for(const affineNullity of [1,2])for(let instance=0;instance<12;instance++){
    const random=randomFromSeed(0x62ea17b^Math.imul(affineNullity,0x66cc11)^
      Math.imul(instance+1,0x28d23b));
    const oracle=generateQuadratic(n,random,affineNullity);
    const learned=learnLowDegree(oracle,n,2);
    const publicNullity=envelopeNullity(learned);
    assert.ok(publicNullity<=rank+affineNullity);
    maxEnvelopeNullity=Math.max(maxEnvelopeNullity,publicNullity);
    const seen=new Uint16Array(1<<n);
    for(let x=0;x<(1<<n);x++)seen[oracle(x)]++;
    if(seen.some(v=>v!==1))nonbijectiveFixtures++;
    const allTargets=instance<2;
    const targets=allTargets?Array.from({length:1<<n},(_,i)=>i):
      [0,1,0x1ac,0x5af,0x999,0xfff];
    for(const y of targets){
      const verdict=invert(oracle,learned,y);
      assert.equal(verdict.answer===null,seen[y]===0);
      if(verdict.answer!==null)assert.equal(oracle(verdict.answer),y);
      if(verdict.candidates)assert.equal(verdict.candidates,2**publicNullity);
      assert.ok(verdict.candidates<=2**(rank+affineNullity));
      maxCandidateCount=Math.max(maxCandidateCount,verdict.candidates);
      targetChecks++;
      if(allTargets)fullOutputChecks++;
    }
    singularAffineFixtures++;
  }
  assert.ok(nonbijectiveFixtures>0);
  return {singularAffineFixtures,fullOutputChecks,targetChecks,
    nonbijectiveFixtures,maxEnvelopeNullity,maxCandidateCount};
}

/**
 * Exercise the uniformly random learner at the full 32-bit width under
 * a genuine rank-two input projection and independent output masks.
 * A separate crypto-default smoke oracle has zero residual and cannot
 * fail its truth check even if the random samples vary across CI runs.
 * @returns {{bits:number,cryptoSmokeSamples:number,rankBound:number,trainingQueries:number,heldoutTargetChecks:number,reachable:number,unreachable:number,highBitSampled:number,maxCandidateCount:number}}
 */
function width32ProjectedRankWitness(){
  const bits=32,rankBound=2;
  const inputMasks=[0x55aa55aa,0x0f0f0f0f];
  const outputMasks=[0x9e3779bb,0x85ebca6f];
  /** @param {number} x @returns {number} */
  function projectedOracle(x){
    const z=parity(x&inputMasks[0])|(parity(x&inputMasks[1])<<1);
    return (x^(z===3?outputMasks[0]:0)^(z===2?outputMasks[1]:0))>>>0;
  }
  const cryptoSmoke=learn(x=>x>>>0,bits,1,1e-8);
  assert.equal(cryptoSmoke.residual.length,0);
  const training=learn(projectedOracle,bits,rankBound,1e-10,
    randomFromSeed(0x4cf7e5b1));
  assert.ok(training.residual.length<=rankBound);
  const highBitSampled=Array.from(training.observed.keys())
    .filter(x=>(x>>>31)!==0).length;
  assert.ok(highBitSampled>0);
  let reachable=0,unreachable=0,maxCandidateCount=0;
  const random=randomFromSeed(0x714bc52e);
  const heldoutTargetChecks=1024;
  for(let i=0;i<heldoutTargetChecks;i++){
    const x=random();
    const target=i%2===0?projectedOracle(x):x;
    const reference=[target,target^outputMasks[0],target^outputMasks[1],
      target^outputMasks[0]^outputMasks[1]];
    const expected=reference.some(candidate=>projectedOracle(candidate>>>0)===target);
    const verdict=invert(projectedOracle,training,target);
    assert.equal(verdict.answer!==null,expected);
    if(verdict.answer!==null)assert.equal(projectedOracle(verdict.answer),target);
    maxCandidateCount=Math.max(maxCandidateCount,verdict.candidates);
    if(expected)reachable++;else unreachable++;
  }
  assert.ok(reachable>0&&unreachable>0);
  return {bits,cryptoSmokeSamples:cryptoSmoke.samples,rankBound,
    trainingQueries:training.observed.size,heldoutTargetChecks,
    reachable,unreachable,highBitSampled,maxCandidateCount};
}

/**
 * Deliberately false degree-two promise for a cubic rank-one mapping.
 * Every weight-two residual vanishes although some weight-three values
 * differ. The incomplete envelope misses a real preimage.
 * @returns {{trueDegree:number,falseDegree:number,hiddenPreimage:number,misclassifiedTarget:number,completeResidualRank:number}}
 */
function outOfDegreePromiseControl() {
  const n=12;
  /** @param {number} x @returns {number} */
  const F=x=>x^(((((x>>>1)&1)&((x>>>2)&1)&((x>>>3)&1))?1:0));
  const misclassifiedTarget=0x0e, hiddenPreimage=0x0f;
  const incomplete=learnLowDegree(F,n,2);
  assert.equal(incomplete.residual.length,0);
  assert.equal(invert(F,incomplete,misclassifiedTarget).answer,null);
  const complete=learnLowDegree(F,n,3);
  assert.equal(complete.residual.length,1);
  const result=invert(F,complete,misclassifiedTarget);
  assert.equal(result.answer,hiddenPreimage);
  assert.equal(F(result.answer),misclassifiedTarget);
  return {trueDegree:3,falseDegree:2,hiddenPreimage,
    misclassifiedTarget,completeResidualRank:complete.residual.length};
}

/** @returns {object} */
function main() {
  const n=12, delta=1e-10, rValues=[1,2,3];
  let cases=0, nontrivial=0, singular=0, totalQueries=0, maxQueries=0;
  let maxCandidates=0, noTrainingTarget=0, nonbijective=0, noImageChecks=0, allTargetChecks=0;
  for (const r of rValues) for (const kind of /** @type {const} */ (['shear','quotient','nonbijective'])) {
    for (let k=0; k<60; k++) {
      const random=randomFromSeed(0xa51c57e ^ (r*0x10000) ^ (k*0x234f) ^ (kind==='shear'?0:kind==='quotient'?0xbadde:0xdeaedd));
      const F=generate(n,r,kind,random);
      const seen=new Uint16Array(1<<n);
      for (let x=0; x<(1<<n); x++) seen[F(x)]++;
      if(kind!=='nonbijective') {
        assert.ok(seen.every(v=>v===1),`fixture not bijective: ${r} ${kind} ${k}`);
      } else if(seen.some(v=>v!==1)) nonbijective++;
      const cached=learn(F,n,r,delta,random);
      assert.ok(cached.residual.length<=r);
      if (cached.residual.length) nontrivial++;
      const span=newSpan(n);
      for (const col of cached.columns) addToSpan(span,col);
      if (span.vectors.length<n) singular++;
      let targetX=random() & ((1<<n)-1);
      while (cached.observed.has(targetX)) targetX=(targetX+1)&((1<<n)-1);
      noTrainingTarget++;
      if(kind==='nonbijective' && r>=2 && k<3) {
        for(let y=0;y<(1<<n);y++) {
          const result=invert(F,cached,y);
          assert.equal(result.answer===null,seen[y]===0,`image classification ${r} ${k} ${y}`);
          if(result.answer!==null)assert.equal(F(result.answer),y);
          assert.ok(result.candidates<=2**r);
          allTargetChecks++;
        }
      }
      const before=cached.observed.size;
      const verdict=invert(F,cached,F(targetX));
      assert.notEqual(verdict.answer,null,`missed image target: ${r} ${kind} ${k}`);
      assert.equal(F(/** @type {number} */ (verdict.answer)), F(targetX));
      if(kind!=='nonbijective')assert.equal(verdict.answer,targetX);
      assert.ok(verdict.candidates<=2**r);
      if(kind==='nonbijective') {
        const missing=seen.findIndex(v=>v===0);
        if(missing>=0) {
          const negative=invert(F,cached,missing);
          assert.equal(negative.answer,null,`invented unreachable image: ${r} ${k}`);
          noImageChecks++;
        }
      }
      const queryCount=before+verdict.candidates;
      assert.ok(queryCount<=n+1+cached.samples+2**r);
      totalQueries+=queryCount;
      maxQueries=Math.max(maxQueries,queryCount);
      maxCandidates=Math.max(maxCandidates,verdict.candidates);
      cases++;
    }
  }
  assert.ok(nontrivial>150 && singular>20 && nonbijective>100 && noImageChecks>100);
  const result={cases,n,rankBounds:rValues,nontrivial,singular,noTrainingTarget,
    totalQueries,maxQueries,maxCandidates,nonbijective,noImageChecks,allTargetChecks,
    meanQueryBudget:totalQueries/cases,
    delta,independentExecutable:__filename,
    outOfPromiseCounterexample:outOfPromiseControl(),
    rankTwoOutputOnlyLowerBound:outputRankTwoLowerBoundWitness(),
    deterministicDegree:deterministicDegreeWitness(),
    width32Deterministic:width32DeterministicQuadratic(),
    width3Exhaustive:width3ExhaustiveNonbijective(),
    singularAffine:singularAffineDegreeWitness(),
    width32Projected:width32ProjectedRankWitness(),
    outOfDegreePromise:outOfDegreePromiseControl()};
  console.log(JSON.stringify(result,null,2));
  return result;
}

if (require.main===module) main();
module.exports={learn,learnLowDegree,invert,generate,generateQuadratic,
  deterministicDegreeWitness,width32DeterministicQuadratic,
  width3ExhaustiveNonbijective,singularAffineDegreeWitness,
  width32ProjectedRankWitness,envelopeNullity,
  applyRows,applyColumns,solveAffinePreimageCandidates,
  outOfPromiseControl,outOfDegreePromiseControl,
  outputRankTwoLowerBoundWitness,main};
