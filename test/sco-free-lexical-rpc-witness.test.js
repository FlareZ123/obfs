'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {
  partitionScoSelectedAsyncExports,
  bindScoModuleExports,
  createScoHandler
}=require('../src');

/** @param {import('node:http').Server} server @returns {Promise<string>} */
async function listen(server){
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await ready;
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  /** @type {Promise<void>} */
  const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await ended;
}

test('selected SCO actual RPC cannot preserve an injected client-only free global',{
  timeout:30000
},async()=>{
  const expressions=[
    'externalBridge',
    'externalBridge?.value',
    'externalBridge.value ?? 0'
  ];
  const originally=Reflect.getOwnPropertyDescriptor(globalThis,'externalBridge');
  assert.equal(originally,undefined,
    'This regression requires a server realm without an externalBridge global');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-free-rpc-'));
  try{
    for(let index=0;index<expressions.length;index++){
      const expression=expressions[index];
      const source='export async function protectedOp(){return '+expression+';}'+
        'export function visible(){return 7;}';
      /** @type {{path:string,sourceType:'module',code:string}} */
      const file={path:'module'+index+'.mjs',sourceType:'module',code:source};
      const generated=partitionScoSelectedAsyncExports(file,{
        seed:'sco-free-rpc-'+index,privateNames:['protectedOp']
      });
      await atomicWrite(path.join(root,file.path),source);
      const original=await import(pathToFileURL(path.join(root,file.path)).href);
      // Node with an explicitly injected global stands in for the original
      // client realm. This controls global binding identity, not browser APIs.
      Object.defineProperty(globalThis,'externalBridge',{
        value:{value:41},configurable:true,writable:true
      });
      const clientValue=await original.protectedOp();
      assert.deepEqual(clientValue,index===0?{value:41}:41);
      Reflect.deleteProperty(globalThis,'externalBridge');
      await assert.rejects(original.protectedOp(),/externalBridge/u);
      const methods=bindScoModuleExports(generated,original);
      const server=http.createServer(createScoHandler([generated.clientFile],{
        remoteMethods:methods,
        authorizeRead:req=>req.headers['x-session']==='allow',
        authorizeRpc:req=>req.headers['x-session']==='allow',
        authorizeOperation:(req,method,args)=>
          req.headers['x-session']==='allow' &&
          method===generated.methodNames.protectedOp && args.length===0
      }));
      try{
        const origin=await listen(server);
        const response=await fetch(origin+'/obfs/rpc',{
          method:'POST',headers:{
            'content-type':'application/json',
            'x-session':'allow'
          },
          body:JSON.stringify({method:generated.methodNames.protectedOp,args:[]})
        });
        const payload=await response.json();
        console.log(JSON.stringify({
          expression,
          injectedClientValue:clientValue,
          serverStatus:response.status,
          serverResponse:payload
        }));
        assert.equal(response.status,500,
          'Accepted private RPC cannot access the client-only free global');
        assert.equal(payload.ok,false);
        assert.equal(original.visible(),7);
      }finally{
        await close(server);
      }
    }
  }finally{
    if(originally)Reflect.defineProperty(globalThis,'externalBridge',originally);
    else Reflect.deleteProperty(globalThis,'externalBridge');
    await fs.rm(root,{recursive:true,force:true});
  }
});
