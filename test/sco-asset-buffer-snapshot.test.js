'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} name
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function getAsset(handler,name){
  const server=http.createServer(handler);
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+name);
    return {status:response.status,body:Buffer.from(await response.arrayBuffer())};
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));
  }
}

test('SCO takes a byte-exact owned snapshot of caller-managed asset Buffers',{
  timeout:15000
},async()=>{
  const original=Buffer.from('body{color:blue}/* reviewed static CSS */','utf8');
  const mutable=Buffer.from(original);
  const alias=mutable.subarray(0,mutable.length);
  const files=[{path:'style.css',sourceType:'asset',code:mutable}];
  const handler=createScoHandler(files,{publicPaths:['style.css']});
  // The caller's view changes after the source-map/source-file preflight.
  alias.fill(0x58);
  assert.notDeepEqual(mutable,original);
  const delivered=await getAsset(handler,'style.css');
  assert.equal(delivered.status,200);
  assert.deepEqual(delivered.body,original,
    'The HTTP handler must serve its validated private snapshot');
});

test('SCO snapshots each of multiple assets that share caller-owned Buffer storage',{
  timeout:15000
},async()=>{
  const source=Buffer.from('{"public":true}','utf8');
  const original=Buffer.from(source);
  const handler=createScoHandler([
    {path:'a.json',sourceType:'asset',code:source},
    {path:'b.json',sourceType:'asset',code:source}
  ],{publicPaths:['a.json','b.json']});
  source.fill(0x59);
  for(const name of ['a.json','b.json']){
    const response=await getAsset(handler,name);
    assert.equal(response.status,200);
    assert.deepEqual(response.body,original);
  }
});

test('SCO string asset source remains supported with a positive public allowlist',{
  timeout:15000
},async()=>{
  const handler=createScoHandler([{
    path:'style.css',sourceType:'asset',code:'body{display:block}'
  }],{publicPaths:['style.css']});
  const response=await getAsset(handler,'style.css');
  assert.equal(response.body.toString('utf8'),'body{display:block}');
});
