'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {lowerPolyvariantAffine}=require('../src/affine-native');

/** @typedef {'module'|'commonjs'} SourceType */
/** @typedef {{cases:number,checkedValues:number,selectedFunctions:number,selectedPaths:number,sourceDigest:string}} FuzzResult */

/**
 * @param {string} source
 * @returns {(value:unknown)=>number}
 */
function executable(source){
  const code=source.replace(/^export /gmu,'');
  return /** @type {(value:unknown)=>number} */ (
    new Function(code+'\nreturn f;')()
  );
}

/**
 * Reproducible source generator for integer-normalized, left-associative
 * return-only chains, including signed constants near the admitted boundary.
 * The generated program remains within the compiler's stated grammar.
 *
 * @param {number} cases
 * @returns {FuzzResult}
 */
function run(cases=384){
  if(!Number.isSafeInteger(cases)||cases<1||cases>1000)
    throw new RangeError('Expected 1 through 1000 deterministic cases');
  let state=0x51ba7e93;
  /** @returns {number} */
  function next(){
    state=(Math.imul(state,1664525)+1013904223)|0;
    return state>>>0;
  }
  const hash=createHash('sha256');
  let checkedValues=0,selectedFunctions=0,selectedPaths=0;
  for(let caseIndex=0;caseIndex<cases;caseIndex++){
    const sourceType=/** @type {SourceType} */ (caseIndex%2?'module':'commonjs');
    const variants=/** @type {2|4|8} */ ([2,4,8][caseIndex%3]);
    const stepCount=8+(next()%57);
    let expression='(x|0)';
    for(let step=0;step<stepCount;step++){
      const amount=next()%256;
      const sign=next()&1?'+':'-';
      expression='('+expression+sign+amount+')';
    }
    const source=(sourceType==='module'?'export ':'')+
      'function f(x){return ('+expression+'|0);}\n';
    const transformed=lowerPolyvariantAffine(source,sourceType,{
      seed:'fuzz-compact-'+caseIndex,names:['f'],variants,compact:true
    });
    assert.equal(transformed.functions,1);
    assert.equal(transformed.paths,variants);
    assert.equal(transformed.steps,stepCount);
    assert.equal(transformed.declined,0);
    const native=executable(source),compact=executable(transformed.code);
    const values=/** @type {unknown[]} */ ([
      undefined,null,true,false,-0,0,1,-1,NaN,Infinity,-Infinity,
      2147483647,-2147483648,4294967295,-4294967297,
      '123',-123.5,1e100,1e-100
    ]);
    for(let i=0;i<96;i++){
      const integer=next()|0;
      values.push(integer);
      if(i%8===0)values.push(integer+0.875);
    }
    for(const value of values){
      assert.equal(compact(value),native(value),
        'Mismatch in case '+caseIndex+' value '+String(value));
      checkedValues++;
    }
    let originalCoercions=0,transformedCoercions=0;
    assert.equal(compact({valueOf(){transformedCoercions++;return 19.9;}}),
      native({valueOf(){originalCoercions++;return 19.9;}}));
    assert.equal(originalCoercions,1);
    assert.equal(transformedCoercions,1);
    assert.throws(()=>native(Symbol('coercion')),TypeError);
    assert.throws(()=>compact(Symbol('coercion')),TypeError);
    assert.throws(()=>native(3n),TypeError);
    assert.throws(()=>compact(3n),TypeError);
    checkedValues+=3;
    selectedFunctions+=transformed.functions;
    selectedPaths+=transformed.paths;
    hash.update(source).update('\0').update(transformed.code).update('\0');
  }
  return {cases,checkedValues,selectedFunctions,selectedPaths,
    sourceDigest:hash.digest('hex')};
}

if(require.main===module){
  const count=process.argv[2]===undefined?384:Number(process.argv[2]);
  const result=run(count);
  process.stdout.write('COMPACT_SEMANTIC_FUZZ '+JSON.stringify(result)+'\n');
}

module.exports={run};
