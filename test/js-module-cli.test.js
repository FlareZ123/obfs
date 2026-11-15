'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {readArgs}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/**
 * Run the actual production CLI with a deterministic Node executable.
 * @param {string} binary
 * @param {string[]} argv
 * @returns {ReturnType<typeof spawnSync>}
 */
function cli(binary,argv) {
  return spawnSync(process.execPath,[path.join(__dirname,'../bin',binary),...argv],{
    encoding:'utf8',timeout:15000
  });
}

test('CLI --js-module is explicit and rejects SNO mode',()=>{
  const parsed=readArgs(['--root','src','--entry','index.js','--js-module']);
  assert.equal(parsed.jsModule,true);
  assert.equal(readArgs(['--root','src','--entry','index.js']).jsModule,false);
  const processResult=cli('sno.js',['--root','missing','--entry','index.js','--out','out','--js-module']);
  assert.notEqual(processResult.status,0);
  assert.match(processResult.stderr,/--js-module is for browser COO or SCO/);
});

test('COO CLI preserves, renames, and executes ordinary .js ESM graph on opt-in',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cli-js-esm-'));
  try {
    const input=path.join(root,'input');
    const output=path.join(root,'output');
    await fs.mkdir(input);
    await atomicWrite(path.join(input,'state.js'),'export const state={privateValue:19};');
    await atomicWrite(path.join(input,'main.js'),
      'import {state} from "./state.js";console.log(state.privateValue);');
    const run=cli('coo.js',[
      '--root',input,'--entry','main.js','--out',output,
      '--js-module','--closed-world','--seed','cli-js-module'
    ]);
    assert.equal(run.status,0,run.stderr);
    const transformed=await fs.readFile(path.join(output,'main.js'),'utf8');
    assert.doesNotMatch(transformed,/\.privateValue\b/);
    await atomicWrite(path.join(output,'package.json'),JSON.stringify({type:'module'}));
    const executed=spawnSync(process.execPath,[path.join(output,'main.js')],{
      encoding:'utf8',timeout:10000
    });
    assert.equal(executed.status,0,executed.stderr);
    assert.equal(executed.stdout.trim(),'19');
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('SCO CLI --js-module serves valid browser .js imports via HTTP',async()=>{
  const http=require('node:http');
  const net=require('node:net');
  const {spawn}=require('node:child_process');
  const {parse}=require('../src/ast');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cli-sco-js-'));
  const reservation=net.createServer();
  await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const address=reservation.address();
  assert.ok(address && typeof address!=='string');
  const port=address.port;
  await new Promise(resolve=>reservation.close(resolve));
  /** @type {ReturnType<typeof spawn>|undefined} */
  let server;
  try {
    await atomicWrite(path.join(root,'entry.js'),'import {value} from "./state.js";export const answer=value;');
    await atomicWrite(path.join(root,'state.js'),'export const value=17;');
    server=spawn(process.execPath,[path.join(__dirname,'../bin/sco.js'),
      '--root',root,'--entry','entry.js','--port',String(port),'--js-module'],{
      stdio:['ignore','pipe','pipe']
    });
    const ready=Promise.race([
      new Promise((resolve,reject)=>{
        server.stdout.on('data',data=>{
          if(String(data).includes('SCO listening'))resolve(undefined);
        });
        server.once('exit',code=>reject(Error(`SCO child exited ${code}`)));
      }),
      new Promise((resolve,reject)=>setTimeout(()=>reject(Error('SCO startup timeout')),8000).unref())
    ]);
    await ready;
    /** @param {string} name @returns {Promise<{status:number,code:string}>} */
    function fetch(name) {
      return new Promise((resolve,reject)=>{
        http.get({host:'127.0.0.1',port,path:`/obfs/${name}`},res=>{
          let code='';
          res.setEncoding('utf8');
          res.on('data',chunk=>code+=chunk);
          res.on('end',()=>resolve({status:res.statusCode,code}));
        }).on('error',reject);
      });
    }
    const entry=await fetch('entry.js');
    assert.equal(entry.status,200);
    assert.match(entry.code,/import\s*\{/);
    assert.match(entry.code,/export\s+const/);
    assert.doesNotThrow(()=>parse(entry.code,'module'));
    const state=await fetch('state.js');
    assert.equal(state.status,200);
    assert.doesNotThrow(()=>parse(state.code,'module'));
  } finally {
    if(server) {
      server.kill();
      await new Promise(resolve=>server.once('exit',resolve));
    }
    await fs.rm(root,{recursive:true,force:true});
  }
});
