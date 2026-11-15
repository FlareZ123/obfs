'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {parse}=require('../src/ast');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const ROOT=path.join(__dirname,'../examples/sco-selective');
const CANARY='SCO_SELECTIVE_SERVER_ONLY_CANARY_73159';
const SEED='sco-selective-20261115-example';

/** @param {string} source @param {string[]} [privateNames] */
function partition(source,privateNames=['protectedDigest']){
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',code:source,sourceType:'module'},
    {seed:SEED,privateNames});
}

test('selective SCO rejects escaped private exports, reflection and ambiguous graphs',()=>{
  const bad=[
    'const x=7;export async function secret(){return x;}export function local(){return 2;}',
    'export * from "./secret.mjs";export async function secret(){}export function local(){}',
    'import "./setup.mjs";export async function secret(){}export function local(){}',
    'export let local=1;export async function secret(){}',
    'export default function local(){}export async function secret(){}',
    'export function secret(){}export function local(){}',
    'export async function secret(){}export function local(){return secret;}',
    'export async function secret(){}export function local(){return String(secret);}',
    'export async function secret(){}export function local(){return secret.name;}',
    'export async function secret(){}export function local(){return eval("secret");}',
    'export async function secret(){}export function local(){return import("./secret.mjs");}',
    'export async function secret(){}export function local(){return new Function("return secret");}',
    'export async function secret(){}export const local=()=>1,other=()=>2;',
    'export async function secret(){}',
    'export async function secret(){}export async function secret(){}export function local(){}'
  ];
  for(const source of bad)assert.throws(()=>partition(source,['secret']),Error,source);
  assert.throws(()=>partition('export async function secret(){}export function local(){}',
    ['missing']),/Unknown private/);
  assert.throws(()=>partition('export async function secret(){}export function local(){}',
    ['secret','secret']),/distinct privateNames/);
});

test('selective SCO preserves locally run source and exact generated public module',async()=>{
  const original=(await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const actual=partition(original);
  const expected=(await fs.readFile(path.join(ROOT,'after','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  assert.equal(actual.clientFile.code,expected,'Checked-in generated facade differs');
  assert.deepEqual(actual.publicNames,['normalize','fastScore','report','combined']);
  assert.deepEqual(actual.privateNames,['protectedDigest']);
  assert.doesNotThrow(()=>parse(expected,'module'));
  assert.ok(expected.includes('globalThis.externalBridge.accept'));
  assert.ok(expected.includes('export async function protectedDigest(value)'));
  assert.ok(!expected.includes(CANARY));
  assert.ok(!expected.includes('createHmac'));
  assert.ok(!expected.includes('16000'));
  assert.deepEqual(Object.keys(actual.methodNames),['protectedDigest']);
});

test('selective SCO real HTTP preserves cross-module imports and external APIs',{
  timeout:60000
},async()=>{
  const source=await fs.readFile(path.join(ROOT,'before','mixed.mjs'),'utf8');
  const partitioned=partition(source);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-selective-sco-'));
  const originalFetch=globalThis.fetch;
  const oldBridge=globalThis.externalBridge;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try {
    for(const root of ['original','client']){
      await atomicWrite(path.join(dir,root,'consumer.mjs'),
        'import {combined,report} from "./mixed.mjs";\n'+
        'export async function run(value){return {local:report(value.length),protected:await combined(value)};}\n');
    }
    await atomicWrite(path.join(dir,'original','mixed.mjs'),source);
    await atomicWrite(path.join(dir,'client','mixed.mjs'),partitioned.clientFile.code);
    const original=await import(pathToFileURL(path.join(dir,'original','consumer.mjs')).href);
    const privateNamespace=await import(pathToFileURL(path.join(dir,'original','mixed.mjs')).href);
    const remoteMethods=bindScoModuleExports(partitioned,privateNamespace);
    let protectedExecutions=0;
    server=http.createServer(createScoHandler([partitioned.clientFile],{
      remoteMethods,
      authorizeRead:req=>req.headers['x-test-session']==='allow',
      authorizeRpc:req=>req.headers['x-test-session']==='allow',
      authorizeOperation:(req,method,args)=>{
        protectedExecutions++;
        return req.headers['x-test-session']==='allow' &&
          method===partitioned.methodNames.protectedDigest &&
          args.length===1 && typeof args[0]==='string';
      }
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP server address');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await originalFetch(origin+'/obfs/mixed.mjs')).status,403);
    const delivered=await originalFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-test-session':'allow'}
    });
    assert.equal(delivered.status,200);
    assert.equal((await delivered.text()).includes(CANARY),false);
    assert.equal((await originalFetch(origin+'/obfs/private.mjs',{
      headers:{'x-test-session':'allow'}
    })).status,404);
    const denied=await originalFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:partitioned.methodNames.protectedDigest,args:['example']})
    });
    assert.equal(denied.status,403);
    globalThis.externalBridge={accept:/** @param {number} v */ v=>v^0xa55a};
    globalThis.fetch=(url,options)=>originalFetch(new URL(/** @type {string} */ (url),origin),{
      ...options,headers:{...options?.headers,'x-test-session':'allow'}
    });
    const client=await import(pathToFileURL(path.join(dir,'client','consumer.mjs')).href);
    for(const value of ['  Alpha  ','βeta','42']){
      assert.deepEqual(await client.run(value),await original.run(value));
    }
    assert.equal(protectedExecutions,3);
  }finally{
    globalThis.fetch=originalFetch;
    if(oldBridge===undefined)delete globalThis.externalBridge;
    else globalThis.externalBridge=oldBridge;
    if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(dir,{recursive:true,force:true});
  }
});
