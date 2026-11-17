'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {
  partitionScoSelectedGraph,createScoSelectedGraphHandler
}=require('../src');
const {createPublicOnlyRelay}=require('./sco-selected-graph-attacker');

/** @param {import('node:http').Server} server @returns {Promise<string>} */
async function listen(server){
  /** @type {Promise<void>} */
  const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await ready;
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Unexpected local server address');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  /** @type {Promise<void>} */
  const ended=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await ended;
}

/**
 * Genuine public-only authorized attacker against the new two-facade SCO
 * deployment. Keys and original modules live exclusively in the defender's
 * harness. The isolated attacker implementation receives only two HTTP
 * module URLs, an origin and a legitimate request credential.
 *
 * @returns {Promise<{heldOut:number,matched:number,protectedMethods:number,originalSourceDigests:string[],distributedSourceDigests:string[],originalBytes:number,distributedBytes:number,privateKeyLeak:boolean,unauthorizedStatus:number,privateSourceStatus:number}>}
 */
async function runRelay(){
  const targets=['alpha.mjs','beta.mjs'];
  const keys=targets.map(()=>randomBytes(32).toString('hex'));
  const sources=targets.map((name,index)=>[
    'import {createHmac} from "node:crypto";',
    'const PRIVATE_CANARY_'+index+'="'+keys[index]+'";',
    'export async function secret(value){',
    '  return createHmac("sha256",PRIVATE_CANARY_'+index+').update(value).digest("hex");',
    '}',
    'export function local(value){return value.length;}',
    'export async function combined(value){return (await secret(value))+":"+local(value);}'
  ].join('\n'));
  const graph=partitionScoSelectedGraph(targets.map((name,index)=>({
    file:{path:name,code:sources[index],sourceType:/** @type {'module'} */ ('module')},
    options:{
      seed:'selected-graph-public-attacker-20261117',
      privateNames:['secret'],allowServerImports:true
    }
  })));
  /** @type {Record<string,Record<string,unknown>>} */
  const original=Object.create(null);
  for(let i=0;i<targets.length;i++){
    original[targets[i]]=await import('data:text/javascript,'+
      encodeURIComponent(sources[i]));
  }

  const token=randomBytes(24).toString('hex');
  const methods=new Set(targets.map(name=>graph.partitions[name].methodNames.secret));
  /** @type {import('node:http').Server|undefined} */
  let defender;
  /** @type {import('node:http').Server|undefined} */
  let attacker;
  try{
    defender=http.createServer(createScoSelectedGraphHandler(graph,original,{
      authorizeRead:req=>req.headers['x-test-session']===token,
      authorizeRpc:req=>req.headers['x-test-session']===token,
      authorizeOperation:(req,method,args)=>
        req.headers['x-test-session']===token&&methods.has(method)&&
        args.length===1&&typeof args[0]==='string'&&args[0].length<=2048
    }));
    const origin=await listen(defender);
    const denial=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:[...methods][0],args:['unauthorized']})
    });
    assert.equal(denial.status,403);
    const privateRequest=await fetch(origin+'/obfs/private/key.mjs',{
      headers:{'x-test-session':token}
    });
    assert.equal(privateRequest.status,404);

    // Keep the public-only attacker behind a separate module boundary.
    const relay=await createPublicOnlyRelay({origin,publicPaths:targets,token});
    attacker=relay.server;
    const attackOrigin=await listen(attacker);
    let privateKeyLeak=false;
    let distributedBytes=0;
    for(const name of targets){
      const code=relay.sources[name];
      distributedBytes+=Buffer.byteLength(code,'utf8');
      if(code.includes('PRIVATE_CANARY_')||code.includes('createHmac')||
        keys.some(key=>code.includes(key)))privateKeyLeak=true;
    }
    assert.equal(privateKeyLeak,false);
    assert.equal(Object.keys(relay.routes).length,2);
    let matched=0;
    for(let i=0;i<32;i++){
      for(const name of targets){
        const value='held-out-'+name+'-'+i+'-'+randomBytes(24).toString('hex');
        const response=await fetch(attackOrigin+'/clone',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({name,value})
        });
        assert.equal(response.status,200);
        const cloned=await response.json();
        const task=/** @type {(v:string)=>Promise<string>} */ (original[name].secret);
        const expected=await task(value);
        if(cloned.value===expected)matched++;
      }
    }
    assert.equal(matched,64,'Legitimate public-only attacker can relay every held-out output');
    return {
      heldOut:64,matched,protectedMethods:methods.size,
      originalSourceDigests:sources.map(value=>createHash('sha256').update(value).digest('hex')),
      distributedSourceDigests:targets.map(name=>
        createHash('sha256').update(relay.sources[name]).digest('hex')),
      originalBytes:sources.reduce((sum,value)=>sum+Buffer.byteLength(value,'utf8'),0),
      distributedBytes,privateKeyLeak,
      unauthorizedStatus:denial.status,privateSourceStatus:privateRequest.status
    };
  }finally{
    if(attacker)await close(attacker);
    if(defender)await close(defender);
  }
}

if(require.main===module){
  runRelay().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runRelay};
