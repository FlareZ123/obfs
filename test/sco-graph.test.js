'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {partitionScoAsyncGraph,bindScoGraphExports}=require('../src');
const {build,SEED}=require('../examples/sco-graph/build.cjs');
const {startServer}=require('../examples/sco-graph/server.cjs');

const ROOT=path.join(__dirname,'../examples/sco-graph');
const INPUT='0123456789abcdef0123456789abcdef';

test('SCO graph refuses ambiguous imports, accidental publication and incomplete paths',()=>{
  const base={path:'private.mjs',code:'export async function sign(x){return x;}'};
  /** @param {{path:string,code:string}[]} files @param {string[]} exposed */
  function make(files,exposed) {
    return partitionScoAsyncGraph(files,{seed:'graph-negative',exposedPaths:exposed});
  }
  const bad=[
    [{path:'api.mjs',code:'import "./missing.mjs";export async function sign(){return 1;}'}],
    [{path:'api.mjs',code:'import "./sub/../secret.mjs";export async function sign(){return 1;}'}],
    [{path:'api.mjs',code:'import "left-pad";export async function sign(){return 1;}'}],
    [{path:'api.mjs',code:'export async function sign(x){return import(x);}' }],
    [{path:'api.mjs',code:'export async function sign(){return import("./missing.mjs");}'}],
    [{path:'api.mjs',code:'export async function sign(){return eval(\'import("./hidden.mjs")\');}'}],
    [{path:'api.mjs',code:'export async function sign(){return Function(\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'export async function sign(){return new Function(\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'export async function sign(){return globalThis["Function"](\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'const loader=Function;export async function sign(){return loader(\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'const {Function: loader}=globalThis;export async function sign(){return loader(\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'let loader;loader=globalThis.Function;export async function sign(){return loader(\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'const loader=(0,Function);export async function sign(){return loader(\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'export async function sign(){return Function.call(null,\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'export async function sign(){return globalThis["F"+"unction"].call(null,\'return import("./hidden.mjs")\')();}'}],
    [{path:'api.mjs',code:'import {createRequire} from "node:module";export async function sign(){return 1;}'}],
    [{path:'api.mjs',code:'import * as vm from "node:vm";export async function sign(){return 1;}'}],
    [{path:'api.mjs',code:'import {Worker} from "node:worker_threads";export async function sign(){return 1;}'}],
    [{path:'api.mjs',code:'import {spawn} from "node:child_process";export async function sign(){return 1;}'}],
    [{path:'api.mjs',code:'export async function sign(){return process.getBuiltinModule("module");}'}],
    [{path:'api.mjs',code:'export async function sign(){return globalThis.process["getBuiltinModule"]("module");}'}],
    [{path:'api.mjs',code:'export const publicKey="mistake";'}],
    [{path:'api.mjs',code:'export async function sign(){return 1;}'},{path:'API.mjs',code:'export async function sign(){return 2;}'}]
  ];
  for(const files of bad)assert.throws(()=>make(files,['api.mjs']),TypeError,files[0].code);
  assert.throws(()=>make([base],['private.mjs','private.mjs']),/duplicate exposed/);
  assert.throws(()=>make([base],['other.mjs']),/Missing or duplicate exposed/);
  assert.throws(()=>make([base],[]),/explicit exposedPaths/);
  assert.throws(()=>make([{path:'../illegal.mjs',code:base.code}],['../illegal.mjs']),TypeError);
  assert.throws(()=>make([{path:'api.cjs',code:base.code}],['api.cjs']),/only .mjs/);

  assert.throws(()=>make([
    {path:'api.mjs',code:'import "./sub/../secret.mjs";export async function sign(){return 1;}'},
    {path:'secret.mjs',code:'export const x=1;'}
  ],['api.mjs']),/noncanonical/);
  const nested=make([
    {path:'sub/api.mjs',code:'import {x} from "../secret.mjs";export async function sign(){return x;}'},
    {path:'secret.mjs',code:'export const x=2;'}
  ],['sub/api.mjs']);
  assert.equal(nested.clientFiles.length,1);
  assert.equal(nested.privatePaths[0],'secret.mjs');

  const valid=make([
    {path:'api.mjs',code:'import {x} from "./secret.mjs";export async function sign(){return x;}'},
    {path:'secret.mjs',code:'export const x="private";'}
  ],['api.mjs']);
  assert.deepEqual(valid.exposedPaths,['api.mjs']);
  assert.deepEqual(valid.privatePaths,['secret.mjs']);
  assert.equal(valid.clientFiles.length,1);
  assert.ok(!valid.clientFiles[0].code.includes('private'));
  assert.equal(Object.keys(valid.partitions).length,1);
  assert.throws(()=>bindScoGraphExports(valid,{}),/Missing private ESM namespace/);
  assert.throws(()=>bindScoGraphExports(valid,{'api.mjs':{}}),/Missing executable server export/);
});

test('published SCO graph modules are exact generated facades with no private source',async()=>{
  const graph=await build();
  assert.equal(graph.clientFiles.length,2);
  assert.deepEqual(graph.exposedPaths,['api.mjs','audit.mjs']);
  assert.deepEqual(graph.privatePaths,['secret.mjs']);
  for(const emitted of graph.clientFiles){
    const actual=await fs.readFile(path.join(ROOT,'after',emitted.path),'utf8');
    assert.equal(actual,emitted.code,'Generated public facade is stale: '+emitted.path);
    assert.ok(!actual.includes('PRIVATE_GRAPH_SOURCE_CANARY_631744'));
    assert.ok(!actual.includes('OBFS_SCO_GRAPH_KEY'));
    assert.ok(!actual.includes('calculateDigest'));
    assert.ok(!actual.includes('node:crypto'));
    assert.ok(!actual.includes('12000'));
  }
  const fileBytes=graph.clientFiles.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0);
  assert.ok(fileBytes>0);
  const direct=partitionScoAsyncGraph([
    {path:'api.mjs',code:await fs.readFile(path.join(ROOT,'before','api.mjs'),'utf8')},
    {path:'audit.mjs',code:await fs.readFile(path.join(ROOT,'before','audit.mjs'),'utf8')},
    {path:'secret.mjs',code:await fs.readFile(path.join(ROOT,'before','secret.mjs'),'utf8')}
  ],{seed:SEED,exposedPaths:['api.mjs','audit.mjs']});
  assert.deepEqual(direct,graph);
});

test('real private SCO graph preserves authenticated remote behavior and withholds dependency',async()=>{
  const oldKey=process.env.OBFS_SCO_GRAPH_KEY;
  process.env.OBFS_SCO_GRAPH_KEY=randomBytes(32).toString('hex');
  const previousFetch=globalThis.fetch;
  /** @type {Awaited<ReturnType<typeof startServer>>|undefined} */
  let sample;
  try{
    sample=await startServer({token:'integration-demo-token-31'});
    const {origin,token,graph}=sample;
    /** @param {string} name @returns {string} */
    const clientPath=name=>path.join(ROOT,'after',name);
    const authenticated={headers:{'x-demo-token':token}};
    assert.equal((await fetch(origin+'/obfs/api.mjs')).status,403);
    assert.equal((await fetch(origin+'/obfs/audit.mjs')).status,403);
    assert.equal((await fetch(origin+'/obfs/secret.mjs',authenticated)).status,404);
    for(const filename of graph.exposedPaths){
      const response=await fetch(origin+'/obfs/'+filename,authenticated);
      assert.equal(response.status,200);
      const source=await response.text();
      assert.ok(!source.includes('PRIVATE_GRAPH_SOURCE_CANARY_631744'));
      assert.ok(!source.includes('OBFS_SCO_GRAPH_KEY'));
      assert.ok(!source.includes('node:crypto'));
    }
    const rejected=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:graph.partitions['api.mjs'].methodNames.derive,args:[INPUT]})
    });
    assert.equal(rejected.status,403);
    globalThis.fetch=(url,options)=>previousFetch(new URL(
      /** @type {string} */ (url),origin).href,{
        ...options,headers:{...options?.headers,'x-demo-token':token}
      });
    const originalApi=await import(pathToFileURL(path.join(ROOT,'before','api.mjs')).href);
    const originalAudit=await import(pathToFileURL(path.join(ROOT,'before','audit.mjs')).href);
    const remoteApi=await import(pathToFileURL(clientPath('api.mjs')).href);
    const remoteAudit=await import(pathToFileURL(clientPath('audit.mjs')).href);
    const expected=await originalApi.derive(INPUT);
    assert.equal(await remoteApi.derive(INPUT),expected);
    assert.equal(await remoteAudit.verify(INPUT,expected),await originalAudit.verify(INPUT,expected));
    assert.equal(await remoteAudit.verify(INPUT,'0'.repeat(64)),false);
    const serverRegistry=bindScoGraphExports(graph,{
      'api.mjs':originalApi,'audit.mjs':originalAudit
    });
    assert.equal(Object.keys(serverRegistry).length,2);
    /** @type {{native:number[],remote:number[]}} */
    const timings={native:[],remote:[]};
    for(let trial=0;trial<5;trial++){
      const order=/** @type {('native'|'remote')[]} */ (trial%2===0?['native','remote']:['remote','native']);
      for(const kind of order){
        const start=performance.now();
        const actual=kind==='native'?await originalApi.derive(INPUT):await remoteApi.derive(INPUT);
        assert.equal(actual,expected);
        timings[kind].push(performance.now()-start);
      }
    }
    /** @param {number[]} values @returns {number} */
    const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
    console.log('SCO graph private-HMAC latency (five samples, localhost): '+
      JSON.stringify({nativeMedianMs:median(timings.native),
        remoteMedianMs:median(timings.remote),
        ratio:median(timings.remote)/median(timings.native)}));
  }finally{
    globalThis.fetch=previousFetch;
    if(sample){
      const server=sample.server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
      await closed;
    }
    if(oldKey===undefined)delete process.env.OBFS_SCO_GRAPH_KEY;
    else process.env.OBFS_SCO_GRAPH_KEY=oldKey;
  }
});
