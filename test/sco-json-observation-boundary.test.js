'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {
  partitionScoAsyncModule,bindScoModuleExports,createScoHandler
}=require('../src');

/**
 * The SCO partition deliberately uses JSON-compatible method arguments and
 * results. This executable witness records where that transport contract
 * differs from full JavaScript observational equivalence. It must be retained
 * as a negative control when adding any future "lossless RPC" mode.
 */
test('real SCO generated facade loses shared references and non-JSON numeric values',async()=>{
  const source=[
    'export async function compare(a,b){',
    'return {same:a===b,negative:Object.is(a[0],-0),',
    'missing:a[1]===undefined,finite:a[2]===7};',
    '}',
    'export async function result(){return {finite:7,nan:NaN,negative:-0};}',
    'export async function echo(value){return value;}'
  ].join('\n');
  const original=await import('data:text/javascript;base64,'+
    Buffer.from(source).toString('base64'));
  const partition=partitionScoAsyncModule({
    path:'boundary.mjs',sourceType:'module',code:source
  },{seed:'sco-json-observation-boundary'});
  const server=http.createServer(createScoHandler([partition.clientFile],{
    publicPaths:['boundary.mjs'],
    remoteMethods:bindScoModuleExports(partition,original),
    authorizeRpc:()=>true
  }));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const originalFetch=globalThis.fetch;
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    const response=await originalFetch(root+'/obfs/boundary.mjs');
    assert.equal(response.status,200);
    const delivered=await response.text();
    assert.ok(!delivered.includes('negative:Object.is'));
    const client=await import('data:text/javascript;base64,'+
      Buffer.from(delivered).toString('base64'));
    globalThis.fetch=(input,options)=>
      originalFetch(new URL(String(input),root),options);

    const shared=[-0,undefined,7];
    const nativeShared=await original.compare(shared,shared);
    const remoteShared=await client.compare(shared,shared);
    assert.deepEqual(nativeShared,{
      same:true,negative:true,missing:true,finite:true
    });
    assert.deepEqual(remoteShared,{
      same:false,negative:false,missing:false,finite:true
    });

    const independent=[4,null,7];
    assert.deepEqual(await client.compare(independent,[4,null,7]),
      await original.compare(independent,[4,null,7]),
      'ordinary acyclic JSON values retain this method result');

    const nativeResult=await original.result();
    const remoteResult=await client.result();
    assert.equal(Number.isNaN(nativeResult.nan),true);
    assert.equal(Object.is(nativeResult.negative,-0),true);
    assert.deepEqual(remoteResult,{finite:7,nan:null,negative:0});
    // This ordinary JSON object has no cycle or shared internal reference.
    // Its JavaScript identity still cannot survive a remote pass-by-value call.
    const originalInput={label:'visible'};
    assert.strictEqual(await original.echo(originalInput),originalInput);
    const remoteEcho=await client.echo(originalInput);
    assert.deepEqual(remoteEcho,originalInput);
    assert.notStrictEqual(remoteEcho,originalInput);
    const cyclic={};
    cyclic.self=cyclic;
    assert.strictEqual(await original.echo(cyclic),cyclic);
    await assert.rejects(()=>client.echo(cyclic),/circular|cyclic/iu);
  }finally{
    globalThis.fetch=originalFetch;
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve()));
  }
});
