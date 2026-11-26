'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');
const {main}=require('../src/cli');

/** @returns {Promise<number>} */
async function unusedPort() {
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Expected TCP address');
  await new Promise(resolve=>server.close(resolve));
  return address.port;
}

/**
 * Spawn SCO on a clean port and query the specified paths.
 * @param {string} root
 * @param {string[]} additionalArgs
 * @param {string[]} names
 * @returns {Promise<Map<string,{status:number,body:string}>>}
 */
async function requestSco(root,additionalArgs,names) {
  const port=await unusedPort();
  const child=spawn(process.execPath,[
    path.join(__dirname,'../bin/sco.js'),'--root',root,'--entry','index.mjs',
    '--port',String(port),...additionalArgs
  ],{stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([
      new Promise((resolve,reject)=>{
        child.once('error',reject);
        child.once('exit',code=>reject(new Error('SCO exited before listening: '+code)));
        child.stdout.on('data',data=>{
          if(data.toString().includes('SCO listening'))resolve(null);
        });
      }),
      new Promise((resolve,reject)=>setTimeout(()=>reject(new Error('SCO startup timed out')),8000).unref())
    ]);
    /** @type {Map<string,{status:number,body:string}>} */
    const results=new Map();
    for(const name of names) {
      const encoded=name.split('/').map(encodeURIComponent).join('/');
      const response=await fetch('http://127.0.0.1:'+port+'/obfs/'+encoded);
      results.set(name,{status:response.status,body:await response.text()});
    }
    return results;
  }finally{
    child.kill();
    if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
  }
}

test('SCO CLI withholds unreferenced JS and only exposes graph or explicitly selected files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-public-scope-'));
  try {
    await atomicWrite(path.join(root,'index.mjs'),
      `import {value} from './lib/helper.mjs';import {greeting} from './café/hello world.mjs';import {version} from './assets/r%C3%A9sum%C3%A9%23v1.mjs';globalThis.publicValue=value;globalThis.greeting=greeting;globalThis.version=version;async function load(){return import('./lazy.mjs');}if(false){import('./private/dormant.mjs');}`);
    await atomicWrite(path.join(root,'lib','helper.mjs'),
      'export const value="public-helper";');
    await atomicWrite(path.join(root,'café','hello world.mjs'),
      'export const greeting="bonjour";');
    await atomicWrite(path.join(root,'assets','résumé#v1.mjs'),
      'export const version="encoded-path";');
    await atomicWrite(path.join(root,'lazy.mjs'),
      'export const value="public-lazy";');
    await atomicWrite(path.join(root,'private','secret.cjs'),
      'const SERVER_ONLY_SECRET="server-secret-never-ship";module.exports=SERVER_ONLY_SECRET;');
    await atomicWrite(path.join(root,'private','secret.mjs'),
      'export const SERVER_ONLY_SECRET="server-secret-never-ship";');
    await atomicWrite(path.join(root,'private','dormant.mjs'),
      'export const DORMANT_SECRET="dormant-import-never-ship";');
    await atomicWrite(path.join(root,'independent.js'),
      'globalThis.independent=true;import("./independent-child.mjs");');
    await atomicWrite(path.join(root,'independent-child.mjs'),
      'export const worker="public-child";');
    await atomicWrite(path.join(root,'style.css'),'body{color:red;}');

    const paths=['index.mjs','lib/helper.mjs','café/hello world.mjs','assets/résumé#v1.mjs','lazy.mjs','private/secret.cjs',
      'private/secret.mjs','private/dormant.mjs','independent.js','independent-child.mjs','style.css'];
    const baseline=await requestSco(root,[],paths);
    for(const name of paths.slice(0,4))assert.equal(baseline.get(name)?.status,200,name);
    for(const name of paths.slice(4))assert.equal(baseline.get(name)?.status,404,name);
    for(const observed of baseline.values()) {
      assert.ok(!observed.body.includes('server-secret-never-ship') &&
        !observed.body.includes('dormant-import-never-ship'),
        'Private source leaked in an SCO response');
    }

    const explicit=await requestSco(root,['--client','lazy.mjs','--client','independent.js',
      '--client','independent-child.mjs','--asset','style.css'],paths);
    for(const name of [...paths.slice(0,5),'independent.js','independent-child.mjs','style.css']) {
      assert.equal(explicit.get(name)?.status,200,name);
    }
    for(const name of ['private/secret.cjs','private/secret.mjs','private/dormant.mjs']) {
      assert.equal(explicit.get(name)?.status,404,name);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('SCO CLI rejects repeated-separator ESM paths that POSIX normalization would misresolve',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-ambiguous-url-path-'));
  try {
    await atomicWrite(path.join(root,'index.mjs'),
      'import {value} from "./a//../dep.mjs";globalThis.value=value;');
    await atomicWrite(path.join(root,'dep.mjs'),'export const value="posix-target";');
    await atomicWrite(path.join(root,'a','dep.mjs'),'export const value="url-target";');
    const port=await unusedPort();
    const child=spawnSync(process.execPath,[
      path.join(__dirname,'../bin/sco.js'),'--root',root,'--entry','index.mjs',
      '--port',String(port)
    ],{encoding:'utf8',timeout:8000,windowsHide:true});
    if(child.error)throw child.error;
    assert.notEqual(child.status,0,child.stdout);
    assert.match(child.stderr,/SCO noncanonical ESM import path unsupported: \.\/a\/\/\.\.\/dep\.mjs/u);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('SCO CLI rejects terminal dot-segment ESM paths that would over-publish a file',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-terminal-dot-url-path-'));
  try {
    await atomicWrite(path.join(root,'index.mjs'),
      'import {value} from "./private.mjs/.";globalThis.value=value;');
    await atomicWrite(path.join(root,'private.mjs'),
      'export const value="must-remain-private";');
    const port=await unusedPort();
    const child=spawnSync(process.execPath,[
      path.join(__dirname,'../bin/sco.js'),'--root',root,'--entry','index.mjs',
      '--port',String(port)
    ],{encoding:'utf8',timeout:8000,windowsHide:true});
    assert.notEqual(child.error?.code,'ETIMEDOUT',
      'SCO accepted the noncanonical import and remained listening');
    if(child.error)throw child.error;
    assert.notEqual(child.status,0,child.stdout);
    assert.match(child.stderr,/SCO noncanonical ESM import path unsupported: \.\/private\.mjs\/\./u);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});


test('SCO CLI rejects an explicitly selected DEL filename before listening',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-del-public-path-'));
  try {
    await atomicWrite(path.join(root,'index.mjs'),'export const ready=true;');
    await assert.rejects(main('sco',[
      '--root',root,'--entry','index.mjs','--client','del\\u007f.mjs'
    ]),/Unsafe file path:/u);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
