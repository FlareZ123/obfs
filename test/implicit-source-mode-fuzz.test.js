'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @type {readonly ('coo'|'sno'|'sco')[]} */
const modes=['coo','sno','sco'];

/**
 * Deterministically derive different valid JS identifiers and obfuscation
 * seeds, with no hidden randomness during test execution.
 * @param {number} iteration
 * @returns {{key:string,seed:string}}
 */
function caseNames(iteration) {
  const digest=createHash('sha256').update('agent50/source-fuzz/'+iteration).digest('hex');
  return {key:'private_'+digest.slice(0,18),seed:digest.slice(18,50)};
}

/**
 * Every source invokes a native observer that may disclose source columns,
 * function names, or both. No observer uses explicit .stack/.name/toString.
 * @param {number} n
 * @param {number} index
 * @returns {string}
 */
function observer(n,index) {
  switch(index) {
    case 0: return "console.trace();";
    case 1: return "console.error(new Error('probe'));";
    case 2: return "const problem=new RangeError('probe');console.warn(problem);";
    case 3: return "const trace=console.trace;trace();";
    case 4: return "const {trace:printer}=console;printer();";
    case 5: return "const tool=require('node:util');tool.inspect(new Error('probe'));";
    case 6: return "const {inspect:printer}=require('util');printer(new Error('probe'));";
    case 7: return "const tool=require('node:util');tool.format('%O',new Error('probe'));";
    case 8: return "const tool=require('node:util');tool.formatWithOptions({},'%O',new Error('probe'));";
    case 9: return "const tool=require('node:util');tool.getCallSites(1);";
    case 10: return "const tool=require('node:util');const method='getCallSites';tool[method](1);";
    case 11: return "console.log([function exposed"+n+"(){return got;}]);";
    case 12: return "console.dir({nested:[function exposed"+n+"(){return got;}]});";
    case 13: return "const logger=console;logger['error'](new TypeError('probe'));";
    default: throw new RangeError('Unknown observer case '+index);
  }
}

test('deterministic 3-mode source-observer matrix retains exact source bytes',()=>{
  let checked=0;
  for(let iteration=0;iteration<12;iteration++) {
    const {key,seed}=caseNames(iteration);
    for(let index=0;index<14;index++) {
      const source="'use strict';const owner={"+key+":73};"+
        "const got=owner."+key+";"+observer(iteration,index)+
        "module.exports=got;";
      assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
        'observer proof failed for '+iteration+'/'+index+': '+source);
      for(const mode of modes) {
        const file=obfuscateFiles([
          {path:'case.cjs',sourceType:'commonjs',code:source}
        ],{mode,seed,strings:mode==='sno'}).files[0];
        assert.equal(file.code,source,mode+'/'+iteration+'/'+index);
        assert.deepEqual(file.metrics,{literals:0,objects:0,properties:0,bindings:0});
        checked++;
      }
    }
  }
  assert.equal(checked,504);
});

test('deterministic 3-mode primitive logger retains actual transform yield',()=>{
  let positive=0;
  for(let iteration=0;iteration<12;iteration++) {
    const {key,seed}=caseNames(iteration);
    const source="'use strict';const owner={"+key+":73};"+
      "console.log(42);module.exports=owner."+key+";";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
    for(const mode of modes) {
      const result=obfuscateFiles([
        {path:'case.cjs',sourceType:'commonjs',code:source}
      ],{mode,seed,strings:false}).files[0];
      assert.ok(result.metrics.objects>0,mode+'/'+iteration+'/'+result.code);
      assert.notEqual(result.code,source);
      positive++;
    }
  }
  assert.equal(positive,36);
});
