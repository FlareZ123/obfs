'use strict';

const assert=require('node:assert/strict');
const {clone,evaluate}=require('./rankthree-polarization-oracle-clone');
const {learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let out=0;
  for(let i=0;i<columns.length;i++)if((x>>>i)&1)out^=columns[i];
  return out>>>0;
}
/** @param {number} x @returns {number} */
function parity(x){
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;return x&1;
}
/** @param {number[]} columns @returns {number} */
function rank(columns){
  const pivots=Array(32).fill(0);
  let result=0;
  for(const entry of columns){
    let x=entry>>>0;
    for(let i=31;i>=0;i--){
      if(!((x>>>i)&1))continue;
      if(pivots[i])x=(x^pivots[i])>>>0;
      else{pivots[i]=x;result++;break;}
    }
  }
  return result;
}
/** @param {()=>number} draw @returns {number[]} */
function randomInvertible(draw){
  const columns=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let i=0;i<256;i++){
    const a=draw()%32;
    let b=draw()%31;if(b>=a)b++;
    columns[a]=(columns[a]^columns[b])>>>0;
    if((draw()&3)===0){
      const temp=columns[a];columns[a]=columns[b];columns[b]=temp;
    }
  }
  assert.equal(rank(columns),32);
  return columns;
}

/**
 * Source-side generator with deliberately identified family labels.
 * Only the resulting function callback is ever passed to either learner.
 * @param {()=>number} draw
 * @param {'cubic'|'quadratic'|'singular'|'affine'} family
 * @param {number} caseNo
 * @returns {(x:number)=>number}
 */
function makeSource(draw,family,caseNo){
  const A=randomInvertible(draw);
  if(family==='singular')A[0]=0;
  assert.equal(rank(A),family==='singular'?31:32);
  /** @type {number[]} */
  const V=[];
  while(V.length<3){
    let next=draw();
    if(family==='singular')next&=0xfffffffe;
    if(rank([...V,next])===V.length+1)V.push(next>>>0);
  }
  const constant=draw();
  const linear=Array.from({length:3},()=>draw());
  const quadratic=Array.from({length:3},()=>draw());
  const cubic=(family==='cubic'||(family==='singular'&&caseNo%2===0))
    ?(draw()||1):0;
  if(family==='quadratic'){
    quadratic[0]=quadratic[0]||1;
  }
  if(family==='affine')quadratic.fill(0);
  const finalCubic=family==='affine'?0:cubic;
  const offset=draw();
  /** @param {number} x @returns {number} */
  function F(x){
    const z=V.map(v=>parity(v&x));
    let correction=constant;
    for(let i=0;i<3;i++)if(z[i])correction^=linear[i];
    if(z[0]&z[1])correction^=quadratic[0];
    if(z[0]&z[2])correction^=quadratic[1];
    if(z[1]&z[2])correction^=quadratic[2];
    if(z[0]&z[1]&z[2])correction^=finalCubic;
    return (apply(A,x)^offset^correction)>>>0;
  }
  if(family==='singular'){
    assert.equal(F(0),F(1),
      'The deliberately singular case must have a genuine collision');
  }
  return F;
}

/**
 * Matched-source experiment: specialize a rank-three projected learner
 * against the general degree<=3 ANF full functional clone on *identical*
 * function instances, while comparing a held-out identical input set.
 * No wall-clock cost, runtime overhead or source reconstruction claim.
 * @returns {object}
 */
function main(){
  const draw=seeded(0x4a921bd5);
  const kinds=/** @type {const} */ (['cubic','quadratic','singular','affine']);
  const casesPerKind=5;
  /** @type {Array<{kind:string,instances:number,learnedQueries:number[],genericQueries:number,verifiedHeldouts:number}>} */
  const rows=[];
  let totalCases=0,totalHeldout=0,fastSum=0,genericSum=0;
  let maxFast=0,minFast=Infinity;
  for(const kind of kinds){
    const queries=[];
    let heldout=0;
    for(let trial=0;trial<casesPerKind;trial++){
      const source=makeSource(draw,kind,trial);
      const fastSeed=(draw()^0x80a1357c)>>>0;
      let liveFast=true,liveGeneric=true;
      /** @type {Set<number>} */
      const fastInputs=new Set();
      /** @type {Set<number>} */
      const genericInputs=new Set();
      const specialized=clone(x=>{
        if(!liveFast)throw Error('Specialized clone requested a disabled oracle');
        fastInputs.add(x>>>0);
        return source(x);
      },32,seeded(fastSeed));
      liveFast=false;
      const generic=learnBoundedDegreeOracle(x=>{
        if(!liveGeneric)throw Error('Generic clone requested a disabled oracle');
        genericInputs.add(x>>>0);
        return source(x);
      },32,3);
      liveGeneric=false;
      assert.equal(specialized.queries,fastInputs.size);
      assert.equal(generic.queryCount,genericInputs.size);
      assert.equal(generic.queryCount,5489);
      assert.ok(specialized.queries<=631);

      const fastModel=JSON.parse(JSON.stringify(specialized));
      const genericModel=JSON.parse(JSON.stringify(generic));
      for(let i=0;i<256;i++){
        const x=draw();
        const actual=source(x);
        assert.equal(evaluate(fastModel,x),actual,
          'Specialized heldout mismatch on '+kind+' case '+trial);
        assert.equal(evaluateBoundedDegreeModel(genericModel,x),actual,
          'Generic heldout mismatch on '+kind+' case '+trial);
        heldout++;
        totalHeldout++;
      }
      queries.push(specialized.queries);
      fastSum+=specialized.queries;
      genericSum+=generic.queryCount;
      maxFast=Math.max(maxFast,specialized.queries);
      minFast=Math.min(minFast,specialized.queries);
      totalCases++;
    }
    rows.push({kind,instances:casesPerKind,
      learnedQueries:queries,genericQueries:5489,verifiedHeldouts:heldout});
  }
  assert.equal(totalCases,20);
  assert.equal(totalHeldout,5120);
  assert.ok(maxFast<=631);
  const output={
    inputWidth:32,oracleContract:'same fixed function and heldout inputs',
    family:'hidden input projection rank<=3, arbitrary vector-valued degree<=3',
    attempts:totalCases,heldoutOutputsPerMethod:totalHeldout,
    specialized:{minQueries:minFast,maxQueries:maxFast,totalQueries:fastSum,
      mathematicalConfidenceCap:631},
    generic:{queriesPerSource:5489,totalQueries:genericSum},
    totalQuerySavings:genericSum-fastSum,
    rows,
    confidence:'Specialized probability bound requires iid uniform triples; fixed-seed witnesses do not independently certify the failure probability',
    scope:'Chosen-input functional cloning only; no obfuscation runtime measurement'
  };
  console.log(JSON.stringify(output,null,2));
  return output;
}
if(require.main===module)main();
module.exports={main};
