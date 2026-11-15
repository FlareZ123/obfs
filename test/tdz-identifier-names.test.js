'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/** @param {string} source @returns {string} */
function evaluate(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return JSON.stringify(context.module.exports);
}

/**
 * Property and string transformations are disabled to isolate identifier
 * mangling and observable ReferenceError message text.
 * @param {string} source
 * @param {string[]} protectedIdentifiers
 */
function compare(source,protectedIdentifiers) {
  const transformed=obfuscateFiles([{path:'test.cjs',sourceType:'commonjs',code:source}],{
    mode:'sno',seed:'tdz-error-safety',properties:false,strings:false
  }).files[0];
  assert.equal(evaluate(transformed.code),evaluate(source),transformed.code);
  for(const identifier of protectedIdentifiers) {
    assert.match(transformed.code,new RegExp(`\\b${identifier}\\b`));
  }
}

test('a read before a const initializer preserves the TDZ error binding name',()=>{
  compare(`'use strict';let message;
    try{ console.log(secretKey); } catch(error){ message=error.message; }
    const secretKey=17;module.exports=message;`,['secretKey']);
});

test('a const self-reference inside its initializer preserves TDZ error text',()=>{
  compare(`'use strict';let message;
    try{const answer=answer+1;}catch(error){message=error.message;}
    module.exports=message;`,['answer']);
});

test('a later parameter read in an earlier default preserves TDZ error name',()=>{
  compare(`'use strict';function f(a=b,b){return a};let message;
    try{f();}catch(error){message=error.message;}
    module.exports=message;`,['b']);
});

test('a safe local with no early references remains transformable',()=>{
  const source=`'use strict';const normalValue=19;module.exports=normalValue+1;`;
  const output=obfuscateFiles([{path:'test.cjs',code:source,sourceType:'commonjs'}],{
    mode:'sno',seed:'tdz-safe-control',properties:false,strings:false
  }).files[0];
  assert.equal(evaluate(output.code),evaluate(source));
  assert.equal(output.metrics.bindings,1);
});
