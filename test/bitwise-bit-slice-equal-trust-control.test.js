'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {layerXorFunctions}=require('../workplace/layered-mba');
const {cloneBitwiseBitSlice}=require('../sims/bitwise-bit-slice-clone');

/**
 * Restricted single-function CommonJS execution; same source, same wrapper,
 * same VM constraints and same input domain across the two comparison arms.
 * @param {string} source
 * @returns {(x:number,y:number)=>number}
 */
function instantiate(source){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:3000});
  const fn=context.module.exports;
  assert.equal(typeof fn,'function');
  return /** @type {(x:number,y:number)=>number} */(fn);
}

/** @param {number} value @returns {number} */
function mix(value){
  let x=value|0;
  x^=x<<13;x^=x>>>17;x^=x<<5;
  return x|0;
}

test('80 matched-layered-versus-esbuild minified controls admit identical four-query clones',{
  timeout:60000
},()=>{
  const expressions=[
    '(x^y)|0',
    '((x^y)&0x55aa33cc)|0',
    '((x^y)^(~x&y))|0',
    '((x^y)|((x&y)^0xabcdef))|0'
  ];
  const corners=[-2147483648,-1,0,1,2147483647,0x12345678|0];
  let cases=0,oracleCalls=0,heldout=0;
  for(const [family,expression] of expressions.entries()){
    const original='function f(x,y){return '+expression+';}module.exports=f;';
    const minified=transformSync(original,{
      format:'cjs',loader:'js',target:'node22',minify:true,legalComments:'none'
    }).code;
    const minifiedVictim=instantiate(minified);
    const reference=instantiate(original);
    for(let seed=0;seed<20;seed++){
      const generated=layerXorFunctions(original,{
        sourceType:'commonjs',names:['f'],seed:'equal-trust-four-query/'+family+'/'+seed
      });
      assert.equal(generated.rewrites,1,'protected candidate must alter source');
      assert.notEqual(generated.code,original);
      const protectedVictim=instantiate(generated.code);
      let protectedCalls=0,controlCalls=0;
      const protectedClone=cloneBitwiseBitSlice((x,y)=>{
        protectedCalls++;
        return protectedVictim(x,y);
      },2);
      const controlClone=cloneBitwiseBitSlice((x,y)=>{
        controlCalls++;
        return minifiedVictim(x,y);
      },2);
      assert.equal(protectedCalls,4);
      assert.equal(controlCalls,4);
      oracleCalls+=protectedCalls+controlCalls;
      cases++;
      for(const x of corners)for(const y of corners){
        const correct=reference(x,y);
        assert.equal(protectedVictim(x,y),correct);
        assert.equal(minifiedVictim(x,y),correct);
        assert.equal(protectedClone.evaluate(x,y),correct);
        assert.equal(controlClone.evaluate(x,y),correct);
        heldout++;
      }
      for(let i=0;i<1024;i++){
        const x=mix(i*13+family*971+seed*37);
        const y=mix(i*19+family*733+seed*41);
        const correct=reference(x,y);
        assert.equal(protectedVictim(x,y),correct);
        assert.equal(minifiedVictim(x,y),correct);
        assert.equal(protectedClone.evaluate(x,y),correct);
        assert.equal(controlClone.evaluate(x,y),correct);
        heldout++;
      }
    }
  }
  assert.equal(cases,80);
  assert.equal(oracleCalls,640);
  assert.equal(heldout,80*(36+1024));
});
