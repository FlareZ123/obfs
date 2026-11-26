'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{id:number,specifier:string,target:string,decoy:string}} ControlCase */
/** @typedef {{listening:boolean,stderr:string,results?:Map<string,{status:number,body:string}>}} ProbeResult */

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
 * Start the actual SCO CLI and request each selected source path.
 * A startup refusal is returned with stderr so a future pathname guard can
 * satisfy the regression without exposing the decoy.
 * @param {string} root
 * @param {string[]} names
 * @returns {Promise<ProbeResult>}
 */
async function probeSco(root,names) {
  const port=await unusedPort();
  const child=spawn(process.execPath,[
    path.join(__dirname,'../bin/sco.js'),'--root',root,'--entry','index.mjs',
    '--port',String(port)
  ],{stdio:['ignore','pipe','pipe']});
  let stderr='';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{stderr+=chunk;});

  const startup=await new Promise(/** @type {(resolve:(value:{listening:boolean,stderr:string})=>void)=>void} */ (resolve=>{
    let settled=false;
    /** @param {{listening:boolean,stderr:string}} value */
    const finish=value=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.on('data',chunk=>{
      if(String(chunk).includes('SCO listening'))finish({listening:true,stderr});
    });
    child.once('error',error=>finish({listening:false,stderr:stderr+'\n'+String(error)}));
    child.once('exit',()=>finish({listening:false,stderr}));
    const timer=setTimeout(()=>finish({listening:false,stderr:stderr+'\nSCO startup timed out'}),8000);
    timer.unref();
  }));

  if(!startup.listening) {
    if(child.exitCode===null)child.kill();
    return startup;
  }

  try {
    /** @type {Map<string,{status:number,body:string}>} */
    const results=new Map();
    for(const name of names) {
      const encoded=name.split('/').map(encodeURIComponent).join('/');
      const response=await fetch('http://127.0.0.1:'+port+'/obfs/'+encoded);
      results.set(name,{status:response.status,body:await response.text()});
    }
    return {...startup,results};
  } finally {
    child.kill();
    if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
  }
}

test('SCO publishes the WHATWG URL target and withholds POSIX decoys for C0 specifiers',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-url-c0-publication-'));
  try {
    /** @type {ControlCase[]} */
    const cases=[];
    const controls=['\t','\n','\r'];
    let id=0;
    for(const control of controls) {
      for(const dotSegment of ['.','..']) {
        for(let offset=0;offset<=dotSegment.length;offset++) {
          const segment=dotSegment.slice(0,offset)+control+dotSegment.slice(offset);
          cases.push({
            id,
            specifier:'./a/'+segment+'/../secret-'+id+'.mjs',
            target:(dotSegment==='.'?'dir/':'')+'secret-'+id+'.mjs',
            decoy:'dir/a/secret-'+id+'.mjs'
          });
          id++;
        }
      }
    }
    assert.equal(cases.length,15,'The matrix covers every insertion position in . and .. for TAB/LF/CR');

    await atomicWrite(path.join(root,'index.mjs'),'import "./dir/entry.mjs";');
    const imports=cases.map(item=>
      'import {value as value'+item.id+'} from '+JSON.stringify(item.specifier)+';'
    ).join('\n');
    await atomicWrite(path.join(root,'dir','entry.mjs'),imports+'\n');

    /** @type {string[]} */
    const requestNames=['index.mjs','dir/entry.mjs'];
    for(const item of cases) {
      await atomicWrite(path.join(root,item.target),
        'export const value="url-target-'+item.id+'";');
      await atomicWrite(path.join(root,item.decoy),
        'export const value="posix-decoy-'+item.id+'";');
      requestNames.push(item.target,item.decoy);
    }

    const probe=await probeSco(root,requestNames);
    if(!probe.listening) {
      assert.match(probe.stderr,/SCO .*import path unsupported|noncanonical ESM import|URL pathname.*control/u,
        'A fail-closed startup refusal must identify the unsupported ESM pathname');
      return;
    }

    const observed=cases.map(item=>({
      id:item.id,
      target:probe.results?.get(item.target)?.status,
      decoy:probe.results?.get(item.decoy)?.status
    }));
    const expected=cases.map(item=>({id:item.id,target:200,decoy:404}));
    assert.deepEqual(observed,expected,
      'Native ESM resolves the URL target; SCO must not publish the distinct POSIX-selected decoy');
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
