'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {safePath}=require('./core');

/**
 * Verify a selective SCO partition's server-only source commitments against
 * the exact deployed private ESM graph before importing its original modules.
 * This is a trusted-server initialization check, not a hostile-filesystem
 * atomicity guarantee. The caller must avoid concurrent file replacement
 * between this check and Node's module load.
 *
 * @param {{privateSourceDigests?:{path:string,sha256:string}[]}} partition
 * @param {string} root Absolute filesystem directory containing original ESM files.
 * @returns {Promise<void>}
 */
async function verifyScoPrivateSourceDigests(partition,root){
  if(typeof root!=='string'||!path.isAbsolute(root)){
    throw new TypeError('SCO private integrity root must be an absolute directory');
  }
  if(!partition||!Array.isArray(partition.privateSourceDigests)||
     !partition.privateSourceDigests.length){
    throw new TypeError('SCO partition has no audited private source commitments');
  }
  const seen=new Set();
  /** @type {{path:string,sha256:string}[]} */
  const commitments=[];
  // The verifier must inspect every declared array slot, independent of
  // caller-overridden Symbol.iterator, and must use precisely the same
  // getter values for validation and the later deployed-byte comparison.
  const expectedSources=partition.privateSourceDigests;
  for(let index=0;index<expectedSources.length;index++){
    const entry=expectedSources[index];
    const declaredPath=entry?.path;
    const declaredSha=entry?.sha256;
    if(typeof declaredPath!=='string'||typeof declaredSha!=='string'||
       !/^[0-9a-f]{64}$/u.test(declaredSha)){
      throw new TypeError('SCO private source commitment is malformed');
    }
    const filename=safePath(declaredPath);
    const caseName=filename.toLowerCase();
    if(seen.has(caseName))throw new TypeError('SCO private source commitment path duplicated: '+filename);
    seen.add(caseName);
    commitments.push({path:filename,sha256:declaredSha});
  }
  const realRoot=await fs.realpath(root);
  for(const expected of commitments){
    const filename=expected.path;
    const candidate=path.resolve(realRoot,...filename.split('/'));
    const realFile=await fs.realpath(candidate);
    const relative=path.relative(realRoot,realFile);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){
      throw new TypeError('SCO private source escapes integrity root: '+filename);
    }
    const actual=createHash('sha256').update(await fs.readFile(realFile)).digest('hex');
    if(actual!==expected.sha256){
      throw new TypeError('SCO private source bytes changed since partition: '+filename);
    }
  }
}

module.exports={verifyScoPrivateSourceDigests};
