'use strict';

const assert=require('node:assert/strict');
const {apply,span,kernel,random,randomLinear,invert,verifyStructure}=
  require('./public-residual-width5-6-independent');

/**
 * @template T
 * @param {T[]} values
 * @param {() => number} rng
 * @returns {T[]}
 */
function shuffle(values,rng){
  for(let i=values.length-1;i>0;i--){
    const j=rng()%(i+1);
    [values[i],values[j]]=[values[j],values[i]];
  }
  return values;
}

/**
 * Build a permutation on 2r input bits with a public affine interpolant
 * of rank r and kernel dimension r, concealed by linear input/output maps.
 * @param {number} r
 * @param {() => number} rng
 * @returns {{values:number[], attempts:number}}
 */
function construct(r,rng){
  const width=2*r;
  const side=1<<r;
  const domain=1<<width;
  /** @type {number[]} */
  let highs=[];
  /** @type {number[]} */
  let lows=[];
  /** @type {number[]} */
  let input=[];
  let attempts=0;
  do {
    const nonzero=Array.from({length:side-1},(_,i)=>i+1);
    highs=shuffle([...nonzero],rng).slice(0,width);
    lows=shuffle([...nonzero],rng).slice(0,width);
    input=highs.map((high,i)=>(high<<r)|lows[i]);
    attempts++;
  }while(kernel(input).length!==1 || span(highs).size!==side);

  const substitution=Array(side).fill(-1);
  substitution[0]=0;
  for(let i=0;i<width;i++) substitution[lows[i]]=highs[i];
  const rest=shuffle(Array.from({length:side},(_,i)=>i)
    .filter(i=>!substitution.includes(i)),rng);
  let unused=0;
  for(let i=0;i<side;i++) {
    if(substitution[i]<0)substitution[i]=rest[unused++];
  }
  assert.equal(new Set(substitution).size,side);
  const output=randomLinear(width,rng);
  const offset=rng()%domain;
  const values=Array.from({length:domain},(_,x)=>{
    const v=apply(input,x);
    return apply(output,(v&~(side-1))|substitution[v&(side-1)])^offset;
  });
  assert.equal(new Set(values).size,domain);
  return {values,attempts};
}

/** @returns {{seed:string,instances:number,targets:number,highNullity:number,maxRepairs:number,maxExpansions:number,maxQueries:number,attempts:number,byWidth:Record<string,number>}} */
function run(){
  const rng=random(0xa811d065);
  const configs=[{r:4,instances:24},{r:5,instances:8}];
  let instances=0,targets=0,maxRepairs=0,maxExpansions=0,maxQueries=0,attempts=0;
  /** @type {Record<string,number>} */
  const byWidth={};
  for(const {r,instances:count} of configs){
    const width=2*r,domain=1<<width;
    for(let i=0;i<count;i++){
      const sample=construct(r,rng);
      attempts+=sample.attempts;
      const values=sample.values;
      const constant=values[0];
      const linear=Array.from({length:width},(_,bit)=>values[1<<bit]^constant);
      assert.equal(kernel(linear).length,1<<r);
      assert.equal(verifyStructure(values).r,r);
      for(let source=0;source<domain;source++) {
        const observed=invert(values,values[source]);
        assert.equal(observed.recovered,source);
        assert.equal(observed.repairs,r);
        assert.ok(observed.queries<=width+2**(r+1));
        maxRepairs=Math.max(maxRepairs,observed.repairs);
        maxExpansions=Math.max(maxExpansions,observed.expansions);
        maxQueries=Math.max(maxQueries,observed.queries);
        targets++;
      }
      instances++;
      byWidth[String(width)]=(byWidth[String(width)]??0)+domain;
    }
  }
  return {seed:'0xa811d065',instances,targets,highNullity:5,maxRepairs,maxExpansions,maxQueries,attempts,byWidth};
}

if(require.main===module)process.stdout.write(JSON.stringify(run(),null,2)+'\n');
module.exports={run,construct};
