'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

const code='function f(x){var value=x|0;if(value>4){value+=3;}else{value-=2;}return value;}module.exports={f};';
const files=[{path:'app.cjs',sourceType:/** @type {'commonjs'} */('commonjs'),code}];

const missing=[
  ['Register VM',{experimentalRegisterVm:{'missing.cjs':['f']}}],
  ['Expression VM',{experimentalExpressionVm:{'missing.cjs':['f']}}],
  ['Native graph',{experimentalNativeGraph:{'missing.cjs':['f']}}],
  ['Branch blocks',{experimentalBranchBlocks:{'missing.cjs':['f']}}],
  ['Statement flow',{experimentalStatementFlow:{'missing.cjs':['f']}}],
  ['Wasm i32',{experimentalWasmI32:{'missing.cjs':['f']}}],
  ['Polyvariant affine',{experimentalPolyvariantAffine:{'missing.cjs':['f']}}]
];

for(const [name,selection] of missing){
  test(name+' declines unknown selected file rather than silently omitting protected work',()=>{
    assert.throws(()=>obfuscateFiles(files,{
      mode:'coo',seed:'selection-preflight',strings:false,identifiers:false,
      properties:false,...selection
    }),/selects missing or non-JavaScript input missing\.cjs/u);
  });
}

test('selected backend refuses an asset path and mismatched file spelling',()=>{
  assert.throws(()=>obfuscateFiles([
    ...files,{path:'asset.bin',sourceType:'asset',code:Buffer.from('public')}
  ],{
    mode:'coo',seed:'selection-asset',strings:false,identifiers:false,
    properties:false,experimentalStatementFlow:{'asset.bin':['f']}
  }),/Statement flow selects missing or non-JavaScript input asset\.bin/u);
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'selection-case',strings:false,identifiers:false,
    properties:false,experimentalStatementFlow:{'APP.cjs':['f']}
  }),/Statement flow selects missing or non-JavaScript input APP\.cjs/u);
});

test('a valid target cannot hide a second, unmatched selected target',()=>{
  assert.throws(()=>obfuscateFiles(files,{
    mode:'coo',seed:'selection-mixed',strings:false,identifiers:false,
    properties:false,experimentalStatementFlow:{'app.cjs':['f'],'absent.cjs':['f']}
  }),/Statement flow selects missing or non-JavaScript input absent\.cjs/u);
});

test('empty selector lists remain harmless declarations',()=>{
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'selection-empty',strings:false,identifiers:false,
    properties:false,experimentalStatementFlow:{'missing.cjs':[]}
  });
  assert.equal(output.files[0].code,code);
});

test('a valid selected file still emits real function control-flow and preserves observed behavior',()=>{
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'selection-positive',strings:false,identifiers:false,
    properties:false,experimentalStatementFlow:{'app.cjs':['f']}
  });
  assert.equal(output.files[0].metrics.statementFlowFunctions,1);
  const emitted=String(output.files[0].code);
  assert.match(emitted,/switch\(/u);
  /** @param {string} source @returns {(input:number)=>number} */
  const load=source=>/** @type {(input:number)=>number} */(
    vm.runInNewContext(source+'\n;f;',{module:{exports:{}}}));
  const native=load(code);
  const protectedFunction=load(emitted);
  for(let input=-50;input<=50;input++){
    assert.equal(protectedFunction(input),native(input));
  }
});

test('selection getter is read only once before emitting the requested function',()=>{
  let reads=0;
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'selection-getter',strings:false,identifiers:false,
    properties:false,
    get experimentalStatementFlow(){
      reads++;
      return reads===1?{'app.cjs':['f']}:{'missing.cjs':['f']};
    }
  });
  assert.equal(reads,1);
  assert.equal(output.files[0].metrics.statementFlowFunctions,1);
});

test('validated function names survive later caller-array mutation',()=>{
  const functions=['f'];
  const output=obfuscateFiles(files,{
    mode:'coo',seed:'selection-array-snapshot',strings:false,identifiers:false,
    experimentalStatementFlow:{'app.cjs':functions},
    get properties(){
      functions.length=0;
      return false;
    }
  });
  assert.equal(functions.length,0,'The caller can mutate its own configuration');
  assert.equal(output.files[0].metrics.statementFlowFunctions,1,
    'The compiler must preserve its accepted protected-work selection');
});
