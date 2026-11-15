'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

/** @param {string} executable @param {string[]} args */
function run(executable,args) {
  const result=spawnSync(process.execPath,[executable,...args],{encoding:'utf8'});
  assert.equal(result.status,0,`command: ${executable} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('COO CLI transforms and executes an actual two-file ESM program',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cli-coo-'));
  try{
    const input=path.join(root,'input'),output=path.join(root,'output');
    await fs.mkdir(input);
    await atomicWrite(path.join(input,'state.mjs'),'export const state={secret:17};');
    await atomicWrite(path.join(input,'index.mjs'),'import {state} from "./state.mjs";console.log(state.secret);');
    run(path.join(__dirname,'../bin/coo.js'),['--root',input,'--entry','index.mjs','--out',output,'--closed-world','--seed','cli-check']);
    const processed=await fs.readFile(path.join(output,'index.mjs'),'utf8');
    assert.doesNotMatch(processed,/\.secret\b/);
    const result=run(path.join(output,'index.mjs'),[]);
    assert.equal(result.trim(),'17');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('SNO CLI generates a single integrity-checking launcher',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cli-sno-'));
  try{
    const input=path.join(root,'input'),output=path.join(root,'output');
    await fs.mkdir(input);
    await atomicWrite(path.join(input,'index.cjs'),'module.exports=require("./helper.cjs").answer;');
    await atomicWrite(path.join(input,'helper.cjs'),'module.exports={answer:29};');
    run(path.join(__dirname,'../bin/sno.js'),['--root',input,'--entry','index.cjs','--out',output,'--seed','cli-check']);
    const loader=path.join(output,'sno-entry.cjs');
    const check=spawnSync(process.execPath,['-e',`console.log(require(${JSON.stringify(loader)}))`],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);
    const result=check.stdout;
    assert.equal(result.trim(),'29');
    await atomicWrite(path.join(output,'helper.cjs'),'module.exports={answer:31};');
    const tampered=spawnSync(process.execPath,[loader],{encoding:'utf8'});
    assert.notEqual(tampered.status,0);
    assert.match(tampered.stderr,/Integrity check failed/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('SCO CLI serves distinct valid JavaScript bodies from its Node entrypoint',async()=>{
  const http=require('node:http');
  const net=require('node:net');
  const {spawn}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cli-sco-'));
  const candidate=net.createServer();
  await new Promise(resolve=>candidate.listen(0,'127.0.0.1',resolve));
  const address=candidate.address();
  assert.ok(address && typeof address!=='string');
  const port=address.port;
  await new Promise(resolve=>candidate.close(resolve));
  let server;
  try {
    await atomicWrite(path.join(root,'index.mjs'),'globalThis.scoMessage="freshly-rendered-value";');
    server=spawn(process.execPath,[path.join(__dirname,'../bin/sco.js'),'--root',root,'--entry','index.mjs','--port',String(port)],{
      stdio:['ignore','pipe','pipe']
    });
    const ready=Promise.race([
      new Promise((resolve,reject)=>{
        server.stdout.on('data',data=>{
          if(data.toString().includes('SCO listening'))resolve();
        });
        server.once('exit',code=>reject(Error(`SCO child exited ${code}`)));
      }),
      new Promise((resolve,reject)=>setTimeout(()=>reject(Error('SCO startup exceeded 8 seconds')),8000).unref())
    ]);
    await ready;
    /** @returns {Promise<{status:number,body:string}>} */
    const fetch=()=>new Promise((resolve,reject)=>{
      http.get({host:'127.0.0.1',port,path:'/obfs/index.mjs'},res=>{
        let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:text}));
      }).on('error',reject);
    });
    const [first,second]=await Promise.all([fetch(),fetch()]);
    assert.equal(first.status,200);
    assert.equal(second.status,200);
    assert.notEqual(first.body,second.body);
    assert.match(first.body,/globalThis\.scoMessage/);
  } finally {
    if(server){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
    await fs.rm(root,{recursive:true,force:true});
  }
});
