'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const vm=require('node:vm');
const {createScoHandler,obfuscateFiles}=require('../src');
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
    'return {payload,offset};',
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


/** @param {string} source @returns {unknown} */
function evaluateCommonJs(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.module.exports;
}

test('SCO hashed identifier variants normalize without the request seed',async()=>{
  const original=[
    'const confidentialCount=7;',
    'const weightedCount=confidentialCount+5;',
    'module.exports=weightedCount;'
  ].join('\n');
  // Separate compiler errors from HTTP path or response errors.
  const direct=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],
    {mode:'sco',seed:'static-normalizer-diagnostic'});
  assert.ok(typeof direct.files[0].code==='string');
  const server=http.createServer(createScoHandler([
    {path:'entry.cjs',sourceType:'commonjs',code:original}
  ]));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('Expected listener');
    const endpoint='http://127.0.0.1:'+addr.port+'/obfs/entry.cjs';
    const responses=await Promise.all([fetch(endpoint),fetch(endpoint)]);
    assert.ok(responses.every(response=>response.status===200));
    const variants=await Promise.all(responses.map(response=>response.text()));
    assert.notEqual(variants[0],variants[1]);
    for(const variant of variants){
      assert.match(variant,/_v[a-f0-9]{12}/u);
      assert.equal(evaluateCommonJs(variant),evaluateCommonJs(original));
      assert.ok(!variant.includes('/* variant:'));
    }
    const normalized=variants.map(variant=>normalizeScoVariant(variant,'commonjs'));
    assert.equal(normalized[0],normalized[1]);
    assert.equal(evaluateCommonJs(normalized[0]),evaluateCommonJs(original));
    assert.match(normalized[0],/reconstructedLocal_0/u);
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('normalizer handles marker-free source and refuses invalid input',()=>{
  assert.equal(normalizeScoVariant("const x='text';"),'const x="text";');
  assert.throws(()=>normalizeScoVariant(/** @type {any} */ (null)),/served JS string/);
});


test('host-locked SCO variants remain statically equivalent after source-only normalization',async()=>{
  const original="const privateToken='recoverable-client-string-1234567890';globalThis.out=privateToken;";
  const handler=createScoHandler([{path:'entry.js',sourceType:'script',code:original}],{
    routePrefix:'/obfs/',allowedHosts:['www.example.org']
  });
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected listening TCP server');
    /** @returns {Promise<{status:number,body:string}>} */
    function request() {
      return new Promise((resolve,reject)=>{
        http.get({
          host:'127.0.0.1',port:address.port,path:'/obfs/entry.js',
          headers:{Host:'www.example.org'}
        },response=>{
          const chunks=[];
          response.setEncoding('utf8');
          response.on('data',chunk=>chunks.push(chunk));
          response.on('end',()=>resolve({
            status:/** @type {number} */(response.statusCode),
            body:chunks.join('')
          }));
        }).on('error',reject);
      });
    }
    const results=await Promise.all(Array.from({length:4},request));
    assert.ok(results.every(({status})=>status===200));
    const variants=results.map(({body})=>body);
    assert.ok(new Set(variants).size>1,'A normal eligible source should still vary per request');
    const normalized=variants.map(body=>normalizeScoVariant(body,'script'));
    assert.equal(new Set(normalized).size,1,
      'Host guarding and string-escape randomization are normalized with no seed');
    for(const code of [...variants,normalized[0]]){
      const allowed={location:{hostname:'www.example.org'}};
      vm.runInNewContext(code,allowed,{timeout:1000});
      assert.equal(allowed.out,'recoverable-client-string-1234567890');
      const denied={location:{hostname:'elsewhere.example.org'}};
      assert.throws(()=>vm.runInNewContext(code,denied,{timeout:1000}),/Unauthorized execution host/);
      assert.equal(denied.out,undefined);
    }
    assert.ok(normalized[0].includes('"recoverable-client-string-1234567890"'));
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
