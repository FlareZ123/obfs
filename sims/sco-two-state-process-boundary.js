'use strict';

const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const http=require('node:http');
const {createPolicy,learn,continuation,equivalent}=
  require('./sco-two-state-optimal-network-policy');

/** @typedef {import('./sco-two-state-optimal-network-policy').Machine} Machine */
/** @typedef {{input:number,output:number}} Event */

/** @param {http.Server} server @returns {Promise<string>} */
async function listen(server){
  /** @type {Promise<void>} */
  const listening=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve());
  });
  await listening;
  const address=server.address();
  assert.ok(address&&typeof address==='object');
  return 'http://127.0.0.1:'+address.port;
}

/**
 * The trusted server process generates its actual transition table only in
 * private process memory. It never writes source or the table to a shared
 * file or exposes either via HTTP. A private IPC snapshot goes to the test
 * evaluator only after the attacker process has terminated.
 * @returns {Promise<void>}
 */
async function runServer(){
  const {transform}=require('esbuild');
  const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
  const material=randomBytes(4);
  /** @type {Machine} */
  const machine={next:[[0,0],[0,0]],output:[[0,0],[0,0]]};
  for(let state=0;state<2;state++)for(let input=0;input<2;input++){
    const choice=material[state*2+input]&3;
    machine.next[state][input]=choice>>1;
    machine.output[state][input]=choice&1;
  }
  const canary='private-'+randomBytes(24).toString('hex');
  const cookie='session='+randomBytes(24).toString('hex');
  let scoState=0,ordinaryState=0;
  /** @type {Event[]} */
  const scoTrace=[];
  /** @type {Event[]} */
  const ordinaryTrace=[];
  const privateCode=[
    'const privateTable='+JSON.stringify(machine)+';',
    'const privateCanary='+JSON.stringify(canary)+';',
    'let current=0;',
    'export async function step(symbol){',
    'if(!Number.isInteger(symbol)||symbol<0||symbol>1)throw TypeError("symbol");',
    'const previous=current;',
    'current=privateTable.next[previous][symbol];',
    'return privateTable.output[previous][symbol];',
    '}'
  ].join('\n');
  const privateNamespace=await import('data:text/javascript;base64,'+
    Buffer.from(privateCode).toString('base64'));
  const partition=partitionScoAsyncModule({path:'client.mjs',sourceType:'module',code:privateCode},
    {seed:'two-state-process-'+randomBytes(16).toString('hex'),serverOnlyInitialization:true});
  assert.deepEqual(partition.names,['step']);
  const bound=bindScoModuleExports(partition,privateNamespace);
  const targetMethod=partition.methodNames.step;
  // Wrap the trusted method for independent call trace capture; public code
  // still sees only the handler's JSON operation and its result.
  const methods={...bound,[targetMethod]:async(/** @type {number} */ symbol)=>{
    const output=await bound[targetMethod](symbol);
    const previous=scoState;
    scoState=machine.next[previous][symbol];
    assert.equal(output,machine.output[previous][symbol]);
    scoTrace.push({input:symbol,output});
    return output;
  }};
  const scoServer=http.createServer(createScoHandler([partition.clientFile],{
    remoteMethods:methods,
    authorizeRpc:(/** @type {http.IncomingMessage} */ request)=>request.headers.cookie===cookie,
    authorizeOperation:(/** @type {http.IncomingMessage} */ request,
      /** @type {string} */ method,/** @type {unknown[]} */ args)=>
      request.headers.cookie===cookie&&method===targetMethod&&
      args.length===1&&(args[0]===0||args[0]===1)
  }));
  const plainSource=[
    'export async function step(symbol){',
    'const response=await fetch("/step",{method:"POST",credentials:"same-origin",',
    'cache:"no-store",headers:{"content-type":"application/json"},',
    'body:JSON.stringify({symbol})});',
    'if(!response.ok)throw new Error("Denied "+response.status);',
    'return (await response.json()).value;',
    '}'
  ].join('');
  const plainClient=(await transform(plainSource,{format:'esm',minify:true})).code;
  const ordinaryServer=http.createServer((request,response)=>{
    if(request.method==='GET'&&request.url==='/client.mjs'){
      response.writeHead(200,{'content-type':'text/javascript'});
      response.end(plainClient);return;
    }
    if(request.method!=='POST'||request.url!=='/step'){
      response.writeHead(404);response.end();return;
    }
    if(request.headers.cookie!==cookie){
      response.writeHead(403);response.end();return;
    }
    /** @type {Buffer[]} */
    const chunks=[];
    request.on('data',/** @param {Buffer} chunk */ chunk=>chunks.push(chunk));
    request.on('end',()=>{
      try{
        const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(payload?.symbol!==0&&payload?.symbol!==1){
          response.writeHead(400);response.end();return;
        }
        const symbol=payload.symbol;
        const output=machine.output[ordinaryState][symbol];
        ordinaryState=machine.next[ordinaryState][symbol];
        ordinaryTrace.push({input:symbol,output});
        response.writeHead(200,{'content-type':'application/json'});
        response.end(JSON.stringify({value:output}));
      }catch{
        response.writeHead(400);response.end();
      }
    });
  });
  const scoOrigin=await listen(scoServer);
  const ordinaryOrigin=await listen(ordinaryServer);
  process.send?.({kind:'ready',scoOrigin,ordinaryOrigin,cookie,methodId:targetMethod});
  process.on('message',message=>{
    if(!message||typeof message!=='object')return;
    const typed=/** @type {ProcessMessage} */(message);
    if(typed.kind==='snapshot'){
      process.send?.({kind:'snapshot',machine,canary,scoTrace,ordinaryTrace,
        publicClient:partition.clientFile.code,ordinaryClient:plainClient});
    }
    if(typed.kind==='stop'){
      Promise.all([new Promise(resolve=>scoServer.close(resolve)),
        new Promise(resolve=>ordinaryServer.close(resolve))])
        .then(()=>process.exit(0))
        .catch(()=>process.exit(1));
    }
  });
}

