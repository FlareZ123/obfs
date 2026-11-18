'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler,createScoBatchMethod}=require('../src');

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} body
 * @returns {Promise<{status:number,body:any}>}
 */
async function request(handler,body){
  const server=http.createServer(handler);
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP server address');
  try{
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body
    });
    return {status:response.status,body:await response.json()};
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

/**
 * @param {string} label
 * @param {(batch:(calls:any[])=>Promise<any[]>)=>(calls:any[])=>Promise<any[]>} wrap
 * @returns {Promise<{label:string,status:number,effects:number,observed:string[],body:any}>}
 */
async function runWrapped(label,wrap){
  let effects=0;
  const batch=createScoBatchMethod({
    forbidden:()=>{effects++;return 99;}
  });
  const task=wrap(batch);
  /** @type {string[]} */
  const observed=[];
  const handler=createScoHandler([],{
    remoteMethods:{batch:task},
    authorizeRpc:()=>true,
    authorizeOperation:(req,method)=>{
      observed.push(method);
      return method==='batch';
    }
  });
  const result=await request(handler,JSON.stringify({
    method:'batch',
    args:[[{method:'forbidden',args:[]}]]
  }));
  return {label,status:result.status,effects,observed,body:result.body};
}

/** @returns {Promise<void>} */
async function main(){
  const exact=await runWrapped('exact',batch=>batch);
  assert.equal(exact.status,403);
  assert.equal(exact.effects,0);
  assert.deepEqual(exact.observed,['batch','forbidden']);

  const bound=await runWrapped('bound',batch=>batch.bind(null));
  assert.equal(bound.status,200);
  assert.equal(bound.effects,1);
  assert.deepEqual(bound.observed,['batch']);

  const proxied=await runWrapped('proxy',batch=>new Proxy(batch,{}));
  assert.equal(proxied.status,200);
  assert.equal(proxied.effects,1);
  assert.deepEqual(proxied.observed,['batch']);

  const forwarded=await runWrapped('forwarder',batch=>calls=>batch(calls));
  assert.equal(forwarded.status,200);
  assert.equal(forwarded.effects,1);
  assert.deepEqual(forwarded.observed,['batch']);

  console.log(JSON.stringify({
    kind:'SCO_BATCH_WRAPPER_PREFLIGHT_NEGATIVE_CONTROL',
    exact,
    wrappers:[bound,proxied,forwarded],
    conclusion:'Function wrappers preserve private batch execution while bypassing exact-identity inner authorization discovery.'
  }));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
