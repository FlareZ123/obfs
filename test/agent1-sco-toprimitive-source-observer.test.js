'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createScoHandler}=require('../src');

/** @param {string} source @returns {Promise<string>} */
async function fetchVariant(source) {
  const handler=createScoHandler([{path:'entry.cjs',sourceType:'commonjs',code:source}]);
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
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

/** @param {string} code @returns {{value:unknown,source:string}} */
function observe(code) {
  /** @type {{captured:unknown,source:string|null}} */
  const observation={captured:null,source:null};
  const external=Function('observation',
    'return function external(){observation.captured=arguments.callee.caller.caller;'+
    'observation.source=observation.captured?Function.prototype.toString.call(observation.captured):null;}'
  )(observation);
  const toPrimitive=Function('external',
    'return function toPrimitive(hint){external();return 1;}'
  )(external);
  const value={[Symbol.toPrimitive]:toPrimitive};
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent1-sco-toprimitive-'));
  const filePath=path.join(directory,'entry.cjs');
  try {
    fs.writeFileSync(filePath,code,'utf8');
    const resolved=require.resolve(filePath);
    delete require.cache[resolved];
    const reader=/** @type {(value:unknown)=>unknown} */(require(filePath));
    const result=reader(value);
    assert.equal(typeof observation.captured,'function',
      'Symbol.toPrimitive must capture hidden()');
    const source=observation.source||Function.prototype.toString.call(observation.captured);
    return {value:result,source};
  } finally {
    try {delete require.cache[require.resolve(filePath)];} catch {}
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

const source=
  'const owner={secretField:1};'+
  'const other={unrelatedField:2};'+
  'function hidden(value,aux){const sum=value+1;return owner.secretField+sum;}'+
  'function plain(){return other.unrelatedField;}'+
  'function publicReader(value,aux){return hidden(value,aux)+plain();}'+
  'module.exports=publicReader;';

test('SCO CommonJS ToPrimitive hook preserves hidden() source',async()=>{
  const before=observe(source);
  assert.equal(before.value,5);
  const variant=await fetchVariant(source);
  const after=observe(variant);
  assert.equal(after.value,before.value);
  assert.ok(!variant.includes('unrelatedField'),
    'The unrelated plain() owner field is the positive rewrite-yield control: '+variant);
  assert.deepEqual(after,before,
    'A host Symbol.toPrimitive hook can capture hidden() source in the SCO client: '+
    JSON.stringify({before,after,variant}));
});
