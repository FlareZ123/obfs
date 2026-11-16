'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');

/** @param {string} source @returns {(a:number)=>number} */
function execute(source){
  const module={exports:null};
  vm.runInNewContext(source,{module,globalThis},{timeout:3000});
  return /** @type {(a:number)=>number} */ (/** @type {unknown} */ (module.exports));
}

test('signed negative zero returns are declined because Wasm i32 cannot represent -0',()=>{
  const cases=[
    {expression:'-0',negativeInput:0},
    {expression:'a ? -0 : 0',negativeInput:1},
    {expression:'a ? 0 : -0',negativeInput:0},
    {expression:'a ? (a ? -0 : 1) : 0',negativeInput:1}
  ];
  for(const [index,example] of cases.entries()){
    const source='function f(a){return '+example.expression+';}module.exports=f;';
    const original=execute(source);
    assert.ok(Object.is(original(example.negativeInput),-0),
      'Original must have an observable -0 output: '+example.expression);
    assert.ok(!Object.is(original(example.negativeInput),+0));
    const emitted=lowerWasmI32Functions(source,'commonjs',{
      seed:'negative-zero-conformance-'+index,names:['f']
    });
    assert.equal(emitted.functions,0,example.expression);
    assert.equal(emitted.declined,1,example.expression);
    assert.equal(emitted.code,source,example.expression);
  }
});

test('ordinary negative Int32 literals remain eligible and preserve typed output',()=>{
  const source='function f(a){return a ? -1 : 0;}module.exports=f;';
  const emitted=lowerWasmI32Functions(source,'commonjs',{
    seed:'ordinary-signed-negative-literal',names:['f']
  });
  assert.equal(emitted.functions,1);
  const original=execute(source);
  const compiled=execute(emitted.code);
  for(const value of [-2147483648,-1,0,1,2147483647]){
    assert.ok(Object.is(compiled(value),original(value)));
  }
});
