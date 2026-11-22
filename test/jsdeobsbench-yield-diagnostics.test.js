'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyzeRows}=require('../sims/jsdeobsbench-yield-diagnostics');

test('JsDeObsBench yield diagnostics separates function-source refusals from unobserved no-yield files',()=>{
  const rows=[
    {
      filename:'function-source.js',
      original:'function watched(value){return value;} String.prototype.concat.call(watched);',
      obfs_metrics:{bindings:0}
    },
    {
      filename:'plain.js',
      original:'const answer=42; console.log(answer);',
      obfs_metrics:{bindings:1}
    },
    {
      filename:'unobserved-no-yield.js',
      original:'console.log("constant");',
      obfs_metrics:{bindings:0}
    }
  ];
  const result=analyzeRows(rows,'script');
  assert.equal(result.files,3);
  assert.equal(result.parseFailures,0);
  assert.equal(result.functionSourceObserved,1);
  assert.equal(result.distributedSourceObserved,0);
  assert.equal(result.observerFilesWithoutBindings,1);
  assert.equal(result.unobservedFilesWithBindings,1);
  assert.equal(result.unobservedFilesWithoutBindings,1);
  assert.equal(result.observerFilesWithBindings,0);
  assert.deepEqual(result.samples.functionOnly,['function-source.js']);
});

test('JsDeObsBench yield diagnostics rejects malformed transformation metrics',()=>{
  assert.throws(()=>analyzeRows([{
    filename:'bad.js',original:'const x=1;',obfs_metrics:{bindings:-1}
  }],'script'),/Invalid benchmark row/);
});
