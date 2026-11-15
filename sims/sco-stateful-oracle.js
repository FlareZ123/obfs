'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {pathToFileURL} = require('node:url');
const {createScoHandler, partitionScoAsyncModule, bindScoModuleExports} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{reset:()=>Promise<boolean>,step:(symbol:number)=>Promise<number>}} StateOracle */
/** @typedef {{next:number[][],output:number[][]}} PrivateMachine */
/** @typedef {{next:number[][],output:number[][],access:number[][]}} LearnedMachine */

/**
 * Deterministic hidden four-state machine with two legal input symbols.
 * Input zero cycles across all four states; its 0011 output pattern makes
 * those states distinguishable by a two-symbol suffix. A seeded PRNG varies
 * the other transition/output and the starting pattern rotation.
 * @param {number} seed
 * @returns {PrivateMachine}
 */
function makeMachine(seed) {
  let value = seed >>> 0;
  /** @returns {number} */
  function nextRandom() {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value;
  }
  const rotate = nextRandom() % 4;
  const next = [];
  const output = [];
  const pattern = [0, 0, 1, 1];
  for (let state = 0; state < 4; state++) {
    next.push([(state + 1) % 4, (nextRandom() >>> 16) % 4]);
    output.push([pattern[(state + rotate) % 4], (nextRandom() >>> 16) % 2]);
  }
  return {next, output};
}

/**
 * Truth oracle used only to verify the learned machine, never by the learner.
 * @param {PrivateMachine} machine
 * @param {number[]} word
 * @returns {number[]}
 */
function privateTrace(machine, word) {
  let state = 0;
  const outputs = [];
  for (const symbol of word) {
    outputs.push(machine.output[state][symbol]);
    state = machine.next[state][symbol];
  }
  return outputs;
}

/**
 * Enumerate nonempty distinguishing suffixes shorter than the supplied
 * upper bound on the private state count.
 * @param {number} alphabetSize
 * @param {number} maxStates
 * @returns {number[][]}
 */
function suffixes(alphabetSize, maxStates) {
  /** @type {number[][]} */
  const all = [];
  /** @type {number[][]} */
  let layer = [[]];
  for (let length = 1; length < maxStates; length++) {
    /** @type {number[][]} */
    const next = [];
    for (const prefix of layer) for (let symbol = 0; symbol < alphabetSize; symbol++) {
      const word = [...prefix, symbol];
      next.push(word);
      all.push(word);
    }
    layer = next;
  }
  return all;
}

/**
 * Learn a resettable deterministic Mealy machine using its public RPC
 * interface alone. The attacker knows the alphabet and a state-count bound.
 * No private module, transition table or original source is inspected.
 *
 * The signature of a prefix consists of output traces after that prefix.
 * Two states with distinct futures in an N-state Mealy machine have a
 * distinguishing word shorter than N. This learns the observable quotient
 * for the stipulated state bound, including observationally equal states.
 *
 * @param {StateOracle} api
 * @param {number} [maxStates]
 * @param {number} [alphabetSize]
 * @returns {Promise<{machine:LearnedMachine,requests:number,experiments:number,elapsedMs:number}>}
 */
async function learnMachine(api, maxStates = 4, alphabetSize = 2) {
  if (!Number.isSafeInteger(maxStates) || maxStates < 2 || maxStates > 6 ||
      !Number.isSafeInteger(alphabetSize) || alphabetSize < 1 || alphabetSize > 3) {
    throw new RangeError('Unsupported finite model bounds');
  }
  const started = performance.now();
  const experiments = suffixes(alphabetSize, maxStates);
  let requests = 0;
  /** @type {Map<string,number[]>} */
  const cache = new Map();
  /** @param {number[]} prefix @param {number[]} suffix @returns {Promise<number[]>} */
  async function query(prefix, suffix) {
    const key = JSON.stringify([prefix, suffix]);
    const remembered = cache.get(key);
    if (remembered) return remembered;
    assert.equal(await api.reset(), true);
    requests++;
    for (const symbol of prefix) {
      await api.step(symbol);
      requests++;
    }
    const observed = [];
    for (const symbol of suffix) {
      const value = await api.step(symbol);
      requests++;
      assert.ok(Number.isSafeInteger(value));
      observed.push(value);
    }
    cache.set(key, observed);
    return observed;
  }
  /** @param {number[]} prefix @returns {Promise<string>} */
  async function signature(prefix) {
    const seen = [];
    for (const suffix of experiments) seen.push(await query(prefix, suffix));
    return JSON.stringify(seen);
  }
  /** @type {number[][]} */
  const access = [[]];
  const signatures = new Map([[await signature([]), 0]]);
  for (let index = 0; index < access.length; index++) {
    for (let symbol = 0; symbol < alphabetSize; symbol++) {
      const candidate = [...access[index], symbol];
      const key = await signature(candidate);
      if (!signatures.has(key)) {
        assert.ok(access.length < maxStates, 'Machine violates supplied state bound');
        signatures.set(key, access.length);
        access.push(candidate);
      }
    }
  }
  /** @type {number[][]} */
  const next = [];
  /** @type {number[][]} */
  const output = [];
  for (const prefix of access) {
    const targets = [];
    const outputs = [];
    for (let symbol = 0; symbol < alphabetSize; symbol++) {
      const observed = await query(prefix, [symbol]);
      outputs.push(observed[0]);
      const key = await signature([...prefix, symbol]);
      const target = signatures.get(key);
      assert.notEqual(target, undefined);
      targets.push(/** @type {number} */ (target));
    }
    next.push(targets);
    output.push(outputs);
  }
  return {machine:{next,output,access},requests,experiments:experiments.length,
    elapsedMs:Number((performance.now()-started).toFixed(3))};
}

