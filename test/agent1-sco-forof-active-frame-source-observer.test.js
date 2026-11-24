'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const vm=require('node:vm');
const {createScoHandler}=require('../src');

/**
 * Fetch one server-generated SCO response from a real local HTTP handler.
 * @param {string} source
 * @returns {Promise<string>}
 */
async function fetchVariant(source) {
  const handler=createScoHandler([{path:'entry.cjs',sourceType:'commonjs',code:source}]);
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/entry.cjs');
    assert.equal(response.status,200);
    return await response.text();
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/**
 * Run a classic SCO response with a caller-controlled sloppy iterable.
 * @param {string} code
 * @returns {{value:unknown,source:string}}
 */
function observe(code) {
  /** @type {{captured:unknown}} */
  const observation={captured:null};
  const external=Function('observation',
    'return function external(){observation.captured=arguments.callee.caller.caller;}'
  )(observation);
  const iterable=Function('external',
    'return {'+
      '[Symbol.iterator]:function iterator(){return this;},'+
      'next:function next(){external();return {done:true};}'+
    '};'
  )(external);
  /** @type {{module:{exports:unknown},external:unknown,iterable:unknown}} */
  const context={module:{exports:null},external,iterable};
  vm.runInNewContext(code,context,{timeout:2500});
  assert.equal(typeof context.module.exports,'function');
  const reader=/** @type {(value:unknown)=>unknown} */(context.module.exports);
  const value=reader(iterable);
  assert.equal(typeof observation.captured,'function',
    'The host callback must capture hidden() through IteratorNext');
  return {value,source:Function.prototype.toString.call(observation.captured)};
}

const source=
  '(function(){'+
    'const owner={secretField:1};'+
    'const other={unrelatedField:2};'+
    'function hidden(iterable){for(const value of iterable){}return owner.secretField;}'+
    'function plain(){return other.unrelatedField;}'+
    'function publicReader(iterable){return hidden(iterable)+plain();}'+
    'module.exports=publicReader;'+
  '})();';

test('SCO response preserves a private callable observed through host IteratorNext',async()=>{
  const before=observe(source);
  assert.equal(before.value,3);
  const variant=await fetchVariant(source);
  const after=observe(variant);
  assert.equal(after.value,before.value,
    'The SCO response must preserve ordinary return-value behavior');
  assert.ok(!variant.includes('unrelatedField'),
    'The unrelated plain() owner field is the positive rewrite-yield control');
  assert.deepEqual(after,before,
    'A host-supplied iterator callback can capture hidden() source in the SCO client: '+
    JSON.stringify({before,after,variant}));
});
