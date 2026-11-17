'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {parse,observesFunctionSource}=require('../src/ast');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {string|undefined} */
function execute(source) {
  const context={module:{exports:undefined}};
  vm.runInNewContext(source,context,{timeout:1500});
  return JSON.stringify(context.module.exports);
}

test('fresh array literal own index is a proven primitive under implicit coercion',()=>{
  const safe=[
    "'use strict';module.exports=['first-long-literal','second-long-literal'][0]+'!';",
    "'use strict';module.exports='prefix-'+['first-long-literal','second-long-literal'][1];",
    "'use strict';module.exports=String(['first-long-literal','second-long-literal'][0]);",
    "'use strict';module.exports=['first-long-literal',null,true,7][3]+'!';"
  ];
  for(const [index,source] of safe.entries()) {
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
      'Fresh own element is primitive for case '+index);
    const generated=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'fresh-inline-array-element/'+index,properties:false
    }).files[0];
    assert.ok(generated.metrics.literals>=2,'Private literals must be encoded: '+index);
    assert.equal(execute(String(generated.code)),execute(source),
      'Generated runtime parity: '+index);
  }
});

test('source-observation proof rejects holes, spreads and function-bearing inline arrays',()=>{
  const unsafe=[
    "'use strict';module.exports=[,][0]+'-source';",
    "'use strict';module.exports=[()=>9][0]+'-source';",
    "'use strict';const fn=function observed(){return 1;};module.exports=[fn][0]+'-source';",
    "'use strict';module.exports=[{toString(){return 'object';}}][0]+'-source';",
    "'use strict';module.exports=[...'ab','safe'][0]+'-source';",
    "'use strict';module.exports=[globalThis.opaque][0]+'-source';"
  ];
  for(const source of unsafe) {
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  }
});

test('prototype-filled hole has observable function source in native VM',()=>{
  const original=[
    "'use strict';",
    "Array.prototype[0]=function hiddenSourceMarker(){return 9;};",
    "module.exports=[,][0]+'-source';"
  ].join('');
  const result=execute(original);
  assert.match(String(result),/function hiddenSourceMarker/u);
  assert.equal(observesFunctionSource(parse(original,'commonjs')),true);
});
