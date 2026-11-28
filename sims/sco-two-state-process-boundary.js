'use strict';

const assert=require('node:assert/strict');
const {fork,spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const readline=require('node:readline');
const {randomBytes,randomInt}=require('node:crypto');
const http=require('node:http');
const {createPolicy,learnExpected,continuation,equivalent}=
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
  const tamperOrdinary=process.argv.includes('--tamper-wire');
  const {transform}=require('esbuild');
  const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');
  // Uniformly sample the exact prior: four one-state plus 256 two-state
  // labelled machines, initially at state zero.
  const modelId=randomInt(260);
  const states=modelId<4?1:2;
  let code=modelId<4?modelId:modelId-4;
  /** @type {Machine} */
  const machine={next:Array.from({length:states},()=>[0,0]),
    output:Array.from({length:states},()=>[0,0])};
  for(let state=0;state<states;state++)for(let input=0;input<2;input++){
    const choice=code%(2*states);
    code=Math.floor(code/(2*states));
    machine.next[state][input]=Math.floor(choice/2);
    machine.output[state][input]=choice%2;
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
    if(typeof output!=='number'||(output!==0&&output!==1)){
      throw new Error('Unexpected trusted private step output');
    }
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
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",',
    'cache:"no-store",headers:{"content-type":"application/json"},',
    'body:JSON.stringify({method:'+JSON.stringify(targetMethod)+',args:[symbol]})});',
    'const payload=await response.json();',
    'if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");',
    'return payload.value;',
    '}'
  ].join('');
  const plainClient=(await transform(plainSource,{format:'esm',minify:true})).code;
  const staticHeaders={'content-type':'text/javascript; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'};
  const jsonHeaders={'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff'};
  const ordinaryServer=http.createServer((request,response)=>{
    /** @param {number} status @param {Record<string,unknown>} payload */
    const respond=(status,payload)=>{
      response.writeHead(status,jsonHeaders);
      response.end(JSON.stringify(payload));
    };
    if(request.method==='GET'&&request.url==='/obfs/client.mjs'){
      response.writeHead(200,staticHeaders);
      response.end(plainClient);return;
    }
    if(request.method!=='POST'||request.url!=='/obfs/rpc'){
      response.writeHead(404);response.end();return;
    }
    if(request.headers.cookie!==cookie){
      respond(403,{ok:false,error:'Forbidden'});return;
    }
    /** @type {Buffer[]} */
    const chunks=[];
    request.on('data',/** @param {Buffer} chunk */ chunk=>chunks.push(chunk));
    request.on('end',()=>{
      try{
        const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(payload?.method!==targetMethod||!Array.isArray(payload?.args)||
            payload.args.length!==1||(payload.args[0]!==0&&payload.args[0]!==1)){
          respond(403,{ok:false,error:'Forbidden'});return;
        }
        const symbol=payload.args[0];
        const output=machine.output[ordinaryState][symbol];
        ordinaryState=machine.next[ordinaryState][symbol];
        ordinaryTrace.push({input:symbol,output});
        respond(200,tamperOrdinary?{ok:true,value:output,wireMarker:1}:
          {ok:true,value:output});
      }catch{
        respond(400,{ok:false,error:'Malformed JSON'});
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
      process.send?.({kind:'snapshot',modelId,machine,canary,scoTrace,ordinaryTrace,
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

/** @typedef {{kind:string,[key:string]:any}} ProcessMessage */
/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} expected
 * @param {number} [timeoutMs]
 * @returns {Promise<ProcessMessage>}
 */
function receive(child,expected,timeoutMs=45000){
  return new Promise((resolve,reject)=>{
    let stderr='';
    /** @param {Buffer|string} chunk */
    const onStderr=chunk=>{stderr=(stderr+String(chunk)).slice(-1800);};
    child.stderr?.on('data',onStderr);
    const timer=setTimeout(()=>{cleanup();reject(new Error(expected+' child timeout: '+stderr));},timeoutMs);
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
    function onExit(code){cleanup();reject(new Error('Child exited before '+expected+': '+code+' '+stderr));}
    function cleanup(){
      clearTimeout(timer);
      child.stderr?.off('data',onStderr);
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
 *   signalPermissionDenied:boolean,wireCalls:number,wireMatched:boolean,
 *   modelId:number}>}
 */
async function runProcessBoundary(isolatedUid=false,tamperOrdinary=false){
  if(typeof tamperOrdinary!=='boolean')throw new TypeError('Expected boolean wire mutation');
  if(typeof isolatedUid!=='boolean')throw new TypeError('Expected boolean UID isolation');
  if(isolatedUid&&process.platform!=='linux'){
    throw new Error('Different-UID attacker requires Linux');
  }
  const server=fork(__filename,tamperOrdinary?['--server','--tamper-wire']:['--server'],
    {execArgv:[],stdio:['ignore','ignore','pipe','ipc']});
  /** @type {import('node:child_process').ChildProcess|null} */
  let attacker=null;
  /** @type {string|null} */
  let publicRoot=null;
  try{
    const ready=await receive(server,'ready');
    const [deniedSco,deniedOrdinary,privatePath]=await Promise.all([
      fetch(ready.scoOrigin+'/obfs/rpc',{method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({method:ready.methodId,args:[0]})}),
      fetch(ready.ordinaryOrigin+'/obfs/rpc',{method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({method:ready.methodId,args:[0]})}),
      fetch(ready.scoOrigin+'/obfs/private/actual.mjs')
    ]);
    assert.equal(deniedSco.status,403);
    assert.equal(deniedOrdinary.status,403);
    assert.equal(await deniedSco.text(),await deniedOrdinary.text());
    assert.notEqual(privatePath.status,200);
    // Deliberately exclude the evaluator/server's environment, including
    // NODE_OPTIONS and any ambient service credentials. The sole authorized
    // bearer is delivered explicitly over the public-client IPC envelope.
    // GitHub's /home/runner checkout is not traversable by nobody. Publish
    // only the already-distributed ATTACKER PROGRAM and public model-class
    // learner under a 0755 temporary directory. This is distinct from the
    // private source, table, server code generated in memory, or credentials.
    let attackerSource=__filename;
    if(isolatedUid){
      publicRoot=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-public-attacker-'));
      await fs.chmod(publicRoot,0o755);
      const script=path.join(publicRoot,path.basename(__filename));
      const learner=path.join(publicRoot,'sco-two-state-optimal-network-policy.js');
      await fs.copyFile(__filename,script);
      await fs.copyFile(path.join(__dirname,'sco-two-state-optimal-network-policy.js'),learner);
      await fs.chmod(script,0o644);
      await fs.chmod(learner,0o644);
      attackerSource=script;
    }
    if(isolatedUid){
      // The evaluator/server remain an ordinary runner user. Only the
      // minimal public attacker script runs as nobody; avoid root-evaluating
      // repository tests through sudo. IPC is newline JSON over pipes.
      const client=spawn('sudo',['-n','-u','nobody',process.execPath,attackerSource,
        '--attacker'],{cwd:publicRoot??undefined,env:{PATH:process.env.PATH??'/usr/bin:/bin'},
        stdio:['pipe','pipe','pipe']});
      attacker=client;
      const output=client.stdout;
      if(!output)throw new Error('Missing isolated attacker stdout');
      readline.createInterface({input:output}).on('line',line=>{
        try{client.emit('message',JSON.parse(line));}catch{
          client.emit('message',{kind:'attacker-error',
            message:'Isolated attacker returned invalid JSON'});
        }
      });
    }else{
      attacker=fork(attackerSource,['--attacker'],{execArgv:[],env:{},
        stdio:['ignore','ignore','pipe','ipc']});
    }
    const attackerReady=receive(attacker,'attacker-result');
    const invocation={kind:'start',scoOrigin:ready.scoOrigin,
      ordinaryOrigin:ready.ordinaryOrigin,cookie:ready.cookie,serverPid:server.pid};
    if(isolatedUid){
      if(!attacker.stdin)throw new Error('Missing isolated attacker stdin');
      attacker.stdin.write(JSON.stringify(invocation)+'\n');
    }else attacker.send(invocation);
    const attack=await attackerReady;
    const attackerPid=attack.result.attackerProcessPid;
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
    assert.ok(Number.isInteger(snapshot.modelId)&&snapshot.modelId>=0&&snapshot.modelId<260);
    assert.deepEqual(snapshot.machine,createPolicy().models[snapshot.modelId]);
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
      wireCalls:attack.result.wireCalls,wireMatched:attack.result.wireMatched,
      modelId:snapshot.modelId,traceLength:expected.length};
  }finally{
    if(attacker)attacker.kill();
    if(server.connected)server.send?.({kind:'stop'});
    if(publicRoot)await fs.rm(publicRoot,{recursive:true,force:true});
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
