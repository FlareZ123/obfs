'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Execute one CommonJS body at a fixed filename and return its exported value.
 * @param {string} code
 * @returns {unknown}
 */
function execute(code) {
  const context={process,JSON,module:{exports:null}};
  vm.runInNewContext(code,context,{
    filename:'process-report-observer.cjs',
    timeout:2000
  });
  return context.module.exports;
}

test('process.report.getReport currently exposes a transformed source coordinate',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "module.exports=JSON.stringify(process.report.getReport().javascriptStack);";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent1-process-report-negative',
    strings:false,
    identifiers:false
  }).files[0];
  const native=execute(source);
  const transformed=execute(output.code);
  assert.equal(typeof native,'string');
  assert.equal(typeof transformed,'string');
  assert.match(native,/process-report-observer\.cjs:1:\d+/);
  assert.match(transformed,/process-report-observer\.cjs:1:\d+/);
  assert.ok(output.metrics.properties>0,output.code);
  assert.notEqual(transformed,native,output.code);
});
