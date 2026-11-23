'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {cloneBitwiseBitSlice}=require('../sims/bitwise-bit-slice-clone');
const {mixInt32Functions}=require('../workplace/mba-i32-lower');

/** @param {string} source @returns {(x:number,y:number)=>number} */
function load(source){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return /** @type {(x:number,y:number)=>number} */(context.module.exports);
}

/** @param {number} x @returns {number} */
function scramble(x){
  let value=x|0;
  value^=value<<13;value^=value>>>17;value^=value<<5;
  return value|0;
}

test('four black-box queries clone 100 direct MBA variants including arithmetic-carry implementations',{
  timeout:60000
},()=>{
  const expressions=[
    '(x^y)|0',
    '(x&y)|0',
    '(x|y)|0',
    '((x+y)-((x&y)<<1))|0'
  ];
  const edge=[-2147483648,-65536,-1,0,1,7,255,65535,2147483647];
  let protectedFunctions=0,attackerCalls=0,heldout=0;
  for(const [family,expr] of expressions.entries()){
    const source='function compute(x,y){return '+expr+';}module.exports=compute;';
    const native=load(source);
    for(let seed=0;seed<25;seed++){
      const output=mixInt32Functions(source,{
        sourceType:'commonjs',seed:'four-query-direct/'+family+'/'+seed,
        names:['compute'],maxRewrites:2
      });
      assert.ok(output.rewrites>=1,'The source must actually be MBA-transformed');
      const protectedOracle=load(output.code);
      let calls=0;
      const clone=cloneBitwiseBitSlice((x,y)=>{
        calls++;
        return protectedOracle(x,y);
      },2);
      assert.equal(calls,4);
      protectedFunctions++;
      attackerCalls+=calls;
      for(const x of edge)for(const y of edge){
        assert.equal(protectedOracle(x,y),native(x,y));
        assert.equal(clone.evaluate(x,y),native(x,y));
        heldout++;
      }
      for(let index=0;index<1800;index++){
        const x=scramble(family*317+seed*1537+index*11);
        const y=scramble(family*653+seed*991+index*43);
        assert.equal(clone.evaluate(x,y),native(x,y),
          'Four-query clone family='+family+' seed='+seed+' index='+index);
        heldout++;
      }
    }
  }
  assert.equal(protectedFunctions,100);
  assert.equal(attackerCalls,400);
  assert.equal(heldout,188100);
});

test('pure bitwise-only intermediate syntax is sufficient but not necessary',()=>{
  const source='function f(x,y){return ((x+y)-((x&y)<<1))|0;}module.exports=f;';
  const compiled=load(source);
  const clone=cloneBitwiseBitSlice(compiled,2);
  for(let x=-512;x<512;x+=13)for(let y=-512;y<512;y+=17)
    assert.equal(clone.evaluate(x,y),(x^y)|0);
});

test('MBA rewriting a non-bit-slice arithmetic function does not make it four-query cloneable',()=>{
  const source='function compute(x,y){return (x+y)|0;}module.exports=compute;';
  for(let seed=0;seed<15;seed++){
    const output=mixInt32Functions(source,{
      sourceType:'commonjs',seed:'arithmetic-negative/'+seed,names:['compute']
    });
    assert.ok(output.rewrites>0);
    const protectedOracle=load(output.code);
    const clone=cloneBitwiseBitSlice(protectedOracle,2);
    assert.equal(protectedOracle(1,1),2);
    assert.notEqual(clone.evaluate(1,1),protectedOracle(1,1),
      'An arithmetic-carry function lies outside the semantic promise');
  }
});
