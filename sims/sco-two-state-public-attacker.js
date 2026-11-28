'use strict';

const assert=require('node:assert/strict');
const readline=require('node:readline');
const {createPolicy,learnExpected,continuation}=
  require('./sco-two-state-optimal-network-policy');

/** @typedef {{kind:string,[key:string]:any}} ProcessMessage */

async function runAttacker(){
  /** @param {ProcessMessage} result */
  const reply=result=>{
    if(typeof process.send==='function')process.send(result);
    else process.stdout.write(JSON.stringify(result)+'\n');
  };
  /** @param {unknown} data */
  const onStart=async data=>{
    if(!data||typeof data!=='object')return;
    const typed=/** @type {ProcessMessage} */(data);
    if(typed.kind!=='start')return;
    const {scoOrigin,ordinaryOrigin,cookie}=typed;
    try{
      // In the Linux elevated test, demonstrate the public client cannot
      // signal the separately owned privileged server even given its PID.
      let signalPermissionDenied=false;
      if(typed.serverPid&&process.platform==='linux'){
        try{process.kill(typed.serverPid,0);}catch(error){
          signalPermissionDenied=/** @type {NodeJS.ErrnoException} */(error).code==='EPERM';
        }
      }
      const nativeFetch=globalThis.fetch;
      const [scoSourceReply,ordinarySourceReply]=await Promise.all([
        nativeFetch(scoOrigin+'/obfs/client.mjs'),
        nativeFetch(ordinaryOrigin+'/obfs/client.mjs')
      ]);
      assert.equal(scoSourceReply.status,200);
      assert.equal(ordinarySourceReply.status,200);
      for(const header of ['content-type','cache-control','x-content-type-options']){
        assert.equal(scoSourceReply.headers.get(header),
          ordinarySourceReply.headers.get(header));
      }
      const [scoSource,ordinarySource]=await Promise.all([
        scoSourceReply.text(),ordinarySourceReply.text()
      ]);
      assert.equal(scoSource.includes('privateTable'),false);
      assert.equal(ordinarySource.includes('privateTable'),false);
      const scoApi=await import('data:text/javascript;base64,'+
        Buffer.from(scoSource).toString('base64'));
      const ordinaryApi=await import('data:text/javascript;base64,'+
        Buffer.from(ordinarySource).toString('base64'));
      assert.equal('reset' in scoApi,false);
      assert.equal('reset' in ordinaryApi,false);
      /** @typedef {{path:string,method:string,body:string,headers:string,
       *   credentials:string,cache:string,responseStatus:number,responseBody:string,
       *   responseHeaders:string}} WireRecord */
      /** @type {{sco:WireRecord[],ordinary:WireRecord[]}} */
      const wires={sco:[],ordinary:[]};
      /** @param {string} origin @param {'sco'|'ordinary'} arm */
      const bindFetch=(origin,arm)=>{
        globalThis.fetch=/** @type {typeof fetch} */((input,init)=>{
          const target=new URL(String(input),origin);
          const record={path:target.pathname,method:String(init?.method),
            body:String(init?.body),headers:JSON.stringify(init?.headers),
            credentials:String(init?.credentials),cache:String(init?.cache),
            responseStatus:0,responseBody:'',responseHeaders:''};
          wires[arm].push(record);
          return nativeFetch(target,{...init,headers:{...init?.headers,cookie}})
            .then(async response=>{
              record.responseStatus=response.status;
              record.responseBody=await response.clone().text();
              record.responseHeaders=['content-type','cache-control',
                'x-content-type-options'].map(header=>response.headers.get(header)).join('|');
              return response;
            });
        });
      };
      const policy=createPolicy();
      assert.equal(policy.models.length,260);
      assert.equal(policy.beliefs.length,4429);
      assert.equal(policy.ranks[0],9);
      bindFetch(scoOrigin,'sco');
      const sco=await learnExpected(scoApi,policy);
      bindFetch(ordinaryOrigin,'ordinary');
      const ordinary=await learnExpected(ordinaryApi,policy);
      assert.deepEqual(ordinary.inputs,sco.inputs);
      assert.deepEqual(ordinary.outputs,sco.outputs);
      assert.ok(sco.queries<=9);
      const followup=[0,1,1,0,1,0,0,1,1,1,0,0,1,0,1,1];
      const scoClone=continuation(sco.clone,sco.currentState,followup);
      const ordinaryClone=continuation(ordinary.clone,ordinary.currentState,followup);
      assert.deepEqual(scoClone.outputs,ordinaryClone.outputs);
      /** @type {number[]} */
      const actualSco=[],actualOrdinary=[];
      for(const input of followup){
        bindFetch(scoOrigin,'sco');
        actualSco.push(await scoApi.step(input));
        bindFetch(ordinaryOrigin,'ordinary');
        actualOrdinary.push(await ordinaryApi.step(input));
      }
      assert.deepEqual(actualSco,scoClone.outputs);
      assert.deepEqual(actualOrdinary,ordinaryClone.outputs);
      globalThis.fetch=nativeFetch;
      // Compare every method, argument body, fetch option, and JSON reply.
      // Origins intentionally differ because each arm has independent state.
      try{assert.deepEqual(wires.sco,wires.ordinary);}catch(error){
        throw new Error('Wire transcript mismatch after semantic parity',{cause:error});
      }
      assert.equal(wires.sco.length,sco.queries+followup.length);
      reply({kind:'attacker-result',result:{sco,ordinary,followup,
        followupOutputs:actualSco,scoPublicBytes:Buffer.byteLength(scoSource),
        ordinaryPublicBytes:Buffer.byteLength(ordinarySource),
        attackerUid:process.getuid?.()??-1,
        attackerProcessPid:process.pid,signalPermissionDenied,
        wireCalls:wires.sco.length,wireMatched:true}});
    }catch(error){
      reply({kind:'attacker-error',message:String(error),
        stack:error instanceof Error?error.stack:''});
    }
  };
  process.on('message',onStart);
  if(typeof process.send!=='function'){
    // sudo strips Node's inherited IPC environment. Use newline-delimited
    // JSON on stdin/stdout only for this public-client subprocess.
    for await(const line of readline.createInterface({input:process.stdin})){
      try{void onStart(JSON.parse(line));}catch(error){
        reply({kind:'attacker-error',message:String(error)});
      }
    }
  }
}


if(require.main===module){
  runAttacker().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runAttacker};
