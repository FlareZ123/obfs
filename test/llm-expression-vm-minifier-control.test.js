'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const vm=require('node:vm');
const {transformSync,version}=require('esbuild');

/** @param {string} content @returns {string} */
function sha256(content){
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Load exactly one CJS function without requiring another application module.
 * @param {string} source
 * @returns {(x:number)=>number}
 */
function load(source){
  /** @type {{exports:unknown}} */
  const mod={exports:null};
  vm.runInNewContext(source,{module:mod,exports:mod.exports},{timeout:1000});
  assert.equal(typeof mod.exports,'function');
  return /** @type {(x:number)=>number} */(mod.exports);
}

/** @returns {number[]} */
function numericCorpus(){
  const inputs=[0,-0,-1,1,2,-2,7,13,255,256,0x7fffffff,-0x80000000,
    1.5,-2.75,Number.MIN_VALUE,Number.MAX_VALUE,Infinity,-Infinity,NaN];
  let word=0x712ca00d;
  for(let i=0;i<2048;i++){
    word^=word<<13;word^=word>>>17;word^=word<<5;
    inputs.push(word|0);
  }
  return inputs;
}

test('source-matched esbuild control and emitted expression VM match numeric behavior',()=>{
  assert.equal(version,'0.28.2','The minifier version is part of the benchmark contract');
  const original=fs.readFileSync(path.join(__dirname,'../examples/expression-vm/before.cjs'),'utf8');
  const protectedCode=fs.readFileSync(path.join(__dirname,'../examples/expression-vm/after.cjs'),'utf8');
  const control=transformSync(original,{
    minify:true,target:'node22',format:'cjs',legalComments:'none'
  }).code;
  const originalFunction=load(original);
  const controlFunction=load(control);
  const protectedFunction=load(protectedCode);
  const inputs=numericCorpus();
  for(const value of inputs){
    const expected=originalFunction(value);
    assert.ok(Object.is(controlFunction(value),expected),
      'esbuild numeric parity failed at input '+String(value));
    assert.ok(Object.is(protectedFunction(value),expected),
      'Expression VM numeric parity failed at input '+String(value));
  }
  assert.ok(Buffer.byteLength(control,'utf8')<Buffer.byteLength(protectedCode,'utf8'));
  const result={
    source:'examples/expression-vm/before.cjs',
    protected:'examples/expression-vm/after.cjs',
    minifier:'esbuild '+version,
    options:{minify:true,target:'node22',format:'cjs',legalComments:'none'},
    inputs:inputs.length,
    sourceSha256:sha256(original),
    minifiedSha256:sha256(control),
    protectedSha256:sha256(protectedCode),
    minifiedBytes:Buffer.byteLength(control,'utf8'),
    protectedBytes:Buffer.byteLength(protectedCode,'utf8'),
    minified:control
  };
  process.stdout.write('SOURCE_MATCHED_LLM_MINIFIER_CONTROL '+JSON.stringify(result)+'\n');
});
