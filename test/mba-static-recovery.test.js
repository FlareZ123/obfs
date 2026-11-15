'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {mixInt32Functions}=require('../workplace/mba-i32-lower');
const {normalizeMba}=require('../sims/mba-static-normalize');

/** @param {string} source @returns {(x:number,y:number)=>number} */
function compile(source){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:3000});
  return /** @type {(x:number,y:number)=>number} */ (context.module.exports);
}

const cases=[
  '(x+y)|0','(x-y)|0','(x^y)|0','(x&y)|0','(x|y)|0',
  '((x+y)^(x-y))|0','((x^y)+(x&y))|0',
  '((x|127)^(y&1023))|0','((x&9)^((y|7)+x))|0'
];

/** @param {number} input @returns {number} */
function scramble(input){return Math.imul(input^(input>>>12),16807)|0;}

test('seedless source-only normalizer erases all 15 publicly generated MBA identities',()=>{
  let tested=0,lowered=0,recovered=0;
  for(const [index,expression] of cases.entries()){
    const source='function f(x,y){return '+expression+';}module.exports=f;';
    const baseline=compile(source);
    for(let seed=0;seed<25;seed++) {
      const mixed=mixInt32Functions(source,{sourceType:'commonjs',
        names:['f'],seed:'attacker-hidden/'+index+'/'+seed,maxRewrites:16});
      assert.ok(mixed.rewrites>0);
      const normalized=normalizeMba(mixed.code);
      assert.equal(normalized.rewrites,mixed.rewrites,
        'Static deobfuscator failed recovery for seed '+seed+' expression '+expression);
      const recoveredFn=compile(normalized.code);
      for(const x of [-2147483648,-1,0,17,2147483647])
        for(const y of [-2147483648,-1,0,31,2147483647]) {
          assert.ok(Object.is(baseline(x,y),recoveredFn(x,y)));
        }
      for(let sample=0;sample<225;sample++) {
        const x=scramble(sample*97+seed*19),y=scramble(sample*17+index*101);
        assert.ok(Object.is(baseline(x,y),recoveredFn(x,y)));
      }
      recovered+=normalized.rewrites;
      lowered+=mixed.rewrites;
      tested++;
    }
  }
  assert.equal(tested,cases.length*25);
  assert.equal(recovered,lowered);
});

test('attacker simplifies checked-in generated sample without original source or seed',()=>{
  const before=readFileSync(path.join(__dirname,'../samples/mba-i32-before.cjs'),'utf8');
  const delivered=readFileSync(path.join(__dirname,'../samples/mba-i32-after.cjs'),'utf8');
  const recovered=normalizeMba(delivered);
  const expected=readFileSync(path.join(__dirname,'../samples/mba-i32-recovered.cjs'),'utf8');
  assert.equal(recovered.code,expected);
  assert.equal(recovered.rewrites,2);
  assert.ok(recovered.code.length<delivered.length);
  assert.ok(!recovered.code.includes('~(~('));
  const native=compile(before),attacker=compile(recovered.code);
  for(let i=0;i<2000;i++){
    const x=scramble(i+17),y=scramble(i*31+29);
    assert.equal(attacker(x,y),native(x,y));
  }
});

test('attacker refuses shapes involving getters/calls to avoid changing semantics',()=>{
  for(const source of [
    'function f(x,y){return (x()|y)+(x()&y);}',
    'function f(x,y){return (x.value|y)+(x.value&y);}',
    'function f(x,y){return Math.imul(x,7)^y;}'
  ]){
    const result=normalizeMba(source);
    assert.equal(result.rewrites,0);
    assert.equal(result.code,source);
  }
});
