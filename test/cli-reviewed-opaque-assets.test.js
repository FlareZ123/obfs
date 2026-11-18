'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createHash}=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const net=require('node:net');
const os=require('node:os');
const path=require('node:path');
const {atomicWrite}=require('../src/atomic');

/** @param {string|Buffer} code @returns {string} */
const digest=code=>createHash('sha256').update(code).digest('hex');
const program='module.exports=17;';
const safeCss=Buffer.from('body{color:teal}');
/** @param {'coo'|'sno'} mode @param {string[]} args */
function cli(mode,args){
  return spawnSync(process.execPath,[path.join(__dirname,'../bin/'+mode+'.js'),...args],{
    encoding:'utf8',timeout:10000
  });
}

/** @returns {Promise<{directory:string,input:string,manifest:string,output:string}>} */
async function fixture(){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reviewed-cli-'));
  const input=path.join(directory,'source'),output=path.join(directory,'out');
  const manifest=path.join(directory,'independently-approved.json');
  await fs.mkdir(input);
  await atomicWrite(path.join(input,'entry.cjs'),program);
  await atomicWrite(path.join(input,'theme.css'),safeCss);
  return {directory,input,manifest,output};
}

/** @param {string} manifest @param {Array<{path:string,sha256:string}>} records */
async function approve(manifest,records){
  await atomicWrite(manifest,JSON.stringify(records));
}

test('COO and SNO CLI accept independently reviewed exact asset bytes',async()=>{
  const f=await fixture();
  try{
    await approve(f.manifest,[{path:'theme.css',sha256:digest(safeCss)}]);
    for(const mode of /** @type {const} */(['coo','sno'])){
      const out=f.output+'-'+mode;
      const response=cli(mode,['--root',f.input,'--entry','entry.cjs',
        '--out',out,'--reviewed-assets',f.manifest]);
      assert.equal(response.status,0,response.stderr);
      assert.deepEqual(await fs.readFile(path.join(out,'theme.css')),safeCss);
      if(mode==='sno')assert.equal(
        spawnSync(process.execPath,[path.join(out,'sno-entry.cjs')],{encoding:'utf8'}).status,0);
    }
  }finally{await fs.rm(f.directory,{recursive:true,force:true});}
});

test('COO and SNO CLI refuse a stale or unreviewed asset before writing outputs',async()=>{
  const f=await fixture();
  try{
    await approve(f.manifest,[{path:'theme.css',sha256:digest('stale')}]);
    for(const mode of /** @type {const} */(['coo','sno'])){
      const out=f.output+'-'+mode;
      const response=cli(mode,['--root',f.input,'--entry','entry.cjs',
        '--out',out,'--reviewed-assets',f.manifest]);
      assert.notEqual(response.status,0);
      assert.match(response.stderr,/Opaque asset differs from reviewed bytes/);
      await assert.rejects(fs.stat(out),{code:'ENOENT'});
    }
  }finally{await fs.rm(f.directory,{recursive:true,force:true});}
});

test('CLI refuses manifest embedded in source tree, including a valid approval',async()=>{
  const f=await fixture();
  try{
    const inside=path.join(f.input,'reviewed.json');
    await approve(inside,[{path:'theme.css',sha256:digest(safeCss)}]);
    for(const mode of /** @type {const} */(['coo','sno'])){
      const out=f.output+'-'+mode;
      const response=cli(mode,['--root',f.input,'--entry','entry.cjs',
        '--out',out,'--reviewed-assets',inside]);
      assert.notEqual(response.status,0);
      assert.match(response.stderr,/manifest must be outside --root/);
      await assert.rejects(fs.stat(out),{code:'ENOENT'});
    }
  }finally{await fs.rm(f.directory,{recursive:true,force:true});}
});

test('CLI refuses non-array manifest JSON instead of silently disabling review',async()=>{
  const f=await fixture();
  try{
    await atomicWrite(f.manifest,'{"theme.css":"'+digest(safeCss)+'"}');
    const result=cli('coo',['--root',f.input,'--entry','entry.cjs',
      '--out',f.output,'--reviewed-assets',f.manifest]);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/requires a JSON array/);
    await assert.rejects(fs.stat(f.output),{code:'ENOENT'});
  }finally{await fs.rm(f.directory,{recursive:true,force:true});}
});