/**
 * This process receives only two origin URLs and a legitimate session cookie,
 * downloads both public clients over HTTP, and queries the authorized step
 * method. It has no model/table/seed in arguments, environment, or IPC.
 * @returns {Promise<void>}
 */
async function runAttacker(){
  process.on('message',async data=>{
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
      const [scoSource,ordinarySource]=await Promise.all([
        nativeFetch(scoOrigin+'/obfs/client.mjs').then(r=>{
          assert.equal(r.status,200);return r.text();}),
        nativeFetch(ordinaryOrigin+'/client.mjs').then(r=>{
          assert.equal(r.status,200);return r.text();})
      ]);
      assert.equal(scoSource.includes('privateTable'),false);
      assert.equal(ordinarySource.includes('privateTable'),false);
      const scoApi=await import('data:text/javascript;base64,'+
        Buffer.from(scoSource).toString('base64'));
      const ordinaryApi=await import('data:text/javascript;base64,'+
        Buffer.from(ordinarySource).toString('base64'));
      assert.equal('reset' in scoApi,false);
      assert.equal('reset' in ordinaryApi,false);
      /** @param {string} origin */
      const bindFetch=origin=>{
        globalThis.fetch=/** @type {typeof fetch} */((input,init)=>
          nativeFetch(new URL(String(input),origin),{
            ...init,headers:{...init?.headers,cookie}
          }));
      };
      const policy=createPolicy();
      assert.equal(policy.models.length,260);
      assert.equal(policy.beliefs.length,4429);
      assert.equal(policy.ranks[0],9);
      bindFetch(scoOrigin);
      const sco=await learn(scoApi,policy);
      bindFetch(ordinaryOrigin);
      const ordinary=await learn(ordinaryApi,policy);
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
        bindFetch(scoOrigin);
        actualSco.push(await scoApi.step(input));
        bindFetch(ordinaryOrigin);
        actualOrdinary.push(await ordinaryApi.step(input));
      }
      assert.deepEqual(actualSco,scoClone.outputs);
      assert.deepEqual(actualOrdinary,ordinaryClone.outputs);
      globalThis.fetch=nativeFetch;
      process.send?.({kind:'attacker-result',result:{sco,ordinary,followup,
        followupOutputs:actualSco,scoPublicBytes:Buffer.byteLength(scoSource),
        ordinaryPublicBytes:Buffer.byteLength(ordinarySource),
        attackerUid:process.getuid?.()??-1,signalPermissionDenied}});
    }catch(error){
      process.send?.({kind:'attacker-error',message:String(error),
        stack:error instanceof Error?error.stack:''});
    }
  });
}

/** @typedef {{kind:string,[key:string]:any}} ProcessMessage */
/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} expected
 * @param {number} [timeoutMs]
 * @returns {Promise<ProcessMessage>}
 */
function receive(child,expected,timeoutMs=45000){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error(expected+' child timeout'));},timeoutMs);
    /** @param {unknown} value */
    function onMessage(value){
      const message=/** @type {ProcessMessage|null} */(value);
      if(message?.kind==='attacker-error'){
        cleanup();reject(new Error(message.message+'\n'+message.stack));return;
      }
      if(message?.kind===expected){cleanup();resolve(message);}
    }
    /** @param {Error} error */
    function onError(error){cleanup();reject(error);}
    /** @param {number|null} code */
    function onExit(code){cleanup();reject(new Error('Child exited before '+expected+': '+code));}
    function cleanup(){
      clearTimeout(timer);
      child.off('message',onMessage);
      child.off('error',onError);
      child.off('exit',onExit);
    }
    child.on('message',onMessage);
    child.once('error',onError);
    child.once('exit',onExit);
  });
}

/**
 * Process boundary is real, but a same-UID child is NOT a hostile sandbox:
 * /proc, debugging and same-user filesystem access may still be available.
 * We establish what the fixed attacker actually received on its IPC/HTTP
 * interfaces, not what arbitrary malicious code could obtain under a shared
 * OS account. Server model only enters evaluator IPC after the attacker exits.
 *
 * @returns {Promise<{queries:number,rank:number,beliefs:number,
 *   exact:boolean,matchedControl:boolean,unauthorizedSco:number,
 *   unauthorizedOrdinary:number,publicServerPrivateCanary:boolean,
 *   scoBytes:number,ordinaryBytes:number,serverPid:number,
 *   attackerPid:number,traceLength:number,serverUid:number,attackerUid:number,
 *   signalPermissionDenied:boolean}>}
 */
