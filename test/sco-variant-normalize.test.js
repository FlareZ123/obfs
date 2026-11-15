'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const vm=require('node:vm');
const {createScoHandler}=require('../src');
const {normalizeScoVariant}=require('../sims/sco-variant-normalize');

/** @param {string} source @returns {string} */
function evaluate(source) {
  const context={};
  vm.runInNewContext(source,context,{timeout:1000});
  return JSON.stringify(context.out);
}

test('two independent SCO variants collapse under source-only AST canonicalization',async()=>{
  const source=[
    'function emit(value){',
    "const payload='client-polymorphism-secret';",
    'const offset=value+5;',
    "return payload+':'+offset;",
    '}',
    'globalThis.out=emit(12);'
  ].join('\n');
  const server=http.createServer(createScoHandler([
    {path:'entry.js',sourceType:'script',code:source}
  ]));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('Expected TCP listener');
    const endpoint='http://127.0.0.1:'+addr.port+'/obfs/entry.js';
    const a=await fetch(endpoint);
    const b=await fetch(endpoint);
    assert.equal(a.status,200);
    assert.equal(b.status,200);
    const variants=[await a.text(),await b.text()];
    assert.notEqual(variants[0],variants[1],'Independent requests should retain literal spelling variation');
    for(const variant of variants)assert.equal(evaluate(variant),evaluate(source));

    const normalized=variants.map(value=>normalizeScoVariant(value,'script'));
    assert.equal(normalized[0],normalized[1],
      'Literal variation and deterministic name-shapes are recoverable statically');
    assert.ok(normalized[0].includes('"client-polymorphism-secret"'),
      'The attacker can read the original string literal AST value');
    assert.equal(evaluate(normalized[0]),evaluate(source));
    assert.ok(variants.every(value=>!value.includes('/* variant:')),
      'A served client file must not disclose the internal randomization seed');
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('normalizer handles marker-free source and refuses invalid input',()=>{
  assert.equal(normalizeScoVariant("const x='text';"),'const x="text";');
  assert.throws(()=>normalizeScoVariant(/** @type {any} */ (null)),/served JS string/);
});
