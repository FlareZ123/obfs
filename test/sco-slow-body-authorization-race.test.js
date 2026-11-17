'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {createScoHandler}=require('../src');

/** @returns {{promise:Promise<void>,resolve:()=>void}} */
function latch(){
  /** @type {()=>void} */
  let resolve=()=>{};
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}

/**
 * A local authenticated client controls upload pacing. Unlike an ordinary
 * Promise-based fixture, the request truly remains half-uploaded while a
 * stateful server credential is revoked. This demonstrates that the current
 * optional isolation integration changes when coarse authorization is read.
 *
 * @param {boolean} isolated
 * @returns {Promise<{status:number,body:unknown,privateRuns:number,checks:boolean[]}>}
 */
async function scenario(isolated){
  const arrived=latch();
  const checked=latch();
  let active=true;
  let privateRuns=0;
  /** @type {boolean[]} */
  const checks=[];
  const handler=createScoHandler([],{
    remoteMethods:{value:()=>{privateRuns++;return 'private-value';}},
    authorizeRpc:()=>{
      checks.push(active);
      checked.resolve();
      return active;
    },
    ...(isolated?{
      runRpcIsolated:async(_request,execute)=>{await execute();}
    }:{})
  });
  const server=http.createServer((request,response)=>{
    arrived.resolve();
    handler(request,response);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  /** @type {import('node:http').ClientRequest|undefined} */
  let request;
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const result=new Promise((resolve,reject)=>{
      request=http.request({
        hostname:'127.0.0.1',port:address.port,
        path:'/obfs/rpc',method:'POST',
        headers:{'content-type':'application/json'}
      },async response=>{
        try{
          let body='';
          for await(const chunk of response)body+=chunk.toString('utf8');
          resolve({status:response.statusCode??0,body:JSON.parse(body)});
        }catch(error){reject(error);}
      });
      request.on('error',reject);
      request.write('{"method":"value","args":');
    });
    await arrived.promise;
    if(!isolated)await checked.promise;
    // For ordinary requests the coarse gate has already authorized, but
    // the JSON body has yet to finish. Isolation defers this gate until after
    // the full body and therefore observes the revoked state.
    active=false;
    assert.ok(request);
    request.end('[]}');
    const response=/** @type {{status:number,body:unknown}} */ (await result);
    return {...response,privateRuns,checks};
  }finally{
    request?.destroy();
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve()));
  }
}

test('SCO ordinary RPC admission is a request-start snapshot during slow upload',{
  timeout:10000
},async()=>{
  const observed=await scenario(false);
  assert.deepEqual(observed,{
    status:200,body:{ok:true,value:'private-value'},privateRuns:1,checks:[true]
  });
});

test('SCO isolation shifts coarse authorization to after complete request parsing',{
  timeout:10000
},async()=>{
  const observed=await scenario(true);
  assert.deepEqual(observed,{
    status:403,body:{ok:false,error:'Forbidden'},privateRuns:0,checks:[false]
  });
});

module.exports={scenario};
