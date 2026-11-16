'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createScoHandler}=require('../src');

/**
 * Transmit unmodified bytes rather than the string-encoding path in fetch.
 * @param {number} port
 * @param {Buffer[]} chunks
 * @returns {Promise<{status:number,payload:any}>}
 */
async function send(port,chunks){
  return new Promise((resolve,reject)=>{
    const request=http.request({
      host:'127.0.0.1',port,path:'/obfs/rpc',method:'POST',
      headers:{'content-type':'application/json'}
    },response=>{
      /** @type {Buffer[]} */
      const parts=[];
      response.on('data',chunk=>parts.push(Buffer.from(chunk)));
      response.on('error',reject);
      response.on('end',()=>{
        try{
          resolve({status:response.statusCode??0,
            payload:JSON.parse(Buffer.concat(parts).toString('utf8'))});
        }catch(error){reject(error);}
      });
    });
    request.on('error',reject);
    for(const chunk of chunks)request.write(chunk);
    request.end();
  });
}

test('SCO rejects invalid UTF-8 JSON octets without calling private RPC',async()=>{
  /** @type {string[]} */
  const effects=[];
  let coarseChecks=0;
  let operationChecks=0;
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{probe:/** @param {string} value */ value=>{
      effects.push(value);
      return value;
    }},
    authorizeRpc:()=>{coarseChecks++;return true;},
    authorizeOperation:()=>{operationChecks++;return true;}
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const port=address.port;
    const prefix=Buffer.from('{"method":"probe","args":["','utf8');
    const suffix=Buffer.from('"]}','utf8');
    for(const bytes of [
      Buffer.from([0xff]),
      Buffer.from([0xc0,0xaf]),
      Buffer.from([0xe2,0x82]),
      Buffer.from([0xed,0xa0,0x80])
    ]){
      const rejected=await send(port,[prefix,bytes,suffix]);
      assert.deepEqual(rejected,{status:400,payload:{ok:false,error:'Malformed JSON'}});
      assert.deepEqual(effects,[],'An invalid byte sequence cannot reach private code');
    }

    assert.equal(coarseChecks,4,'Non-isolated coarse auth still runs before bytes');
    assert.equal(operationChecks,0,'Invalid body cannot reach method-level auth');

    const validReplacement=await send(port,[
      Buffer.from(JSON.stringify({method:'probe',args:['\ufffd']}),'utf8')
    ]);
    assert.deepEqual(validReplacement,{status:200,payload:{ok:true,value:'\ufffd'}});
    assert.deepEqual(effects,['\ufffd']);
    const validSplit=await send(port,[
      prefix,Buffer.from([0xe2]),Buffer.from([0x82,0xac]),suffix
    ]);
    assert.deepEqual(validSplit,{status:200,payload:{ok:true,value:'€'}});
    assert.deepEqual(effects,['\ufffd','€']);
    assert.equal(coarseChecks,6);
    assert.equal(operationChecks,2);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('SCO checks isolated JSON bytes before entering policy or protected work',async()=>{
  let isolatedChecks=0;
  let coarseChecks=0;
  let operationChecks=0;
  let effects=0;
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{probe:()=>++effects},
    authorizeRpc:()=>{coarseChecks++;return true;},
    authorizeOperation:()=>{operationChecks++;return true;},
    runRpcIsolated:async(request,execute)=>{
      isolatedChecks++;
      await execute();
    }
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const port=address.port;
    const invalid=await send(port,[
      Buffer.from('{"method":"probe","args":["'),
      Buffer.from([0xff]),
      Buffer.from('"]}')
    ]);
    assert.deepEqual(invalid,{status:400,payload:{ok:false,error:'Malformed JSON'}});
    assert.equal(isolatedChecks,0,'Invalid body cannot occupy session-isolation scope');
    assert.equal(coarseChecks,0,'Isolated coarse auth occurs after body validation');
    assert.equal(operationChecks,0);
    assert.equal(effects,0);

    const accepted=await send(port,[
      Buffer.from(JSON.stringify({method:'probe',args:[]}))
    ]);
    assert.deepEqual(accepted,{status:200,payload:{ok:true,value:1}});
    assert.equal(isolatedChecks,1);
    assert.equal(coarseChecks,1);
    assert.equal(operationChecks,1);
    assert.equal(effects,1);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
