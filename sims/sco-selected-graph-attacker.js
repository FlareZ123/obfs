'use strict';

const http=require('node:http');

/** @typedef {{method:string,endpoint:string}} PublicRpcRoute */
/**
 * Recover one selected async export's public RPC identity and endpoint
 * using only the compiler's distributed source, without importing compiler
 * modules or the server's original code. This deliberately supports the
 * one-private-export fixture below and makes no general deobfuscation claim.
 *
 * @param {string} publicCode
 * @returns {PublicRpcRoute}
 */
function recoverSingleRpc(publicCode){
  const ids=[...new Set(publicCode.match(/\bm[0-9a-f]{24}\b/gu)??[])];
  const match=publicCode.match(/\bfetch\(("(?:\\.|[^"\\])*")\s*,/u);
  if(ids.length!==1||!match){
    throw new TypeError('Unexpected public RPC facade grammar');
  }
  const endpoint=JSON.parse(match[1]);
  if(typeof endpoint!=='string'||!endpoint.startsWith('/')){
    throw new TypeError('Invalid public RPC endpoint');
  }
  return {method:ids[0],endpoint};
}

/**
 * Build a real attacker-operated HTTP relay using only two public module
 * paths, the target URL and an already legitimate target session. The attacker
 * needs none of the private source, method-registry state or HMAC keys.
 *
 * @param {{origin:string,publicPaths:string[],token:string}} context
 * @returns {Promise<{server:import('node:http').Server,routes:Record<string,PublicRpcRoute>,sources:Record<string,string>}>}
 */
async function createPublicOnlyRelay(context){
  /** @type {Record<string,PublicRpcRoute>} */
  const routes=Object.create(null);
  /** @type {Record<string,string>} */
  const sources=Object.create(null);
  for(const name of context.publicPaths){
    const result=await fetch(context.origin+'/obfs/'+name,{
      headers:{'x-test-session':context.token}
    });
    if(!result.ok)throw new Error('Attacker could not retrieve advertised facade');
    const publicCode=await result.text();
    sources[name]=publicCode;
    routes[name]=recoverSingleRpc(publicCode);
  }
  const server=http.createServer((request,response)=>{
    void(async()=>{
      if(request.method!=='POST'||request.url!=='/clone'){
        response.writeHead(404).end();
        return;
      }
      let raw='';
      for await(const chunk of request){
        raw+=String(chunk);
        if(raw.length>8192)throw new TypeError('Clone request too large');
      }
      const parsed=JSON.parse(raw);
      if(!parsed||typeof parsed.name!=='string'||
         !Object.hasOwn(routes,parsed.name)||
         typeof parsed.value!=='string'||parsed.value.length>2048){
        throw new TypeError('Unsupported clone request');
      }
      const {method,endpoint}=routes[parsed.name];
      const target=await fetch(context.origin+endpoint,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-test-session':context.token
        },
        body:JSON.stringify({method,args:[parsed.value]})
      });
      const reply=await target.json();
      if(!target.ok||!reply||reply.ok!==true){
        response.writeHead(502).end();
        return;
      }
      response.writeHead(200,{'content-type':'application/json'});
      response.end(JSON.stringify({value:reply.value}));
    })().catch(()=>{
      if(!response.headersSent)response.writeHead(400);
      response.end();
    });
  });
  return {server,routes,sources};
}

module.exports={recoverSingleRpc,createPublicOnlyRelay};