/** @param {LearnedMachine} machine @param {number[]} word @returns {number[]} */
function learnedTrace(machine, word) {
  let state = 0;
  const outputs = [];
  for (const symbol of word) {
    outputs.push(machine.output[state][symbol]);
    state = machine.next[state][symbol];
  }
  return outputs;
}

/**
 * Attack through the actual emitted SCO proxy and authenticated HTTP handler.
 * The server's private module is never passed to learnMachine.
 * @param {number} index
 * @returns {Promise<{index:number,learnedStates:number,requests:number,experiments:number,
 *   heldout:number,sourceDisclosed:boolean,unauthorizedStatus:number,elapsedMs:number}>}
 */
async function scenario(index) {
  const secret = makeMachine((0x5f7a2b31 + Math.imul(index, 7919)) >>> 0);
  const canary = 'private-fsm-canary-' + index;
  const source = [
    'const model=' + JSON.stringify(secret) + ';',
    'const canary=' + JSON.stringify(canary) + ';',
    'let current=0;',
    'export async function reset(){current=0;return true;}',
    'export async function step(symbol){',
    'if(!Number.isInteger(symbol)||symbol<0||symbol>=2)throw TypeError("symbol");',
    'const old=current;current=model.next[old][symbol];return model.output[old][symbol];',
    '}'
  ].join('\n');
  const partition = partitionScoAsyncModule({path:'client.mjs',sourceType:'module',code:source}, {
    seed:'stateful-research-' + index,serverOnlyInitialization:true
  });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'obfs-stateful-'));
  /** @type {import('node:http').Server|null} */
  let server = null;
  const nativeFetch = globalThis.fetch;
  try {
    const privateFile = path.join(directory,'private','implementation.mjs');
    await atomicWrite(privateFile, source);
    const privateModule = await import(pathToFileURL(privateFile).href);
    server = http.createServer(createScoHandler([partition.clientFile], {
      remoteMethods:bindScoModuleExports(partition,privateModule),
      authorizeRpc:request=>request.headers.cookie==='session=legitimate',
      authorizeOperation:(request,method,args)=>request.headers.cookie==='session=legitimate' &&
        (method===partition.methodNames.reset && args.length===0 ||
         method===partition.methodNames.step && args.length===1 &&
         Number.isInteger(args[0]) && args[0]>=0 && args[0]<2)
    }));
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address==='object');
    const origin = 'http://127.0.0.1:' + address.port;
    const response = await nativeFetch(origin+'/obfs/client.mjs');
    assert.equal(response.status,200);
    const publicSource = await response.text();
    assert.ok(!publicSource.includes(canary));
    assert.ok(!publicSource.includes('model.next'));
    assert.ok(!publicSource.includes('model.output'));
    const publicFile = path.join(directory,'public','client.mjs');
    await atomicWrite(publicFile,publicSource);
    const unauthenticated = await nativeFetch(origin+'/obfs/rpc', {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partition.methodNames.reset,args:[]})
    });
    assert.equal(unauthenticated.status,403);
    globalThis.fetch = (input,options) => nativeFetch(new URL(String(input), origin), {
      ...options,headers:{...options?.headers,cookie:'session=legitimate'}
    });
    const api = /** @type {StateOracle} */ (await import(pathToFileURL(publicFile).href));
    const learned = await learnMachine(api);
    assert.equal(learned.machine.access.length,4);
    let heldout = 0;
    // Verify 2^1 + ... + 2^10 traces without additional RPC requests.
    /** @type {number[][]} */
    let layer = [[]];
    for (let length=1;length<=10;length++) {
      /** @type {number[][]} */
      const next = [];
      for (const prefix of layer) for (let bit=0;bit<2;bit++) {
        const word=[...prefix,bit];
        next.push(word);
        assert.deepEqual(learnedTrace(learned.machine,word),privateTrace(secret,word));
        heldout++;
      }
      layer=next;
    }
    return {index,learnedStates:learned.machine.access.length,requests:learned.requests,
      experiments:learned.experiments,heldout,sourceDisclosed:false,
      unauthorizedStatus:unauthenticated.status,elapsedMs:learned.elapsedMs};
  } finally {
    globalThis.fetch=nativeFetch;
    if (server) await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {number} [count]
 * @returns {Promise<{scenarios:number,requests:number,heldout:number,allExact:boolean,
 *   details:Awaited<ReturnType<typeof scenario>>[]}>}
 */
async function runStateful(count=4) {
  if(!Number.isSafeInteger(count)||count<1||count>16)throw new RangeError('count 1..16');
  /** @type {Awaited<ReturnType<typeof scenario>>[]} */
  const details=[];
  for(let index=0;index<count;index++)details.push(await scenario(index));
  return {scenarios:details.length,requests:details.reduce((sum,item)=>sum+item.requests,0),
    heldout:details.reduce((sum,item)=>sum+item.heldout,0),
    allExact:details.every(item=>item.learnedStates===4 && item.unauthorizedStatus===403 && !item.sourceDisclosed),
    details};
}

if(require.main===module) {
  runStateful().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={makeMachine,privateTrace,learnMachine,learnedTrace,scenario,runStateful};
