'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {transformSync}=require('esbuild');
const {pathToFileURL}=require('node:url');
const {createScoHandler,partitionScoAsyncModule,bindScoModuleExports}=
  require('../src');
const {atomicWrite}=require('../src/atomic');
const {computeThreeStateMinimax}=
  require('../sims/sco-three-state-minimax');
const {observableStateClasses}=
  require('../sims/sco-mealy-refinement');

const MODEL_COUNT=46656;

/** @param {string|Buffer} value @returns {string} */
function sha256(value){
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Decode the exact base-six table index used by the exhaustive corpus.
 * @param {number} index
 * @returns {{next:number[][],output:number[][]}}
 */
function decodeModel(index){
  if(!Number.isSafeInteger(index)||index<0||index>=MODEL_COUNT)
    throw new RangeError('model index must be in [0, 46655]');
  let code=index;
  /** @type {number[][]} */
  const next=[];
  /** @type {number[][]} */
  const output=[];
  for(let state=0;state<3;state++){
    next.push([]);
    output.push([]);
    for(let input=0;input<2;input++){
      const digit=code%6;
      code=Math.floor(code/6);
      next[state][input]=Math.floor(digit/2);
      output[state][input]=digit%2;
    }
  }
  return {next,output};
}

/**
 * @param {http.Server} server
 * @returns {Promise<string>}
 */
function listen(server){
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string'){
        reject(new Error('Expected an ephemeral TCP address'));
        return;
      }
      resolve('http://127.0.0.1:'+address.port);
    });
  });
}

/**
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function close(server){
  return new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
  });
}

/**
 * @param {{next:number[][],output:number[][]}} secret
 * @param {number} index
 * @param {string} directory
 * @returns {Promise<{server:http.Server,origin:string,method:string,
 *   getState:()=>number,publicSource:string,canary:string,
 *   privateModuleSha256:string,publicSourceSha256:string}>}
 */
async function startSco(secret,index,directory){
  const canary='private-three-state-canary-'+index;
  const source=[
    'const model='+JSON.stringify(secret)+';',
    'const canary='+JSON.stringify(canary)+';',
    'let current=0;',
    'export async function step(symbol){',
    'if(!Number.isInteger(symbol)||symbol<0||symbol>=2)throw TypeError("symbol");',
    'const old=current;current=model.next[old][symbol];',
    'return model.output[old][symbol];',
    '}'
  ].join('\n');
  const privateModuleSha256=sha256(source);
  const privatePath=path.join(directory,'private-'+index+'.mjs');
  await atomicWrite(privatePath,source);
  const partition=partitionScoAsyncModule({
    path:'client.mjs',sourceType:'module',code:source
  },{seed:'agent11-three-state-live-'+index,serverOnlyInitialization:true});
  const privateModule=await import(pathToFileURL(privatePath).href);
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const remoteMethods={...bindScoModuleExports(partition,privateModule)};
  const method=partition.methodNames.step;
  const original=remoteMethods[method];
  if(typeof original!=='function')throw new Error('Missing bound private step');
  let state=0;
  /** @param {number} symbol @returns {Promise<unknown>} */
  remoteMethods[method]=async symbol=>{
    const value=await original(symbol);
    state=secret.next[state][symbol];
    return value;
  };
  const handler=createScoHandler([partition.clientFile],{
    remoteMethods,
    authorizeRpc:request=>request.headers.cookie==='session=legitimate',
    authorizeOperation:(request,name,args)=>
      request.headers.cookie==='session=legitimate'&&name===method&&
      args.length===1&&typeof args[0]==='number'&&
      Number.isInteger(args[0])&&args[0]>=0&&args[0]<2
  });
  const server=http.createServer(handler);
  const origin=await listen(server);
  const response=await fetch(origin+'/obfs/client.mjs');
  assert.equal(response.status,200,'generated public SCO client is served');
  const publicSource=await response.text();
  assert.ok(!publicSource.includes(canary),'private canary absent from public client');
  assert.ok(!publicSource.includes(JSON.stringify(secret)),
    'private transition table absent from public client');
  assert.ok(publicSource.includes(method),'remote method identifier is public');
  assert.ok(publicSource.includes('/obfs/rpc'),'RPC endpoint is public');
  const publicSourceSha256=sha256(publicSource);
  return {
    server,origin,method,getState:()=>state,publicSource,canary,
    privateModuleSha256,publicSourceSha256
  };
}
/**
 * Matched ordinary minified JSON-RPC control with identical hidden state,
 * method contract, credential, endpoint, and public-client route.
 * @param {{next:number[][],output:number[][]}} secret
 * @returns {Promise<{server:http.Server,origin:string,method:string,
 *   getState:()=>number,publicSource:string,publicSourceSha256:string,
 *   serverCodeSha256:string}>}
 */