async function runProcessBoundary(isolatedUid=false){
  if(typeof isolatedUid!=='boolean')throw new TypeError('Expected boolean UID isolation');
  if(isolatedUid&&(process.platform!=='linux'||process.getuid?.()!==0)){
    throw new Error('Dedicated UID requires a privileged Linux test process');
  }
  const server=fork(__filename,['--server'],{execArgv:[],stdio:['ignore','ignore','pipe','ipc']});
  /** @type {import('node:child_process').ChildProcess|null} */
  let attacker=null;
  try{
    const ready=await receive(server,'ready');
    const [deniedSco,deniedOrdinary,privatePath]=await Promise.all([
      fetch(ready.scoOrigin+'/obfs/rpc',{method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({method:ready.methodId,args:[0]})}),
      fetch(ready.ordinaryOrigin+'/step',{method:'POST',
        headers:{'content-type':'application/json'},body:'{}'}),
      fetch(ready.scoOrigin+'/obfs/private/actual.mjs')
    ]);
    assert.equal(deniedSco.status,403);
    assert.equal(deniedOrdinary.status,403);
    assert.notEqual(privatePath.status,200);
    // Deliberately exclude the evaluator/server's environment, including
    // NODE_OPTIONS and any ambient service credentials. The sole authorized
    // bearer is delivered explicitly over the public-client IPC envelope.
    attacker=fork(__filename,['--attacker'],{execArgv:[],env:{},
      ...(isolatedUid?{uid:65534,gid:65534}:{}),
      stdio:['ignore','ignore','pipe','ipc']});
    const attackerReady=receive(attacker,'attacker-result');
    attacker.send({kind:'start',scoOrigin:ready.scoOrigin,
      ordinaryOrigin:ready.ordinaryOrigin,cookie:ready.cookie,serverPid:server.pid});
    const attack=await attackerReady;
    const attackerPid=attacker.pid||-1;
    // End the adversarial process before obtaining evaluator-only truth.
    const activeAttacker=attacker;
    /** @type {Promise<void>} */
    const stopped=new Promise(resolve=>activeAttacker.once('exit',()=>resolve()));
    activeAttacker.kill();
    await stopped;
    attacker=null;
    const snapshotReady=receive(server,'snapshot');
    server.send({kind:'snapshot'});
    const snapshot=await snapshotReady;
    /** @type {import('./sco-two-state-optimal-network-policy').Learned} */
    const sco=attack.result.sco;
    const ordinary=attack.result.ordinary;
    const followup=attack.result.followup;
    const inputTranscript=sco.inputs.concat(followup);
    const outputTranscript=sco.outputs.concat(attack.result.followupOutputs);
    const expected=inputTranscript.map((input,index)=>({input,output:outputTranscript[index]}));
    assert.deepEqual(snapshot.scoTrace,expected);
    assert.deepEqual(snapshot.ordinaryTrace,expected);
    assert.equal(snapshot.publicClient.includes(snapshot.canary),false);
    assert.equal(snapshot.ordinaryClient.includes(snapshot.canary),false);
    let trueState=0;
    for(const input of inputTranscript.slice(0,sco.queries)){
      trueState=snapshot.machine.next[trueState][input];
    }
    assert.equal(equivalent([sco.clone,snapshot.machine],sco.currentState,
      2+trueState),true);
    assert.equal(equivalent([ordinary.clone,snapshot.machine],ordinary.currentState,
      2+trueState),true);
    return {queries:sco.queries,rank:sco.initialRank,beliefs:sco.beliefCount,
      exact:true,matchedControl:true,unauthorizedSco:deniedSco.status,
      unauthorizedOrdinary:deniedOrdinary.status,
      publicServerPrivateCanary:false,scoBytes:attack.result.scoPublicBytes,
      ordinaryBytes:attack.result.ordinaryPublicBytes,serverPid:server.pid||-1,
      attackerPid,serverUid:process.getuid?.()??-1,
      attackerUid:attack.result.attackerUid,
      signalPermissionDenied:attack.result.signalPermissionDenied,
      traceLength:expected.length};
  }finally{
    if(attacker)attacker.kill();
    if(server.connected)server.send?.({kind:'stop'});
    // Kill even if a child is wedged; the final settled exit is not used
    // as a separate proof of application behavior.
    setTimeout(()=>{if(server.exitCode===null)server.kill();},3000).unref();
  }
}

if(process.argv[2]==='--server'){
  runServer().catch(error=>{console.error(error);process.exit(1);});
}else if(process.argv[2]==='--attacker'){
  runAttacker().catch(error=>{console.error(error);process.exit(1);});
}else if(require.main===module){
  runProcessBoundary().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runProcessBoundary};
