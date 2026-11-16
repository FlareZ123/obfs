'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {partitionScoSelectedAsyncExports,bindScoModuleExports,createScoHandler}=require('../src');

const root=path.join(__dirname,'../examples/sco-static-imports');
const seed='sco-static-import-20261116';

/**
 * @param {string} code
 * @param {import('../src/sco-selective-partition').ScoSelectiveOptions} [options]
 * @returns {import('../src/sco-selective-partition').ScoSelectivePartition}
 */
function partition(code,options={}){
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code},{
    seed,privateNames:['protectedDigest'],...options
  });
}

test('SCO named builtin imports require an explicit, narrowly scoped opt-in',async()=>{
  const source=await fs.readFile(path.join(root,'before/mixed.mjs'),'utf8');
  assert.throws(()=>partition(source),/explicitly enabled named Node builtin imports/);
  assert.throws(()=>partition(source,{allowServerImports:'yes'}),
    /distinct privateNames/);
  const invalid=[
    'import {x} from "./other.mjs";',
    'import {x} from "crypto";',
    'import {x} from "node:unknown-module";',
    'import * as x from "node:crypto";',
    'import x from "node:crypto";',
    'import "node:crypto";'
  ];
  for(const statement of invalid) {
    const code=statement+
      'export async function protectedDigest(){return 7;}'+
      'export function local(){return 8;}';
    assert.throws(()=>partition(code,{allowServerImports:true}),
      /explicitly enabled named Node builtin imports/,statement);
  }
});

test('SCO keeps server-only imported bindings out of every public function',()=>{
  const head='import {createHash as secretHasher} from "node:crypto";';
  const secret='export async function protectedDigest(){return secretHasher("sha256").digest("hex");}';
  const publicRead='export function local(){return secretHasher("sha256").digest("hex");}';
  assert.throws(()=>partition(head+secret+publicRead,{allowServerImports:true}),
    /server-only constant: local/);
  const publicHelper='function helper(){return secretHasher("sha256");}';
  const consumer='export function local(){return 17;}';
  assert.throws(()=>partition(head+publicHelper+secret+consumer,{
    allowServerImports:true,publicHelperNames:['helper']
  }),/server-only constant: helper/);
});

test('SCO accepts multiple explicit named Node builtin imports without client disclosure',()=>{
  const code=[
    'import {createHash} from "node:crypto";',
    'import {Buffer as PrivateBuffer} from "node:buffer";',
    'export async function protectedDigest(v){return createHash("sha256").update(PrivateBuffer.from(v)).digest("hex");}',
    'export function local(v){return v.length;}'
  ].join('\n');
  const compiled=partition(code,{allowServerImports:true});
  assert.deepEqual(compiled.privateNames,['protectedDigest']);
  assert.doesNotMatch(compiled.clientFile.code,/node:crypto|node:buffer|PrivateBuffer|createHash/u);
  assert.match(compiled.clientFile.code,/export function local/u);
  const original=await import('data:text/javascript,'+encodeURIComponent(code));
  const methods=bindScoModuleExports(compiled,original);
  for(const value of ['','alpha','Ωmega']){
    assert.equal(await methods[compiled.methodNames.protectedDigest](value),
      await original.protectedDigest(value));
  }
});

test('SCO generated static-import facade matches pinned source and authenticated native behavior',{
  timeout:60000
},async()=>{
  const source=(await fs.readFile(path.join(root,'before/mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const expected=(await fs.readFile(path.join(root,'after/mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const compiled=partition(source,{allowServerImports:true});
  assert.equal(compiled.clientFile.code,expected,'Generated facade drifted from checked-in before/after');
  assert.deepEqual(compiled.publicNames,['format','combined']);
  assert.deepEqual(compiled.privateNames,['protectedDigest']);
  assert.doesNotMatch(expected,/node:crypto|serverHmac|PRIVATE_KEY|SERVER_ONLY_IMPORT_KEY/u);
  const original=await import('data:text/javascript,'+encodeURIComponent(source));
  const registry=bindScoModuleExports(compiled,original);
  const nativeFetch=globalThis.fetch;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try {
    server=http.createServer(createScoHandler([compiled.clientFile],{
      remoteMethods:registry,
      authorizeRead:req=>req.headers['x-test-session']==='allow',
      authorizeRpc:req=>req.headers['x-test-session']==='allow',
      authorizeOperation:(req,method,args)=>req.headers['x-test-session']==='allow' &&
        method===compiled.methodNames.protectedDigest &&
        args.length===1 && typeof args[0]==='string'
    }));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    assert.equal((await nativeFetch(origin+'/obfs/mixed.mjs')).status,403);
    const authorized=await nativeFetch(origin+'/obfs/mixed.mjs',{
      headers:{'x-test-session':'allow'}
    });
    assert.equal(authorized.status,200);
    const delivered=await authorized.text();
    assert.doesNotMatch(delivered,/node:crypto|serverHmac|PRIVATE_KEY|SERVER_ONLY_IMPORT_KEY/u);
    const denied=await nativeFetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({method:compiled.methodNames.protectedDigest,args:['x']})
    });
    assert.equal(denied.status,403);
    globalThis.fetch=(url,options)=>nativeFetch(new URL(/** @type {string} */ (url),origin),{
      ...options,headers:{...options?.headers,'x-test-session':'allow'}
    });
    const client=await import('data:text/javascript,'+encodeURIComponent(expected));
    for(const value of ['', ' alpha ','Ωmega','A'.repeat(8192)]){
      assert.equal(client.format(value),original.format(value));
      assert.equal(await client.protectedDigest(value),await original.protectedDigest(value));
      assert.equal(await client.combined(value),await original.combined(value));
    }
  }finally{
    globalThis.fetch=nativeFetch;
    if(server)await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
