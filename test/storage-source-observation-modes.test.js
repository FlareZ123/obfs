'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const source=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  localStorage.setItem("storage-mode-source-observer",inspect);',
  '  return inspect()+independent();',
  '}'
].join('\n');

for(const mode of ['coo','sco']) {
  test(mode.toUpperCase()+' client transform currently misses native Storage source observation while retaining identifier yield',()=>{
    assert.equal(observesFunctionSource(parse(source,'module')),false);
    const result=obfuscateFiles([{
      path:'entry.mjs',
      sourceType:'module',
      code:source
    }],{
      mode,
      seed:'storage-source-observation-mode-'+mode,
      properties:false,
      identifiers:true,
      strings:false
    });
    const output=String(result.files[0].code);
    assert.ok(result.files[0].metrics.bindings>=2);
    assert.ok(!output.includes('privateLocal'));
    assert.ok(!output.includes('independentLocal'));
  });
}
