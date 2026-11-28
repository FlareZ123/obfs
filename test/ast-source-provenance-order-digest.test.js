'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {number} value @returns {()=>number} */
function prng(value) {
  let state=value>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return state>>>0;
  };
}
/** @param {string[]} a @param {()=>number} next @returns {string[]} */
function shuffled(a,next) {
  const b=[...a];
  for(let i=b.length-1;i>0;i--) {
    const j=next()%(i+1);
    [b[i],b[j]]=[b[j],b[i]];
  }
  return b;
}
/**
 * Source-permutation corpus tests order invariance of native/Function source
 * provenance propagation. These are analysis decisions, not a claim about
 * runtime behavior of each deliberately reordered assignment program.
 *
 * @param {number} size
 * @param {number} permutation
 * @param {number} form
 * @returns {string}
 */
function source(size,permutation,form) {
  const names=Array.from({length:size+1},(_,i)=>'ref'+i);
  const next=prng((size*0x9e3779b9+permutation*65537+form*337)>>>0);
  const links=names.slice(0,-1).map((name,i)=>name+'='+names[i+1]+';');
  const node='ref'+size+'=function sourceFn(){return 17;};';
  const body=shuffled([...links,node],next);
  const consumers=[
    'const observed=String(ref0);',
    'const observed=ref0.toString();',
    'const observed=/a/.test(ref0);',
    'const observed=[ref0].join("");',
    'const observed=Object.keys({k:ref0});',
    'const observed=17;'
  ];
  return [
    'let '+names.join(',')+';',
    ...body,
    consumers[form],
    'void observed;'
  ].join('\n');
}

test('source-provenance decision checksum for deterministic adversarial assignment permutations',()=>{
  const hashes=[];
  const counts=Array.from({length:6},()=>({positive:0,negative:0}));
  for(const size of [0,1,2,4,8,16,32,48]) {
    for(let permutation=0;permutation<12;permutation++) {
      for(let form=0;form<6;form++) {
        const ast=parse(source(size,permutation,form),'module');
        const observed=observesFunctionSource(ast);
        assert.equal(typeof observed,'boolean');
        counts[form][observed?'positive':'negative']++;
        hashes.push(size+':'+permutation+':'+form+':'+Number(observed));
      }
    }
  }
  const digest=createHash('sha256').update(hashes.join('|')).digest('hex');
  const output={digest,caseCount:hashes.length,counts};
  console.log('SOURCE_PROVENANCE_ORDER_DIGEST '+JSON.stringify(output));
  assert.equal(hashes.length,576);
});
