'use strict';

// Standalone public-only SCO attacker. The runner passes only a public URL and
// one legitimate Account A cookie. This program imports no project modules,
// original ESM files, server keys, or private source commitments.
const http=require('node:http');
const {createHash}=require('node:crypto');

/** @returns {Promise<void>} */
async function main(){
  const origin=process.argv[1];
  const token=process.argv[2];
  if(!origin||!token||process.env.SCO_REALM_SECRET){
    throw new TypeError('Public attacker receives only endpoint and A credential');
  }
  const nativeFetch=global.fetch;
  const response=await nativeFetch(origin+'/obfs/private-api.mjs');
  if(response.status!==200)throw new Error('Public facade unavailable');
  const code=await response.text();
  const method=code.match(/"m[0-9a-f]{24}"/u)?.[0]?.slice(1,-1);
  if(!method)throw new Error('Public method ID not found in emitted source');
  const unauth=await nativeFetch(origin+'/obfs/rpc',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({method,args:[1,'unauth',0]})
  });
  if(unauth.status!==403)throw new Error('Unauthorized direct RPC was not denied');
  global.fetch=(target,options)=>nativeFetch(new URL(target instanceof Request?target.url:target,origin),{
    ...options,headers:{...options?.headers,cookie:'session='+token}
  });
  const api=await import('data:text/javascript,'+encodeURIComponent(code));
  const a1=await api.tick(1,'public-A-probe',0);
  const batchCalls=Array.from({length:16},(_,index)=>({
    name:'tick',args:[index+2,'oracle-A-'+index,0]
  }));
  /** @type {Array<{ok:boolean,value:{sequence:number,tag:string}}>} */
  const batchResults=await api.batch(batchCalls);
  if(batchResults.length!==16||batchResults.some(item=>item.ok!==true)){
    throw new Error('Authorized public oracle batch failed');
  }
  const proxy=http.createServer(async(request,reply)=>{
    let body='';
    for await(const chunk of request)body+=chunk.toString();
    const upstream=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json',cookie:'session='+token},
      body
    });
    reply.writeHead(upstream.status,{'content-type':'application/json'});
    reply.end(await upstream.text());
  });
  proxy.listen(0,'127.0.0.1',()=>{
    const address=proxy.address();
    if(!address||typeof address==='string')throw new Error('Attacker relay not listening');
    process.stdout.write(JSON.stringify({
      kind:'SCO-public-only-adversary-ready',
      method,servedSha256:createHash('sha256').update(code).digest('hex'),
      unauthStatus:unauth.status,accountAResult:a1,
      oracleBatch:batchResults.map(item=>item.value),proxyPort:address.port,
      sawPrivateRoot:Object.hasOwn(process.env,'SCO_REALM_SECRET')
    })+'\n');
  });
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
