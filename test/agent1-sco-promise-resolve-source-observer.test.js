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

/** @param {string} code @returns {Promise<{value:unknown,source:string}>} */
async function observe(code) {
  /** @type {{captured:unknown,source:string|null,stackNames:string[]}} */
  const observation={captured:null,source:null,stackNames:[]};
  const external=Function('observation',
    'return function external(){'+
    'const ErrorCtor=Error;const previous=ErrorCtor.prepareStackTrace;'+
    'try{ErrorCtor.prepareStackTrace=(_error,sites)=>sites;'+
    'const sites=new Error().stack;'+
    'observation.stackNames=sites.map(site=>site.getFunctionName());'+
    'const frame=sites.find(site=>site.getFunctionName()==="hidden");'+
    'observation.captured=frame&&frame.getFunction();'+
    'observation.source=observation.captured?Function.prototype.toString.call(observation.captured):null;'+
    '}finally{ErrorCtor.prepareStackTrace=previous;}'+
    '}'
  )(observation);
  const getThen=Function('external',
    'return function getThen(){external();return resolve=>resolve();}'
  )(external);
  const thenable=Object.defineProperty({},'then',{configurable:true,get:getThen});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent1-sco-promise-'));
  const filePath=path.join(directory,'entry.cjs');
  try {
    fs.writeFileSync(filePath,code,'utf8');
    const resolved=require.resolve(filePath);
    delete require.cache[resolved];
    const reader=/** @type {(value:unknown)=>Promise<unknown>} */(require(filePath));
    const value=await reader(thenable);
    assert.equal(typeof observation.captured,'function',
      'PromiseResolve then getter must capture hidden(): '+JSON.stringify(observation.stackNames));
    const source=observation.source||Function.prototype.toString.call(observation.captured);
    return {value,source};
  } finally {
    try {delete require.cache[require.resolve(filePath)];} catch {}
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

const source=
  'const owner={secretField:1};'+
  'const other={unrelatedField:2};'+
  'async function hidden(value,aux){await value;return owner.secretField;}'+
  'function plain(){return other.unrelatedField;}'+
  'async function publicReader(value,aux){return await hidden(value,aux)+plain();}'+
  'module.exports=publicReader;';

test('SCO CommonJS PromiseResolve thenable getter preserves hidden() source',async()=>{
  const before=await observe(source);
  assert.equal(before.value,3);
  const variant=await fetchVariant(source);
  const after=await observe(variant);
  assert.equal(after.value,before.value);
  assert.ok(!variant.includes('unrelatedField'),
    'The unrelated plain() owner field is the positive rewrite-yield control: '+variant);
  assert.deepEqual(after,before,
    'A host thenable getter can capture hidden() source in the SCO client: '+
    JSON.stringify({before,after,variant}));
});
