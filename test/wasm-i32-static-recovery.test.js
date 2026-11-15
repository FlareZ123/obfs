'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {parse}=require('../src/ast');
const {obfuscateFiles}=require('../src/core');
const {recoverPublicWasmExpression,extractPublicWasm}=
  require('../sims/wasm-i32-static-recover');

/** @param {string} source @returns {string} */
function canonical(source) {
  const ast=parse('function f(x){return '+source+';}', 'commonjs');
  const arg=ast.body[0].body.body[0].argument;
  /** @param {import('../src/ast').AstNode} node @returns {string} */
  function walk(node) {
    if(node.type==='Identifier')return node.name;
    if(node.type==='Literal')return String(node.value);
    if(node.type==='UnaryExpression'&&node.operator==='-'&&
       node.argument.type==='Literal')return String(-node.argument.value);
    if(node.type==='UnaryExpression'&&node.operator==='~')return '(~'+walk(node.argument)+')';
    if(node.type==='BinaryExpression')return '('+walk(node.left)+node.operator+walk(node.right)+')';
    throw new TypeError('Unsupported independent expression '+node.type);
  }
  return walk(arg);
}

/** @param {string} code @returns {(x:number)=>number} */
function load(code) {
  const module={exports:null};
  vm.runInNewContext(code,{module,globalThis},{timeout:1000});
  return /** @type {(x:number)=>number} */(module.exports);
}

const expressions=[
  '(((x^137)&(x>>>3))|(x<<7))',
  '((x&255)^((x|0x1f4d)>>5))',
  '(((x>>>1)^(x<<17))>>>3)',
  '((~x)&(x^(-2147483648)))',
  '(x&(x|x))^(~(x^255))'
];

let state=0x8ca35461;
/** @returns {number} */
function next() {state^=state<<13;state^=state>>>17;state^=state<<5;return state|0;}

test('seedless static Wasm bytecode attacker exactly reconstructs all 120 bitvector ASTs',()=>{
  let reconstructions=0,comparisons=0;
  for(const expression of expressions) {
    const source='function f(x){return '+expression+';}module.exports=f;';
    const original=load(source);
    for(let n=0;n<24;n++) {
      const transformed=lowerWasmI32Functions(source,'commonjs',{
        seed:'static-attacker-independent-'+n,names:['f']
      });
      assert.equal(transformed.functions,1);
      // The attacker gets only the generated JavaScript; none of the
      // original source, compiler internals or build seed is read here.
      const recovered=recoverPublicWasmExpression(transformed.code);
      assert.ok(recovered.bytes>25);
      assert.equal(recovered.expression,canonical(expression),
        'seedless static reconstruction of '+expression+' seed '+n);
      reconstructions++;
      const clone=load('function f(x){return '+recovered.expression+';}module.exports=f;');
      const compiled=load(transformed.code);
      for(let i=0;i<256;i++) {
        const x=next();
        assert.ok(Object.is(clone(x),original(x)));
        assert.ok(Object.is(compiled(x),original(x)));
        comparisons++;
      }
    }
  }
  assert.equal(reconstructions,120);
  assert.equal(comparisons,120*256);
  console.log('Independent public-Wasm AST reconstruction: '+reconstructions+
    ' exact expressions and '+comparisons+' held-out typed integer checks');
});

test('attacker refuses nonmatching source and malformed Wasm',()=>{
  assert.throws(()=>extractPublicWasm('function safe(){return 1;}'),/No public/);
  assert.throws(()=>extractPublicWasm('Uint8Array.from([1,2,999])'),/Malformed/);
  assert.throws(()=>extractPublicWasm('Uint8Array.from([0,97,115,109])'),/Invalid public/);
});


test('end-to-end COO and SNO transformations still expose recoverable Wasm AST',()=>{
  const expression='(((x^137)&(x>>>3))|(x<<7))';
  const source='function f(x){return '+expression+';}module.exports=f;';
  for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])) {
    for(const seed of ['pipeline-a','pipeline-b','pipeline-c']) {
      const result=obfuscateFiles([{
        path:'bundle.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed,closedWorld:true,
        experimentalWasmI32:{'bundle.cjs':['f']}
      });
      const output=result.files[0];
      assert.equal(output.metrics.wasmI32Functions,1);
      const recovered=recoverPublicWasmExpression(String(output.code));
      assert.equal(recovered.expression,canonical(expression));
      const original=load(source);
      const protectedFn=load(String(output.code));
      const reconstructed=load('function f(x){return '+recovered.expression+';}module.exports=f;');
      for(let value=-512;value<=512;value++) {
        assert.equal(protectedFn(value),original(value));
        assert.equal(reconstructed(value),original(value));
      }
    }
  }
});
