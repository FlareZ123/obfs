'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function execute(code) {
  const realm={module:{exports:null}};
  vm.runInNewContext(code,realm,{timeout:2000});
  return JSON.stringify(realm.module.exports);
}

/**
 * A binding identifier provides inferred names to anonymous functions and
 * classes. Mangling it can modify observable Function.prototype.name.
 * @param {string} source
 * @param {number} safeBindings
 */
function compare(source,safeBindings) {
  const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'inferred-name-safety',strings:false,properties:false
  }).files[0];
  assert.equal(execute(result.code),execute(source),result.code);
  assert.equal(result.metrics.bindings,safeBindings,result.code);
}

test('an anonymous arrow function inherits its const binding name',()=>{
  compare(`'use strict';const callback=()=>17;module.exports=callback.name;`,0);
});

test('an anonymous function expression inherits its const binding name',()=>{
  compare(`'use strict';const helper=function(){};module.exports=helper.name;`,0);
});

test('an anonymous generator inherits its const binding name',()=>{
  compare(`'use strict';const generator=function*(){};module.exports=generator.name;`,0);
});

test('an anonymous class expression inherits its const binding name',()=>{
  compare(`'use strict';const Utility=class {};module.exports=Utility.name;`,0);
});

test('an anonymous async arrow retains its binding name through an alias',()=>{
  compare(`'use strict';const handler=async()=>1;const alias=handler;
    module.exports=[handler.name,alias.name];`,1);
});

test('let binding also supplies a function name',()=>{
  compare(`'use strict';let executor=function(){return 1};module.exports=executor.name;`,0);
});

test('explicitly named function expression remains safe for binding mangling',()=>{
  compare(`'use strict';const action=function explicitName(){};module.exports=action.name;`,1);
});

test('primitive local const still permits mangling',()=>{
  compare(`'use strict';const counter=17;module.exports=counter+1;`,1);
});

test('anonymous function introduced through assignment preserves inferred name',()=>{
  compare(`'use strict';let worker;worker=function(){};module.exports=worker.name;`,0);
});

test('anonymous arrow introduced through logical assignment preserves inferred name',()=>{
  compare(`'use strict';let task;task ||= ()=>7;module.exports=task.name;`,0);
});

test('explicitly named function assigned later permits binding mangling',()=>{
  compare(`'use strict';let action;action=function named(){};module.exports=action.name;`,1);
});

test('conditional branch functions with no inferred name permit binding mangling',()=>{
  compare(`'use strict';const callback=true?function(){}:function(){};module.exports=callback.name;`,1);
});
