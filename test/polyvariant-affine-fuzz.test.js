'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {lowerPolyvariantAffine}=require('../src');
const {recover}=require('../sims/polyvariant-affine-static-recover');

/** @param {string} source @returns {(input:unknown)=>number} */
function load(source) {
  /** @type {{exports:(input:unknown)=>number}} */
  const module={exports:()=>0};
  Function('module','exports',source)(module,module.exports);
  return module.exports;
}

/** @param {Function} fn @param {unknown} input @returns {string} */
function observe(fn,input) {
  try {
    const result=fn(input);
    return 'ok:'+String(result);
  } catch(error) {
    const exception=/** @type {Error} */ (error);
    return 'throw:'+exception.name+':'+exception.message;
  }
}

/** @returns {()=>number} */
function generator() {
  let state=0x58a81f2d;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}

test('64 seeded signed-arithmetic graphs preserve native values and remain statically reconstructable',()=>{
  const next=generator();
  let transformedCount=0;
  for(let graph=0;graph<64;graph++) {
    const stepCount=8+(next()%57);
    let expression='(input|0)';
    for(let j=0;j<stepCount;j++) {
      const op=next()%2===0?'+':'-';
      const imm=next()%256;
      expression='('+expression+op+imm+')';
    }
    const source='function protectedSum(input){return ('+expression+
      '|0);}module.exports=protectedSum;';
    const native=load(source);
    for(const variants of /** @type {(2|4|8)[]} */ ([2,4,8])) {
      const result=lowerPolyvariantAffine(source,'commonjs',{
        seed:'polyvariant-fuzz-'+graph+'-'+variants,
        names:['protectedSum'],variants
      });
      assert.equal(result.functions,1);
      assert.equal(result.steps,stepCount);
      assert.equal(result.paths,variants);
      const modified=load(result.code);
      const attack=recover(result.code,'protectedSum');
      assert.equal(attack.cases,variants);
      const recovered=Function('return ('+attack.source+')')();
      for(let i=0;i<80;i++) {
        const number=(next()|0);
        assert.equal(modified(number),native(number),
          'graph='+graph+' paths='+variants+' numeric='+number);
        assert.equal(recovered(number),native(number));
      }
      for(const nonNumber of /** @type {unknown[]} */ ([
        null,undefined,'8','abc',true,false,2n,Symbol('fuzz'),
        NaN,Infinity,-Infinity,2.5,0.5,-0.5,-2147483649,
        {valueOf(){return 12;}}
      ])) {
        assert.equal(observe(modified,nonNumber),observe(native,nonNumber));
      }
      transformedCount++;
    }
  }
  assert.equal(transformedCount,192);
});

test('polyvariant explicitly refuses oversized or insufficient expression chains',()=>{
  const make=/** @param {number} steps @returns {string} */ n=>{
    let expression='(input|0)';
    for(let i=0;i<n;i++)expression='('+expression+'+1)';
    return 'function protectedSum(input){return ('+expression+
      '|0);}module.exports=protectedSum;';
  };
  for(const length of [0,1,7,65,100]) {
    const source=make(length);
    const result=lowerPolyvariantAffine(source,'commonjs',{
      seed:'polyvariant-length-'+length,names:['protectedSum'],variants:4
    });
    assert.equal(result.code,source);
    assert.equal(result.functions,0);
    assert.equal(result.declined,1);
  }
  const boundary=make(64);
  assert.equal(lowerPolyvariantAffine(boundary,'commonjs',{
    seed:'polyvariant-length-64',names:['protectedSum'],variants:4
  }).functions,1);
});
