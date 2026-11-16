'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');

const assets=[{path:'style.css',sourceType:'asset',code:'body{color:blue}'}];

/**
 * @param {import('node:http').RequestListener} handler
 * @param {(port:number)=>Promise<unknown>} work
 * @returns {Promise<unknown>}
 */
async function withHandler(handler,work){
  const server=http.createServer(handler);
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    return await work(address.port);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve()));
  }
}

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<{status:number,body:string}>}
 */
async function readAsset(port,host){
  return new Promise((resolve,reject)=>{
    http.get({
      hostname:'127.0.0.1',port,path:'/obfs/style.css',
      headers:{host}
    },response=>{
      /** @type {Buffer[]} */
      const chunks=[];
      response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
      response.on('end',()=>resolve({
        status:response.statusCode??0,
        body:Buffer.concat(chunks).toString('utf8')
      }));
      response.on('error',reject);
    }).on('error',reject);
  });
}

/**
 * @param {number} port
 * @param {string} method
 * @returns {Promise<{status:number,payload:any}>}
 */
async function requestRpc(port,method){
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args:[]})
  });
  return {status:response.status,payload:await response.json()};
}

test('SCO host and source-read policy cannot be changed through caller options after setup',{
  timeout:15000
},async()=>{
  const hosts=['approved.example'];
  let denialCount=0;
  const options={
    allowedHosts:hosts,
    publicPaths:['style.css'],
    authorizeRead:()=>{denialCount++;return false;}
  };
  const handler=createScoHandler(assets,options);
  // Holders of the caller's config must not silently disable the access
  // controls already reviewed when this handler instance was constructed.
  hosts[0]='evil.example';
  options.allowedHosts=['evil.example'];
  options.authorizeRead=()=>true;
  await withHandler(handler,async port=>{
    const validHost=await readAsset(port,'approved.example');
    assert.equal(validHost.status,403);
    assert.equal(validHost.body,'');
    const deniedHost=await readAsset(port,'evil.example');
    assert.equal(deniedHost.status,403);
    assert.equal(deniedHost.body,'');
  });
  assert.equal(denialCount,1,'The original callback remained installed');
});

test('SCO preserves frozen remote method registry and authorization callbacks',{
  timeout:15000
},async()=>{
  /** @type {Record<string,()=>number>} */
  const registry={
    // Existing SCO dispatch invokes each operation with its registry as
    // receiver. Copying function references to a new object changes `this`;
    // the snapshot must retain the original receiver identity.
    value(){return this===registry?17:9999;}
  };
  const options={
    publicPaths:['style.css'],
    remoteMethods:registry,
    authorizeRpc:()=>true,
    authorizeOperation:/** @type {(request:import('node:http').IncomingMessage,method:string,args:unknown[])=>boolean} */
      ((request,method)=>method==='value')
  };
  const handler=createScoHandler(assets,options);
  registry.value=()=>999;
  registry.injected=()=>999;
  options.remoteMethods={value:()=>12345,other:()=>12345};
  options.authorizeRpc=()=>false;
  options.authorizeOperation=()=>true;
  await withHandler(handler,async port=>{
    assert.deepEqual(await requestRpc(port,'value'),{
      status:200,payload:{ok:true,value:17}
    });
    const injected=await requestRpc(port,'injected');
    assert.equal(injected.status,400);
    const other=await requestRpc(port,'other');
    assert.equal(other.status,400);
  });
});

test('SCO still uses live state inside captured authorization function',{
  timeout:15000
},async()=>{
  let authorized=false;
  const options={
    publicPaths:['style.css'],
    authorizeRead:()=>authorized
  };
  const handler=createScoHandler(assets,options);
  await withHandler(handler,async port=>{
    assert.equal((await readAsset(port,'localhost')).status,403);
    authorized=true;
    const response=await readAsset(port,'localhost');
    assert.equal(response.status,200);
    assert.equal(response.body,'body{color:blue}');
  });
});
