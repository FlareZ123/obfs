'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @param {string} source @returns {{source:string,value:number}} */
function execute(source) {
  const context={module:{exports:null},performance};
  vm.runInNewContext(source,context,{timeout:3000});
  return JSON.parse(JSON.stringify(context.module.exports));
}
/** @param {string} operation @returns {string} */
function fixture(operation) {
  return "'use strict';"+
    "function inspect(){const owner={secretField:47};return owner.secretField;}"+
    "let source='';try{"+operation+"}catch(error){source=error.message;}"+
    "module.exports={source,value:inspect()};";
}
const cases=[
  ['mark direct Function detail','performance.mark("fixed",{detail:inspect});'],
  ['mark nested Function detail','performance.mark("fixed",{detail:{nested:[inspect]}});'],
  ['measure direct Function detail','performance.measure("fixed",{start:0,end:1,detail:inspect});'],
  ['measure nested Function detail','performance.measure("fixed",{start:0,end:1,detail:[inspect]});'],
  ['mark detached detail','(()=>{const timing=performance;timing.mark("fixed",{detail:inspect});})();'],
  ['mark primitive name but callable detail','Reflect.apply(performance.mark,performance,["fixed",{detail:inspect}]);'],
  ['mark source via options alias','(()=>{const options={detail:inspect};performance.mark("fixed",options);})();']
];
for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  for(const [label,operation] of cases) {
    test(mode+' native User Timing detail clone retains callable source: '+label,()=>{
      const original=fixture(operation);
      const native=execute(original);
      assert.equal(native.value,47);
      assert.match(native.source,/secretField/u,'Native DataCloneError source witness');
      const mutated=execute(original.replaceAll('secretField','mutatedField'));
      assert.notEqual(mutated.source,native.source,
        'Changing callable source spelling changes native clone diagnostic');
      const output=obfuscateFiles([{path:'detail.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'agent19-timing-detail/'+label+'/'+mode,strings:true
      }).files[0];
      assert.deepEqual(execute(output.code),native,
        'User Timing detail clone must preserve callable source despite valid primitive name');
      assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
        'Nested User Timing detail can expose function source');
      assert.equal(output.metrics.objects,0,
        'A source-observed callable may not have its body rewritten');
    });
  }
  test(mode+' primitive User Timing detail retains independent private-property yield',()=>{
    const source="'use strict';const owner={secretField:47};"+
      "performance.mark('fixed',{detail:{count:3,nested:[4]}});"+
      "module.exports={source:'fixed',value:owner.secretField};";
    const output=obfuscateFiles([{path:'detail.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'agent19-timing-primitive-detail/'+mode,strings:false
    }).files[0];
    assert.deepEqual(execute(output.code),execute(source));
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
    assert.ok(output.metrics.objects>0,'Primitive detail must not veto private owner yield');
  });
}
