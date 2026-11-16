'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preflightScoBatchState}=require('../src');

/** @param {string[]} names @returns {{method:string,args:unknown[]}[]} */
function calls(names) {
  return names.map(method=>({method,args:[]}));
}

/**
 * A transition which returns a Promise must not be treated as a truthy
 * authorization state, even when it is the last step in the batch.
 */
test('modeled batch refuses async transitions on the final and intermediate steps',()=>{
  const policy={
    authorize:/** @param {unknown} state */ state=>Boolean(state),
    transition:/** @type {any} */ (async()=>false)
  };
  assert.throws(()=>preflightScoBatchState(calls(['revoke']),true,policy),
    /transition must return synchronously/);
  assert.throws(()=>preflightScoBatchState(calls(['revoke','read']),true,policy),
    /transition must return synchronously/);
});

/** The Promise protocol includes arbitrary callable thenables, not just native Promise. */
test('modeled batch refuses non-Promise thenable transition and initial state',()=>{
  const thenable={
    then:/** @param {(state:boolean)=>void} resolve */ resolve=>resolve(false)
  };
  const policy={
    authorize:/** @param {unknown} state */ state=>Boolean(state),
    transition:/** @type {any} */ (()=>thenable)
  };
  assert.throws(()=>preflightScoBatchState(calls(['revoke']),true,policy),
    /transition must return synchronously/);
  assert.throws(()=>preflightScoBatchState(calls(['read']),
    /** @type {any} */ (thenable),policy),
    /initial state must be synchronous/);
  assert.throws(()=>preflightScoBatchState(calls(['read']),
    /** @type {any} */ (Promise.resolve(true)),policy),
    /initial state must be synchronous/);
});

/** Ordinary synchronous object state remains valid, including across successive modeled steps. */
test('modeled batch retains synchronous object transitions and denies revoked state',()=>{
  /** @type {{
   * authorize:(state:{active:boolean},method:string,args:unknown[])=>boolean,
   * transition:(state:{active:boolean},method:string,args:unknown[])=>{active:boolean}
   * }} */
  const policy={
    authorize:(state,method,args)=>state.active && args.length===0 &&
      (method==='read'||method==='revoke'),
    transition:(state,method)=>method==='revoke'?{active:false}:state
  };
  assert.equal(preflightScoBatchState(calls(['read','revoke']),{active:true},policy),true);
  assert.equal(preflightScoBatchState(calls(['revoke','read']),{active:true},policy),false);
  assert.equal(preflightScoBatchState(calls(['read']),{active:false},policy),false);
});

test('HTTP SCO refuses async-transition batch before private side effects',async()=>{
  const http=require('node:http');
  const {createScoHandler,createScoBatchMethod}=require('../src');
  let effects=0;
  const methods={read:()=>++effects};
  const batch=createScoBatchMethod(methods);
  const statePolicy={
    authorize:/** @param {unknown} state */ state=>Boolean(state),
    transition:/** @type {any} */ (async()=>false)
  };
  const server=http.createServer(createScoHandler([],{
    remoteMethods:{batch},
    authorizeRpc:()=>true,
    authorizeOperation:(request,method,args)=>method==='batch' &&
      args.length===1 && preflightScoBatchState(args[0],true,statePolicy)
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({method:'batch',args:[calls(['read'])]})
    });
    assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{ok:false,error:'Operation failed'});
    assert.equal(effects,0);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});


/**
 * A policy model can accidentally use async functions that reject. The
 * synchronous preflight must fail closed without leaving an unhandled Promise
 * rejection that terminates its host process.
 */
test('rejecting async policy results cannot terminate Node after synchronous denial',()=>{
  const {spawnSync}=require('node:child_process');
  const {join}=require('node:path');
  const script=[
    "'use strict';",
    "const assert=require('node:assert/strict');",
    "const {preflightScoBatchState}=require('./src');",
    "const calls=[{method:'read',args:[]}];",
    "const base={authorize:()=>true,transition:state=>state};",
    "const run=(state,policy)=>assert.throws(()=>preflightScoBatchState(calls,state,policy),TypeError);",
    "run(Promise.reject(Error('initial-state-async-rejection')),base);",
    "run(true,{...base,authorize:()=>Promise.reject(Error('permission-async-rejection'))});",
    "run(true,{...base,transition:()=>Promise.reject(Error('transition-async-rejection'))});",
    "const cross=label=>require('node:vm').runInNewContext('Promise.reject(Error('+JSON.stringify(label)+'))');",
    "run(cross('foreign-initial'),base);",
    "run(true,{...base,authorize:()=>cross('foreign-authorize')});",
    "run(true,{...base,transition:()=>cross('foreign-transition')});",
    "setImmediate(()=>process.stdout.write('policy-denials-survived'));"
  ].join('\n');
  const result=spawnSync(process.execPath,['--unhandled-rejections=strict','-e',script],{
    cwd:join(__dirname,'..'),encoding:'utf8',timeout:5000
  });
  assert.equal(result.status,0,'Unexpected child termination: '+result.stderr);
  assert.match(result.stdout,/policy-denials-survived/);
});


/**
 * A rejected asynchronous transition must be refused before any private work,
 * and a real SCO HTTP server must survive its later Promise rejection.
 */
test('SCO HTTP survives rejecting async policy transitions under strict Node rejection handling',()=>{
  const {spawnSync}=require('node:child_process');
  const {join}=require('node:path');
  const script=[
    "'use strict';",
    "const assert=require('node:assert/strict');",
    "const http=require('node:http');",
    "const {createScoHandler,createScoBatchMethod,preflightScoBatchState}=require('./src');",
    "let effects=0;",
    "const methods={read:()=>{effects++;return 'private';}};",
    "const batch=createScoBatchMethod(methods);",
    "const policy={authorize:()=>true,transition:()=>Promise.reject(Error('async-policy-rejection'))};",
    "const server=http.createServer(createScoHandler([],{",
    "  remoteMethods:{batch},authorizeRpc:()=>true,",
    "  authorizeOperation:(_req,method,args)=>method==='batch' &&",
    "    preflightScoBatchState(args[0],true,policy)",
    "}));",
    "async function run(){",
    "  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));",
    "  try{",
    "    const address=server.address();",
    "    assert(address && typeof address==='object');",
    "    const url='http://127.0.0.1:'+address.port+'/obfs/rpc';",
    "    for(let i=0;i<2;i++){",
    "      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},",
    "        body:JSON.stringify({method:'batch',args:[[{method:'read',args:[]}]]})});",
    "      assert.equal(response.status,500);",
    "      assert.deepEqual(await response.json(),{ok:false,error:'Operation failed'});",
    "    }",
    "    assert.equal(effects,0);",
    "  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}",
    "  setImmediate(()=>process.stdout.write('http-denials-survived'));",
    "}",
    "run().catch(error=>{console.error(error);process.exitCode=1;});"
  ].join('\n');
  const result=spawnSync(process.execPath,['--unhandled-rejections=strict','-e',script],{
    cwd:join(__dirname,'..'),encoding:'utf8',timeout:10000
  });
  assert.equal(result.status,0,'Unexpected child termination: '+result.stderr);
  assert.match(result.stdout,/http-denials-survived/);
});
