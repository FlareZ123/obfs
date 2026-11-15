'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
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
    'let x=7;export async function secret(){return x;}export function local(){return 2;}',
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
    'export async function secret(){}export async function secret(){}export function local(){}',
    'const key={value:7};export async function secret(){return key;}export function local(){return 2;}',
    'const key=Date.now();export async function secret(){return key;}export function local(){return 2;}'
  ];
  for(const source of bad)assert.throws(()=>partition(source,['secret']),Error,source);
  assert.throws(()=>partition('export async function secret(){}export function local(){}',
    ['missing']),/Unknown private/);
  assert.throws(()=>partition('export async function secret(){}export function local(){}',
    ['secret','secret']),/distinct privateNames/);
});


test('selective SCO rejects split function-object and ambient-state mutation',async()=>{
  const sharedFunction=[
    'export function visible(){return visible.counter||0;}',
    'export async function privateBump(){visible.counter=42;return 1;}',
    'export async function run(){await privateBump();return visible();}'
  ].join('\n');
  const original=await import('data:text/javascript,'+encodeURIComponent(sharedFunction));
  assert.equal(await original.run(),42,'Original private/public exports share one function');
  assert.throws(()=>partition(sharedFunction,['privateBump']),/separated public binding/);

  const sharedGlobal=[
    'export function visible(){return globalThis.sharedFlag;}',
    'export async function privateBump(){globalThis.sharedFlag=42;return 1;}'
  ].join('\n');
  assert.throws(()=>partition(sharedGlobal,['privateBump']),/share ambient state/);
  const aliasGlobal=[
    'export function visible(){return window.sharedFlag;}',
    'export async function privateBump(){globalThis.sharedFlag=42;}'
  ].join('\n');
  assert.throws(()=>partition(aliasGlobal,['privateBump']),/share ambient state/);

  const privateSingleton=[
    'export function visible(){return 7;}',
    'export async function privateBump(){privateBump.counter=(privateBump.counter||0)+1;return privateBump.counter;}'
  ].join('\n');
  const one=await import('data:text/javascript,'+encodeURIComponent(privateSingleton)+'#one');
  const two=await import('data:text/javascript,'+encodeURIComponent(privateSingleton)+'#two');
  assert.equal(await one.privateBump(),1);
  assert.equal(await two.privateBump(),1);
  assert.throws(()=>partition(privateSingleton,['privateBump']),/stateful private function value/);

  const privateEval=[
    'export function visible(){return 7;}',
    'export async function privateBump(){return eval("visible()");}'
  ].join('\n');
  assert.throws(()=>partition(privateEval,['privateBump']),/dynamic lexical execution/);
});


