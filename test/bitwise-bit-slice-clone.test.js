'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {cloneBitwiseBitSlice}=require('../sims/bitwise-bit-slice-clone');
const {layerXorFunctions}=require('../workplace/layered-mba');

/** @param {string} code @returns {(x:number,y:number)=>number} */
function load(code){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  return /** @type {(x:number,y:number)=>number} */(context.module.exports);
}

/** @param {number} value @returns {number} */
function scramble(value){
  let x=value|0;
  x^=x<<13;x^=x>>>17;x^=x<<5;
  return x|0;
}

test('100 generated layered bitwise-MBA functions are cloned with exactly four black-box queries',{
  timeout:60000
},()=>{
  const originals=[
    'function f(x,y){return (x^y)|0;}module.exports=f;',
    'function f(x,y){return ((x^y)&0x55aa33cc)|0;}module.exports=f;',
    'function f(x,y){return ((x^y)^(~x&y))|0;}module.exports=f;',
    'function f(x,y){return ((x^y)|((x&y)^0xabcdef))|0;}module.exports=f;'
  ];
  const edges=[-2147483648,-65536,-1,0,1,7,31,255,65535,2147483647];
  let protectedFunctions=0,queries=0,heldout=0;
  for(const [family,source] of originals.entries()){
    for(let seed=0;seed<25;seed++){
      const output=layerXorFunctions(source,{
        sourceType:'commonjs',seed:'four-query-attack/'+family+'/'+seed,names:['f']
      });
      assert.equal(output.rewrites,1,'A genuine layered protected leaf must be generated');
      const victim=load(output.code);
      let calls=0;
      const attack=cloneBitwiseBitSlice((x,y)=>{
        calls++;
        return victim(x,y);
      },2);
      assert.equal(calls,4,'The learner must use exactly four chosen input pairs');
      assert.equal(attack.queries,4);
      assert.equal(attack.masks.length,4);
      queries+=calls;
      protectedFunctions++;
      for(const x of edges)for(const y of edges){
        assert.equal(attack.evaluate(x,y),victim(x,y),
          'Layered-MBA corner mismatch family='+family+' seed='+seed);
        heldout++;
      }
      for(let k=0;k<1800;k++){
        const x=scramble((family+1)*3617+seed*1257+k*17);
        const y=scramble((family+5)*817+seed*917+k*37);
        assert.equal(attack.evaluate(x,y),victim(x,y),
          'Layered-MBA held-out mismatch family='+family+' seed='+seed+' k='+k);
        heldout++;
      }
    }
  }
  assert.equal(protectedFunctions,100);
  assert.equal(queries,400);
  assert.equal(heldout,190000);
});

test('all 16 two-input Boolean bit truth tables are correctly cloned',()=>{
  for(let truth=0;truth<16;truth++){
    /** @param {number} x @param {number} y @returns {number} */
    const oracle=(x,y)=>{
      let out=0;
      for(let pattern=0;pattern<4;pattern++)if(truth&(1<<pattern)){
        let term=pattern&1?x:~x;
        term&=pattern&2?y:~y;
        out|=term;
      }
      return out|0;
    };
    const clone=cloneBitwiseBitSlice(oracle,2);
    for(let x=-128;x<=127;x+=3)for(let y=-128;y<=127;y+=7)
      assert.equal(clone.evaluate(x,y),oracle(x,y),
        'Truth function '+truth+' x='+x+' y='+y);
  }
});

test('three input pointwise logic is cloned with eight queries',()=>{
  /** @param {number} x @param {number} y @param {number} z @returns {number} */
  const oracle=(x,y,z)=>(((x&y)|(~x&z))^0x00ff55aa)|0;
  let calls=0;
  const clone=cloneBitwiseBitSlice((...args)=>{
    calls++;
    return oracle(args[0],args[1],args[2]);
  },3);
  assert.equal(calls,8);
  for(let x=-256;x<=256;x+=13)for(let y=-256;y<=256;y+=17)
    for(let z=-256;z<=256;z+=23)
      assert.equal(clone.evaluate(x,y,z),oracle(x,y,z));
});

test('addition, shifts and state invalidate the pointwise promise',()=>{
  const plus=cloneBitwiseBitSlice((x,y)=>(x+y)|0,2);
  assert.notEqual(plus.evaluate(1,1),2,
    'Carry propagation between bit positions defeats 4-query interpolation');
  const shift=cloneBitwiseBitSlice(x=>x>>>1,1);
  assert.notEqual(shift.evaluate(2),1,
    'A bit shift couples distinct bit positions and invalidates interpolation');
  let counter=0;
  /** @param {number} x @param {number} y @returns {number} */
  const stateful=(x,y)=>((x^y)^(++counter))|0;
  const cloned=cloneBitwiseBitSlice(stateful,2);
  assert.notEqual(cloned.evaluate(0,0),stateful(0,0),
    'Cross-request state is not a fixed bitwise function');
});

test('unproved contracts and invalid caller/oracle types are rejected',()=>{
  for(const arity of [0,-1,1.1,5,NaN,Infinity])
    assert.throws(()=>cloneBitwiseBitSlice(()=>0,arity),RangeError);
  assert.throws(()=>cloneBitwiseBitSlice(/** @type {any} */(0),2),TypeError);
  assert.throws(()=>cloneBitwiseBitSlice(()=>1.5,2),TypeError);
  assert.throws(()=>cloneBitwiseBitSlice(()=>2147483648,2),TypeError);
  const clone=cloneBitwiseBitSlice(x=>x,1);
  assert.throws(()=>clone.evaluate(),TypeError);
  assert.throws(()=>clone.evaluate(1.1),TypeError);
  assert.throws(()=>clone.evaluate(2147483648),TypeError);
});
