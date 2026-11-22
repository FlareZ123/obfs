'use strict';

const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {atomicWrite,withDirectoryLock}=require('../src/atomic');

/** @param {string} output @param {string} id @param {boolean} group */
async function publisher(output,id,group) {
  const publish=async()=>{
    await atomicWrite(path.join(output,'first.js'),id);
    if(id==='A') {
      process.send?.({type:'half',id});
      await new Promise(resolve=>{
        process.once('message',message=>{
          if(message==='continue')resolve();
        });
      });
    }
    await atomicWrite(path.join(output,'second.js'),id);
  };
  process.send?.({type:'started',id});
  if(group)await withDirectoryLock(output,publish,{timeoutMs:10000});
  else await publish();
  process.send?.({type:'done',id});
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} type
 * @returns {Promise<void>}
 */
function awaitMessage(child,type) {
  return new Promise((resolve,reject)=>{
    /** @param {{type?:string}} msg */
    const onMessage=msg=>{
      if(msg.type===type){cleanup();resolve();}
    };
    /** @param {number|null} code */
    const onExit=code=>{cleanup();reject(new Error('Child exited early with '+code));};
    const cleanup=()=>{child.off('message',onMessage);child.off('exit',onExit);};
    child.on('message',onMessage);
    child.once('exit',onExit);
  });
}

/** @param {string} mode @returns {Promise<{first:string,second:string}>} */
async function runPair(mode) {
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-publish-sft-'));
  const output=path.join(parent,'dist');
  await fs.mkdir(output);
  await atomicWrite(path.join(output,'first.js'),'0');
  await atomicWrite(path.join(output,'second.js'),'0');
  const run=id=>fork(__filename,['writer',output,id,mode],{stdio:['ignore','ignore','inherit','ipc']});
  const a=run('A');
  const aHalf=awaitMessage(a,'half');
  const aDone=awaitMessage(a,'done');
  /** @type {import('node:child_process').ChildProcess|undefined} */let b;
  try {
    await aHalf;
    console.log(mode+': A published first.js and is paused');
    b=run('B');
    const bStarted=awaitMessage(b,'started');
    const bDone=awaitMessage(b,'done');
    if(mode==='ungrouped'){
      await bDone;
      console.log(mode+': B published both files while A is paused');
    }else{
      await bStarted;
      console.log(mode+': B attempted publication and is waiting for A');
    }
    a.send('continue');
    await aDone;
    if(mode==='grouped')await bDone;
    const first=await fs.readFile(path.join(output,'first.js'),'utf8');
    const second=await fs.readFile(path.join(output,'second.js'),'utf8');
    console.log(mode+': final pair '+JSON.stringify({first,second}));
    return {first,second};
  }finally {
    a.kill();b?.kill();
    await fs.rm(parent,{recursive:true,force:true});
  }
}

if(process.argv[2]==='writer') {
  publisher(process.argv[3],process.argv[4],process.argv[5]==='grouped')
    .catch(error=>{console.error(error);process.exitCode=1;});
}else {
  (async()=>{
    const baseline=await runPair('ungrouped');
    const locked=await runPair('grouped');
    assert.notEqual(baseline.first,baseline.second,'Pre-fix schedule must create a mixed generation');
    assert.equal(locked.first,locked.second,'Directory lock must prevent mixed generations');
    console.log('PASS: deterministic cross-process baseline red, directory-lock green');
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
