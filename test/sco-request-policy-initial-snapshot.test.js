'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {createScoHandler}=require('../src');

const assets=[{path:'public.css',sourceType:'asset',code:'SAFE_PUBLIC_ASSET'}];

/**
 * @param {import('node:http').RequestListener} handler
 * @param {(port:number)=>Promise<void>} work
 * @returns {Promise<void>}
 */
async function withHandler(handler,work){
  const server=http.createServer(handler);
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    await work(address.port);
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
    http.get({hostname:'127.0.0.1',port,path:'/obfs/public.css',
      headers:{host}},response=>{
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
 * @returns {Promise<{status:number,payload:unknown}>}
 */
async function requestRpc(port,method){
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args:[]})
  });
  return {status:response.status,payload:await response.json()};
}

test('SCO fixes the first configured RPC authorization callback at handler creation',{
  timeout:10000
},async()=>{
  let reads=0;
  const options={
    remoteMethods:{value(){return 41;}},
    get authorizeRpc(){
      reads++;
      return reads===1?()=>false:()=>true;
    }
  };
  const handler=createScoHandler(assets,options);
  await withHandler(handler,async port=>{
    assert.equal((await requestRpc(port,'value')).status,403);
  });
  assert.equal(reads,1);
});

test('SCO never exposes a method introduced by a later remoteMethods getter',{
  timeout:10000
},async()=>{
  let reads=0;
  const options={
    get remoteMethods(){
      reads++;
      return reads===1?{publicValue(){return 11;}}:{
        publicValue(){return 11;},privateValue(){return 'PRIVATE_METHOD_CANARY';}
      };
    },
    authorizeRpc:()=>true
  };
  const handler=createScoHandler(assets,options);
  await withHandler(handler,async port=>{
    assert.equal((await requestRpc(port,'privateValue')).status,400);
    assert.deepEqual(await requestRpc(port,'publicValue'),{
      status:200,payload:{ok:true,value:11}
    });
  });
  assert.equal(reads,1);
});

test('SCO fixes the initial source-read authorization callback',{
  timeout:10000
},async()=>{
  let reads=0;
  const options={
    get authorizeRead(){
      reads++;
      return reads===1?()=>false:()=>true;
    }
  };
  const handler=createScoHandler(assets,options);
  await withHandler(handler,async port=>{
    assert.equal((await readAsset(port,'localhost')).status,403);
  });
  assert.equal(reads,1);
});

test('SCO keeps the first configured Host routing list and ignores later expansion',{
  timeout:10000
},async()=>{
  let reads=0;
  const options={
    get allowedHosts(){
      reads++;
      return reads===1?['approved.example']:
        ['approved.example','unapproved.example'];
    }
  };
  const handler=createScoHandler(assets,options);
  await withHandler(handler,async port=>{
    assert.equal((await readAsset(port,'unapproved.example')).status,403);
    assert.equal((await readAsset(port,'approved.example')).status,200);
  });
  assert.equal(reads,1);
});

test('SCO uses first configured RPC byte cap even when getter later expands it',{
  timeout:10000
},async()=>{
  let reads=0;
  const options={
    remoteMethods:{value(){return 7;}},
    authorizeRpc:()=>true,
    get maxRpcBytes(){
      reads++;
      return reads===1?1:65536;
    }
  };
  const handler=createScoHandler(assets,options);
  await withHandler(handler,async port=>{
    assert.equal((await requestRpc(port,'value')).status,413);
  });
  assert.equal(reads,1);
});

test('SCO reads the compiler closedWorld option once on construction',()=>{
  let reads=0;
  const options={
    get closedWorld(){
      reads++;
      return reads===1?false:true;
    }
  };
  assert.doesNotThrow(()=>createScoHandler(assets,options));
  assert.equal(reads,1);
});
