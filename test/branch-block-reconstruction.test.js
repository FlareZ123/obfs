'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {flattenBranchBlocks}=require('../src');
const {recoverBranchFunction}=require('../sims/branch-block-reconstruction');
const {SEED}=require('../examples/branch-blocks/build.cjs');

const ROOT=path.join(__dirname,'../examples/branch-blocks');
const before=fs.readFileSync(path.join(ROOT,'before/gate.cjs'),'utf8');
const after=fs.readFileSync(path.join(ROOT,'after/gate.cjs'),'utf8');

test('checked-in branch sample matches the actual deterministic compiler',()=>{
  const compiled=flattenBranchBlocks(before,'commonjs',{seed:SEED,names:['gate']});
  assert.equal(compiled.functions,1);
  assert.equal(compiled.blocks,5);
  assert.equal(compiled.code,after);
});

test('independent attacker reconstructs the actual emitted branches without the compiler seed',()=>{
  const recovered=recoverBranchFunction(after,'gate');
  assert.equal(recovered.blocks,5);
  assert.equal(recovered.tests,2);
  assert.equal(recovered.operations,7);
  const original=require('../examples/branch-blocks/before/gate.cjs').gate;
  const flattened=require('../examples/branch-blocks/after/gate.cjs').gate;
  const clone=/** @type {(x:unknown)=>unknown} */ (vm.runInNewContext('('+recovered.source+')'));
  for(let x=-2048;x<=2048;x++){
    assert.equal(clone(x),original(x));
    assert.equal(flattened(x),original(x));
  }
  for(const value of ['1','',true,false,null,undefined,Infinity,-Infinity,NaN]){
    assert.equal(clone(value),original(value));
    assert.equal(flattened(value),original(value));
  }
});


test('independent attacker symbolically cancels operand-dependent runtime state masks',()=>{
  const masked=flattenBranchBlocks(before,'commonjs',{
    seed:SEED,names:['gate'],stateBlinding:true
  });
  assert.equal(masked.blocks,5);
  assert.match(masked.code,/typeof /u);
  const recovered=recoverBranchFunction(masked.code,'gate');
  assert.equal(recovered.blocks,5);
  assert.equal(recovered.tests,2);
  assert.equal(recovered.operations,7);
  const native=require('../examples/branch-blocks/before/gate.cjs').gate;
  const obfuscated=/** @type {(x:unknown)=>unknown} */ (
    vm.runInNewContext('(function(){const module={exports:{}};'+masked.code+';return module.exports.gate})()')
  );
  const clone=/** @type {(x:unknown)=>unknown} */ (vm.runInNewContext('('+recovered.source+')'));
  for(let x=-4096;x<=4096;x++){
    assert.equal(obfuscated(x),native(x));
    assert.equal(clone(x),native(x));
  }
});
