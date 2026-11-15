'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {parse}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');

const runFile=promisify(execFile);

test('SCO partition refuses modules with residual client-visible effects or ambiguous wrappers',()=>{
  const invalid=[
    'export function sync(a){return a;}',
    'export async function* generate(){yield 1;}',
    'export async function defaults(value=10){return value;}',
    'export async function bound(){return this;}',
    'const secret="private";export async function remote(){return secret;}',
    'import "./side-effect.mjs";export async function remote(){return 1;}',
    'export const value=23;',
    'export default async function remote(){return 1;}',
    'export async function spread(...args){return args.length;}',
    'export async function destructure({value}){return value;}'
  ];
  for(const code of invalid) {
    assert.throws(()=>partitionScoAsyncModule({path:'remote.mjs',code}),TypeError,code);
  }
  assert.throws(()=>partitionScoAsyncModule({path:'remote.cjs',code:'export async function go(){}'}),/\.mjs or \.js/);
  assert.throws(()=>partitionScoAsyncModule({path:'remote.mjs',code:'export async function go(){}'},{
    endpoint:'//wrong.example/rpc'
  }),/same-origin/);
});

test('SCO partition transmits only generated async stubs, keeping server code private',async()=>{
  const secret='secret-original-module-implementation-482713';
  const source=[
    'export async function pair(a,b){',
    ' const canary='+JSON.stringify(secret)+';',
    ' return {canary,sum:a+b,argc:arguments.length};',
    '}',
    'export async function fail(value){',
    ' throw new Error("private-throw-"+value);',
    '}'
  ].join('\n');
  const partition=partitionScoAsyncModule({
    path:'remote.mjs',sourceType:'module',code:source
  },{seed:'partition-fixture'});

  assert.equal(partition.names.join(','),'pair,fail');
  assert.notEqual(partition.methodNames.pair,'pair');
  assert.notEqual(partition.methodNames.fail,'fail');
  assert.equal(partition.clientFile.path,'remote.mjs');
  assert.ok(!partition.clientFile.code.includes(secret));
  assert.ok(!partition.clientFile.code.includes('private-throw'));
  assert.doesNotThrow(()=>parse(partition.clientFile.code,'module'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-partition-'));
  const serverFile=path.join(directory,'protected','original.mjs');
  const clientFile=path.join(directory,'public','remote.mjs');
  await atomicWrite(serverFile,source);
  const serverExports=await import(pathToFileURL(serverFile).href);
  const serverMethods=bindScoModuleExports(partition,serverExports);
  assert.equal(Object.keys(serverMethods).length,2);
  assert.ok(!Object.keys(serverMethods).includes('pair'));
  assert.throws(()=>bindScoModuleExports(partition,{pair:()=>1}),/Missing executable server export/);

  const server=http.createServer(createScoHandler([partition.clientFile],{
    remoteMethods:serverMethods,
    authorizeRead:request=>request.headers.cookie==='session=allow',
    authorizeRpc:request=>request.headers.cookie==='session=allow',
    authorizeOperation:(request,method,args)=>request.headers.cookie==='session=allow' &&
      (method===partition.methodNames.pair || method===partition.methodNames.fail) &&
      Array.isArray(args)
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected listener');
    const port=address.port;
    const endpoint='http://127.0.0.1:'+port+'/obfs/remote.mjs';
    const denied=await fetch(endpoint);
    assert.equal(denied.status,403);
    const response=await fetch(endpoint,{headers:{cookie:'session=allow'}});
    assert.equal(response.status,200);
    const served=await response.text();
    assert.ok(!served.includes(secret));
    assert.ok(!served.includes('private-throw'));
    await atomicWrite(clientFile,served);

    const runner=[
      'const {pathToFileURL}=require("node:url");',
      'const originalFetch=globalThis.fetch;',
      'const allowed=process.argv[2]==="allow";',
      'const port=process.argv[4];',
      'globalThis.fetch=(endpoint,options)=>originalFetch(new URL(endpoint,"http://127.0.0.1:"+port),',
      '{...options,headers:{...options.headers,...(allowed?{cookie:"session=allow"}:{})}});',
      'import(pathToFileURL(process.argv[1]).href).then(async module=>{',
      'const fn=module[process.argv[3]];',
      'try{const value=await fn(5,8,99);',
      'process.stdout.write(JSON.stringify({ok:true,name:fn.name,length:fn.length,value}));',
      '}catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message}));}',
      '}).catch(error=>{console.error(error);process.exitCode=1;});'
    ].join('');

    /**
     * @param {'allow'|'deny'} session
     * @param {'pair'|'fail'} method
     * @returns {Promise<any>}
     */
    async function call(session,method) {
      const output=await runFile(process.execPath,['--eval',runner,clientFile,session,method,String(port)],{
        encoding:'utf8',timeout:15000
      });
      return JSON.parse(output.stdout);
    }
    assert.deepEqual(await call('allow','pair'),{
      ok:true,name:'pair',length:2,value:{canary:secret,sum:13,argc:3}
    });
    assert.deepEqual(await call('deny','pair'),{ok:false,error:'Remote operation failed'});
    assert.deepEqual(await call('allow','fail'),{ok:false,error:'Remote operation failed'});
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
});
