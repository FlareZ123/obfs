'use strict';

const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {test}=require('node:test');
const {atomicWrite}=require('../src/atomic');

/**
 * Run a file-writing regression with a fresh directory and guaranteed cleanup.
 * @param {(directory:string)=>Promise<void>} exercise
 * @returns {Promise<void>}
 */
async function withDirectory(exercise) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-atomic-test-'));
  try {await exercise(directory);}
  finally {await fs.rm(directory,{recursive:true,force:true});}
}

/**
 * Launch a separate Node process that writes using the same exported module.
 * Its READY message confirms the writer has reached the lock attempt path.
 * @param {string} destination
 * @param {string} payload
 * @returns {{ready:Promise<void>,completed:Promise<void>,hasExited:()=>boolean}}
 */
function spawnWriter(destination,payload) {
  const code=[
    "'use strict';",
    'const {atomicWrite}=require(process.argv[1]);',
    "process.stdout.write('READY\\n');",
    'atomicWrite(process.argv[2],process.argv[3])',
    "  .then(()=>process.stdout.write('DONE\\n'))",
    '  .catch(error=>{console.error(error);process.exitCode=1;});'
  ].join('\n');
  const child=spawn(process.execPath,['-e',code,require.resolve('../src/atomic'),destination,payload],{
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  let errors='';
  let exited=false;
  /** @type {(value:void)=>void} */
  let signalReady;
  /** @type {(reason:Error)=>void} */
  let signalFailure;
  const ready=new Promise((resolve,reject)=>{signalReady=resolve;signalFailure=reject;});
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{
    output+=chunk;
    if(output.includes('READY\n'))signalReady();
  });
  child.stderr.on('data',chunk=>{errors+=chunk;});
  const completed=new Promise((resolve,reject)=>{
    child.once('error',error=>{exited=true;signalFailure(error);reject(error);});
    child.once('exit',code=>{
      exited=true;
      if(!output.includes('READY\n'))signalFailure(new Error('Writer exited before READY: '+errors));
      if(code===0&&output.includes('DONE\n'))resolve();
      else reject(new Error('Writer failed ('+code+'): '+errors+' '+output));
    });
  });
  return {ready,completed,hasExited:()=>exited};
}

test('atomicWrite preserves exact binary bytes and removes temporary artifacts',async()=>{
  await withDirectory(async directory=>{
    const destination=path.join(directory,'artifact.bin');
    const content=Buffer.from([0,255,128,10,13,0,42]);
    await atomicWrite(destination,content);
    assert.deepEqual(await fs.readFile(destination),content);
    assert.deepEqual(await fs.readdir(directory),['artifact.bin']);
  });
});

test('atomicWrite times out on another writer lock without changing the destination',async()=>{
  await withDirectory(async directory=>{
    const destination=path.join(directory,'artifact.js');
    await atomicWrite(destination,'original');
    const lock=await fs.open(destination+'.lock','wx');
    try {
      await assert.rejects(atomicWrite(destination,'replacement',{timeoutMs:80}),
        /** @param {unknown} error */error=>
          Boolean(error&&typeof error==='object'&&'code' in error&&error.code==='EEXIST'));
      assert.equal(await fs.readFile(destination,'utf8'),'original');
      assert.deepEqual((await fs.readdir(directory)).sort(),['artifact.js','artifact.js.lock']);
    } finally {
      await lock.close();
      await fs.rm(destination+'.lock',{force:true});
    }
  });
});

test('atomicWrite serializes a distinct process behind an existing file lock',async()=>{
  await withDirectory(async directory=>{
    const destination=path.join(directory,'entry.mjs');
    await atomicWrite(destination,'first');
    const lock=await fs.open(destination+'.lock','wx');
    /** @type {ReturnType<typeof spawnWriter>|undefined} */
    let writer;
    try {
      writer=spawnWriter(destination,'second');
      await writer.ready;
      await new Promise(resolve=>setTimeout(resolve,100));
      assert.equal(writer.hasExited(),false,'Writer must wait while lock belongs to parent');
      assert.equal(await fs.readFile(destination,'utf8'),'first');
    } finally {
      await lock.close();
      await fs.rm(destination+'.lock',{force:true});
    }
    assert.ok(writer);
    await writer.completed;
    assert.equal(await fs.readFile(destination,'utf8'),'second');
    assert.deepEqual(await fs.readdir(directory),['entry.mjs']);
  });
});

test('atomicWrite cleans lock and temporary files if destination is a directory',async()=>{
  await withDirectory(async directory=>{
    const destination=path.join(directory,'occupied');
    await fs.mkdir(destination);
    await assert.rejects(atomicWrite(destination,'cannot replace directory'));
    assert.deepEqual(await fs.readdir(directory),['occupied']);
    assert.deepEqual(await fs.readdir(destination),[]);
    await fs.rmdir(destination);
    await atomicWrite(destination,'recovered');
    assert.equal(await fs.readFile(destination,'utf8'),'recovered');
    assert.deepEqual(await fs.readdir(directory),['occupied']);
  });
});
