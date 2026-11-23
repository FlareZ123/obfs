'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');
const {cloneBitwiseBitSlice}=require('../sims/bitwise-bit-slice-clone');
const {cloneMod32Affine}=require('../sims/word-affine-functional-clone');

/**
 * A deliberately server-private two-method program. Both SCO and ordinary
 * protected service hold the same private implementations, the same
 * capability policy and the same public input/output schema. The attacker
 * sees only the authenticated HTTP endpoints and their JSON responses.
 * @param {number} seed
 * @returns {{bitwise:(x:number,y:number)=>number,
 *   affine:(x:number,y:number)=>number}}
 */
function makePrivateMethods(seed){
  const mask=(Math.imul(seed,0x9e3779b1)^0x55aa33cc)|0;
  const a=(Math.imul(seed,13)|1),b=(Math.imul(seed,17)|1);
  const constant=(Math.imul(seed,29)^0x56789abc)|0;
  return {
    bitwise:(x,y)=>(((x^y)&mask)^(x&~y))|0,
    affine:(x,y)=>(constant+Math.imul(a,x)+Math.imul(b,y))|0
  };
}

/**
 * Minimal conventional private-service control. Its implementation is held
 * on the server exactly like SCO's remoteMethods, and it authenticates the
 * same out-of-band header. This control deliberately does not obfuscate or
 * expose source, only replies to the same user-visible JSON schema.
 * @param {ReturnType<typeof makePrivateMethods>} methods
 * @param {Record<string,number>} counts
 * @returns {import('node:http').RequestListener}
 */
function conventionalHandler(methods,counts){
  return async(req,res)=>{
    if(req.url!=='/obfs/rpc'){
      res.writeHead(404);res.end();return;
    }
    if(req.headers['x-test-capability']!=='allowed'){
      res.writeHead(403);res.end(JSON.stringify({ok:false,error:'Forbidden'}));return;
    }
    try{
      /** @type {Buffer[]} */
      const chunks=[];
      for await(const chunk of req)chunks.push(chunk);
      /** @type {{method:string,args:number[]}} */
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!Object.hasOwn(methods,body.method)||!Array.isArray(body.args))
        throw Error('Invalid method');
      const fn=methods[/** @type {'bitwise'|'affine'} */(body.method)];
      counts[body.method]++;
      const value=fn(body.args[0],body.args[1]);
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({ok:true,value}));
    }catch(error){
      res.writeHead(400);res.end(JSON.stringify({ok:false,error:'Invalid request'}));
    }
  };
}

/**
 * @param {import('node:http').Server} server
 * @returns {Promise<number>}
 */
async function open(server){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Expected assigned TCP port');
  return address.port;
}

/** @param {import('node:http').Server} server @returns {Promise<void>} */
async function close(server){
  await new Promise((resolve,reject)=>server.close(error=>
    error?reject(error):resolve(undefined)));
}

/**
 * Invoke a single authorized public RPC, without reading private methods.
 * @param {number} port
 * @param {'bitwise'|'affine'} method
 * @param {number[]} args
 * @param {boolean} [authorized]
 * @returns {Promise<{status:number,value:number|null}>}
 */
async function rpc(port,method,args,authorized=true){
  const response=await fetch('http://127.0.0.1:'+port+'/obfs/rpc',{
    method:'POST',
    headers:{'content-type':'application/json',
      'x-test-capability':authorized?'allowed':'denied'},
    body:JSON.stringify({method,args})
  });
  /** @type {{ok:boolean,value?:number}} */
  const body=await response.json();
  return {status:response.status,value:body.ok?body.value??null:null};
}

/**
 * Gather precisely four chosen bitwise and three chosen modular-affine
 * observations, then build independent offline program functions with cached
 * samples. The interpolation tools NEVER receive the server implementation,
 * its math source, or a callback capable of additional hidden HTTP requests.
 *
 * @param {number} port
 * @returns {Promise<{bitwise:(x:number,y:number)=>number,
 *   affine:(x:number,y:number)=>number,queries:number}>}
 */