test('SCO CLI serves only explicitly selected reviewed opaque assets',async()=>{
  const f=await fixture();
  const serverFile=path.join(f.input,'entry.mjs');
  /** @type {import('node:child_process').ChildProcessWithoutNullStreams|undefined} */
  let child;
  try{
    await atomicWrite(serverFile,'globalThis.value=17;');
    await approve(f.manifest,[{path:'theme.css',sha256:digest(safeCss)}]);
    const socket=net.createServer();
    await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
    const addr=socket.address();
    assert.ok(addr&&typeof addr!=='string');
    const port=addr.port;
    await new Promise(resolve=>socket.close(resolve));
    child=spawn(process.execPath,[path.join(__dirname,'../bin/sco.js'),
      '--root',f.input,'--entry','entry.mjs','--asset','theme.css',
      '--port',String(port),'--reviewed-assets',f.manifest]);
    await new Promise((resolve,reject)=>{
      /** @type {NodeJS.Timeout} */
      const timeout=setTimeout(()=>reject(new Error('SCO reviewed startup timed out')),8000);
      child.stdout.on('data',data=>{
        if(data.toString().includes('SCO listening')){clearTimeout(timeout);resolve(undefined);}
      });
      child.once('exit',code=>{clearTimeout(timeout);reject(new Error('SCO exited '+code));});
    });
    const response=await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port,path:'/obfs/theme.css'},res=>{
        /** @type {Buffer[]} */
        const buffers=[];
        res.on('data',chunk=>buffers.push(Buffer.from(chunk)));
        res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(buffers)}));
      }).on('error',reject);
    });
    assert.deepEqual(response,{status:200,body:safeCss});
  }finally{
    if(child){
      const exiting=new Promise(resolve=>child.once('exit',resolve));
      child.kill();
      await exiting;
    }
    await fs.rm(f.directory,{recursive:true,force:true});
  }
});

test('SCO CLI rejects unapproved asset bytes during handler setup',async()=>{
  const f=await fixture();
  try{
    await atomicWrite(path.join(f.input,'entry.mjs'),'globalThis.value=17;');
    await approve(f.manifest,[{path:'theme.css',sha256:digest('stale')}]);
    const result=spawnSync(process.execPath,[path.join(__dirname,'../bin/sco.js'),
      '--root',f.input,'--entry','entry.mjs','--asset','theme.css',
      '--port','43891','--reviewed-assets',f.manifest],{encoding:'utf8',timeout:10000});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/Opaque asset differs from reviewed bytes/);
    assert.doesNotMatch(result.stdout,/SCO listening/);
  }finally{await fs.rm(f.directory,{recursive:true,force:true});}
});

test('reviewed manifest policy cannot be overridden by a repeated CLI flag',async()=>{
  const f=await fixture();
  try{
    await approve(f.manifest,[{path:'theme.css',sha256:digest(safeCss)}]);
    const second=path.join(f.directory,'other-approved.json');
    await approve(second,[{path:'theme.css',sha256:digest('untrusted')}]);
    for(const mode of /** @type {const} */(['coo','sno'])){
      const out=f.output+'-'+mode;
      const response=cli(mode,['--root',f.input,'--entry','entry.cjs',
        '--out',out,'--reviewed-assets',f.manifest,'--reviewed-assets',second]);
      assert.notEqual(response.status,0);
      assert.match(response.stderr,/reviewed-assets must be specified once/);
      await assert.rejects(fs.stat(out),{code:'ENOENT'});
    }
  }finally{await fs.rm(f.directory,{recursive:true,force:true});}
});

test('SCO reviewed manifest cannot authorize an unselected private asset',async()=>{
  const f=await fixture();
  try{
    await atomicWrite(path.join(f.input,'entry.mjs'),'globalThis.value=17;');
    await approve(f.manifest,[
      {path:'theme.css',sha256:digest(safeCss)},
      {path:'private.txt',sha256:digest('not-served')}
    ]);
    await atomicWrite(path.join(f.input,'private.txt'),'not-served');
    const response=spawnSync(process.execPath,[path.join(__dirname,'../bin/sco.js'),
      '--root',f.input,'--entry','entry.mjs','--asset','theme.css',
      '--port','43891','--reviewed-assets',f.manifest],{encoding:'utf8',timeout:10000});
    assert.notEqual(response.status,0);
    assert.match(response.stderr,/unused or missing published asset paths/);
    assert.doesNotMatch(response.stdout,/SCO listening/);
  }finally{await fs.rm(f.directory,{recursive:true,force:true});}
});
