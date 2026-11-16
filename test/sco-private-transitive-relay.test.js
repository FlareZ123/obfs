'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {createHash,randomBytes}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,
  createScoHandler,verifyScoPrivateSourceDigests}=require('../src');

/** @param {import('node:http').Server} server @returns {Promise<number>} */
async function listen(server){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  return address.port;
}

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('source-audited three-file SCO still allows independent authorized online cloning',{
  timeout:120000
},async()=>{
  const keyName='OBFS_TRANSITIVE_HMAC_KEY_20261116';
  const previous=process.env[keyName];
  const realSource=[
    'import {deriveProof} from "./private/engine.mjs";',
    'export async function protectedDigest(value){return deriveProof(value);}',
    'export function local(value){return String(value).trim();}'
  ].join('\n');
  const engine={
    path:'private/engine.mjs',
    code:'import {hmac} from "./deep/leaf.mjs"; export function deriveProof(value){return hmac(value);}'
  };
  const leaf={
    path:'private/deep/leaf.mjs',
    code:[
      'import {createHmac} from "node:crypto";',
      'const key=process.env.'+keyName+';',
      'if(!key)throw Error("Server secret not configured");',
      'export function hmac(value){',
      '  let result=value;',
      '  for(let i=0;i<4000;i++)result=createHmac("sha256",key).update(result).digest("hex");',
      '  return result;',
      '}'
    ].join('\n')
  };
  const partition=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',code:realSource,sourceType:'module'
  },{
    seed:'sco-audited-transitive-relay-20261116',
    privateNames:['protectedDigest'],
    privateModuleImports:['./private/engine.mjs'],
    privateModuleSources:[engine,leaf]
  });
  assert.deepEqual(partition.clientFile.privateModulePaths,
    ['private/engine.mjs','private/deep/leaf.mjs']);
  assert.doesNotMatch(partition.clientFile.code,/createHmac|deriveProof|Server secret/u);
  const trustedRoot=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-trusted-'));
  const publicRoot=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-attacker-'));
  const nativeFetch=globalThis.fetch;
  const token='attacker-owned-legitimate-session';
  /** @type {import('node:http').Server|undefined} */
  let trusted;
  /** @type {import('node:child_process').ChildProcessWithoutNullStreams|undefined} */
  let attacker;
  try{
    await atomicWrite(path.join(trustedRoot,'mixed.mjs'),realSource);
    await atomicWrite(path.join(trustedRoot,engine.path),engine.code);
    await atomicWrite(path.join(trustedRoot,leaf.path),leaf.code);
    await atomicWrite(path.join(publicRoot,'public.mjs'),partition.clientFile.code);
    const attackerSource=[
      'import {createServer} from "node:http";',
      'import {pathToFileURL} from "node:url";',
      'const [origin,token,publicPath]=process.argv.slice(2);',
      'const realFetch=globalThis.fetch;',
      'globalThis.fetch=(url,options)=>realFetch(new URL(String(url),origin),{',
      '  ...options,headers:{...options?.headers,"x-owned-session":token}',
      '});',
      'const client=await import(pathToFileURL(publicPath).href);',
      'const proxy=createServer((req,res)=>{',
      '  void (async()=>{',
      '    if(req.method!=="POST"||req.url!=="/clone"){res.writeHead(404).end();return;}',
      '    let body="";',
      '    for await(const chunk of req){body+=chunk.toString();if(body.length>4096)throw Error("Large input");}',
      '    const data=JSON.parse(body);',
      '    if(typeof data.value!=="string"||data.value.length>128)throw Error("Bad input");',
      '    const value=await client.protectedDigest(data.value);',
      '    res.writeHead(200,{"content-type":"application/json"}).end(JSON.stringify({value}));',
      '  })().catch(()=>res.writeHead(400).end());',
      '});',
      'proxy.listen(0,"127.0.0.1",()=>{',
      '  const address=proxy.address();',
      '  process.stdout.write(JSON.stringify({port:address.port,hasPrivateKey:!!process.env.'+keyName+'})+"\\n");',
      '});'
    ].join('\n');
    await atomicWrite(path.join(publicRoot,'attacker.mjs'),attackerSource);
    process.env[keyName]=randomBytes(32).toString('hex');
    await verifyScoPrivateSourceDigests(partition,trustedRoot);
    const original=await import(pathToFileURL(path.join(trustedRoot,'mixed.mjs')).href);
    delete process.env[keyName];
    let servedCalls=0;
    const originals=bindScoModuleExports(partition,original);
    /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
    const methods=Object.create(null);
    for(const [method,fn] of Object.entries(originals)){
      methods[method]=(...args)=>{servedCalls++;return fn(...args);};
    }
    trusted=http.createServer(createScoHandler([partition.clientFile],{
      remoteMethods:methods,
      authorizeRead:req=>req.headers['x-owned-session']===token,
      authorizeRpc:req=>req.headers['x-owned-session']===token,
      authorizeOperation:(req,method,args)=>
        req.headers['x-owned-session']===token &&
        method===partition.methodNames.protectedDigest &&
        args.length===1&&typeof args[0]==='string'&&args[0].length<=128
    }));
    const origin='http://127.0.0.1:'+await listen(trusted);
    const unauthorized=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.protectedDigest,args:['test']})
    });
    assert.equal(unauthorized.status,403);
    for(const file of partition.clientFile.privateModulePaths){
      const response=await nativeFetch(origin+'/obfs/'+file,{
        headers:{'x-owned-session':token}
      });
      assert.equal(response.status,404,file+' must remain private');
    }
    const env={
      PATH:process.env.PATH??'',
      SystemRoot:process.env.SystemRoot??'',
      TEMP:process.env.TEMP??'',
      TMP:process.env.TMP??''
    };
    attacker=spawn(process.execPath,[
      path.join(publicRoot,'attacker.mjs'),origin,token,path.join(publicRoot,'public.mjs')
    ],{cwd:publicRoot,env,stdio:['ignore','pipe','pipe']});
    const child=attacker;
    /** @type {{port:number,hasPrivateKey:boolean}} */
    const ready=await new Promise((resolve,reject)=>{
      let stdout='';
      let stderr='';
      child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
      child.stdout.on('data',chunk=>{
        stdout+=chunk.toString();
        if(stdout.includes('\n'))resolve(JSON.parse(stdout.split('\n')[0]));
      });
      child.once('error',reject);
      child.once('exit',code=>reject(Error('Attacker child exited '+code+': '+stderr)));
    });
    assert.equal(ready.hasPrivateKey,false,'attacker process must have no HMAC secret');
    const cloneUrl='http://127.0.0.1:'+ready.port+'/clone';
    /** @param {string} value @returns {Promise<string>} */
    async function clone(value){
      const response=await nativeFetch(cloneUrl,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({value})
      });
      assert.equal(response.status,200);
      return (await response.json()).value;
    }
    let matched=0;
    for(let index=0;index<20;index++){
      const input=createHash('sha256').update('audited-heldout-'+index).digest('hex');
      if(await clone(input)===await original.protectedDigest(input))matched++;
    }
    assert.equal(matched,20,'A legitimate relay clones every held-out output');
    assert.equal(servedCalls,20,'Every clone must use the trusted server once');
    const payload='measurement-'+('x'.repeat(80));
    const expected=await original.protectedDigest(payload);
    /** @type {number[]} */
    const originalSamples=[];
    /** @type {number[]} */
    const cloneSamples=[];
    for(let index=0;index<8;index++){
      for(const mode of index%2?['original','clone']:['clone','original']){
        const start=performance.now();
        const output=mode==='original'?await original.protectedDigest(payload):
          await clone(payload);
        assert.equal(output,expected);
        (mode==='original'?originalSamples:cloneSamples).push(performance.now()-start);
      }
    }
    const nativeMedian=median(originalSamples);
    const relayMedian=median(cloneSamples);
    console.log(JSON.stringify({
      attackerProcessKeyPresent:ready.hasPrivateKey,
      privateStaticFiles:partition.clientFile.privateModulePaths.length,
      unauthorizedStatus:unauthorized.status,
      privateFileStatus:404,heldOut:20,matched,
      attackerRelayCalls:servedCalls,
      node:process.version,platform:process.platform,
      nativeMedianMs:Number(nativeMedian.toFixed(6)),
      relayMedianMs:Number(relayMedian.toFixed(6)),
      relayRatio:Number((relayMedian/nativeMedian).toFixed(6))
    }));
  }finally{
    if(previous===undefined)delete process.env[keyName];
    else process.env[keyName]=previous;
    if(attacker){
      const child=attacker;
      if(child.exitCode===null)child.kill();
    }
    if(trusted)await new Promise((resolve,reject)=>
      trusted.close(error=>error?reject(error):resolve()));
    await fs.rm(trustedRoot,{recursive:true,force:true});
    await fs.rm(publicRoot,{recursive:true,force:true});
  }
});
