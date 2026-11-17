'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {randomBytes,createHmac,createHash}=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const {partitionScoAsyncGraph,createScoGraphHandler}=require('../src/sco-graph');
const {createScoPrincipalRealmPool}=require('../sims/sco-principal-realm-worker');

const dir=path.join(__dirname,'fixtures','sco-principal-realm');
const entry=path.join(dir,'private-api.mjs');

/** @param {http.Server} server @returns {Promise<string>} */
async function listen(server){
  /** @type {Promise<void>} */
  const listening=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  await listening;
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Missing server address');
  return 'http://127.0.0.1:'+address.port;
}

/** @param {http.Server} server @returns {Promise<void>} */
async function close(server){
  /** @type {Promise<void>} */
  const done=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await done;
}

/** @param {string} root @param {string} principal @param {number} index
 *  @param {string} data @returns {string} */
function independentTag(root,principal,index,data){
  const key=createHmac('sha256',root).update(principal).digest();
  return createHmac('sha256',key).update(String(index)).update(data).digest('hex');
}

test('external public-only A process relays A but cannot consume B or read private root',async()=>{
  const root=randomBytes(32).toString('hex');
  const tokenA=randomBytes(24).toString('hex');
  const tokenB=randomBytes(24).toString('hex');
  const previousSecret=process.env.SCO_REALM_SECRET;
  process.env.SCO_REALM_SECRET=root;
  const api=fs.readFileSync(entry,'utf8');
  const dependency=fs.readFileSync(path.join(dir,'private-counter.mjs'),'utf8');
  const graph=partitionScoAsyncGraph([
    {path:'private-api.mjs',sourceType:'module',code:api},
    {path:'private-counter.mjs',sourceType:'module',code:dependency}
  ],{exposedPaths:['private-api.mjs'],seed:'external-A-public-only-repro-seed'});
  const pool=createScoPrincipalRealmPool(entry,['tick'],{maxPrincipals:2});
  await Promise.all([pool.initialize('A'),pool.initialize('B')]);
  const scope=new AsyncLocalStorage();
  /** @param {http.IncomingMessage} request @returns {string|null} */
  const principalOf=request=>{
    if(request.headers.cookie==='session='+tokenA)return 'A';
    if(request.headers.cookie==='session='+tokenB)return 'B';
    return null;
  };
  /** @type {(...args:unknown[])=>Promise<unknown>} */
  const tick=async(...args)=>pool.call(scope.getStore(),'tick',args);
  const handler=createScoGraphHandler(graph,{'private-api.mjs':{tick}},{
    authorizeRpc:request=>principalOf(request)!==null,
    runRpcIsolated:(request,execute)=>scope.run(principalOf(request),execute)
  });
  const server=http.createServer(handler);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sco-public-only-'));
  /** @type {import('node:child_process').ChildProcessWithoutNullStreams|undefined} */
  let attacker;
  try{
    const origin=await listen(server);
    const source=fs.readFileSync(path.resolve(__dirname,'../sims/sco-principal-realm-public-attacker.cjs'),'utf8');
    const env={...process.env};
    delete env.SCO_REALM_SECRET;
    delete env.SCO_REALM_PRINCIPAL;
    attacker=spawn(process.execPath,['-e',source,origin,tokenA],{
      cwd:temp,env,stdio:'pipe'
    });
    const running=attacker;
    let errorOutput='';
    running.stderr.on('data',chunk=>{errorOutput+=chunk.toString();});
    /** @type {Promise<{
     *   kind:string,method:string,servedSha256:string,unauthStatus:number,
     *   accountAResult:{sequence:number,tag:string},proxyPort:number,
     *   sawPrivateRoot:boolean
     * }>} */
    const ready=new Promise((resolve,reject)=>{
      let stdout='';
      running.stdout.on('data',chunk=>{
        stdout+=chunk.toString();
        const boundary=stdout.indexOf('\n');
        if(boundary>=0)resolve(JSON.parse(stdout.slice(0,boundary)));
      });
      running.once('error',reject);
      running.once('exit',code=>reject(new Error('Public attacker exited '+code+': '+errorOutput)));
    });
    const result=await ready;
    assert.equal(result.kind,'SCO-public-only-adversary-ready');
    assert.equal(result.sawPrivateRoot,false);
    assert.equal(result.unauthStatus,403);
    assert.equal(result.accountAResult.sequence,1);
    assert.equal(result.accountAResult.tag,independentTag(root,'A',1,'public-A-probe'));
    assert.equal(result.servedSha256,
      createHash('sha256').update(graph.clientFiles[0].code).digest('hex'));
    const proxied=await fetch('http://127.0.0.1:'+result.proxyPort+'/',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:result.method,args:[2,'attacker-relay',0]})
    });
    assert.equal(proxied.status,200);
    const relayed=await proxied.json();
    assert.equal(relayed.value.sequence,2);
    assert.equal(relayed.value.tag,independentTag(root,'A',2,'attacker-relay'));
    const bResponse=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json',cookie:'session='+tokenB},
      body:JSON.stringify({method:result.method,args:[1,'B-fresh-heldout',0]})
    });
    assert.equal(bResponse.status,200);
    const b=await bResponse.json();
    assert.equal(b.value.sequence,1);
    assert.equal(b.value.tag,independentTag(root,'B',1,'B-fresh-heldout'));
    assert.notEqual(b.value.tag,relayed.value.tag);
    console.log('Independent A public facade and relay '+JSON.stringify({
      sha256:result.servedSha256,unauthorized:result.unauthStatus,
      validASequence:result.accountAResult.sequence,relayedSequence:relayed.value.sequence,
      independentBSequence:b.value.sequence,privateSecretAbsentInChild:!result.sawPrivateRoot
    }));
  }finally{
    if(attacker?.exitCode===null){
      attacker.kill();
      /** @type {Promise<void>} */
      const exited=new Promise(resolve=>attacker?.once('exit',()=>resolve()));
      await exited;
    }
    if(server.listening)await close(server);
    await pool.close();
    fs.rmSync(temp,{recursive:true,force:true});
    if(previousSecret===undefined)delete process.env.SCO_REALM_SECRET;
    else process.env.SCO_REALM_SECRET=previousSecret;
  }
});
