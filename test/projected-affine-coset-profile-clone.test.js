'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {learnProjectedAffineOracle,evaluateProjectedAffineModel}=
  require('../sims/projected-affine-coset-profile-clone');

/** @param {number} seed @returns {()=>number} */
function seeded(seed){
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let x=state;
    x=Math.imul(x^(x>>>15),x|1);
    x^=x+Math.imul(x^(x>>>7),x|61);
    return (x^(x>>>14))>>>0;
  };
}

/** @param {number} x @returns {number} */
function parity(x){
  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;
  return x&1;
}

/** @param {number[]} masks @returns {number} */
function rankOf(masks){
  const pivots=Array(32).fill(0);
  let count=0;
  for(let value of masks){
    for(let i=31;i>=0;i--){
      if(!((value>>>i)&1))continue;
      if(pivots[i])value=(value^pivots[i])>>>0;
      else{pivots[i]=value;count++;break;}
    }
  }
  return count;
}

/**
 * This private family is built independently of the public-source learner.
 * The test passes only its forward oracle to the attacker.
 * @param {number} bits
 * @param {number} rank
 * @param {()=>number} draw
 * @param {boolean} noninjective
 * @param {boolean} sparse
 * @returns {(input:number)=>number}
 */
function secretOracle(bits,rank,draw,noninjective,sparse){
  const mask=bits===32?0xffffffff:2**bits-1;
  /** @type {number[]} */
  const projected=[];
  while(projected.length<rank){
    const candidate=(draw()&mask)>>>0;
    if(rankOf([...projected,candidate])===projected.length+1){
      projected.push(candidate);
    }
  }
  const affine=Array.from({length:bits},()=>noninjective?0:draw());
  const offset=draw();
  const table=Array.from({length:2**rank},()=>sparse?0:draw());
  if(sparse)table[table.length-1]=(draw()|1)>>>0;
  return input=>{
    const x=(input&mask)>>>0;
    let v=0;
    for(let i=0;i<rank;i++)v|=parity(x&projected[i])<<i;
    let output=offset^table[v];
    let y=x;
    while(y){
      const low=y&-y;
      output^=affine[31-Math.clz32(low)];
      y=(y^low)>>>0;
    }
    return output>>>0;
  };
}

test('random hidden input rank four through six yields fully offline 32-bit functional clones',()=>{
  let cases=0,heldouts=0,maxQueries=0,noninjective=0;
  for(const rank of [4,5,6]){
    for(let trial=0;trial<12;trial++){
      const sparse=trial%4===0;
      const singular=trial%3===0;
      const native=secretOracle(32,rank,
        seeded((0x8391ac00^rank*101+trial*619)>>>0),singular,sparse);
      let online=true,calls=0;
      const oracle=/** @type {(input:number)=>number} */ (x=>{
        if(!online)throw new Error('Offline model attempted to query original oracle');
        calls++;
        return native(x);
      });
      const model=learnProjectedAffineOracle(oracle,32,rank,
        seeded((0x5e0d2000^rank*17+trial*104729)>>>0));
      online=false;
      assert.equal(model.queries,calls);
      assert.ok(model.failureBound<1e-10,
        'Predeclared probabilistic failure bound exceeded');
      assert.equal(model.table.length,2**rank);
      assert.equal(model.coordinates.length,32);
      assert.equal(model.affineCorrections.length,32);
      const offline=/** @type {typeof model} */ (
        JSON.parse(JSON.stringify(model))
      );
      const inputs=seeded((0x5ca11300^trial*317+rank*4099)>>>0);
      for(let i=0;i<4096;i++){
        const x=inputs();
        assert.equal(evaluateProjectedAffineModel(offline,x),native(x),
          'rank='+rank+' trial='+trial+' x='+x);
        heldouts++;
      }
      maxQueries=Math.max(maxQueries,calls);
      cases++;
      if(singular)noninjective++;
    }
  }
  assert.equal(cases,36);
  assert.equal(heldouts,147456);
  assert.equal(noninjective,12);
  process.stdout.write('PROFILE_CLONE_32BIT '+JSON.stringify({
    cases,heldouts,maxQueries,noninjective,
    oracleClosedAfterTraining:true
  })+'\n');
});

test('exhaustive small-width truth tables and affine references',()=>{
  let cases=0,outputs=0;
  for(const bits of [5,6]){
    for(const rank of [3,4,5]){
      if(rank>bits)continue;
      for(let trial=0;trial<8;trial++){
        const native=secretOracle(bits,rank,
          seeded((0x24061100+trial*31+rank*307+bits*4099)>>>0),
          trial%2===0,trial%3===0);
        let calls=0;
        const model=learnProjectedAffineOracle(x=>{calls++;return native(x);},
          bits,rank,seeded((0xa161a000+bits*101+rank*17+trial)>>>0));
        assert.equal(calls,model.queries);
        for(let x=0;x<2**bits;x++){
          assert.equal(evaluateProjectedAffineModel(model,x),native(x));
          outputs++;
        }
        cases++;
      }
    }
  }
  assert.equal(cases,48);
  process.stdout.write('PROFILE_CLONE_EXHAUSTIVE '+JSON.stringify({cases,outputs})+'\n');
});

test('rank family and failure-risk parameter validation',()=>{
  assert.throws(()=>learnProjectedAffineOracle(()=>0,0,1),RangeError);
  assert.throws(()=>learnProjectedAffineOracle(()=>0,32,9),RangeError);
  assert.throws(()=>learnProjectedAffineOracle(()=>0,3,4),RangeError);
  assert.throws(()=>learnProjectedAffineOracle(()=>0,32,2,seeded(1),0),RangeError);
});
