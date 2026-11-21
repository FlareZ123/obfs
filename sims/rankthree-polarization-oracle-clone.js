'use strict';
const assert=require('node:assert/strict');
const {clone:learnQuadratic,evaluate:evaluateQuadratic}=
  require('./rankthree-quadratic-polarization-peer');

/** @typedef {{bits:number,base:number,linear:number[],degree:2|3,
  quadratic:number[][],p:number[],q:number[],r:number[],
  h12:number,h13:number,h23:number,h123:number,
  queries:number,trials:number}} Clone */

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let v=seed>>>0;
  return ()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return v>>>0;};
}
/** @param {number[]} columns @param {number} x @returns {number} */
function apply(columns,x){
  let value=0;
  for(let i=0;i<columns.length;i++)if((x>>>i)&1)value^=columns[i];
  return value>>>0;
}
/** @param {number} x @returns {number} */
function parity(x){
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;return x&1;
}
/** @param {number[]} columns @param {number} width @returns {number} */
function rank(columns,width){
  const pivots=Array(width).fill(0);
  let count=0;
  for(const entry of columns){
    let word=entry>>>0;
    for(let bit=width-1;bit>=0;bit--){
      if(!((word>>>bit)&1))continue;
      if(pivots[bit])word=(word^pivots[bit])>>>0;
      else{pivots[bit]=word;count++;break;}
    }
  }
  return count;
}
/** @param {()=>number} draw @returns {number[]} */
function invertibleColumns(draw){
  const cols=Array.from({length:32},(_,i)=>(1<<i)>>>0);
  for(let j=0;j<384;j++){
    const a=draw()%32;let b=draw()%31;if(b>=a)b++;
    cols[a]=(cols[a]^cols[b])>>>0;
    if((draw()&3)===0){const v=cols[a];cols[a]=cols[b];cols[b]=v;}
  }
  return cols;
}

/**
 * Source-only functional clone under an input linear projection of rank <=3.
 * Third derivative detects a genuine cubic component. When it vanishes,
 * generic degree-two interpolation gives an exact clone under the promise.
 * @param {(x:number)=>number} oracle
 * @param {number} bits
 * @param {()=>number} draw
 * @param {number} [delta]
 * @returns {Clone}
 */
