'use strict';

const assert=require('node:assert/strict');
const {construct}=require('./public-residual-extremal-construction');
const {apply,span,kernel,invert,verifyStructure,random,randomLinear}=
  require('./public-residual-width5-6-independent');

/**
 * Independently confirm the explicit singular-interpolant family survives a
 * dense output affine layer, with no access to the affine layer in the
 * chosen-target inverter.
 * @returns {{seed:string,instances:number,targets:number,rankRepairs:number,maxQueries:number,maxExpansions:number,byWidth:Record<string,number>}}
 */
function run(){
  const rng=random(0x8a771e55);
  let instances=0,targets=0,rankRepairs=0,maxQueries=0,maxExpansions=0;
  /** @type {Record<string,number>} */
  const byWidth={};
  for(let r=3;r<=8;r++){
    const width=2*r;
    const side=1<<r;
    const domain=1<<width;
    const original=construct(r);
    const output=randomLinear(width,rng);
    const offset=rng()%domain;
    const wrapped=original.map(v=>apply(output,v)^offset);
    assert.equal(new Set(wrapped).size,domain);
    const constant=wrapped[0];
    const interpolant=Array.from({length:width},(_,bit)=>wrapped[1<<bit]^constant);
    assert.equal(kernel(interpolant).length,side);
    const residuals=wrapped.map((v,x)=>v^constant^apply(interpolant,x));
    assert.equal(span(residuals).size,side);
    if(r<=5)assert.equal(verifyStructure(wrapped).r,r);
    const targetCount=r<=5?domain:r===6?32:r===7?8:2;
    for(let i=0;i<targetCount;i++){
      const secret=(i*997)%domain;
      const result=invert(wrapped,wrapped[secret]);
      assert.equal(result.recovered,secret);
      assert.equal(result.repairs,r);
      assert.ok(result.queries<=width+2**(r+1));
      maxQueries=Math.max(maxQueries,result.queries);
      maxExpansions=Math.max(maxExpansions,result.expansions);
      rankRepairs=Math.max(rankRepairs,result.repairs);
      targets++;
    }
    instances++;
    byWidth[String(width)]=targetCount;
  }
  return {seed:'0x8a771e55',instances,targets,rankRepairs,maxQueries,
    maxExpansions,byWidth};
}

if(require.main===module)process.stdout.write(JSON.stringify(run(),null,2)+'\n');
module.exports={run};
