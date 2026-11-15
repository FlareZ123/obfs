'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

/**
 * Atomically replace one file, serialized by a cross-process lock file.
 * A failed writer removes its temporary file without deleting another writer's lock.
 * @param {string} destination
 * @param {string|Buffer} content
 * @param {{timeoutMs?:number}} [options]
 * @returns {Promise<void>}
 */
async function atomicWrite(destination, content, options = {}) {
  await fs.mkdir(path.dirname(destination), {recursive:true});
  const lockPath = `${destination}.lock`;
  const deadline = Date.now() + (options.timeoutMs ?? 5000);
  /** @type {import('node:fs/promises').FileHandle|undefined} */
  let lock;
  for (;;) {
    try {
      lock = await fs.open(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */(error).code !== 'EEXIST' || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 35));
    }
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, {flag:'wx'});
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary,{force:true});
    await lock.close();
    await fs.rm(lockPath,{force:true});
  }
}

module.exports = {atomicWrite};