async function startOrdinary(secret){
  let state=0;
  const ordinaryClientSource=transformSync(
    'export async function step(symbol){const response=await fetch("/obfs/rpc",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({method:"step",args:[symbol]})});const payload=await response.json();if(!response.ok||payload?.ok!==true)throw Error("RPC failed");return payload.value}',
    {format:'esm',minify:true,target:'es2022'}
  ).code;
  const server=http.createServer(async(request,response)=>{
    if(request.method==='GET'&&request.url==='/obfs/client.mjs'){
      response.writeHead(200,{
        'content-type':'application/javascript; charset=utf-8',
        'cache-control':'no-store'
      });
      response.end(ordinaryClientSource);
      return;
    }
    if(request.method!=='POST'||request.url!=='/obfs/rpc'){
      response.writeHead(404);response.end();return;
    }
    if(request.headers.cookie!=='session=legitimate'){
      response.writeHead(403);response.end(JSON.stringify({ok:false,error:'Forbidden'}));return;
    }
    /** @type {Buffer[]} */
    const chunks=[];
    for await(const chunk of request)chunks.push(Buffer.from(chunk));
    /** @type {{method?:unknown,args?:unknown}} */
    let query;
    try{query=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{response.writeHead(400);response.end();return;}
    if(query.method!=='step'||!Array.isArray(query.args)||query.args.length!==1||
       typeof query.args[0]!=='number'||!Number.isInteger(query.args[0])||
       query.args[0]<0||query.args[0]>=2){
      response.writeHead(400);response.end(JSON.stringify({ok:false,error:'Invalid operation'}));return;
    }
    const symbol=query.args[0];
    const output=secret.output[state][symbol];
    state=secret.next[state][symbol];
    response.writeHead(200,{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(JSON.stringify({ok:true,value:output}));
  });
  const origin=await listen(server);
  const response=await fetch(origin+'/obfs/client.mjs');
  assert.equal(response.status,200,'ordinary minified public client is served');
  const publicSource=await response.text();
  assert.ok(publicSource.includes('step'),'ordinary method name is public');
  assert.ok(publicSource.includes('/obfs/rpc'),'ordinary RPC endpoint is public');
  return {
    server,origin,method:'step',getState:()=>state,publicSource,
    publicSourceSha256:sha256(publicSource),
    serverCodeSha256:sha256(startOrdinary.toString())
  };
}
/**
 * The attacker runs in a separate Node process and receives only a public
 * policy DAG, RPC origin, and public method name.
 * @param {string} origin
 * @param {string} method
 * @param {string} policyPath
 * @returns {Promise<{queries:number,inputs:number[],outputs:number[],terminalClass:number,
 *   transcript:{input:number,method:string,status:number,ok:boolean,output:unknown}[],
 *   policySha256:string,clientSha256:string,heldoutInputs:number[],heldoutOutputs:number[]}>}
 */
function runAttacker(origin,method,policyPath){
  const script=path.join(__dirname,'..','sims','sco-three-state-policy-attacker.js');
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script,origin,method,policyPath],{
      stdio:['ignore','pipe','pipe']
    });
    let stdout='';
    let stderr='';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>{stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.once('error',reject);
    child.once('close',(code,signal)=>{
      if(code!==0){
        reject(new Error('Public attacker process failed: '+String(code)+' '+String(signal)+' '+stderr));
        return;
      }
      try{resolve(JSON.parse(stdout.trim()));}
      catch(error){reject(error);}
    });
  });
}