function clone(oracle,bits,draw,delta=1e-10){
  if(!Number.isInteger(bits)||bits<1||bits>32)
    throw new RangeError('Expected 1..32 input bits');
  const mask=bits===32?0xffffffff:(2**bits-1);
  /** @type {Map<number,number>} */
  const seen=new Map();
  /** @param {number} x @returns {number} */
  function ask(x){
    const value=(x&mask)>>>0;
    if(!seen.has(value))seen.set(value,oracle(value)>>>0);
    return /** @type {number} */ (seen.get(value));
  }
  const base=ask(0);
  const basis=Array.from({length:bits},(_,i)=>
    (ask((1<<i)>>>0)^base)>>>0);
  /** @param {number} a @param {number} b @returns {number} */
  function B(a,b){
    return (ask((a^b)>>>0)^ask(a)^ask(b)^base)>>>0;
  }
  /** @param {number} a @param {number} b @param {number} c @returns {number} */
  function T(a,b,c){
    return (base^ask(a)^ask(b)^ask(c)^
      ask((a^b)>>>0)^ask((a^c)>>>0)^ask((b^c)>>>0)^
      ask((a^b^c)>>>0))>>>0;
  }
  const bound=Math.ceil(Math.log(delta)/Math.log(43/64));
  let a=0,b=0,c=0,w=0,trials=0;
  for(;trials<bound;trials++){
    const pa=draw()&mask,pb=draw()&mask,pc=draw()&mask;
    const v=T(pa,pb,pc);
    if(v){
      a=pa>>>0;b=pb>>>0;c=pc>>>0;w=v;trials++;break;
    }
  }
  if(w){
    const p=Array(bits).fill(0),q=Array(bits).fill(0),r=Array(bits).fill(0);
    for(let i=0;i<bits;i++){
      const e=(1<<i)>>>0;
      const pp=T(e,b,c), qq=T(a,e,c), rr=T(a,b,e);
      assert.ok(pp===0||pp===w);
      assert.ok(qq===0||qq===w);
      assert.ok(rr===0||rr===w);
      p[i]=Number(pp!==0);q[i]=Number(qq!==0);r[i]=Number(rr!==0);
    }
    const h12=B(a,b),h13=B(a,c),h23=B(b,c),h123=w;
    /** @param {number} pp @param {number} qq @param {number} rr @returns {number} */
    function H(pp,qq,rr){
      return (((pp&qq)?h12:0)^((pp&rr)?h13:0)^
        ((qq&rr)?h23:0)^((pp&qq&rr)?h123:0))>>>0;
    }
    const linear=basis.map((entry,i)=>(entry^H(p[i],q[i],r[i]))>>>0);
    assert.ok(seen.size <= (bits+1)+7*bound+6*bits);
    return {bits,base,linear,degree:3,quadratic:[],p,q,r,
      h12,h13,h23,h123,queries:seen.size,trials};
  }
  // A genuine degree<=2 projected rank-three polar form has an
  // effective quotient of dimension at most three. The independent
  // two-anchor peer learner recovers its complete alternating Gram
  // form using <=2n signature values after a nonzero random pair.
  // If a true cubic was missed, the entire failure event is already
  // bounded by the preceding independent-uniform triple search.
  const quadraticModel=learnQuadratic(ask,bits,draw,delta);
  /** @type {number[][]} */
  const quadratic=[];
  for(let i=0;i<bits;i++){
    /** @type {number[]} */
    const row=[];
    const a=(1<<i)>>>0;
    for(let j=i+1;j<bits;j++){
      const b=(1<<j)>>>0;
      row.push((evaluateQuadratic(quadraticModel,0)^
        evaluateQuadratic(quadraticModel,a)^
        evaluateQuadratic(quadraticModel,b)^
        evaluateQuadratic(quadraticModel,(a^b)>>>0))>>>0);
    }
    quadratic.push(row);
  }
  const pairBound=Math.ceil(Math.log(delta)/Math.log(5/8));
  assert.ok(seen.size <= (bits+1)+7*bound+3*pairBound+2*bits);
  return {bits,base,linear:basis,degree:2,quadratic,
    p:[],q:[],r:[],h12:0,h13:0,h23:0,h123:0,
    queries:seen.size,trials};
}

/** @param {Clone} m @param {number} x @returns {number} */
function evaluate(m,x){
  let value=(m.base^apply(m.linear,x))>>>0;
  if(m.degree===2){
    for(let i=0;i<m.bits;i++){
      if(!((x>>>i)&1))continue;
      for(let j=i+1;j<m.bits;j++){
        if((x>>>j)&1)value^=m.quadratic[i][j-i-1];
      }
    }
    return value>>>0;
  }
  let p=0,q=0,r=0;
  for(let i=0;i<m.bits;i++){
    if(!((x>>>i)&1))continue;
    p^=m.p[i];q^=m.q[i];r^=m.r[i];
  }
  if(p&q)value^=m.h12;
  if(p&r)value^=m.h13;
  if(q&r)value^=m.h23;
  if(p&q&r)value^=m.h123;
  return value>>>0;
}

/** @returns {number[][]} */
function invertible3(){
  /** @type {number[][]} */
  const xs=[];
  for(let a=1;a<8;a++)for(let b=1;b<8;b++)for(let c=1;c<8;c++){
    if(rank([a,b,c],3)===3)xs.push([a,b,c]);
  }
  assert.equal(xs.length,168);
  return xs;
}
/** @param {()=>number} draw @returns {(x:number)=>number} */
function projected32(draw){
  const A=invertibleColumns(draw);
  /** @type {number[]} */
  const V=[];
  while(V.length<3){
    const candidate=draw();
    if(rank([...V,candidate],32)>V.length)V.push(candidate);
  }
  const table=Array.from({length:8},()=>draw());
  // Every third instance is forced to have no cubic ANF term.
  if((draw()&3)===0){
    let v=0;for(let i=0;i<7;i++)v^=table[i];
    table[7]=v>>>0;
  }
  const base=draw();
  return x=>{
    const z=parity(V[0]&x)|(parity(V[1]&x)<<1)|(parity(V[2]&x)<<2);
    return (apply(A,x)^base^table[z])>>>0;
  };
}
/** @param {()=>number} draw @returns {(x:number)=>number} */
function singular32(draw){
  const input=invertibleColumns(draw);
  const output=invertibleColumns(draw);
  const offset=draw();
  return x=>{
    const t=apply(input,x);
    const nonlinear=(t&0xfffffff8)|
      ((t&1)&((t>>>1)&1))|
      ((((t>>>1)&1)&((t>>>2)&1))<<2);
    return (apply(output,nonlinear)^offset)>>>0;
  };
}

