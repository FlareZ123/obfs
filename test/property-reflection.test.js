'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @param {string|undefined} [activeKey] @returns {string} */
function evaluate(code,activeKey) {
  const context={module:{exports:null,activeKey}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * @param {string} code
 * @param {number} safeObjects
 * @param {(string|undefined)[]} [activeKeys]
 */
function compare(code,safeObjects,activeKeys=[undefined]) {
  const output=obfuscateFiles([{path:'main.cjs',sourceType:'commonjs',code}],{
    mode:'sno',seed:'receiver-reflection-safety',strings:false
  }).files[0];
  for(const key of activeKeys) {
    assert.equal(evaluate(output.code,key),evaluate(code,key),output.code);
  }
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

test('Object.hasOwn preserves unknown external lookup-key semantics',()=>{
  compare(`'use strict';const a={secretField:11};
    const key=module.activeKey||"secretField";
    module.exports=[Object.hasOwn(a,key),key,a.secretField];`,0,
    ['secretField','missingField','toString']);
});

test('Object.getOwnPropertyDescriptors exposes own-key spelling',()=>{
  compare(`'use strict';const a={secretField:12};
    const descriptors=Object.getOwnPropertyDescriptors(a);
    module.exports=[Object.keys(descriptors),descriptors.secretField.value];`,0);
});

test('Reflect.getOwnPropertyDescriptor preserves unknown external lookup key',()=>{
  compare(`'use strict';const a={secretField:13};
    const key=module.activeKey||"secretField";
    const descriptor=Reflect.getOwnPropertyDescriptor(a,key);
    module.exports=[key,descriptor&&descriptor.value];`,0,
    ['secretField','missingField','toString']);
});

test('Reflect.ownKeys exposes own-key spelling',()=>{
  compare(`'use strict';const a={secretField:14};
    module.exports=[Reflect.ownKeys(a),a.secretField];`,0);
});
