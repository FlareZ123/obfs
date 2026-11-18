'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {startServer}=require('../examples/application-challenge/sco-server.cjs');
const {ROOT,EXPOSED}=require('../examples/application-challenge/sco-build.cjs');

/**
 * The generated SCO browser facade exchanges JSON values, which is narrower
 * than arbitrary returned JavaScript object identity and own-property shape.
 * Preserve a real native-vs-RPC negative control so a later correctness gate
 * cannot silently call JSON equality full JavaScript semantic equivalence.
 */
test('real SCO JSON RPC loses native own undefined value while preserving JSON-wire output',async()=>{
  const originalFetch=globalThis.fetch;
  const originalWindow=globalThis.window;
  const hosted=await startServer({token:'sco-json-shape-contract-token-2026'});
  try{
    const remoteUrl=hosted.origin;
    const bearer=hosted.token;
    globalThis.fetch=(input,init)=>{
      const headers=new Headers(init?.headers);
      headers.set('x-demo-token',bearer);
      return originalFetch(new URL(String(input),remoteUrl),{...init,headers});
    };
    const published=/** @type {{evaluateRemote:(seed:number,count:number)=>Promise<any>}} */(
      await import(pathToFileURL(path.join(ROOT,'sco-public',EXPOSED)).href));
    const native=await hosted.native(0x12345678,1);
    const received=await published.evaluateRemote(0x12345678,1);
    assert.equal(Object.hasOwn(native.missing,'value'),true,
      'Native private reflection must retain own undefined field');
    assert.equal(Object.hasOwn(received.missing,'value'),false,
      'The JSON RPC result cannot preserve that own undefined field');
    assert.deepEqual(Reflect.ownKeys(native.missing),[
      'keys','value','enumerable'
    ]);
    assert.deepEqual(Reflect.ownKeys(received.missing),['keys','enumerable']);
    assert.notDeepEqual(received,native,'Raw JS observation differs across RPC');
    assert.equal(JSON.stringify(received),JSON.stringify(native),
      'Declared JSON-wire output must remain equivalent');
  }finally{
    globalThis.fetch=originalFetch;
    await new Promise((resolve,reject)=>hosted.server.close(
      error=>error?reject(error):resolve(undefined)));
    if(originalWindow===undefined)Reflect.deleteProperty(globalThis,'window');
    else globalThis.window=originalWindow;
  }
});
