'use strict';

const assert=require('node:assert/strict');
const {learnBoundedDegreeOracle,evaluateBoundedDegreeModel}=
  require('./bounded-degree-oracle-functional-clone');

/** @typedef {ReturnType<typeof learnBoundedDegreeOracle>} Quadratic */
/**
 * A cubic source whose observed standard-basis signature span exceeds four.
 * The validated wrapper may safely route only this structural failure to exact ANF.
 */
class SignatureSpanOverflowError extends Error {
  /** @param {number} trials */
  constructor(trials) {
    super('Cubic signature span exceeds four');
    this.name='SignatureSpanOverflowError';
    /** @type {'ERR_CUBIC_SIGNATURE_SPAN_OVERFLOW'} */
    this.code='ERR_CUBIC_SIGNATURE_SPAN_OVERFLOW';
    /** @type {number} */
    this.trials=trials;
  }
}

/** @typedef {{bits:number,degree:2|3,projected:number[],
 cubic:number[],lower:Quadratic,queries:number,trials:number}} Model */

/** @param {number} value @returns {number} */
function weight(value){
  let count=0;
  while(value){count++;value&=value-1;}
  return count;
}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let out=0;
  for(let i=0;i<columns.length;i++)if((x>>>i)&1)out^=columns[i];
  return out>>>0;
}
/** @param {number[]} coefficients @param {number} x @returns {number} */
function cubicValue(coefficients,x){
  let out=0;
  for(let m=0;m<coefficients.length;m++){
    if(weight(m)===3 && (x&m)===m)out^=coefficients[m];
  }
  return out>>>0;
}

/**
 * Learn a fixed degree<=3 vector-valued oracle F with input projection
 * rank<=4. A nonzero third derivative yields a 3/4-dimensional
 * hidden quotient basis; subtract its complete cubic component and
 * learn the remaining quadratic via generic Boolean ANF.
 * No assumption on injectivity or the hidden affine core.
 *
 * @param {(x:number)=>number} oracle
 * @param {number} bits 4..32
 * @param {()=>number} draw independent uniform words for probability claim
 * @param {number} [delta]
 * @returns {Model}
 */
