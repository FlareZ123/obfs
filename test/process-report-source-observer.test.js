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
  const context={process,JSON,require,module:{exports:null}};
  vm.runInNewContext(code,context,{
    filename:'process-report-observer.cjs',
    timeout:2000
  });
  return context.module.exports;
}

/**
 * Process diagnostic reports contain the live JavaScript call stack. Any
 * source rewrite ahead of getReport() on the same line can change its column.
 * @param {string} reportExpression
 * @param {string} seed
 */
function mustPreserveProcessReport(reportExpression,seed) {
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "module.exports=JSON.stringify("+reportExpression+".javascriptStack);";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed,
    strings:false,
    identifiers:false
  }).files[0];
  const native=execute(source);
  const transformed=execute(output.code);
  assert.equal(typeof native,'string');
  assert.match(native,/process-report-observer\\.cjs:1:\\d+/);
  assert.equal(transformed,native,output.code);
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
}

test('process.report.getReport preserves source coordinates',()=>{
  mustPreserveProcessReport(
    'process.report.getReport()',
    'agent1-process-report-direct'
  );
});

test('aliased process.report namespace preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const report=process.report;return report.getReport();})()',
    'agent1-process-report-namespace-alias'
  );
});

test('destructured process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const {getReport}=process.report;return getReport();})()',
    'agent1-process-report-method-alias'
  );
});

test('bound process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    '(()=>{const getReport=process.report.getReport.bind(process.report);return getReport();})()',
    'agent1-process-report-bound'
  );
});

test('Reflect.apply process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    'Reflect.apply(process.report.getReport,null,[])',
    'agent1-process-report-reflect-apply'
  );
});

test('Reflect.get process.report method preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "Reflect.get(process.report,'getReport')()",
    'agent1-process-report-reflect-get-method'
  );
});

test('Reflect.get process report namespace preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "Reflect.get(process,'report').getReport()",
    'agent1-process-report-reflect-get-namespace'
  );
});

test('CommonJS process module namespace preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const proc=require('node:process');return proc.report.getReport();})()",
    'agent1-process-report-cjs-namespace'
  );
});

test('CommonJS destructured report export preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const {report}=require('node:process');return report.getReport();})()",
    'agent1-process-report-cjs-report'
  );
});

test('nested CommonJS process report destructuring preserves source coordinates',()=>{
  mustPreserveProcessReport(
    "(()=>{const {report:{getReport}}=require('node:process');return getReport();})()",
    'agent1-process-report-cjs-nested'
  );
});

test('ESM named report import refuses source rewrites',()=>{
  const source="import {report as diagnosticReport} from 'node:process';"+
    "const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "export const observed=diagnosticReport.getReport().javascriptStack;"+
    "export const result=value;";
  assert.equal(observesFunctionSource(parse(source,'module')),true,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.mjs',
    sourceType:'module',
    code:source
  }],{
    mode:'coo',
    seed:'agent1-process-report-esm-report',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
});

test('process.report.writeReport is admitted as a source observer without executing it',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "process.report.writeReport();module.exports=value;";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent1-process-report-write',
    strings:false,
    identifiers:false
  }).files[0];
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
});

test('unsafe private-property rewrite changes process.report stack coordinates',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "module.exports=JSON.stringify(process.report.getReport().javascriptStack);";
  const unsafe=source.replaceAll('distinctivelyLongPrivateField','x');
  const native=execute(source);
  const renamed=execute(unsafe);
  assert.notEqual(renamed,native);
  assert.match(String(renamed),/process-report-observer\\.cjs:1:\\d+/);
});

test('ordinary process metadata remains eligible for property renaming',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+
    "module.exports=value+(process.pid>0?0:1);";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false,source);
  const output=obfuscateFiles([{
    path:'process-report-observer.cjs',
    sourceType:'commonjs',
    code:source
  }],{
    mode:'sno',
    seed:'agent1-process-report-positive',
    strings:false,
    identifiers:false
  }).files[0];
  assert.ok(output.metrics.properties>0,output.code);
  assert.equal(execute(output.code),execute(source));
});
