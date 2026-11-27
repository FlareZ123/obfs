'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {performance} = require('node:perf_hooks');


/**
 * Serialize an operation with a cross-process lock file.
 * A crashed publisher can leave a stale lock; operators should remove such
 * locks only after verifying the publisher is no longer running.
 * @template T
 * @param {string} lockPath
 * @param {()=>Promise<T>} action
 * @param {{timeoutMs?:number}} [options]
 * @returns {Promise<T>}
 */
async function withLock(lockPath,action,options={}) {
  const timeoutMs=options.timeoutMs??5000;
  // NaN makes a deadline comparison permanently false and can strand a
  // publisher behind an occupied lock. Require a finite nonnegative budget.
  if(!Number.isFinite(timeoutMs)||timeoutMs<0)
    throw new TypeError('timeoutMs must be a finite nonnegative number');
  await fs.mkdir(path.dirname(lockPath),{recursive:true});
  // Use elapsed monotonic time: wall-clock adjustments must not extend lock contention.
  const deadline=performance.now()+timeoutMs;
  /** @type {import('node:fs/promises').FileHandle} */
  let lock;
  for(;;) {
    try { lock=await fs.open(lockPath,'wx',0o600); break; }
    catch(error) {
      if(/** @type {NodeJS.ErrnoException} */(error).code!=='EEXIST'||performance.now()>=deadline)throw error;
      await new Promise(resolve=>setTimeout(resolve,35));
    }
  }
  try { return await action(); }
  finally {
    try { await lock.close(); }
    finally { await fs.rm(lockPath,{force:true}); }
  }
}

/**
 * Atomically replace one file, serialized by a cross-process lock file.
 * A failed writer removes its temporary file without deleting another writer's lock.
 * @param {string} destination
 * @param {string|Buffer} content
 * @param {{timeoutMs?:number}} [options]
 * @returns {Promise<void>}
 */
async function atomicWrite(destination,content,options={}) {
  return withLock(destination+'.lock',async()=>{
    const temporary=destination+'.'+randomUUID()+'.tmp';
    try {
      await fs.writeFile(temporary,content,{flag:'wx'});
      await fs.rename(temporary,destination);
    } finally { await fs.rm(temporary,{force:true}); }
  },options);
}

/**
 * Serialize a multi-file publication by cooperating compiler processes.
 * Resolve symlink/junction aliases to a common lock identity first.
 * Atomic per-file writes remain necessary: non-participating readers may
 * still observe a partially updated directory during publication.
 * @template T
 * @param {string} directory
 * @param {()=>Promise<T>} action
 * @param {{timeoutMs?:number}} [options]
 * @returns {Promise<T>}
 */
async function withDirectoryLock(directory,action,options={}) {
  const resolved=path.resolve(directory);
  await fs.mkdir(path.dirname(resolved),{recursive:true});
  /** @type {string} */
  let canonical;
  try { canonical=await fs.realpath(resolved); }
  catch(error) {
    if(/** @type {NodeJS.ErrnoException} */(error).code!=='ENOENT')throw error;
    canonical=path.join(await fs.realpath(path.dirname(resolved)),path.basename(resolved));
  }
  return withLock(canonical+'.obfs.lock',action,options);
}

module.exports={atomicWrite,withDirectoryLock};
