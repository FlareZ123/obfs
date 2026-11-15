'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function evaluate(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} code @param {number} safeObjects */
function compare(code,safeObjects) {
  const output=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'receiver-reflection-safety',strings:false
  }).files[0];
  assert.equal(evaluate(output.code),evaluate(code),output.code);
  assert.equal(output.metrics.objects,safeObjects,output.code);
}

test('hasOwnProperty observes the original key name',()=>{
  compare(`'use strict';const a={secretField:1};
    module.exports=[a.hasOwnProperty("secretField"),a.secretField];`,0);
});

test('an inherited getter can reflect receiver keys without reference escape',()=>{
  compare(`'use strict';Object.defineProperty(Object.prototype,"inspect",{
    get(){return Object.keys(this)[0]}});const a={secretField:2};
    module.exports=[a.inspect,a.secretField];`,0);
});

test('delete reveals an inherited property with the original name',()=>{
  compare(`'use strict';Object.prototype.secretField=91;
    const a={secretField:3};delete a.secretField;
    module.exports=a.secretField;`,0);
});

test('function assigned later can reflect the receiver via this',()=>{
  compare(`'use strict';const a={secretField:4};
    a.secretField=function(){return Object.keys(this)[0]};
    module.exports=a.secretField();`,0);
});

test('destructuring assignment can inject a reflective method into an own key',()=>{
  compare(`'use strict';const a={secretField:5};
    ({field:a.secretField}={field:function(){return Object.keys(this)[0]}});
    module.exports=a.secretField();`,0);
});

test('for-of assignment can inject an unknown value into an own key',()=>{
  compare(`'use strict';const a={secretField:6};
    for(a.secretField of [function(){return Object.keys(this)[0]}]){}
    module.exports=a.secretField();`,0);
});

test('primitive direct writes and numeric increments remain renameable',()=>{
  compare(`'use strict';const a={secretField:1};
    a.secretField=7;a.secretField++;module.exports=a.secretField;`,1);
});

test('an initial own literal key shadows a same-named inherited getter',()=>{
  compare(`'use strict';Object.defineProperty(Object.prototype,"secretField",{
    get(){return 91}});const a={secretField:8};
    module.exports=a.secretField;`,1);
});
