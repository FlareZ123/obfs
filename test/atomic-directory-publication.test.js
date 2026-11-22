'use strict';

const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {test}=require('node:test');
const {atomicWrite,withDirectoryLock}=require('../src/atomic');

/** @param {(directory:string)=>Promise<void>} exercise @returns {Promise<void>} */
async function withTemporaryDirectory(exercise) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-publish-lock-'));
  try { await exercise(directory); }
  finally { await fs.rm(directory,{recursive:true,force:true}); }
}

/**
 * Start a cooperating publisher in another Node process.
 * @param {string} destination
 * @returns {{ready:Promise<void>,completed:Promise<void>,hasExited:()=>boolean}}
 */
function spawnPublisher(destination) {
  const code=[
    "'use strict';",
    'const {atomicWrite,withDirectoryLock}=require(process.argv[1]);',
    "process.stdout.write('READY\\n');",
    'withDirectoryLock(process.argv[2],async()=>{',
    "  await atomicWrite(require('node:path').join(process.argv[2],'first.js'),'second-build');",
    "  await atomicWrite(require('node:path').join(process.argv[2],'second.js'),'second-build');",
    '}).then(()=>process.stdout.write("DONE\\n"))',
    '  .catch(error=>{console.error(error);process.exitCode=1;});'
  ].join('\n');
  const child=spawn(process.execPath,['-e',code,require.resolve('../src/atomic'),destination],{
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  let errors='';
  let exited=false;
  /** @type {(value:void)=>void} */ let signalReady;
  /** @type {(reason:Error)=>void} */ let signalFailure;
  const ready=new Promise((resolve,reject)=>{signalReady=resolve;signalFailure=reject;});
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data',data=>{output+=data;if(output.includes('READY\n'))signalReady();});
  child.stderr.on('data',data=>{errors+=data;});
  const completed=new Promise((resolve,reject)=>{
    child.once('error',error=>{exited=true;signalFailure(error);reject(error);});
    child.once('exit',code=>{
      exited=true;
      if(!output.includes('READY\n'))signalFailure(new Error('Publisher exited before READY: '+errors));
      if(code===0&&output.includes('DONE\n'))resolve();
      else reject(new Error('Publisher failed ('+code+'): '+errors+' '+output));
    });
  });
  return {ready,completed,hasExited:()=>exited};
}

test('directory lock is released if the publication callback throws',async()=>{
  await withTemporaryDirectory(async parent=>{
    const destination=path.join(parent,'output');
    await assert.rejects(withDirectoryLock(destination,async()=>{
      await fs.mkdir(destination);
      throw new Error('cannot publish');
    }),/cannot publish/);
    assert.deepEqual(await fs.readdir(parent),['output']);
    await withDirectoryLock(destination,async()=>{
      await atomicWrite(path.join(destination,'index.js'),'recovered');
    });
    assert.equal(await fs.readFile(path.join(destination,'index.js'),'utf8'),'recovered');
  });
});

test('directory lock serializes two-file publication by another Node process',async()=>{
  await withTemporaryDirectory(async parent=>{
    const destination=path.join(parent,'output');
    await fs.mkdir(destination);
    await atomicWrite(path.join(destination,'first.js'),'first-build');
    await atomicWrite(path.join(destination,'second.js'),'first-build');
    const lock=await fs.open(destination+'.obfs.lock','wx',0o600);
    /** @type {ReturnType<typeof spawnPublisher>|undefined} */
    let publisher;
    try {
      publisher=spawnPublisher(destination);
      await publisher.ready;
      await new Promise(resolve=>setTimeout(resolve,100));
      assert.equal(publisher.hasExited(),false,'Publication must wait for the directory lock');
      assert.equal(await fs.readFile(path.join(destination,'first.js'),'utf8'),'first-build');
      assert.equal(await fs.readFile(path.join(destination,'second.js'),'utf8'),'first-build');
    } finally {
      await lock.close();
      await fs.rm(destination+'.obfs.lock',{force:true});
    }
    assert.ok(publisher);
    await publisher.completed;
    assert.equal(await fs.readFile(path.join(destination,'first.js'),'utf8'),'second-build');
    assert.equal(await fs.readFile(path.join(destination,'second.js'),'utf8'),'second-build');
    assert.deepEqual(await fs.readdir(parent),['output']);
  });
});


test('filesystem aliases share a directory lock, including a missing child',async t=>{
  await withTemporaryDirectory(async parent=>{
    const actual=path.join(parent,'real');
    const alias=path.join(parent,'alias');
    await fs.mkdir(actual);
    try { await fs.symlink(actual,alias,process.platform==='win32'?'junction':'dir'); }
    catch(error) {
      if(process.platform==='win32'&&['EPERM','EACCES'].includes(/** @type {NodeJS.ErrnoException} */(error).code||'')) {
        t.skip('junction creation unavailable');
        return;
      }
      throw error;
    }
    /** @param {string} pathAlias @param {string} canonical */
    async function expectBlocked(pathAlias,canonical) {
      const held=await fs.open(canonical+'.obfs.lock','wx',0o600);
      try {
        let callbackRan=false;
        await assert.rejects(withDirectoryLock(pathAlias,async()=>{callbackRan=true;},{timeoutMs:80}),
          /** @param {unknown} error */ error=>
            Boolean(error&&typeof error==='object'&&'code' in error&&error.code==='EEXIST'));
        assert.equal(callbackRan,false,'Alias must not bypass an existing publisher lock');
      } finally {
        await held.close();
        await fs.rm(canonical+'.obfs.lock',{force:true});
      }
    }
    await expectBlocked(alias,actual);
    await expectBlocked(path.join(alias,'new-child'),path.join(actual,'new-child'));
  });
});