async function attack(port){
  const bitPoints=[[0,0],[-1,0],[0,-1],[-1,-1]];
  /** @type {Map<string,number>} */
  const bitObservations=new Map();
  let queries=0;
  for(const point of bitPoints){
    const answer=await rpc(port,'bitwise',point);
    assert.equal(answer.status,200);
    assert.notEqual(answer.value,null);
    bitObservations.set(point.join(','),/** @type {number} */(answer.value));
    queries++;
  }
  const affinePoints=[[0,0],[1,0],[0,1]];
  /** @type {Map<string,number>} */
  const affineObservations=new Map();
  for(const point of affinePoints){
    const answer=await rpc(port,'affine',point);
    assert.equal(answer.status,200);
    assert.notEqual(answer.value,null);
    affineObservations.set(point.join(','),/** @type {number} */(answer.value));
    queries++;
  }
  const bits=cloneBitwiseBitSlice((x,y)=>{
    const value=bitObservations.get([x,y].join(','));
    if(value===undefined)throw Error('Model requested an unobserved input');
    return value;
  },2);
  const arithmetic=cloneMod32Affine((x,y)=>{
    const value=affineObservations.get([x,y].join(','));
    if(value===undefined)throw Error('Model requested an unobserved input');
    return value;
  },2);
  assert.equal(bits.queries,4);
  assert.equal(arithmetic.queries,3);
  return {bitwise:bits.evaluate,affine:arithmetic.evaluate,queries};
}

/** @param {number} number @returns {number} */
function hash(number){
  let x=number|0;
  x^=x<<13;x^=x>>>17;x^=x<<5;
  return x|0;
}

test('actual authenticated SCO RPCs disclose 2 private low-arity functions in exactly 7 calls',{
  timeout:60000
},async()=>{
  for(const seed of [13,12345,0x12345678]){
    const privateMethods=makePrivateMethods(seed);
    /** @type {Record<string,number>} */
    const protectedCounts={bitwise:0,affine:0};
    /** @type {Record<string,number>} */
    const controlCounts={bitwise:0,affine:0};
    const sco=http.createServer(createScoHandler([
      {path:'client.js',sourceType:'script',code:'globalThis.publicReady=1;'}
    ],{
      remoteMethods:{
        bitwise:(x,y)=>{protectedCounts.bitwise++;return privateMethods.bitwise(x,y);},
        affine:(x,y)=>{protectedCounts.affine++;return privateMethods.affine(x,y);}
      },
      authorizeRpc:req=>req.headers['x-test-capability']==='allowed',
      authorizeOperation:(req,method,args)=>
        ['bitwise','affine'].includes(method)&&args.length===2&&
        args.every(x=>typeof x==='number'&&Number.isInteger(x)),
      publicPaths:['client.js']
    }));
    const conventional=http.createServer(conventionalHandler(privateMethods,controlCounts));
    const [scoPort,controlPort]=await Promise.all([open(sco),open(conventional)]);
    try{
      for(const port of [scoPort,controlPort]){
        const denied=await rpc(port,'bitwise',[0,0],false);
        assert.equal(denied.status,403,'Unauthenticated requests must stay denied');
        const leaked=await fetch('http://127.0.0.1:'+port+'/obfs/private.cjs',{
          headers:{'x-test-capability':'allowed'}
        });
        assert.notEqual(leaked.status,200,'Private source must not be served');
      }
      const protectedClone=await attack(scoPort);
      const controlClone=await attack(controlPort);
      assert.equal(protectedClone.queries,7);
      assert.equal(controlClone.queries,7);
      assert.deepEqual(protectedCounts,{bitwise:4,affine:3});
      assert.deepEqual(controlCounts,{bitwise:4,affine:3});
      for(let i=0;i<3000;i++){
        const x=hash(i*113+seed*7),y=hash(i*197+seed*13);
        assert.equal(protectedClone.bitwise(x,y),privateMethods.bitwise(x,y));
        assert.equal(controlClone.bitwise(x,y),privateMethods.bitwise(x,y));
        assert.equal(protectedClone.affine(x,y),privateMethods.affine(x,y));
        assert.equal(controlClone.affine(x,y),privateMethods.affine(x,y));
      }
      assert.deepEqual(protectedCounts,{bitwise:4,affine:3},
        'Held-out verification must not secretly consult the private RPC');
      assert.deepEqual(controlCounts,{bitwise:4,affine:3});
    }finally{
      await Promise.all([close(sco),close(conventional)]);
    }
  }
});
