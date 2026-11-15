'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {atomicWrite}=require('../src/atomic');
const {parse}=require('../src/ast');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');

const runFile=promisify(execFile);

test('SCO partition recognizes immutable async expression exports, retaining metadata and RPC arity',async()=>{
  const privateCanary='PRIVATE-SCO-ARROW-IMPLEMENTATION-24601';
  const source=[
    'export const add=async (a,b)=>{',
    ' const hidden='+JSON.stringify(privateCanary)+';',
    ' return {sum:a+b,second:b};',
    '};',
    'export const measure=async function(value){',
    ' return {received:arguments.length,value:value*2};',
    '};',
    'export const named=async function localName(value){',
    ' return {received:arguments.length, value:value+3};',
    '};'
  ].join('\n');
  const partition=partitionScoAsyncModule({
    path:'private.mjs',sourceType:'module',code:source
  },{seed:'async-const-expressions',batch:true,maxBatchCalls:4});
  assert.deepEqual(partition.names,['add','measure','named']);
  assert.doesNotThrow(()=>parse(partition.clientFile.code,'module'));
  assert.ok(!partition.clientFile.code.includes(privateCanary));
  assert.ok(!partition.clientFile.code.includes('arguments.length'));
  assert.equal(partition.clientFile.code.includes('async function localName'),true);

  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-const-partition-'));
  const privateFile=path.join(dir,'server','original.mjs');
  const clientFile=path.join(dir,'public','private.mjs');
  await atomicWrite(privateFile,source);
  const namespace=await import(pathToFileURL(privateFile).href);
  const methods=bindScoModuleExports(partition,namespace);
  const allowedIds=new Set(Object.values(partition.methodNames));
  if(partition.batchMethod)allowedIds.add(partition.batchMethod);

  const server=http.createServer(createScoHandler([partition.clientFile],{
    remoteMethods:methods,
    authorizeRead:request=>request.headers.cookie==='session=allow',
    authorizeRpc:request=>request.headers.cookie==='session=allow',
    authorizeOperation:(request,method,args)=>request.headers.cookie==='session=allow' &&
      allowedIds.has(method) && args.length<=3
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected TCP listener');
    const port=address.port;
    const denied=await fetch('http://127.0.0.1:'+port+'/obfs/private.mjs');
    assert.equal(denied.status,403);
    const response=await fetch('http://127.0.0.1:'+port+'/obfs/private.mjs',{
      headers:{cookie:'session=allow'}
    });
    assert.equal(response.status,200);
    const served=await response.text();
    assert.ok(!served.includes(privateCanary));
    await atomicWrite(clientFile,served);

    const script=[
      'const {pathToFileURL}=require("node:url");',
      'const realFetch=globalThis.fetch;',
      'const port=process.argv[2];',
      'const authorized=process.argv[3]==="allow";',
      'globalThis.fetch=(route,opts)=>realFetch(new URL(route,"http://127.0.0.1:"+port),{',
      '...opts,headers:{...opts.headers,...(authorized?{cookie:"session=allow"}:{})}});',
      'import(pathToFileURL(process.argv[1]).href).then(async ns=>{try{',
      'const metadata=Object.fromEntries(["add","measure","named"].map(key=>{',
      'const fn=ns[key];return [key,{name:fn.name,length:fn.length,ownPrototype:Object.hasOwn(fn,"prototype")}];',
      '}));',
      'const outputs=[await ns.add(4,7),await ns.add(4),',
      'await ns.measure(),await ns.measure(2,9,15),await ns.named(6,8),',
      'await ns.batch([{name:"measure",args:[8]},{name:"named",args:[7]}])];',
      'console.log(JSON.stringify({metadata,outputs}));',
      '}catch(error){console.log(JSON.stringify({error:error.message}));}',
      '}).catch(error=>{console.error(error);process.exitCode=1;});'
    ].join('');
    /** @param {'allow'|'deny'} session @returns {Promise<any>} */
    async function call(session) {
      const result=await runFile(process.execPath,[
        '--eval',script,clientFile,String(port),session
      ],{encoding:'utf8',timeout:15000});
      return JSON.parse(result.stdout);
    }
    const result=await call('allow');
    const metadata=Object.fromEntries(['add','measure','named'].map(name=>{
      const fn=namespace[name];
      return [name,{name:fn.name,length:fn.length,ownPrototype:Object.hasOwn(fn,'prototype')}];
    }));
    assert.deepEqual(result.metadata,metadata);
    assert.deepEqual(result.outputs,[
      await namespace.add(4,7),
      await namespace.add(4),
      await namespace.measure(),
      await namespace.measure(2,9,15),
      await namespace.named(6,8),
      {0:undefined}
    ].slice(0,5).concat([[{ok:true,value:await namespace.measure(8)},{ok:true,value:await namespace.named(7)}]]));
    assert.deepEqual(await call('deny'),{error:'Remote operation failed'});
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(dir,{recursive:true,force:true});
  }
});

test('SCO expression partition declines unsupported exports and unproven receivers',()=>{
  const invalid=[
    'export const counter=1;',
    'export let task=async x=>x;',
    'export var task=async x=>x;',
    'export const task=x=>x;',
    'export const task=async function*(x){yield x;}',
    'export const task=async(x=1)=>x;',
    'export const task=async(...args)=>args;',
    'export const task=async({x})=>x;',
    'export const task=async x=>this.x;',
    'export const task=async function(x){return this.x;}',
    'export const task=async x=>x,privateKey=1;',
    'export {task};const task=async x=>x;',
    'const task=async x=>x;export {task};',
    'export default async x=>x;'
  ];
  for(const code of invalid) {
    assert.throws(()=>partitionScoAsyncModule({path:'denied.mjs',code}),
      /RPC partition/,code);
  }
});

test('SCO const async expression partition retains server-only module initialization',async()=>{
  const privateKey='server-resident-closure-738114';
  const source='const privateKey='+JSON.stringify(privateKey)+';'+
    'export const verify=async input=>input===privateKey;';
  assert.throws(()=>partitionScoAsyncModule({path:'client.mjs',code:source}),/RPC partition/);
  const partition=partitionScoAsyncModule({path:'client.mjs',code:source},{
    serverOnlyInitialization:true,seed:'private-expr'
  });
  assert.ok(!partition.clientFile.code.includes(privateKey));
  assert.equal(partition.names[0],'verify');
  const serverExports={verify:async input=>input===privateKey};
  const bound=bindScoModuleExports(partition,serverExports);
  assert.equal(await bound[partition.methodNames.verify](privateKey),true);
  assert.equal(await bound[partition.methodNames.verify]('wrong'),false);
});
