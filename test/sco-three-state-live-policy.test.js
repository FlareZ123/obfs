'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createScoHandler,partitionScoAsyncModule,bindScoModuleExports}=
  require('../src');
const {atomicWrite}=require('../src/atomic');
const {computeThreeStateMinimax}=
  require('../sims/sco-three-state-minimax');
const {observableStateClasses}=
  require('../sims/sco-mealy-refinement');

const MODEL_COUNT=46656;

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
 *   getState:()=>number,publicSource:string,canary:string}>}
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
  return {server,origin,method,getState:()=>state,publicSource,canary};
}

/**
 * Matched ordinary JSON-RPC transport with identical hidden state and policy.
 * @param {{next:number[][],output:number[][]}} secret
 * @returns {Promise<{server:http.Server,origin:string,method:string,getState:()=>number}>}
 */
async function startOrdinary(secret){
  let state=0;
  const server=http.createServer(async(request,response)=>{
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
  return {server,origin,method:'step',getState:()=>state};
}

/**
 * The attacker runs in a separate Node process and receives only a public
 * policy DAG, RPC origin, and public method name.
 * @param {string} origin
 * @param {string} method
 * @param {string} policyPath
 * @returns {{queries:number,inputs:number[],outputs:number[],terminalClass:number}}
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
 * Check the policy's observed trace against the hidden server state retained
 * only by the parent/test process.
 * @param {{queries:number,inputs:number[],outputs:number[],terminalClass:number}} attack
 * @param {{next:number[][],output:number[][]}} secret
 * @param {number} modelIndex
 * @param {Uint16Array} classes
 * @param {()=>number} getServerState
 * @returns {number}
 */
function verifyAttack(attack,secret,modelIndex,classes,getServerState){
  assert.equal(attack.queries,attack.inputs.length);
  assert.equal(attack.outputs.length,attack.inputs.length);
  assert.ok(attack.queries<=24);
  let state=0;
  for(let i=0;i<attack.inputs.length;i++){
    const input=attack.inputs[i];
    assert.ok(input===0||input===1);
    assert.equal(attack.outputs[i],secret.output[state][input],
      'public RPC output must match the hidden Mealy table');
    state=secret.next[state][input];
  }
  assert.equal(getServerState(),state,'server and independent hidden-state tracker agree');
  assert.equal(attack.terminalClass,classes[modelIndex*3+state],
    'the attacker terminal class equals the actual hidden future-behavior class');
  return state;
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
  assert.equal(result.rootPolicyNode,0);
  const policyPath=path.join(os.tmpdir(),'obfs-three-state-policy-'+process.pid+'.json');
  const policy={
    root:result.rootPolicyNode,
    nodes:result.policy.map(node=>({input:node.input,children:node.children}))
  };
  await atomicWrite(policyPath,JSON.stringify(policy));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-three-state-live-'));
  const models=[0,1,12345,23456,46655];
  /** @type {{model:number,transport:string,queries:number,terminalClass:number,finalState:number}[]} */
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
      try{
        const attack=await runAttacker(sco.origin,sco.method,policyPath);
        const finalState=verifyAttack(attack,secret,modelIndex,classes,sco.getState);
        receipts.push({model:modelIndex,transport:'generated-sco-http',
          queries:attack.queries,terminalClass:attack.terminalClass,finalState});
      }finally{await close(sco.server);}

      const ordinary=await startOrdinary(secret);
      try{
        const attack=await runAttacker(ordinary.origin,ordinary.method,policyPath);
        const finalState=verifyAttack(attack,secret,modelIndex,classes,ordinary.getState);
        receipts.push({model:modelIndex,transport:'matched-ordinary-rpc',
          queries:attack.queries,terminalClass:attack.terminalClass,finalState});
      }finally{await close(ordinary.server);}
    }
    for(const modelIndex of models){
      const sco=receipts.find(item=>item.model===modelIndex&&item.transport==='generated-sco-http');
      const ordinary=receipts.find(item=>item.model===modelIndex&&item.transport==='matched-ordinary-rpc');
      assert.ok(sco&&ordinary);
      assert.equal(sco.queries,ordinary.queries);
      assert.equal(sco.terminalClass,ordinary.terminalClass);
      assert.equal(sco.finalState,ordinary.finalState);
    }
    console.log('THREE_STATE_LIVE_POLICY '+JSON.stringify({
      modelCount:models.length,transports:2,receipts
    }));

    // Negative control: the 24-call guarantee is conditional on the <=3-state
    // prior. Add a fourth reachable state on a transition not queried by the
    // policy, preserving its entire observed trace but changing future behavior.
    /** @type {{modelIndex:number,changedState:number,changedInput:number,
     *   finalState:number,terminalClass:number,suffix:number[],
     *   originalSuffixOutputs:number[],fourStateSuffixOutputs:number[]}|null} */
    let fourStateWitness=null;
    for(let modelIndex=0;modelIndex<MODEL_COUNT&&!fourStateWitness;modelIndex++){
      const secret=decodeModel(modelIndex);
      if(reachableStates(secret,0).length!==3)continue;
      const originalTrace=simulatePolicy(policyNodes,secret);
      if(originalTrace.inputs.length!==24)continue;
      for(const state of reachableStates(secret,originalTrace.finalState)){
        for(let input=0;input<2;input++){
          if(originalTrace.visited.has(state+':'+input))continue;
          const oldTarget=secret.next[state][input];
          const fourState={
            next:secret.next.map(row=>row.slice()).concat([[3,3]]),
            output:secret.output.map(row=>row.slice()).concat([[
              1-secret.output[oldTarget][0],1-secret.output[oldTarget][1]
            ]])
          };
          fourState.next[state][input]=3;
          const modifiedTrace=simulatePolicy(policyNodes,fourState);
          assert.deepEqual(modifiedTrace.inputs,originalTrace.inputs);
          assert.deepEqual(modifiedTrace.outputs,originalTrace.outputs);
          assert.equal(modifiedTrace.terminalClass,originalTrace.terminalClass);
          assert.equal(originalTrace.terminalClass,
            classes[modelIndex*3+originalTrace.finalState]);
          const path=shortestInputPath(secret,originalTrace.finalState,state);
          assert.ok(path);
          const suffix=[...path,input,0];
          const originalSuffixOutputs=outputTrace(secret,originalTrace.finalState,suffix);
          const fourStateSuffixOutputs=outputTrace(fourState,modifiedTrace.finalState,suffix);
          assert.notDeepEqual(fourStateSuffixOutputs,originalSuffixOutputs,
            'the fourth state changes a future output after the policy stops');
          const combined={
            next:[
              ...secret.next.map(row=>row.slice()),
              ...fourState.next.map(row=>row.map(target=>target===3?6:target+3))
            ],
            output:[
              ...secret.output.map(row=>row.slice()),
              ...fourState.output.map(row=>row.slice())
            ]
          };
          const combinedClasses=observableStateClasses(combined);
          assert.notEqual(combinedClasses[originalTrace.finalState],
            combinedClasses[3+modifiedTrace.finalState],
            'original and four-state final states have different future behaviors');
          fourStateWitness={
            modelIndex,changedState:state,changedInput:input,
            finalState:originalTrace.finalState,
            terminalClass:originalTrace.terminalClass,suffix,
            originalSuffixOutputs,fourStateSuffixOutputs
          };
          break;
        }
        if(fourStateWitness)break;
      }
    }
    assert.ok(fourStateWitness,
      'find a reachable four-state extension outside the observed 24-call path');
    console.log('THREE_STATE_PRIOR_FALSIFIER '+JSON.stringify(fourStateWitness));
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
    await fs.rm(policyPath,{force:true});
  }
});