/**
 * Check the complete live trace against the hidden state retained only by the
 * parent/test process. This is called after the corresponding HTTP server is
 * closed, so no held-out request can be answered by the live service.
 * @param {{queries:number,inputs:number[],outputs:number[],terminalClass:number,
 *   transcript:{input:number,method:string,status:number,ok:boolean,output:unknown}[],
 *   policySha256:string,clientSha256:string,heldoutInputs:number[],heldoutOutputs:number[]}} attack
 * @param {{next:number[][],output:number[][]}} secret
 * @param {number} modelIndex
 * @param {Uint16Array} classes
 * @param {()=>number} getServerState
 * @param {string} policyHash
 * @param {string} clientHash
 * @returns {number}
 */
function verifyAttack(attack,secret,modelIndex,classes,getServerState,policyHash,clientHash){
  assert.equal(attack.queries,attack.inputs.length);
  assert.equal(attack.outputs.length,attack.inputs.length);
  assert.equal(attack.transcript.length,attack.queries);
  assert.ok(attack.queries<=24);
  assert.equal(attack.policySha256,policyHash,'attacker used the pinned public policy');
  assert.equal(attack.clientSha256,clientHash,'attacker fetched the pinned public client');
  let state=0;
  for(let i=0;i<attack.inputs.length;i++){
    const input=attack.inputs[i];
    assert.ok(input===0||input===1);
    assert.equal(attack.outputs[i],secret.output[state][input],
      'public RPC output must match the hidden Mealy table');
    const row=attack.transcript[i];
    assert.equal(row.input,input);
    assert.equal(row.status,200);
    assert.equal(row.ok,true);
    assert.equal(row.output,attack.outputs[i]);
    state=secret.next[state][input];
  }
  assert.equal(getServerState(),state,'server and independent hidden-state tracker agree');
  assert.equal(attack.terminalClass,classes[modelIndex*3+state],
    'the attacker terminal class equals the actual hidden future-behavior class');
  assert.equal(attack.heldoutInputs.length,64);
  assert.equal(attack.heldoutOutputs.length,64);
  return state;
}

/**
 * Verify the attacker's predicted continuation only after its server has
 * shut down. The hidden model is used solely by the evaluator.
 * @param {{heldoutInputs:number[],heldoutOutputs:number[]}} attack
 * @param {{next:number[][],output:number[][]}} secret
 * @param {number} finalState
 * @returns {{inputs:number[],predictedOutputs:number[],actualOutputs:number[],exact:true}}
 */
function verifyHeldout(attack,secret,finalState){
  const actualOutputs=outputTrace(secret,finalState,attack.heldoutInputs);
  assert.deepEqual(attack.heldoutOutputs,actualOutputs,
    'public behavior quotient predicts the hidden machine after server shutdown');
  return {
    inputs:attack.heldoutInputs,
    predictedOutputs:attack.heldoutOutputs,
    actualOutputs,
    exact:true
  };
}
/**
 * Simulate a public policy against a finite machine without consulting the
 * hidden source during the decision process.
 * @param {ReadonlyArray<{input:number,children:[number,number]}>} policy
 * @param {{next:number[][],output:number[][]}} machine
 * @returns {{inputs:number[],outputs:number[],terminalClass:number,finalState:number,visited:Set<string>}}
 */
function simulatePolicy(policy,machine){
  let node=0;
  let state=0;
  /** @type {number[]} */
  const inputs=[];
  /** @type {number[]} */
  const outputs=[];
  const visited=new Set();
  for(let queries=0;queries<24;queries++){
    const current=policy[node];
    if(!current)throw new Error('Policy node missing: '+node);
    const input=current.input;
    const before=state;
    const output=machine.output[state][input];
    visited.add(before+':'+input);
    inputs.push(input);
    outputs.push(output);
    state=machine.next[state][input];
    const child=current.children[output];
    if(child<=-2)return {
      inputs,outputs,terminalClass:-child-2,finalState:state,visited
    };
    if(child<0)throw new Error('Policy reached an impossible branch');
    node=child;
  }
  throw new Error('Policy did not terminate within 24 calls');
}

