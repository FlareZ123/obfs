'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {mixInt32Functions}=require('../workplace/mba-i32-lower');

/** @param {string} source @returns {(x:number,y:number)=>number} */
function compile(source) {
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return /** @type {(x:number,y:number)=>number} */ (context.module.exports);
}

/** @param {number} value @returns {number} */
function scramble(value) {return Math.imul(value ^ (value>>>16),0x45d9f3b)|0;}

const formulas=[
  '((x+y)|0)',
  '((x-y)|0)',
  '((x^y)|0)',
  '((x&y)|0)',
  '((x|y)|0)',
  '((((x^y)+17)^((x&1023)-y))|0)',
  '((((x-y)>>>5)+((x+y)<<7))|0)',
  '((((x|7)&(y^13))+(x>>>3))|0)'
];

test('seeded MBA identities preserve Int32 arithmetic across each operator and nested bitwise context',()=>{
  const boundaries=[-2147483648,-2147483647,-65536,-255,-2,-1,0,1,2,7,255,
    65535,2147483646,2147483647];
  for(const [index,expression] of formulas.entries()) {
    const source='function compute(x,y){return '+expression+';}module.exports=compute;';
    const reference=compile(source);
    for(let seed=0;seed<12;seed++) {
      const result=mixInt32Functions(source,{sourceType:'commonjs',
        seed:'mba/'+index+'/'+seed,names:['compute'],maxRewrites:16});
      assert.equal(result.functions,1,expression);
      assert.ok(result.rewrites>=1,expression);
      assert.notEqual(result.code,source);
      const candidate=compile(result.code);
      assert.equal(candidate.name,reference.name);
      assert.equal(candidate.length,reference.length);
      for(const x of boundaries)for(const y of boundaries) {
        assert.ok(Object.is(candidate(x,y),reference(x,y)),
          'Boundary mismatch at '+expression+' seed='+seed+' '+x+','+y);
      }
      for(let n=0;n<1200;n++) {
        const x=scramble(n+index*65537+seed*4099);
        const y=scramble(n*13+seed*1777+index*1009);
        assert.ok(Object.is(candidate(x,y),reference(x,y)),
          'Random mismatch at '+expression+' seed='+seed+' '+x+','+y);
      }
    }
  }
});

test('seed changes emitted circuit, while outputs stay equivalent',()=>{
  const source='function compute(x,y){return ((x^y)+(x&y))|0;}module.exports=compute;';
  const a=mixInt32Functions(source,{sourceType:'commonjs',seed:'A',names:['compute'],maxRewrites:2});
  const b=mixInt32Functions(source,{sourceType:'commonjs',seed:'B',names:['compute'],maxRewrites:2});
  assert.notEqual(a.code,b.code);
  assert.ok(a.rewrites>=1);
  for(const [x,y] of [[0,0],[17,-71],[-2147483648,2147483647]]){
    assert.equal(compile(a.code)(x,y),compile(b.code)(x,y));
  }
});

test('ESM named export executes in the native loader',async()=>{
  const source='export function calculate(x,y){return (((x^y)+(x&127))|0);}';
  const result=mixInt32Functions(source,{sourceType:'module',seed:'browser/esm',names:['calculate']});
  assert.equal(result.functions,1);
  const original=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const transformed=await import('data:text/javascript;base64,'+Buffer.from(result.code).toString('base64'));
  for(const x of [-2147483648,-5,0,31,2147483647])for(const y of [-2,0,1,200]){
    assert.equal(transformed.calculate(x,y),original.calculate(x,y));
  }
});

test('unsafe or unsupported functions are left byte-for-byte unchanged',()=>{
  const sources=[
    'function compute(x,y){return x+y;}module.exports=compute;',
    'function compute(x,y){return x.value^y;}module.exports=compute;',
    'function compute(x,y){return (x()^y)|0;}module.exports=compute;',
    'function compute(x,y){return x?y:0;}module.exports=compute;',
    'function compute(x,y){return ((x^y)/2)|0;}module.exports=compute;',
    'function compute(x,y){const z=x;return z^y;}module.exports=compute;',
    'function compute(x,y){eval("x=7");return x^y;}module.exports=compute;',
    'function compute(x,y){return x^y;}module.exports=compute.toString();',
    'function compute(...args){return args[0]^7;}module.exports=compute;'
  ];
  for(const source of sources) {
    const result=mixInt32Functions(source,{sourceType:'commonjs',seed:'refuse',names:['compute']});
    assert.equal(result.functions,0,source);
    assert.equal(result.code,source,source);
  }
});

test('non-Int32 arguments are explicitly outside the correctness contract',()=>{
  const source='function compute(x,y){return ((x+y)|0);}module.exports=compute;';
  const reference=compile(source);
  let witness=false;
  for(let seed=0;seed<20;seed++) {
    const result=mixInt32Functions(source,{sourceType:'commonjs',seed:'coercion/'+seed,names:['compute']});
    if(compile(result.code)('1','2')!==reference('1','2'))witness=true;
  }
  assert.equal(reference('1','2'),12);
  assert.ok(witness,'A string-coercion counterexample must remain visible to release gates');
});

test('invalid configuration is rejected',()=>{
  const source='function f(x,y){return x^y;}';
  for(const options of [null,{}, {seed:'',names:['f']},{seed:'ok',names:'f'},
    {seed:'ok',names:['f'],maxRewrites:0},{seed:'ok',names:['f'],maxRewrites:17},
    {seed:'ok',names:['f'],sourceType:'asset'}]) {
    assert.throws(()=>mixInt32Functions(source,/** @type {any} */ (options)),TypeError);
  }
});

test('checked-in before/after samples reproduce this exact seeded lowerer',()=>{
  const before=readFileSync(path.join(__dirname,'../samples/mba-i32-before.cjs'),'utf8');
  const after=readFileSync(path.join(__dirname,'../samples/mba-i32-after.cjs'),'utf8');
  const generated=mixInt32Functions(before,{sourceType:'commonjs',
    seed:'agent17-mba-sample-v1',names:['digest'],maxRewrites:2});
  assert.equal(generated.functions,1);
  assert.equal(generated.rewrites,2);
  assert.equal(generated.code,after);
  for(const x of [-2147483648,-9,0,3,2147483647])for(const y of [-2147483648,-1,0,71,2147483647]) {
    assert.equal(compile(after)(x,y),compile(before)(x,y));
  }
});