function learn(oracle,bits,draw,delta=1e-10){
  if(!Number.isInteger(bits)||bits<4||bits>32)
    throw new RangeError('Cubic rescue requires 4..32 input bits');
  if(!Number.isFinite(delta)||delta<=0||delta>=1)
    throw new RangeError('Cubic rescue requires delta in (0,1)');
  const mask=bits===32?0xffffffff:2**bits-1;
  /** @type {Map<number,number>} */
  const seen=new Map();
  /** @param {number} x @returns {number} */
  function ask(x){
    const key=(x&mask)>>>0;
    if(!seen.has(key))seen.set(key,oracle(key)>>>0);
    return /** @type {number} */ (seen.get(key));
  }
  /**
   * Alternating trilinear third derivative. For a genuine cubic it
   * equals the vector cubic tensor, with no lower-order pollution.
   * @param {number} a @param {number} b @param {number} c
   * @returns {number}
   */
  function T(a,b,c){
    return (ask(0)^ask(a)^ask(b)^ask(c)^
      ask((a^b)>>>0)^ask((a^c)>>>0)^
      ask((b^c)>>>0)^ask((a^b^c)>>>0))>>>0;
  }
  const sampleLimit=Math.ceil(Math.log(delta)/Math.log(43/64));
  let a=0,b=0,c=0,nonzero=0,trials=0;
  for(;trials<sampleLimit;trials++){
    const pa=draw()&mask,pb=draw()&mask,pc=draw()&mask;
    const output=T(pa,pb,pc);
    if(output){
      a=pa>>>0;b=pb>>>0;c=pc>>>0;
      nonzero=output;trials++;
      break;
    }
  }
  if(!nonzero){
    const lower=learnBoundedDegreeOracle(ask,bits,2);
    assert.ok(seen.size<=7*sampleLimit+1+bits+bits*(bits-1)/2);
    return {bits,degree:2,projected:[],cubic:[],lower,
      queries:seen.size,trials};
  }

  /** @typedef {[number,number,number]} Signature */
  /** @param {number} x @returns {Signature} */
  function sig(x){
    return [T(x,b,c),T(a,x,c),T(a,b,x)];
  }
  const basisInputs=[a,b,c];
  /** @type {Signature[]} */
  const signatures=[[nonzero,0,0],[0,nonzero,0],[0,0,nonzero]];
  const originalSig=Array.from({length:bits},(_,i)=>sig((1<<i)>>>0));
  /** @param {Signature} value @param {Signature[]} columns @returns {number} */
  function coordinate(value,columns){
    for(let mask=0;mask<2**columns.length;mask++){
      /** @type {Signature} */
      const trial=[0,0,0];
      for(let i=0;i<columns.length;i++)if((mask>>>i)&1){
        for(let j=0;j<3;j++)trial[j]=(trial[j]^columns[i][j])>>>0;
      }
      if(trial.every((x,i)=>x===value[i]))return mask;
    }
    return -1;
  }
  let fourthIndex=-1;
  for(let i=0;i<bits;i++){
    if(coordinate(originalSig[i],signatures)===-1){
      fourthIndex=i;break;
    }
  }
  if(fourthIndex>=0){
    const d=(1<<fourthIndex)>>>0;
    basisInputs.push(d);
    signatures.push(originalSig[fourthIndex]);
  }
  const projected=originalSig.map(x=>coordinate(x,signatures));
  if(!projected.every(x=>x>=0))throw new SignatureSpanOverflowError(trials);
  const dimension=basisInputs.length;
  assert.ok(dimension===3||dimension===4);

  const cubic=Array.from({length:2**dimension},(_,m)=>{
    let x=0;
    for(let i=0;i<dimension;i++){
      if((m>>>i)&1)x^=basisInputs[i];
    }
    return ask(x>>>0);
  });
  // Boolean Möbius coefficient extraction on the anchor cube.
  for(let i=0;i<dimension;i++){
    for(let m=0;m<2**dimension;m++){
      if((m>>>i)&1)cubic[m]^=cubic[m^(1<<i)];
    }
  }
  for(let m=0;m<cubic.length;m++){
    if(weight(m)!==3)cubic[m]=0;
  }
  assert.equal(cubicValue(cubic,7),nonzero,
    'Cubic anchor witness must equal the 3D cubic ANF coefficient');

  /** @param {number} x @returns {number} */
  const higher=x=>(cubicValue(cubic,apply(projected,x)))>>>0;
  const lower=learnBoundedDegreeOracle(x=>(ask(x)^higher(x))>>>0,bits,2);
  assert.ok(seen.size<=7*sampleLimit+6*bits+8+
    (1+bits+bits*(bits-1)/2));
  return {bits,degree:3,projected,cubic,lower,
    queries:seen.size,trials};
}

/** @param {Model} model @param {number} input @returns {number} */
function evaluate(model,input){
  let out=evaluateBoundedDegreeModel(model.lower,input);
  if(model.degree===3){
    out^=cubicValue(model.cubic,apply(model.projected,input));
  }
  return out>>>0;
}

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;
    return state>>>0;};
}
/** @param {number} x @returns {number} */
function parity(x){
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;return x&1;
}
/** @param {number[]} columns @returns {number} */
function rank32(columns){
  const pivot=Array(32).fill(0);let count=0;
  for(const column of columns){
    let value=column>>>0;
    for(let i=31;i>=0;i--){
      if(!((value>>>i)&1))continue;
      if(pivot[i])value=(value^pivot[i])>>>0;
      else{pivot[i]=value;count++;break;}
    }
  }
  return count;
}
/** @param {()=>number} draw @returns {number[]} */
function randomInvertible(draw){
  const cols=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let j=0;j<384;j++){
    const i=draw()%32;let k=draw()%31;if(k>=i)k++;
    cols[i]=(cols[i]^cols[k])>>>0;
    if((draw()&3)===0){const tmp=cols[i];cols[i]=cols[k];cols[k]=tmp;}
  }
  return cols;
}