/**
 * @param {{next:number[][],output:number[][]}} machine
 * @param {number} start
 * @returns {number[]}
 */
function reachableStates(machine,start){
  const seen=new Set([start]);
  const queue=[start];
  for(let cursor=0;cursor<queue.length;cursor++){
    const state=queue[cursor];
    for(let input=0;input<2;input++){
      const next=machine.next[state][input];
      if(!seen.has(next)){seen.add(next);queue.push(next);}
    }
  }
  return [...seen];
}

/**
 * @param {{next:number[][],output:number[][]}} machine
 * @param {number} start
 * @param {number} target
 * @returns {number[]|null}
 */
function shortestInputPath(machine,start,target){
  /** @type {{state:number,path:number[]}[]} */
  const queue=[{state:start,path:[]}];
  const seen=new Set([start]);
  for(let cursor=0;cursor<queue.length;cursor++){
    const item=queue[cursor];
    if(item.state===target)return item.path;
    for(let input=0;input<2;input++){
      const next=machine.next[item.state][input];
      if(!seen.has(next)){
        seen.add(next);
        queue.push({state:next,path:[...item.path,input]});
      }
    }
  }
  return null;
}

/**
 * @param {{next:number[][],output:number[][]}} machine
 * @param {number} start
 * @param {number[]} inputs
 * @returns {number[]}
 */
function outputTrace(machine,start,inputs){
  let state=start;
  return inputs.map(input=>{
    const output=machine.output[state][input];
    state=machine.next[state][input];
    return output;
  });
}

