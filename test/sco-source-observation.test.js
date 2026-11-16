'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const vm=require('node:vm');
const {createScoHandler}=require('../src');

/**
 * Fetch one generated SCO script from a real local HTTP server.
 * @param {string} source
 * @returns {Promise<string>}
 */
async function fetchVariant(source) {
  const handler=createScoHandler([
    {path:'entry.js',sourceType:'script',code:source}
  ]);
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('Expected TCP listener');
    const response=await fetch('http://127.0.0.1:'+addr.port+'/obfs/entry.js');
    assert.equal(response.status,200);
    return await response.text();
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/**
 * Evaluate a classic script with a fresh realm and compare plain JSON output.
 * @param {string} code
 * @returns {string}
 */
function run(code) {
  const context={};
  vm.runInNewContext(code,context,{timeout:1000});
  return JSON.stringify(context.out);
}

for(const [name,source] of [
  ['direct Function.toString',
    "function observed(){const text='source-observation-literal';return text;}globalThis.out={value:observed(),source:observed.toString()};"],
  ['String(function) source coercion',
    "function observed(){const text='source-observation-literal';return text;}globalThis.out={value:observed(),source:String(observed)};"],
  ['Function.prototype.toString.call',
    "function observed(){const text='source-observation-literal';return text;}globalThis.out={value:observed(),source:Function.prototype.toString.call(observed)};"],
  ['aliased prefix string coercion',
    "const prefix='';function observed(){const text='source-observation-literal';return text;}globalThis.out={value:observed(),source:prefix+observed};"],
  ['aliased String constructor coercion',
    "const Text=String;function observed(){const text='source-observation-literal';return text;}globalThis.out={value:observed(),source:Text(observed)};"],
  ['conditional Reflect.get source observer',
    "function observed(){const text='source-observation-literal';return text;}const key=true?'toString':'valueOf';globalThis.out={value:observed(),source:Reflect.get(observed,key)()};"],
  ['conditional descriptor source observer',
    "function observed(){const text='source-observation-literal';return text;}const key=true?'toString':'valueOf';const getter=Object.getOwnPropertyDescriptor(Function.prototype,key).value;globalThis.out={value:observed(),source:getter.call(observed)};"]
]) {
  test('SCO response preserves observable function source: '+name,async()=>{
    const variant=await fetchVariant(source);
    assert.equal(run(variant),run(source));
    assert.ok(variant.includes("'source-observation-literal'"),
      'Observed function source must retain original literal spelling');
  });
}

test('SCO still varies safe literal spelling when source is not observed',async()=>{
  const original="const value='source-observation-literal';globalThis.out=value;";
  const variant=await fetchVariant(original);
  assert.equal(run(variant),run(original));
  assert.equal(variant.includes("'source-observation-literal'"),false);
});
