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

test('local Reflect.has stays conservative without an ambient-effect proof',()=>{
  compare(`'use strict';const a={secretField:11};
    module.exports=[Reflect.has(a,"secretField"),a.secretField];`,0);
});

test('local Reflect.getOwnPropertyDescriptor stays conservative without an ambient-effect proof',()=>{
  compare(`'use strict';const a={secretField:12};
    module.exports=[Reflect.getOwnPropertyDescriptor(a,"secretField").value,a.secretField];`,0);
});

test('local Object.getOwnPropertyDescriptor stays conservative without an ambient-effect proof',()=>{
  compare(`'use strict';const a={secretField:13};
    module.exports=[Object.getOwnPropertyDescriptor(a,"secretField").value,a.secretField];`,0);
});

test('patched Reflect.has keeps local property renaming conservative',()=>{
  compare(`'use strict';const native=Reflect.has;Reflect.has=(owner,key)=>key==="secretField"&&native(owner,key);
    const a={secretField:14};module.exports=[Reflect.has(a,"secretField"),a.secretField];`,0);
});

test('patched Object.getOwnPropertyDescriptor keeps local property renaming conservative',()=>{
  compare(`'use strict';const native=Object.getOwnPropertyDescriptor;
    Object.getOwnPropertyDescriptor=(owner,key)=>native(owner,key);
    const a={secretField:15};
    module.exports=[Object.getOwnPropertyDescriptor(a,"secretField").value,a.secretField];`,0);
});

test('Proxy-wrapped owner remains outside local direct-reflection proof',()=>{
  compare(`'use strict';const a={secretField:16};const proxy=new Proxy(a,{
    has(target,key){return key==="secretField"&&Reflect.has(target,key);}
  });module.exports=[Reflect.has(proxy,"secretField"),a.secretField];`,0);
});

test('local Reflect.get stays conservative without an ambient-effect proof',()=>{
  compare(`'use strict';const a={secretField:17};
    module.exports=[Reflect.get(a,"secretField"),a.secretField];`,0);
});

test('local Object.hasOwn stays conservative without an ambient-effect proof',()=>{
  compare(`'use strict';const a={secretField:18};
    module.exports=[Object.hasOwn(a,"secretField"),a.secretField];`,0);
});

test('local three-argument Reflect.set stays conservative without an ambient-effect proof',()=>{
  compare(`'use strict';const a={secretField:19};
    const ok=Reflect.set(a,"secretField",23);
    module.exports=[ok,a.secretField];`,0);
});

test('Reflect.set with an explicit receiver stays outside local proof',()=>{
  compare(`'use strict';const a={secretField:20};const receiver={};
    const ok=Reflect.set(a,"secretField",24,receiver);
    module.exports=[ok,a.secretField,receiver.secretField];`,0);
});

test('patched Reflect.set keeps local property renaming conservative',()=>{
  compare(`'use strict';const native=Reflect.set;
    Reflect.set=(owner,key,value)=>native(owner,key,value);
    const a={secretField:21};Reflect.set(a,"secretField",25);
    module.exports=a.secretField;`,0);
});

test('Reflect.set value spread stays outside local proof because it can supply receiver',()=>{
  compare(`'use strict';const a={secretField:22};const receiver={};
    const args=[26,receiver];const ok=Reflect.set(a,"secretField",...args);
    module.exports=[ok,a.secretField,receiver.secretField];`,0);
});

test('constructor-recovered Object mutation keeps local direct reflection disabled',()=>{
  compare(`'use strict';const O=({}).constructor;const native=O.hasOwn;
    O.hasOwn=(owner,key)=>key==="secretField"&&native(owner,key);
    const a={secretField:23};
    module.exports=[Object.hasOwn(a,"secretField"),a.secretField];`,0);
});

test('dynamic compiler mutation keeps local direct reflection disabled',()=>{
  compare(`'use strict';
    Function("const native=Reflect.get;Reflect.get=(owner,key)=>key==='secretField'?native(owner,key):91")();
    const a={secretField:24};
    module.exports=[Reflect.get(a,"secretField"),a.secretField];`,0);
});