/** @returns {object} */
function main(){
  const scalar=seeded(0x202645a4);
  let finite=0,fullOutputs=0,cubicCases=0,quadraticCases=0;
  for(let g=0;g<65536;g++){
    // By XOR parity over truth table, exactly 32768 of these are cubic
    // or lower. Exhaust the complete quartic-free set.
    if(parity(g)!==0)continue;
    /** @param {number} x @returns {number} */
    const F=x=>(x^((g>>>x)&1))>>>0;
    let online=true,called=0;
    const model=learn(x=>{
      if(!online)throw Error('Finite offline model requested oracle');
      called++;return F(x);
    },4,seeded((g^0x1e0d7241)>>>0));
    online=false;
    assert.equal(called,model.queries);
    const offline=/** @type {Model} */ (JSON.parse(JSON.stringify(model)));
    for(let x=0;x<16;x++){
      assert.equal(evaluate(offline,x),F(x),
        'Quartic-free width-four cubic rescue mismatch '+g+','+x);
      fullOutputs++;
    }
    if(model.degree===3)cubicCases++;else quadraticCases++;
    finite++;
  }
  assert.equal(finite,32768);
  assert.equal(fullOutputs,524288);

  const draw=seeded(0x1325a45c);
  let cases=0,heldouts=0,cubicBranch=0,lowerBranch=0;
  let maxQueries=0,deliberatelyNoninjective=0;
  for(let trial=0;trial<24;trial++){
    const A=randomInvertible(draw);
    if(trial%4===0)A[0]=0;
    /** @type {number[]} */
    const V=[];
    while(V.length<4){
      let v=draw();
      if(trial%4===0)v&=0xfffffffe;
      if(rank32([...V,v])>V.length)V.push(v>>>0);
    }
    const quadratic=Array.from({length:6},()=>draw());
    const cubic=Array.from({length:4},()=>draw());
    if(trial%3===0)cubic.fill(0);
    else if(cubic.reduce((x,y)=>x|y,0)===0)cubic[0]=1;
    const offset=draw();
    /** @param {number} x @returns {number} */
    const F=x=>{
      const z=V.map(v=>parity(v&x));
      let correction=0;
      const pairs=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
      const triples=[[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
      for(let i=0;i<6;i++)if(z[pairs[i][0]]&z[pairs[i][1]])
        correction^=quadratic[i];
      for(let i=0;i<4;i++)if(z[triples[i][0]]&z[triples[i][1]]&
          z[triples[i][2]])correction^=cubic[i];
      return (apply(A,x)^correction^offset)>>>0;
    };
    if(trial%4===0){assert.equal(F(0),F(1));deliberatelyNoninjective++;}
    let online=true,called=0;
    const model=learn(x=>{
      if(!online)throw Error('32-bit offline model requested oracle');
      called++;return F(x);
    },32,seeded((0x92a11337^trial*0x9e3779b9)>>>0));
    online=false;
    assert.equal(called,model.queries);
    assert.ok(called<=1135);
    const serialized=/** @type {Model} */ (JSON.parse(JSON.stringify(model)));
    for(let j=0;j<1024;j++){
      const x=draw();
      assert.equal(evaluate(serialized,x),F(x),
        'Quartic-free 32-bit cubic rescue mismatch '+trial);
      heldouts++;
    }
    if(model.degree===3)cubicBranch++;else lowerBranch++;
    maxQueries=Math.max(maxQueries,called);
    cases++;
  }
  assert.ok(cubicBranch>0&&lowerBranch>0);
  const summary={
    class:'Cubic-or-lower vector oracle with input projection rank <=4',
    exactSourcePromise:'Quartic coefficient is zero',
    finite:{functions:finite,exhaustiveOutputs:fullOutputs,cubicCases,quadraticCases},
    width32:{cases,heldouts,cubicBranch,lowerBranch,
      deliberatelyNoninjective,maxQueries,confidenceCap:1135},
    confidence:'(43/64)^58 for any nonzero vector cubic on a rank<=4 projection',
    note:'Fixed seeded test transcript is reproducible evidence, not independent-uniform probability confirmation'
  };
  console.log(JSON.stringify(summary,null,2));
  return summary;
}
if(require.main===module)main();
module.exports={learn,evaluate,main,SignatureSpanOverflowError};
