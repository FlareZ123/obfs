'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-public-helpers');
const TOKEN='legitimate-public-helper-attack-session';

/**
 * Two-query attacker: receives only the distributed client bytes and
 * authenticated RPC responses. The test harness owns the private source,
 * binds it on the trusted server, and evaluates held-out predictions.
 *
 * The attacker hypothesizes an affine function of string UTF-16 length.
 * Success is evidence only for this simple hidden function family; it
 * does not recover the server's literal secret and says nothing about a
 * cryptographic PRF or other unbounded private computation.
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
    const response=await fetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-demo-session':TOKEN}
    });
    assert.equal(response.status,200);
    const publicCode=await response.text();
    const sourceWithheld=!/SCO_PUBLIC_HELPER_PRIVATE_CANARY|privateFold|PRIVATE_KEY/u.test(publicCode);
    assert.equal(sourceWithheld,true);
    const method=publicCode.match(/"(m[0-9a-f]{24})",\[\.\.\.arguments\]/u)?.[1];
    if(!method)throw Error('Could not recover public RPC method ID');
    let oracleQueries=0;
    /** @param {string} value @returns {Promise<number>} */
    async function oracle(value){
      oracleQueries++;
      const result=await fetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-demo-session':TOKEN},
        body:JSON.stringify({method,args:[value]})
      });
      assert.equal(result.status,200);
      const payload=await result.json();
      assert.equal(payload.ok,true);
      assert.equal(typeof payload.value,'number');
      return payload.value;
    }
    const intercept=await oracle('');
    const slope=(await oracle('x'))-intercept;
    /** @param {string} input @returns {number} */
    const clone=input=>intercept+slope*input.length;
    let matched=0;
    const heldOut=64;
    for(let i=0;i<heldOut;i++){
      const input='heldout-'+i+'-'+('Ω'.repeat(i%13))+'x'.repeat((i*i)%29);
      if(clone(input)===await original.secret(input))matched++;
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
