'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('../sims/statement-flow-recover');

/** @param {string} code @returns {(x:number,hook:(tag:string)=>void)=>number} */
function load(code){
  return /** @type {(x:number,hook:(tag:string)=>void)=>number} */ (
    vm.runInNewContext(code+'\n;f;')
  );
}
/**
 * @param {(x:number,hook:(tag:string)=>void)=>number} fn
 * @param {number} value
 */
function observe(fn,value){
  /** @type {string[]} */
  const events=[];
  const result=fn(value,tag=>events.push(tag));
  return {result,events};
}
const original='function f(x,hook){var y=x|0;'+
  'if((y&1)!==0){hook("odd");y=(y+5)|0;}else{hook("even");y=(y-9)|0;}'+
  'if(y>11){y=(y*3)|0;}else{y=(y^43)|0;}'+
  'if((y&8)===0){y=(y+17)|0;}else{y=(y-23)|0;}'+
  'return y|0;}';

test('seed-permuted dense CFG labels remain unique bounded integers and statically recoverable',()=>{
  const native=load(original);
  for(const compactCases of [false,true]){
    const signatures=new Set();
    for(let index=0;index<12;index++){
      const compiled=flattenStatementFlow(original,'commonjs',{
        seed:'dense-state-'+index,names:['f'],compactCases,denseStateIds:true
      });
      assert.equal(compiled.functions,1);
      assert.ok(compiled.blocks>=4);
      const actual=load(compiled.code);
      const recovered=recoverStatementFlow(compiled.code,'f');
      const clone=load(recovered.code);
      const labels=[...compiled.code.matchAll(/case (\d+):/gu)]
        .map(match=>Number(match[1])).sort((a,b)=>a-b);
      assert.ok(labels.every(label=>Number.isSafeInteger(label)&&
        label>=0&&label<=compiled.blocks),'Dense labels must lie within 0..block count');
      assert.equal(new Set(labels).size,labels.length,'All emitted cases must be distinct');
      // Compact emission may absorb a successor case, leaving a legitimate
      // hole in the public labels; only the unabsorbed mode publishes all.
      if(!compactCases){
        assert.deepEqual(labels,Array.from({length:compiled.blocks+1},(_,i)=>i));
      }
      signatures.add(compiled.code);
      for(let x=-100;x<=100;x+=4){
        const expected=observe(native,x);
        assert.deepEqual(observe(actual,x),expected);
        assert.deepEqual(observe(clone,x),expected);
      }
    }
    assert.ok(signatures.size>1,'Different seeds must produce distinct emitted layouts');
  }
});

test('dense CFG mode retains ordinary fail-closed source-observation contract',()=>{
  const source=original+'String(f);';
  for(const compactCases of [false,true]){
    const result=flattenStatementFlow(source,'commonjs',{
      seed:'dense-source-refusal',names:['f'],compactCases,denseStateIds:true
    });
    assert.equal(result.functions,0);
    assert.equal(result.code,source);
  }
});
