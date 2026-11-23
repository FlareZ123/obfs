'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource,observesDistributedSource}=require('../src/ast');

const cases={
  plain:'const state={secretField:37};module.exports=state.secretField;',
  fetch:'const state={secretField:37};module.exports=Promise.resolve(new Response("fixed").text()).then(observed=>({observed,value:state.secretField}));',
  test:'const state={secretField:37};module.exports=Promise.resolve(new Response("fixed").text()).then(observed=>({observed,value:state.secretField}));'
};

for(const [label,source] of Object.entries(cases)) {
 test('scope debug '+label,()=>{
  const ast=parse(source,'commonjs');
  const fn=observesFunctionSource(ast);
  const ds=observesDistributedSource(ast);
  const compiled=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],
    {mode:'sno',seed:'fetch-file-primitive/Response primitive body',strings:false}).files[0];
  console.log('SOURCE_SCOPE_DEBUG '+JSON.stringify({label,fn,ds,metrics:compiled.metrics,head:String(compiled.code).slice(0,250)}));
  assert.equal(fn,false);
  assert.equal(ds,false);
  assert.equal(compiled.metrics.properties,1);
 });
}
