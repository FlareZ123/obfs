'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {mixInt32Functions}=require('../workplace/mba-i32-lower');
const {cloneMod32Affine}=require('../sims/word-affine-functional-clone');
const {cloneBitwiseBitSlice}=require('../sims/bitwise-bit-slice-clone');

/** @param {string} source @returns {(x:number,y:number)=>number} */
function compile(source){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return /** @type {(x:number,y:number)=>number} */(context.module.exports);
}

/** @param {number} value @returns {number} */
function scramble(value){
  let x=value|0;
  x^=x<<13;x^=x>>>17;x^=x<<5;
  return x|0;
}

test('100 actual direct MBA arithmetic variants and equal-trust minifier recover after 3 queries',{
  timeout:60000
},()=>{
  const formulas=[
    '((x+y)|0)',
    '((x-y)|0)',
    '(((x+y)+17)|0)',
    '(((x-y)-29)|0)'
  ];
  const edge=[-2147483648,-65536,-1,0,1,7,255,65535,2147483647];
  let variants=0,queries=0,heldout=0;
  for(const [family,formula] of formulas.entries()){
    const source='function compute(x,y){return '+formula+';}module.exports=compute;';
    const reference=compile(source);
    const minified=transformSync(source,{
      format:'cjs',loader:'js',target:'node22',minify:true,legalComments:'none'
    }).code;
    const control=compile(minified);
    for(let seed=0;seed<25;seed++){
      const generated=mixInt32Functions(source,{
        sourceType:'commonjs',seed:'mod32-affine/'+family+'/'+seed,
        names:['compute'],maxRewrites:2
      });
      assert.ok(generated.rewrites>=1,
        'Each defended arithmetic function must have real MBA work');
      const defended=compile(generated.code);
      let candidateCalls=0,controlCalls=0;
      const cloned=cloneMod32Affine((x,y)=>{
        candidateCalls++;
        return defended(x,y);
      },2);
      const conventional=cloneMod32Affine((x,y)=>{
        controlCalls++;
        return control(x,y);
      },2);
      assert.equal(candidateCalls,3);
      assert.equal(controlCalls,3);
      assert.equal(cloned.queries,3);
      assert.equal(conventional.queries,3);
      queries+=candidateCalls+controlCalls;
      variants++;
      for(const x of edge)for(const y of edge){
        const actual=reference(x,y);
        assert.equal(defended(x,y),actual);
        assert.equal(control(x,y),actual);
        assert.equal(cloned.evaluate(x,y),actual);
        assert.equal(conventional.evaluate(x,y),actual);
        heldout++;
      }
      for(let n=0;n<1200;n++){
        const x=scramble(n*47+seed*161+family*1777);
        const y=scramble(n*51+seed*313+family*2299);
        const actual=reference(x,y);
        assert.equal(defended(x,y),actual);
        assert.equal(control(x,y),actual);
        assert.equal(cloned.evaluate(x,y),actual);
        assert.equal(conventional.evaluate(x,y),actual);
        heldout++;
      }
    }
  }
  assert.equal(variants,100);
  assert.equal(queries,600);
  assert.equal(heldout,128100);
});

test('three-argument arbitrary modulo-32 affine coefficients recover after four calls',()=>{
  /** @param {number} x @param {number} y @param {number} z @returns {number} */
  function source(x,y,z){
    return (7+Math.imul(13,x)-Math.imul(11,y)+Math.imul(17,z))|0;
  }
  let calls=0;
  const clone=cloneMod32Affine((...args)=>{
    calls++;
    return source(args[0],args[1],args[2]);
  },3);
  assert.equal(calls,4);
  assert.deepEqual(clone.coefficients,[13,-11,17]);
  assert.equal(clone.constant,7);
  for(let index=0;index<3000;index++){
    const x=scramble(index*7),y=scramble(index*11),z=scramble(index*43);
    assert.equal(clone.evaluate(x,y,z),source(x,y,z));
  }
});

test('bitwise XOR and multiplication are outside true ring-affine promise',()=>{
  const xor=cloneMod32Affine((x,y)=>(x^y)|0,2);
  assert.notEqual(xor.evaluate(1,1),(1^1)|0);
  const multiply=cloneMod32Affine((x,y)=>Math.imul(x,y),2);
  assert.notEqual(multiply.evaluate(1,1),Math.imul(1,1));
  const sum=(x,y)=>(x+y)|0;
  const bitwise=cloneBitwiseBitSlice(sum,2);
  assert.notEqual(bitwise.evaluate(1,1),sum(1,1),
    'Bit-slice-local and modulo-affine exact clone grammars are different');
});

test('type and arity contracts refuse unknown or malformed observations',()=>{
  for(const arity of [-1,0,1.1,9,NaN,Infinity])
    assert.throws(()=>cloneMod32Affine(()=>0,arity),RangeError);
  assert.throws(()=>cloneMod32Affine(/** @type {any} */(0),2),TypeError);
  assert.throws(()=>cloneMod32Affine(()=>2147483648,2),TypeError);
  assert.throws(()=>cloneMod32Affine(()=>1.5,2),TypeError);
  const clone=cloneMod32Affine((x,y)=>x+y,2);
  assert.throws(()=>clone.evaluate(1),TypeError);
  assert.throws(()=>clone.evaluate(1,2.5),TypeError);
  assert.throws(()=>clone.evaluate(2147483648,1),TypeError);
});