/** @returns {object} */
function main(){
  const matrices=invertible3();
  let smallCases=0,smallOutputs=0,smallCubic=0,smallQuadratic=0;
  for(let vi=0;vi<matrices.length;vi++){
    const V=matrices[vi];
    const outputMask=(1+vi%7)>>>0;
    for(let table=0;table<256;table++){
      /** @param {number} x @returns {number} */
      const F=x=>{
        const z=apply(V,x);
        return (x^(((table>>>z)&1)?outputMask:0))>>>0;
      };
      let online=true,calls=0;
      const m=clone(x=>{
        if(!online)throw Error('Unexpected live call');
        calls++;return F(x);
      },3,seeded((0x1a93d8e7^vi*0x9e3779b9^table)>>>0));
      online=false;
      assert.equal(calls,m.queries);
      const snapshot=/** @type {Clone} */ (JSON.parse(JSON.stringify(m)));
      for(let x=0;x<8;x++){
        assert.equal(evaluate(snapshot,x),F(x),'Small projected clone failed');
        smallOutputs++;
      }
      if(m.degree===3)smallCubic++;else smallQuadratic++;
      smallCases++;
    }
  }
  assert.equal(smallCases,168*256);
  assert.equal(smallOutputs,smallCases*8);

  const draw=seeded(0x483b97c1);
  let bigCases=0,bigHeldouts=0,bigCubic=0,bigQuadratic=0;
  let maxQueries=0,maxTrials=0,noninjective=0;
  for(let trial=0;trial<64;trial++){
    const isNoninjective=trial%4===0;
    const F=isNoninjective?singular32(draw):projected32(draw);
    let online=true,calls=0;
    const m=clone(x=>{
      if(!online)throw Error('Offline model requested private oracle');
      calls++;return F(x);
    },32,seeded((0x7a035e94^trial*0x9e3779b9)>>>0));
    online=false;
    assert.equal(calls,m.queries);
    const snapshot=/** @type {Clone} */ (JSON.parse(JSON.stringify(m)));
    for(let i=0;i<4096;i++){
      const x=draw();
      assert.equal(evaluate(snapshot,x),F(x),'32-bit held-out output mismatch');
      bigHeldouts++;
    }
    assert.ok(calls<=650);
    if(m.degree===3)bigCubic++;else bigQuadratic++;
    if(isNoninjective)noninjective++;
    maxQueries=Math.max(maxQueries,calls);
    maxTrials=Math.max(maxTrials,m.trials);
    bigCases++;
  }
  assert.ok(bigCubic>0&&bigQuadratic>0);
  const summary={family:'GF(2)^n cubic-or-quadratic with hidden input projection rank <=3',
    width3:{cases:smallCases,outputsVerified:smallOutputs,
      cubic:smallCubic,quadratic:smallQuadratic},
    width32:{cases:bigCases,heldoutOutputs:bigHeldouts,
      cubic:bigCubic,quadratic:bigQuadratic,deliberatelyNoninjective:noninjective,
      maxQueries,maxTripleTrials:maxTrials,confidenceQueryCap:650},
    probability:'Conditional exclusive branches: (43/64)^58 or (5/8)^49 < 1e-10',
    note:'Fixed-seed transcripts are reproducibility tests; they are not the probability proof'};
  console.log(JSON.stringify(summary,null,2));
  return summary;
}
if(require.main===module)main();
module.exports={clone,evaluate,main};
