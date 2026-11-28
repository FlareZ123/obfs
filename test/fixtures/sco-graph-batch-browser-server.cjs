'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../../src');

/**
 * A dedicated trusted-server process for the Chromium budget diagnostic.
 * It deliberately does not load puppeteer, the browser/CDP driver, or a
 * compiler inside timed HTTP request windows. Only its own process CPU
 * between an RPC request and completed response enters rpcCpuMs.
 *
 * @typedef {{type:'start',root:string,app:string,ordinary:string}} Start
 */

/** @type {http.Server|undefined} */
let server;

/** @param {Start} options @returns {Promise<void>} */
async function start(options){
  const apiCode=await fs.readFile(path.join(options.root,'api.mjs'),'utf8');
  const secretCode=await fs.readFile(path.join(options.root,'secret.mjs'),'utf8');
  const graph=partitionScoAsyncGraph([
    {path:'api.mjs',code:apiCode,sourceType:'module'},
    {path:'secret.mjs',code:secretCode,sourceType:'module'}
  ],{
    seed:'agent31-browser-cdp-paired-20261128',
    exposedPaths:['api.mjs'],batchPaths:['api.mjs'],maxBatchCalls:8
  });
  const namespace=await import(pathToFileURL(path.join(options.root,'api.mjs')).href);
  const handler=createScoGraphHandler(graph,{'api.mjs':namespace},{
    authorizeRpc:()=>true,authorizeOperation:()=>true
  });
  const files=new Map([
    ['/native/api.mjs',apiCode],['/native/secret.mjs',secretCode],
    ['/ordinary/api.mjs',options.ordinary],['/app.mjs',options.app]
  ]);
  /** @type {number[]} */
  const rpcCpuMs=[];
  server=http.createServer((request,response)=>{
    const target=request.url??'/';
    if(target.startsWith('/obfs/')){
      if(target==='/obfs/rpc'&&request.method==='POST'){
        const before=process.cpuUsage();
        response.once('finish',()=>{
          const used=process.cpuUsage(before);
          rpcCpuMs.push((used.user+used.system)/1000);
        });
      }
      handler(request,response);
      return;
    }
    response.setHeader('cache-control','no-store');
    response.setHeader('content-security-policy',
      "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'");
    if(target==='/metrics'){
      response.writeHead(200,{'content-type':'application/json'})
        .end(JSON.stringify({rpcCpuMs}));
    }else if(target==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'})
        .end('<!doctype html><html><body><pre id="answer">ready</pre>'+
          '<script type="module" src="/app.mjs"></script></body></html>');
    }else{
      const code=files.get(target);
      if(code!==undefined)response.writeHead(200,
        {'content-type':'text/javascript; charset=utf-8'}).end(code);
      else response.writeHead(404).end();
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const socket=server.address();
  if(!socket||typeof socket==='string')throw new Error('Missing child server TCP socket');
  process.send?.({
    type:'ready',port:socket.port,
    methodId:graph.partitions['api.mjs'].methodNames.compute,
    batchMethod:graph.partitions['api.mjs'].batchMethod
  });
}

/** @param {unknown} message @returns {void} */
function onMessage(message){
  if(!message||typeof message!=='object')return;
  const request=/** @type {{type?:unknown}} */ (message);
  if(request.type==='start'){
    void start(/** @type {Start} */ (message)).catch(error=>{
      process.send?.({type:'error',error:String(error)});
      process.exitCode=1;
    });
  }else if(request.type==='stop'){
    if(!server){process.exitCode=0;return;}
    server.close(error=>{
      if(error)process.exitCode=1;
      else process.exitCode=0;
      process.disconnect?.();
    });
  }
}
process.on('message',onMessage);
