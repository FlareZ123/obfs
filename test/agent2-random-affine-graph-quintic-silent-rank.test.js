'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {invertByRandomAffineGraph,binomialSum}=
  require('../sims/random-affine-graph-flag-inversion');
const {invertByReanchoring}=
  require('../sims/random-affine-anchor-compatible-inversion');
const {inverseOfColumns}=
  require('../sims/sparse-triangular-fixedpoint-inversion');
const {makeLinearTransform,applyLinear}=
  require('../sims/compatible-permutation-linear-sandwich-blackbox');

/**
 * Identity extension to 32 bits of the two-monomial degree-five permutation:
 * x XOR 128*[x_0..x_4=1] XOR 256*[x_2..x_6=1].
 * Output bits 7 and 8 depend only on lower input bits, so this is triangular.
 * @param {number} input
 * @returns {number}
 */
function silentRankQuinticPermutation(input){
  const x=input>>>0;
  return (x^((x&31)===31?128:0)^((x&124)===124?256:0))>>>0;
}

/**
 * The rank-six standard-basis candidate that retains only the first
 * top-degree monomial. It is itself a permutation, but wrong whenever the
 * second monomial is active.
 * @param {number} input
 * @returns {number}
 */
function rankSixFastCandidate(input){
  const x=input>>>0;
  return (x^((x&31)===31?128:0))>>>0;
}

test('corrected affine-graph inversion recovers the 32-bit silent-rank quintic permutation',()=>{
  // Exhaust the 9-bit core: source and rank-six candidate are both
  // permutations, and the candidate's exact mismatch set has size 16.
  const sourceOutputs=new Set();
  const candidateOutputs=new Set();
  let mismatchCount=0;
  for(let input=0;input<512;input++){
    const source=silentRankQuinticPermutation(input);
    const candidate=rankSixFastCandidate(input);
    sourceOutputs.add(source);
    candidateOutputs.add(candidate);
    if(source!==candidate)mismatchCount++;
  }
  assert.equal(sourceOutputs.size,512);
  assert.equal(candidateOutputs.size,512);
  assert.equal(mismatchCount,16);

  // Every target below activates the omitted second quintic monomial.
  // Four targets have bit 31 clear and four set; both A-only and A+B
  // combinations occur. The high bits otherwise pass through unchanged.
  const secrets=[
    0x0000007c,0x0000007d,0x0000007e,0x0000007f,
    0x8000007c,0x8000007d,0x8000007e,0x8000007f
  ];
  /** @type {Array<{secret:string,target:string,queries:number}>} */
  const receipts=[];
  let totalGraphQueries=0;
  for(let index=0;index<secrets.length;index++){
    const secret=secrets[index]>>>0;
    assert.equal(secret&124,124,'the omitted B monomial must be active');
    const target=silentRankQuinticPermutation(secret);
    assert.notEqual(rankSixFastCandidate(secret),target,
      'the raw rank-six candidate must miss this held-out source target');
    /** @param {bigint} input @returns {bigint} */
    const oracle=input=>BigInt(silentRankQuinticPermutation(Number(input)));
    const result=invertByRandomAffineGraph(oracle,BigInt(target),32,5,{
      seed:0xa500+index,
      delta:1e-8
    });
    assert.equal(result.success,true,JSON.stringify({
      index,reason:result.reason,failedDimension:result.failedDimension
    }));
    assert.equal(result.input,BigInt(secret));
    assert.equal(result.verified,true);
    assert.equal(oracle(result.input),BigInt(target),
      'independent exact source-forward verification');
    assert.equal(result.stages.length,32);
    assert.ok(result.stages.every(stage=>stage.reason==='affine-relation'));
    totalGraphQueries+=result.queries;
    receipts.push({
      secret:'0x'+secret.toString(16).padStart(8,'0'),
      target:'0x'+target.toString(16).padStart(8,'0'),
      queries:result.queries
    });
  }

  // One target-independent complete degree-five ANF clone costs Q(32,5).
  // The graph method is target-specific; this eight-target batch is cheaper
  // in original-source queries for this selected source and target set.
  const exactCloneQueries=binomialSum(32,5);
  assert.equal(exactCloneQueries,242825);
  assert.ok(totalGraphQueries<exactCloneQueries);

  // A ninth distinct B-active target crosses the one-time full-clone cost
  // for this fixed source/seed schedule; this pins the observed break-even.
  const ninthSecret=0x0000017c;
  const ninthTarget=silentRankQuinticPermutation(ninthSecret);
  assert.notEqual(rankSixFastCandidate(ninthSecret),ninthTarget);
  /** @param {bigint} input @returns {bigint} */
  const ninthOracle=input=>BigInt(silentRankQuinticPermutation(Number(input)));
  const ninthResult=invertByRandomAffineGraph(ninthOracle,BigInt(ninthTarget),32,5,{
    seed:0xa508,
    delta:1e-8
  });
  assert.equal(ninthResult.success,true,JSON.stringify({
    reason:ninthResult.reason,failedDimension:ninthResult.failedDimension
  }));
  assert.equal(ninthResult.input,BigInt(ninthSecret));
  assert.equal(ninthResult.verified,true);
  assert.equal(ninthOracle(ninthResult.input),BigInt(ninthTarget));
  assert.equal(ninthResult.stages.length,32);
  assert.ok(ninthResult.stages.every(stage=>stage.reason==='affine-relation'));
  const nineTargetTotal=totalGraphQueries+ninthResult.queries;
  assert.ok(nineTargetTotal>exactCloneQueries);

  process.stdout.write('OBFS_GRAPH_QUINTIC_SILENT_RANK '+JSON.stringify({
    width:32,degree:5,
    jointTopDerivativeRadicalCodimension:7,
    affineFlag:true,
    targets:receipts.length,
    receipts,totalGraphQueries,exactCloneQueries,
    ninthReceipt:{
      secret:'0x'+ninthSecret.toString(16).padStart(8,'0'),
      target:'0x'+ninthTarget.toString(16).padStart(8,'0'),
      queries:ninthResult.queries
    },
    nineTargetTotal,
    rawCandidateMismatchesIn9BitCore:16,
    allTargetsRecovered:true
  })+'\\n');
});