test('selective SCO distinguishes private binding references from ordinary property labels',()=>{
  const labels=[
    'export async function secret(){return {local:12,secret:1};}',
    'export function local(){const record={secret:7};return record.secret;}'
  ].join('\n');
  const generated=partition(labels,['secret']);
  assert.deepEqual(generated.publicNames,['local']);
  assert.ok(generated.clientFile.code.includes('record.secret'));

  const shorthand=[
    'export async function secret(){return 1;}',
    'export function local(){const record={secret};return record.secret;}'
  ].join('\n');
  assert.throws(()=>partition(shorthand,['secret']),/observes a private function value/);

  const computed=[
    'export async function secret(){return 1;}',
    'export function local(){const record={[secret]:1};return record;}'
  ].join('\n');
  assert.throws(()=>partition(computed,['secret']),/observes a private function value/);
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
  assert.doesNotMatch(expected,/privateRound|privateKeyBytes|privateHex/u);
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

test('selective SCO with private primitive constants preserves public and protected HMAC',{
  timeout:60000
},async()=>{
  const dirname=path.join(__dirname,'../examples/sco-private-const');
  const source=(await fs.readFile(path.join(dirname,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const golden=(await fs.readFile(path.join(dirname,'after','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const selected=partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code:source},{
    seed:'sco-private-const-20261115',privateNames:['protectedDigest']
  });
  assert.equal(selected.clientFile.code,golden);
  assert.deepEqual(selected.publicNames,['normalize','run']);
  assert.deepEqual(selected.privateNames,['protectedDigest']);
  assert.doesNotMatch(golden,/SERVER_KEY|SCO_SERVER_ONLY_HMAC|createHmac/u);
  assert.match(source,/SCO_SERVER_ONLY_HMAC/u);
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const remoteMethods=bindScoModuleExports(selected,original);
  const originalFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    let executions=0;
    server=http.createServer(createScoHandler([selected.clientFile],{
      remoteMethods,
      authorizeRead:req=>req.headers['x-test-session']==='allow',
      authorizeRpc:req=>req.headers['x-test-session']==='allow',
      authorizeOperation:(req,method,args)=>{
        executions++;
        return req.headers['x-test-session']==='allow' &&
          method===selected.methodNames.protectedDigest &&
          args.length===1 && typeof args[0]==='string';
      }
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected listening TCP port');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await originalFetch(origin+'/obfs/mixed.mjs')).status,403);
    const allowed=await originalFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-test-session':'allow'}
    });
    assert.equal(allowed.status,200);
    assert.equal(await allowed.text(),golden);
    globalThis.fetch=(url,options)=>originalFetch(new URL(/** @type {string} */ (url),origin),{
      ...options,headers:{...options?.headers,'x-test-session':'allow'}
    });
    const client=await import('data:text/javascript,'+encodeURIComponent(golden));
    for(const input of ['  Alpha  ','βeta','42']){
      assert.equal(client.normalize(input),original.normalize(input));
      assert.equal(await client.run(input),await original.run(input));
    }
    assert.equal(executions,3);
  }finally{
    globalThis.fetch=originalFetch;
    if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('selective SCO rejects retained public reads of private constants',()=>{
  const cases=[
    'const SECRET="key";export async function secret(){return SECRET;}export function local(){return SECRET;}',
    'const SECRET=5;export async function secret(){return SECRET;}export function local(){return String(SECRET);}',
    'const SECRET=null;export async function secret(){return SECRET;}export const local=()=>SECRET;'
  ];
  for(const source of cases)assert.throws(()=>partition(source,['secret']),/server-only constant/);
});

test('selective SCO server environment key stays outside source and Chromium-compatible ESM facade',{
  timeout:60000
},async()=>{
  const folder=path.join(__dirname,'../examples/sco-private-env');
  const source=(await fs.readFile(path.join(folder,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const golden=(await fs.readFile(path.join(folder,'after','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{seed:'sco-private-env-20261115',privateNames:['protectedDigest']}),
  /primitive literal/);
  const generated=partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:source
  },{
    seed:'sco-private-env-20261115',privateNames:['protectedDigest'],
    allowServerEnvConstants:true
  });
  assert.equal(generated.clientFile.code,golden);
  assert.doesNotMatch(golden,/process|SERVER_KEY|OBFS_SCO_SERVER_KEY|createHmac/u);
  const previousKey=process.env.OBFS_SCO_SERVER_KEY;
  const originalFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try{
    process.env.OBFS_SCO_SERVER_KEY=randomBytes(32).toString('hex');
    const original=await import('data:text/javascript,'+encodeURIComponent(source));
    const registry=bindScoModuleExports(generated,original);
    server=http.createServer(createScoHandler([generated.clientFile],{
      remoteMethods:registry,
      authorizeRead:req=>req.headers['x-test-session']==='allow',
      authorizeRpc:req=>req.headers['x-test-session']==='allow',
      authorizeOperation:(req,method,args)=>
        req.headers['x-test-session']==='allow'&&
        method===generated.methodNames.protectedDigest &&
        args.length===1 && typeof args[0]==='string'
    }));
    /** @type {Promise<void>} */
    const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
    await ready;
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected environment test TCP port');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await originalFetch(origin+'/obfs/mixed.mjs')).status,403);
    const response=await originalFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-test-session':'allow'}
    });
    assert.equal(response.status,200);
    assert.equal(await response.text(),golden);
    globalThis.fetch=(url,options)=>originalFetch(new URL(/** @type {string} */ (url),origin),{
      ...options,headers:{...options?.headers,'x-test-session':'allow'}
    });
    const client=await import('data:text/javascript,'+encodeURIComponent(golden));
    for(const value of ['  Alpha  ','βeta','42']){
      assert.equal(client.normalize(value),original.normalize(value));
      assert.equal(await client.run(value),await original.run(value));
    }
  }finally{
    globalThis.fetch=originalFetch;
    if(server){
      const running=server;
      /** @type {Promise<void>} */
      const closed=new Promise((resolve,reject)=>running.close(error=>error?reject(error):resolve()));
      await closed;
    }
    if(previousKey===undefined)delete process.env.OBFS_SCO_SERVER_KEY;
    else process.env.OBFS_SCO_SERVER_KEY=previousKey;
  }
});

test('selective SCO server environment opt-in refuses public process reads and dynamic keys',()=>{
  const base='export async function protectedDigest(){return SERVER_KEY;}'+
    'export function local(){return 7;}';
  const invalid=[
    'const SERVER_KEY=process.env[process.env.KEY_NAME];'+base,
    'const SERVER_KEY=process.env["lowerCase"];'+base,
    'const SERVER_KEY=process["env"].OBFS_KEY;'+base,
    'const SERVER_KEY=globalThis.process.env.OBFS_KEY;'+base
  ];
  for(const source of invalid){
    assert.throws(()=>partitionScoSelectedAsyncExports({
      path:'mixed.mjs',code:source
    },{seed:'env-negative',privateNames:['protectedDigest'],
      allowServerEnvConstants:true}),/primitive literal/);
  }
  const unsafe='const SERVER_KEY=process.env.OBFS_KEY;'+
    'export async function protectedDigest(){return SERVER_KEY;}'+
    'export function local(){return process.version;}';
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',code:unsafe
  },{seed:'env-public',privateNames:['protectedDigest'],
    allowServerEnvConstants:true}),/cannot share server environment/);
  for(const ambient of ['globalThis','global','window','self','document']){
    const alias='const SERVER_KEY=process.env.OBFS_KEY;'+
      'export async function protectedDigest(){return SERVER_KEY;}'+
      'export function local(){return '+ambient+'.process.env.OBFS_KEY;}';
    assert.throws(()=>partitionScoSelectedAsyncExports({
      path:'mixed.mjs',code:alias
    },{seed:'env-ambient-'+ambient,privateNames:['protectedDigest'],
      allowServerEnvConstants:true}),/cannot share server environment/);
  }
  const implicitThis='const SERVER_KEY=process.env.OBFS_KEY;'+
    'export async function protectedDigest(){return SERVER_KEY;}'+
    'export function local(){return this.process.env.OBFS_KEY;}';
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',code:implicitThis
  },{seed:'env-this',privateNames:['protectedDigest'],
    allowServerEnvConstants:true}),/cannot share server environment/);
  const bracket='const SERVER_KEY=process.env["OBFS_KEY"];'+base;
  const accepted=partitionScoSelectedAsyncExports({path:'mixed.mjs',code:bracket},{
    seed:'env-bracket',privateNames:['protectedDigest'],allowServerEnvConstants:true
  });
  assert.doesNotMatch(accepted.clientFile.code,/OBFS_KEY/u);
});