test('24-call policy identifies selected sources through process-separated SCO and matched RPC',{
  timeout:120000
},async()=>{
  const result=computeThreeStateMinimax({includePolicy:true});
  assert.equal(result.minimaxQueries,24);
  assert.equal(result.policyNodes,13329);
  assert.ok(result.policy);
  assert.ok(result.classes);
  assert.ok(result.classOutput);
  assert.ok(result.classNext);
  assert.equal(result.rootPolicyNode,0);
  const policyPath=path.join(os.tmpdir(),'obfs-three-state-policy-'+process.pid+'.json');
  const policy={
    root:result.rootPolicyNode,
    nodes:result.policy.map(node=>({input:node.input,children:node.children})),
    classOutput:Array.from(result.classOutput),
    classNext:Array.from(result.classNext)
  };
  const policyJson=JSON.stringify(policy);
  const policyHash=sha256(policyJson);
  await atomicWrite(policyPath,policyJson);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-three-state-live-'));
  const models=[0,1,12345,23456,46655];
  /** @type {{model:number,transport:string,queries:number,terminalClass:number,finalState:number,
   * inputs:number[],outputs:number[],transcript:{input:number,method:string,status:number,ok:boolean,output:unknown}[],
   * policySha256:string,serverCodeSha256:string,publicClientSha256:string,
   * heldout:{inputs:number[],predictedOutputs:number[],actualOutputs:number[],exact:true,
   *   verifiedAfterServerShutdown:true}}[]} */
  const receipts=[];
  try{
    for(const modelIndex of models){
      const secret=decodeModel(modelIndex);
      const independentClasses=observableStateClasses(secret);
      for(let left=0;left<3;left++)for(let right=0;right<3;right++){
        assert.equal(
          result.classes[modelIndex*3+left]===result.classes[modelIndex*3+right],
          independentClasses[left]===independentClasses[right],
          'global quotient agrees with independent per-machine refinement'
        );
      }

      const sco=await startSco(secret,modelIndex,directory);
      /** @type {Awaited<ReturnType<typeof runAttacker>>} */
      let scoAttack;
      try{
        scoAttack=await runAttacker(sco.origin,sco.method,policyPath);
      }finally{await close(sco.server);}
      const scoFinalState=verifyAttack(
        scoAttack,secret,modelIndex,result.classes,sco.getState,policyHash,sco.publicSourceSha256
      );
      const scoHeldout=verifyHeldout(scoAttack,secret,scoFinalState);
      receipts.push({
        model:modelIndex,transport:'generated-sco-http',
        queries:scoAttack.queries,inputs:scoAttack.inputs,outputs:scoAttack.outputs,
        transcript:scoAttack.transcript,terminalClass:scoAttack.terminalClass,
        finalState:scoFinalState,policySha256:policyHash,
        serverCodeSha256:sco.privateModuleSha256,
        publicClientSha256:sco.publicSourceSha256,
        heldout:{...scoHeldout,verifiedAfterServerShutdown:true}
      });

      const ordinary=await startOrdinary(secret);
      /** @type {Awaited<ReturnType<typeof runAttacker>>} */
      let ordinaryAttack;
      try{
        ordinaryAttack=await runAttacker(ordinary.origin,ordinary.method,policyPath);
      }finally{await close(ordinary.server);}
      const ordinaryFinalState=verifyAttack(
        ordinaryAttack,secret,modelIndex,result.classes,ordinary.getState,policyHash,ordinary.publicSourceSha256
      );
      const ordinaryHeldout=verifyHeldout(ordinaryAttack,secret,ordinaryFinalState);
      receipts.push({
        model:modelIndex,transport:'matched-ordinary-minified-rpc',
        queries:ordinaryAttack.queries,inputs:ordinaryAttack.inputs,outputs:ordinaryAttack.outputs,
        transcript:ordinaryAttack.transcript,terminalClass:ordinaryAttack.terminalClass,
        finalState:ordinaryFinalState,policySha256:policyHash,
        serverCodeSha256:ordinary.serverCodeSha256,
        publicClientSha256:ordinary.publicSourceSha256,
        heldout:{...ordinaryHeldout,verifiedAfterServerShutdown:true}
      });
    }
    for(const modelIndex of models){
      const sco=receipts.find(item=>item.model===modelIndex&&item.transport==='generated-sco-http');
      const ordinary=receipts.find(item=>item.model===modelIndex&&item.transport==='matched-ordinary-minified-rpc');
      assert.ok(sco&&ordinary);
      assert.equal(sco.queries,ordinary.queries);
      assert.deepEqual(sco.inputs,ordinary.inputs);
      assert.deepEqual(sco.outputs,ordinary.outputs);
      assert.deepEqual(sco.transcript.map(row=>({input:row.input,status:row.status,ok:row.ok,output:row.output})),
        ordinary.transcript.map(row=>({input:row.input,status:row.status,ok:row.ok,output:row.output})));
      assert.equal(sco.terminalClass,ordinary.terminalClass);
      assert.equal(sco.finalState,ordinary.finalState);
      assert.deepEqual(sco.heldout.predictedOutputs,ordinary.heldout.predictedOutputs);
    }
    // Negative control: preserve a real three-state machine as a reachable
    // submachine, then unroll the observed policy trace into a fresh path. The
    // final path state is reached only after the last observed response, so its
    // future behavior is unconstrained by the transcript.
    const base={
      next:[[1,2],[2,0],[0,1]],
      output:[[0,0],[0,1],[1,0]]
    };
    assert.equal(reachableStates(base,0).length,3);
    assert.equal(new Set(observableStateClasses(base)).size,3);
    const originalTrace=simulatePolicy(policy.nodes,base);
    assert.ok(originalTrace.inputs.length<=24);

    const pathStateCount=originalTrace.inputs.length+1;
    const baseOffset=pathStateCount;
    /** @type {{next:number[][],output:number[][]}} */
    const extension={
      next:Array.from({length:pathStateCount},()=>[baseOffset,baseOffset]),
      output:Array.from({length:pathStateCount},()=>[0,0])
    };
    for(let index=0;index<originalTrace.inputs.length;index++){
      const input=originalTrace.inputs[index];
      const unused=1-input;
      extension.output[index][input]=originalTrace.outputs[index];
      extension.next[index][input]=index+1;
      extension.output[index][unused]=0;
      extension.next[index][unused]=baseOffset;
    }
    const extensionFinalState=pathStateCount-1;
    // 11 is absent from the three base output vectors 00, 01, and 10.
    extension.output[extensionFinalState]=[1,1];
    extension.next[extensionFinalState]=[baseOffset,baseOffset];

    // Keep all three distinct base behaviors reachable, and provide a return
    // edge from the base component to the trace path to make the extension
    // strongly connected.
    const baseNext=base.next.map(row=>row.map(target=>baseOffset+target));
    const baseOutput=base.output.map(row=>row.slice());
    baseNext[0][0]=0;
    extension.next.push(...baseNext);
    extension.output.push(...baseOutput);

    assert.equal(reachableStates(extension,0).length,extension.next.length,
      'every extension state is reachable from the attack initial state');
    for(let state=0;state<extension.next.length;state++){
      assert.equal(reachableStates(extension,state).length,extension.next.length,
        'the extended machine is strongly connected');
    }
    const extensionClasses=observableStateClasses(extension);
    const extensionBehaviorClasses=new Set(extensionClasses).size;
    assert.equal(extensionBehaviorClasses,extension.next.length,
      'every reachable extension state has a distinct future behavior');
    assert.ok(extensionBehaviorClasses>3,
      'the reachable extension exceeds the three-state prior');

    const modifiedTrace=simulatePolicy(policy.nodes,extension);
    assert.deepEqual(modifiedTrace.inputs,originalTrace.inputs);
    assert.deepEqual(modifiedTrace.outputs,originalTrace.outputs);
    assert.equal(modifiedTrace.terminalClass,originalTrace.terminalClass);
    assert.equal(modifiedTrace.finalState,extensionFinalState);

    const distinguishingInput=extension.output[extensionFinalState].findIndex(
      (value,input)=>value!==base.output[originalTrace.finalState][input]
    );
    assert.ok(distinguishingInput===0||distinguishingInput===1);
    const suffix=[distinguishingInput];
    const originalSuffixOutputs=outputTrace(base,originalTrace.finalState,suffix);
    const extensionSuffixOutputs=outputTrace(extension,modifiedTrace.finalState,suffix);
    assert.notDeepEqual(extensionSuffixOutputs,originalSuffixOutputs,
      'the same policy transcript is compatible with a different future behavior');

    const combined={
      next:[
        ...base.next.map(row=>row.slice()),
        ...extension.next.map(row=>row.map(target=>target+3))
      ],
      output:[
        ...base.output.map(row=>row.slice()),
        ...extension.output.map(row=>row.slice())
      ]
    };
    const combinedClasses=observableStateClasses(combined);
    assert.notEqual(combinedClasses[originalTrace.finalState],
      combinedClasses[3+modifiedTrace.finalState]);

    const traceExtensionWitness={
      originalQueries:originalTrace.inputs.length,
      extensionStateCount:extension.next.length,
      extensionBehaviorClasses,
      originalFinalState:originalTrace.finalState,
      extensionFinalState:modifiedTrace.finalState,
      terminalClass:originalTrace.terminalClass,
      suffix,originalSuffixOutputs,extensionSuffixOutputs
    };
    console.log('THREE_STATE_PRIOR_FALSIFIER '+JSON.stringify(traceExtensionWitness));

    const receiptPath=path.join(process.cwd(),'artifacts','sco-three-state-live-policy.json');
    await fs.mkdir(path.dirname(receiptPath),{recursive:true});
    const receipt={
      modelCount:models.length,transports:2,policySha256:policyHash,
      queryBound:24,heldoutLength:64,receipts,
      priorFalsifier:traceExtensionWitness
    };
    await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));
    console.log('THREE_STATE_LIVE_POLICY_SUMMARY '+JSON.stringify({
      modelCount:models.length,transports:2,queryBound:24,
      receipts:receipts.map(item=>({
        model:item.model,transport:item.transport,queries:item.queries,
        terminalClass:item.terminalClass,heldoutVerified:item.heldout.exact
      })),
      priorFalsifier:traceExtensionWitness
    }));
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
    await fs.rm(policyPath,{force:true});
  }
});
