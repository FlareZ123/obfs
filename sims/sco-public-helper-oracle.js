'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');
const {inferPublicFacadeClone}=require('./sco-public-helper-attacker');

const ROOT=path.join(__dirname,'../examples/sco-public-helpers');
const TOKEN='legitimate-public-helper-attack-session';

/**
 * Start an authenticated SCO server with genuinely private source, then
 * call a separate public-client-only attacker and independently validate
 * the offline predictions on never-queried native inputs.
 * The attacker assumes an affine function of UTF-16 string length; success
 * applies to that simple model family and does not reveal the original key.
 *
 * @returns {Promise<{oracleQueries:number,heldOut:number,matched:number,
 *  deniedStatus:number,sourceWithheld:boolean,methodExposed:boolean,
 *  slope:number,intercept:number,privateExecutions:number}>}
 */
async function runOracleAttack(){
  const source=await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8');
  const partition=partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code:source},{
    seed:'sco-public-helpers-20261115-example',
    privateNames:['secret'],publicHelperNames:['normalizeInput','formatCount']
  });
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const methods=bindScoModuleExports(partition,original);
  let privateExecutions=0;
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const counted=Object.create(null);
  for(const [name,fn] of Object.entries(methods)){
    counted[name]=(...args)=>{privateExecutions++;return fn(...args);};
  }
  const server=http.createServer(createScoHandler([partition.clientFile],{
    remoteMethods:counted,
    authorizeRead:req=>req.headers['x-demo-session']===TOKEN,
    authorizeRpc:req=>req.headers['x-demo-session']===TOKEN,
    authorizeOperation:(req,method,args)=>req.headers['x-demo-session']===TOKEN&&
      method===partition.methodNames.secret&&args.length===1&&typeof args[0]==='string'
  }));
  try{
    /** @type {Promise<void>} */
    const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
    await listening;
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('No HTTP listener address');
    const origin='http://127.0.0.1:'+addr.port;
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.secret,args:['unauthorized']})
    });
    assert.equal(denied.status,403);
    const learned=await inferPublicFacadeClone(origin,TOKEN);
    const {clientCode,methodId,oracleQueries,slope,intercept,predict}=learned;
    const sourceWithheld=!/SCO_PUBLIC_HELPER_PRIVATE_CANARY|privateFold|PRIVATE_KEY/u.test(clientCode);
    assert.equal(sourceWithheld,true);
    assert.equal(methodId,partition.methodNames.secret);
    let matched=0;
    const heldOut=64;
    for(let i=0;i<heldOut;i++){
      const input='heldout-'+i+'-'+('Ω'.repeat(i%13))+'x'.repeat((i*i)%29);
      if(predict(input)===await original.secret(input))matched++;
    }
    assert.equal(matched,heldOut);
    assert.equal(privateExecutions,2,'The attacker must not query held-out values');
    return {oracleQueries,heldOut,matched,deniedStatus:denied.status,
      sourceWithheld,methodExposed:true,slope,intercept,privateExecutions};
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  runOracleAttack().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runOracleAttack};