test('affine-graph inversion survives hidden two-sided affine wrappers with a singular canonical reanchor',()=>{
  const inputColumns=makeLinearTransform(0x12345678);
  const outputColumns=makeLinearTransform(0x9abcdef0);
  const inputBias=0x13579bdf;
  const outputBias=0x2468ace0;
  /** @param {number} input @returns {number} */
  const wrappedOracleNumber=input=>{
    const hidden=(applyLinear(inputColumns,input)^inputBias)>>>0;
    return (applyLinear(outputColumns,silentRankQuinticPermutation(hidden))^outputBias)>>>0;
  };
  /** @param {number} input @returns {number} */
  const wrappedFastNumber=input=>{
    const hidden=(applyLinear(inputColumns,input)^inputBias)>>>0;
    return (applyLinear(outputColumns,rankSixFastCandidate(hidden))^outputBias)>>>0;
  };
  /** @param {bigint} input @returns {bigint} */
  const wrappedOracle=input=>BigInt(wrappedOracleNumber(Number(input)));

  // These public inputs map to B-active hidden inputs under the fixed dense
  // affine wrapper. Both values of hidden bit 31 and both A states occur.
  const secrets=[
    0x4f0ff4eb,0xc108ecdd,0xa58a6017,0x34f93989,
    0x640944ac,0x805d7db1,0xc2b25462,0x7cf97486
  ];
  const expectedHidden=[
    0x67aa29fe,0x628acbff,0xfe1940fd,0xc1ece67f,
    0x3e41177e,0x37fff37f,0xbd72767e,0x8721e5ff
  ];
  /** @type {Array<{secret:string,hidden:string,target:string,queries:number}>} */
  const receipts=[];
  let totalGraphQueries=0;
  for(let index=0;index<secrets.length;index++){
    const secret=secrets[index]>>>0;
    const hidden=(applyLinear(inputColumns,secret)^inputBias)>>>0;
    assert.equal(hidden,expectedHidden[index]);
    assert.equal(hidden&124,124,'hidden B monomial must be active');
    const target=wrappedOracleNumber(secret);
    assert.notEqual(wrappedFastNumber(secret),target,
      'the wrapped rank-six candidate must miss every B-active target');
    const result=invertByRandomAffineGraph(wrappedOracle,BigInt(target),32,5,{
      seed:0xb600+index,
      delta:1e-8
    });
    assert.equal(result.success,true,JSON.stringify({
      index,reason:result.reason,failedDimension:result.failedDimension
    }));
    assert.equal(result.input,BigInt(secret));
    assert.equal(result.verified,true);
    assert.equal(wrappedOracle(result.input),BigInt(target));
    assert.equal(result.stages.length,32);
    assert.ok(result.stages.every(stage=>stage.reason==='affine-relation'));
    totalGraphQueries+=result.queries;
    receipts.push({
      secret:'0x'+secret.toString(16).padStart(8,'0'),
      hidden:'0x'+hidden.toString(16).padStart(8,'0'),
      target:'0x'+target.toString(16).padStart(8,'0'),
      queries:result.queries
    });
  }

  // At public anchor zero, the 32 neighbor differences are rank-deficient
  // for this fixed wrapper. A one-basis canonical reanchor cannot proceed,
  // while the graph method above still inverts all selected targets.
  assert.throws(()=>invertByReanchoring(
    wrappedOracleNumber,wrappedOracleNumber(secrets[0]),0x51515151,1,true
  ),/No successful reanchored inversion/);

  // Random reanchoring is a stronger baseline than the canonical anchor:
  // this sparse source admits successful random anchors for some seeds,
  // but not all fixed four-anchor streams.
  const randomReanchor=invertByReanchoring(
    wrappedOracleNumber,wrappedOracleNumber(secrets[0]),0xdeadbeef,4,false
  );
  assert.equal(randomReanchor.value,secrets[0]>>>0);
  assert.equal(randomReanchor.basesTried,3);
  assert.equal(randomReanchor.anchor,0xba8c2458);
  assert.equal(randomReanchor.queries,101);
  assert.equal(randomReanchor.corrections,1);
  assert.equal(randomReanchor.failedBases.length,2);
  assert.ok(randomReanchor.failedBases.every(failure=>
    failure.reason==='interpolant-rank-deficient'));

  // Source-private audit: the third anchor's normalized interpolant
  // B=Lout^-1 M_r Lin^-1 is lower-unitriangular, satisfying the theorem's
  // sufficient condition. The attacker only sees the oracle and final check.
  const inputInverse=inverseOfColumns(inputColumns);
  const outputInverse=inverseOfColumns(outputColumns);
  assert.notEqual(inputInverse,null);
  assert.notEqual(outputInverse,null);
  const compatibleAnchor=0xba8c2458;
  const anchorBase=wrappedOracleNumber(compatibleAnchor);
  const observedColumns=Array.from({length:32},(_,bit)=>
    (wrappedOracleNumber((compatibleAnchor^(2**bit))>>>0)^anchorBase)>>>0);
  const normalizedColumns=Array.from({length:32},(_,bit)=>{
    const hiddenDirection=inputInverse(2**bit>>>0);
    const publicOutputDirection=applyLinear(observedColumns,hiddenDirection);
    return outputInverse(publicOutputDirection)>>>0;
  });
  for(let bit=0;bit<32;bit++){
    assert.equal(normalizedColumns[bit]&((2**bit)-1),0,
      'compatible B must have no entries above its diagonal');
    assert.equal((normalizedColumns[bit]>>>bit)&1,1,
      'compatible B must have unit diagonal');
  }

  assert.throws(()=>invertByReanchoring(
    wrappedOracleNumber,wrappedOracleNumber(secrets[0]),0x51515151,4,false
  ),/No successful reanchored inversion/);

  const exactCloneQueries=binomialSum(32,5);
  assert.equal(exactCloneQueries,242825);
  assert.ok(totalGraphQueries<exactCloneQueries);
  process.stdout.write('OBFS_GRAPH_QUINTIC_AFFINE_WRAPPED '+JSON.stringify({
    width:32,degree:5,
    jointTopDerivativeRadicalCodimension:7,
    affineFlag:true,
    targets:receipts.length,receipts,totalGraphQueries,exactCloneQueries,
    canonicalAnchorReanchor:'rank-deficient',
    randomReanchorSuccess:{
      anchor:'0x'+randomReanchor.anchor.toString(16).padStart(8,'0'),
      queries:randomReanchor.queries,
      basesTried:randomReanchor.basesTried,
      corrections:randomReanchor.corrections,
      normalizedBLowerUnitriangular:true
    },
    randomReanchorFailureSeed:'0x51515151',
    allTargetsRecovered:true
  })+'\\n');
});
