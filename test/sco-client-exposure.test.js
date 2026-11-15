'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

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
      const response=await fetch('http://127.0.0.1:'+port+'/obfs/'+name);
      results.set(name,{status:response.status,body:await response.text()});
    }
    return results;
  }finally{
    child.kill();
    await new Promise(resolve=>child.once('exit',resolve));
  }
}

test('SCO CLI withholds unreferenced JS and only exposes graph or explicitly selected files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-public-scope-'));
  try {
    await atomicWrite(path.join(root,'index.mjs'),
      `import {value} from './lib/helper.mjs';globalThis.publicValue=value;async function load(){return import('./lazy.mjs');}`);
    await atomicWrite(path.join(root,'lib','helper.mjs'),
      'export const value="public-helper";');
    await atomicWrite(path.join(root,'lazy.mjs'),
      'export const value="public-lazy";');
    await atomicWrite(path.join(root,'private','secret.cjs'),
      'const SERVER_ONLY_SECRET="server-secret-never-ship";module.exports=SERVER_ONLY_SECRET;');
    await atomicWrite(path.join(root,'private','secret.mjs'),
      'export const SERVER_ONLY_SECRET="server-secret-never-ship";');
    await atomicWrite(path.join(root,'independent.js'),'globalThis.independent=true;');
    await atomicWrite(path.join(root,'style.css'),'body{color:red;}');

    const paths=['index.mjs','lib/helper.mjs','lazy.mjs','private/secret.cjs',
      'private/secret.mjs','independent.js','style.css'];
    const baseline=await requestSco(root,[],paths);
    for(const name of paths.slice(0,3))assert.equal(baseline.get(name)?.status,200,name);
    for(const name of paths.slice(3))assert.equal(baseline.get(name)?.status,404,name);
    for(const observed of baseline.values()) {
      assert.ok(!observed.body.includes('server-secret-never-ship'),
        'Private source leaked in an SCO response');
    }

    const explicit=await requestSco(root,['--client','independent.js','--asset','style.css'],paths);
    for(const name of [...paths.slice(0,3),'independent.js','style.css']) {
      assert.equal(explicit.get(name)?.status,200,name);
    }
    for(const name of ['private/secret.cjs','private/secret.mjs']) {
      assert.equal(explicit.get(name)?.status,404,name);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
