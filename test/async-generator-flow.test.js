'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {obfuscateFiles} = require('../src');

/** @param {string} code @returns {string} */
function run(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/** @param {string} source @param {number} expectedObjects */
function compare(source,expectedObjects) {
  const output=obfuscateFiles([{path:'app.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'promise-iterator-forward',strings:false
  }).files[0];
  assert.equal(run(output.code),run(source),output.code);
  assert.equal(output.metrics.objects,expectedObjects,output.code);
}

test('async return wraps object in Promise and cannot be a direct alias',()=>{
  compare(`'use strict';Promise.prototype.secretField=91;
    const state={secretField:1};async function id(p){return p;}
    const result=id(state);module.exports=[result.secretField,state.secretField];`,0);
});

test('generator return wraps object in iterator and cannot be a direct alias',()=>{
  compare(`'use strict';Object.prototype.secretField=81;
    const state={secretField:2};function* id(p){return p;}
    const result=id(state);module.exports=[result.secretField,state.secretField];`,0);
});

test('ordinary synchronous identity function retains useful alias renaming',()=>{
  compare(`'use strict';const state={secretField:3};
    function id(p){return p;}const result=id(state);
    module.exports=[result.secretField,state.secretField];`,1);
});

test('async function can still read a proved parameter property',()=>{
  compare(`'use strict';const state={secretField:4};
    async function read(p){return p.secretField;}
    void read(state);module.exports=state.secretField;`,1);
});
