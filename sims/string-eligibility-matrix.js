'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {recoverObfuscatedStrings}=require('./static-string-recovery');

/** @param {string} source @returns {string|undefined} */
function execute(source) {
  const context={module:{exports:undefined}};
  vm.runInNewContext(source,context,{timeout:1500});
  return JSON.stringify(context.module.exports);
}

/** @typedef {{name:string,code:string}} Fixture */
const literals="const values=['first-long-literal','second-long-literal','first-long-literal'];";
const fixtures=[
  {name:'export-array',code:literals+'module.exports=values;'},
  {name:'join-on-alias',code:literals+"module.exports=values.join('::');"},
  {name:'direct-index',code:literals+'module.exports=values[0];'},
  {name:'string-addition',code:literals+"module.exports=values[0]+'::'+values[1];"},
  {name:'inline-join-callee',code:"module.exports=['first-long-literal','second-long-literal'].join('::');"},
  {name:'own-join-call',code:literals+"const join=Array.prototype.join;module.exports=join.call(values,'::');"}
];

/** @returns {void} */
function main() {
  /** @type {Array<{name:string,sourceObserver:boolean,sourceByteObserver:boolean,encodedLiterals:number,decodedTables:number,attackerReplacements:number,parity:boolean}>} */
  const rows=[];
  for(const fixture of fixtures) {
    const source="'use strict';"+fixture.code;
    const ast=parse(source,'commonjs');
    const output=obfuscateFiles([
      {path:'entry.cjs',sourceType:'commonjs',code:source}
    ],{mode:'sno',seed:'string-eligibility-matrix',properties:false}).files[0];
    const generated=String(output.code);
    const recovered=recoverObfuscatedStrings(generated,'commonjs');
    const expected=execute(source);
    const parity=execute(generated)===expected && execute(recovered.code)===expected;
    assert.equal(parity,true,fixture.name);
    rows.push({
      name:fixture.name,
      sourceObserver:observesFunctionSource(ast),
      sourceByteObserver:observesDistributedSource(ast),
      encodedLiterals:output.metrics.literals,
      decodedTables:recovered.tables,
      attackerReplacements:recovered.literals,
      parity
    });
  }
  assert.ok(rows[0].encodedLiterals>=2,'Inert data positive must contain encoded work');
  assert.equal(rows[4].encodedLiterals,0,
    'Literal callee operand remains source-spelled for failed native calls');
  process.stdout.write(JSON.stringify({source:'exact Node 22 CommonJS compiler output',
    rows},null,2)+'\n');
}

if(require.main===module)main();
module.exports={main};
