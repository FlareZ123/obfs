'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function evaluate(code) {
  const realm={module:{exports:null}};
  vm.runInNewContext(code,realm,{timeout:1000});
  return JSON.stringify(realm.module.exports);
}

/** @param {string} source @param {number} eligibleBindings */
function compare(source,eligibleBindings) {
  const output=obfuscateFiles([{path:'default.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'parameter-inferred-names',strings:false,properties:false
  }).files[0];
  assert.equal(evaluate(output.code),evaluate(source),output.code);
  assert.equal(output.metrics.bindings,eligibleBindings,output.code);
}

test('default anonymous function parameter inherits its identifier name',()=>{
  compare(`'use strict';function run(callback=function(){}){return callback.name;}
    module.exports=run();`,0);
});

test('default arrow-function parameter inherits its identifier name',()=>{
  compare(`'use strict';function run(handler=()=>42){return handler.name;}
    module.exports=run();`,0);
});

test('default class parameter inherits its identifier name',()=>{
  compare(`'use strict';function run(Utility=class{}){return Utility.name;}
    module.exports=run();`,0);
});

test('default async arrow parameter preserves its identifier name',()=>{
  compare(`'use strict';async function run(task=async()=>19){module.exports=task.name;}
    void run();`,0);
});

test('primitive default parameter remains behaviorally correct',()=>{
  compare(`'use strict';function run(value=17){return value+1;}
    module.exports=run();`,1);
});

test('explicitly named default function does not require name inference',()=>{
  compare(`'use strict';function run(callback=function declared(){}){return callback.name;}
    module.exports=run();`,1);
});

test('simple parameter without defaults remains eligible for local mangling',()=>{
  compare(`'use strict';function run(value){return value+1;}
    module.exports=run(17);`,1);
});
