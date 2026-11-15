'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {partitionScoAsyncModule,bindScoModuleExports,createScoHandler}=require('../src');

const runFile=promisify(execFile);

test('SCO private initialization opt-in retains server imports and secrets exclusively on server',async()=>{
  const secret='private-server-hmac-key-f3e104ab';
  const code=[
    'import {createHmac} from "node:crypto";',
    'const privateKey='+JSON.stringify(secret)+';',
    'export async function sign(value){',
    ' return createHmac("sha256",privateKey).update(value).digest("hex");',
    '}'
  ].join('\n');

  assert.throws(()=>partitionScoAsyncModule({path:'protected.mjs',code}),/only direct exported/);
  assert.throws(()=>partitionScoAsyncModule({
    path:'protected.mjs',code:code+'\nexport const accidentallyPublished=privateKey;'
  },{serverOnlyInitialization:true}),/only direct exported/);

  const partition=partitionScoAsyncModule({
    path:'protected.mjs',sourceType:'module',code
  },{serverOnlyInitialization:true,seed:'server-only-init'});
  assert.ok(!partition.clientFile.code.includes(secret));
  assert.ok(!partition.clientFile.code.includes('node:crypto'));
  assert.ok(!partition.clientFile.code.includes('createHmac'));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-private-init-'));
  const privateFile=path.join(directory,'server','secret.mjs');
  const clientFile=path.join(directory,'browser','protected.mjs');
  await atomicWrite(privateFile,code);

  const original=await import(pathToFileURL(privateFile).href);
  const expected=await original.sign('message');
  const methods=bindScoModuleExports(partition,original);
  const server=http.createServer(createScoHandler([partition.clientFile],{
    remoteMethods:methods,
    authorizeRead:()=>true,
    authorizeRpc:request=>request.headers.cookie==='session=allow',
    authorizeOperation:(request,method,args)=>request.headers.cookie==='session=allow' &&
      method===partition.methodNames.sign && args.length===1 && typeof args[0]==='string'
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected listener');
    const port=address.port;
    const response=await fetch('http://127.0.0.1:'+port+'/obfs/protected.mjs');
    assert.equal(response.status,200);
    const publicSource=await response.text();
    assert.ok(!publicSource.includes(secret));
    assert.ok(!publicSource.includes('node:crypto'));
    await atomicWrite(clientFile,publicSource);

    const runner=[
      'const {pathToFileURL}=require("node:url");',
      'const originalFetch=globalThis.fetch;',
      'const allowed=process.argv[2]==="allow";',
      'globalThis.fetch=(endpoint,options)=>originalFetch(new URL(endpoint,"http://127.0.0.1:"+process.argv[3]),',
      '{...options,headers:{...options.headers,...(allowed?{cookie:"session=allow"}:{})}});',
      'import(pathToFileURL(process.argv[1]).href).then(async mod=>{try{',
      'const value=await mod.sign("message");',
      'process.stdout.write(JSON.stringify({ok:true,value,exports:Object.keys(mod)}));',
      '}catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message}));}',
      '}).catch(error=>{console.error(error);process.exitCode=1;});'
    ].join('');
    /** @param {'allow'|'deny'} session @returns {Promise<any>} */
    async function invoke(session) {
      const child=await runFile(process.execPath,['--eval',runner,clientFile,session,String(port)],{
        encoding:'utf8',timeout:15000
      });
      return JSON.parse(child.stdout);
    }
    assert.deepEqual(await invoke('allow'),{ok:true,value:expected,exports:['sign']});
    assert.deepEqual(await invoke('deny'),{ok:false,error:'Remote operation failed'});
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await fs.rm(directory,{recursive:true,force:true});
  }
});
