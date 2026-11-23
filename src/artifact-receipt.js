'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {safePath,createPathInventory,registerFilePath}=require('./portable-paths');

/** @typedef {'native'|'minified'|'candidate'} ArtifactArm */
/** @typedef {{arm:ArtifactArm,root:string,files:string[]}} ArmInput */
/** @typedef {{path:string,bytes:number,sha256:string}} ArtifactHash */
/** @typedef {{arm:ArtifactArm,files:ArtifactHash[],sha256:string}} ArmHash */
/** @typedef {{node:string,v8:string,platform:string,architecture:string,osRelease:string,runnerImage:string|null,browserVersion:string|null}} Environment */
/**
 * @typedef {{schema:1,sourceCommit:string,lockSha256:string,options:{seed:string|null,flags:string[]},
 *   environment:Environment,arms:ArmHash[]}} ArtifactReceipt
 */
/** @typedef {{arms:ArmInput[],sourceCommit:string,lockfile:string,seed?:string|null,flags?:string[],runnerImage?:string|null,browserVersion?:string|null}} ReceiptInput */

/** @param {Buffer|string} content @returns {string} */
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Restrict receipt paths to unambiguous relative slash-separated spellings.
 * In particular, backslashes are unsafe as separators on Windows.
 * @param {string} value
 * @returns {string[]}
 */
function pathParts(value) {
  assert.equal(typeof value,'string','Artifact path must be a string');
  assert.ok(value.length>0 && !value.includes('\\') && !value.includes('\0') &&
    !value.startsWith('/') && !/^[A-Za-z]:/.test(value),
  'Artifact path must be portable and relative: '+value);
  const parts=value.split('/');
  assert.ok(parts.every(part=>part && part!=='.' && part!=='..'),
    'Artifact path must not contain traversal or empty segments: '+value);
  // Experiment receipts must obey the compiler's portable path policy too.
  // Otherwise a frozen graph may gain filesystem aliases when moved to
  // Windows or a Unicode-normalizing filesystem.
  try {safePath(value);}
  catch(error){
    throw new TypeError('Artifact path must be portable and relative: '+value,
      {cause:error});
  }
  return parts;
}

/**
 * Hash the actual checked-in or generated file bytes. Refuse symlink or
 * reparse-point traversal, including intermediate directory components.
 * @param {string} root
 * @param {string} relative
 * @returns {Promise<ArtifactHash>}
 */
async function hashFile(root,relative) {
  const parts=pathParts(relative);
  let current=await fs.realpath(root);
  for(let i=0;i<parts.length;i++) {
    current=path.join(current,parts[i]);
    const stat=await fs.lstat(current);
    assert.ok(!stat.isSymbolicLink(),
      'Artifact path must not contain symlinks: '+relative);
    assert.ok(i===parts.length-1?stat.isFile():stat.isDirectory(),
      'Artifact must be a regular file: '+relative);
  }
  const bytes=await fs.readFile(current);
  return {path:relative,bytes:bytes.length,sha256:sha256(bytes)};
}

/**
 * Enumerate every regular file in an artifact root. The experiment must
 * explicitly include the full delivered filesystem graph so a benchmark
 * cannot silently omit a public file that an attacker will also receive.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function enumerateArtifactFiles(root) {
  /** @type {string[]} */
  const files=[];
  const inventory=createPathInventory();
  /** @param {string} directory @param {string} relative @returns {Promise<void>} */
  async function visit(directory,relative) {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const name=relative?relative+'/'+entry.name:entry.name;
      pathParts(name);
      assert.ok(!entry.isSymbolicLink(),
        'Artifact path must not contain symlinks: '+name);
      if(entry.isDirectory()){
        const before=files.length;
        await visit(path.join(directory,entry.name),name);
        // A directory with no file descendants is invisible in a file-only
        // receipt, but its existence can affect filesystem-sensitive code.
        assert.ok(files.length>before,
          'Empty artifact directory cannot be frozen: '+name);
      }else {
        assert.ok(entry.isFile(),'Artifact must be a regular file: '+name);
        registerFilePath(inventory,name,'Ambiguous artifact path: ');
        files.push(name);
      }
    }
  }
  await visit(await fs.realpath(root),'');
  return files.sort();
}

/**
 * @param {ArtifactArm} arm
 * @param {ArtifactHash[]} files
 * @returns {string}
 */
function armSha256(arm,files) {
  return sha256(JSON.stringify(['obfs-arm-v1',arm,
    files.map(file=>[file.path,file.bytes,file.sha256])]));
}

/**
 * @param {ArmInput[]} arms
 * @returns {Promise<ArmHash[]>}
 */
async function hashArms(arms) {
  const names=['candidate','minified','native'];
  assert.equal(arms.length,3,'Exactly three matched artifact arms are required');
  assert.deepEqual(arms.map(item=>item.arm).sort(),names,
    'The candidate, ordinary minified control, and native input must all be present');
  /** @type {ArmHash[]} */
  const hashes=[];
  for(const arm of [...arms].sort((a,b)=>a.arm.localeCompare(b.arm))) {
    assert.ok(arm.files.length>0,'No empty artifact group: '+arm.arm);
    const unique=[...new Set(arm.files)];
    assert.equal(unique.length,arm.files.length,'Duplicate artifact path: '+arm.arm);
    const declared=unique.sort();
    const inventory=createPathInventory();
    for(const file of declared){
      pathParts(file);
      registerFilePath(inventory,file,'Ambiguous artifact path: ');
    }
    assert.deepEqual(await enumerateArtifactFiles(arm.root),declared,
      'Artifact group must enumerate every regular delivered file: '+arm.arm);
    const entries=await Promise.all(declared.map(file=>hashFile(arm.root,file)));
    hashes.push({arm:arm.arm,files:entries,sha256:armSha256(arm.arm,entries)});
  }
  return hashes;
}

/**
 * Capture complete declared public/attacked artifacts, matching build inputs,
 * and the exact Node host. This is a reproducibility receipt, not a trusted
 * integrity boundary when an attacker controls the local runtime/filesystem.
 * @param {ReceiptInput} input
 * @returns {Promise<ArtifactReceipt>}
 */
async function collectArtifactReceipt(input) {
  assert.match(input.sourceCommit,/^[a-f0-9]{40}$/,
    'Receipt requires exact Git commit SHA');
  const arms=await hashArms(input.arms);
  const lockSha256=sha256(await fs.readFile(input.lockfile));
  return {
    schema:1,sourceCommit:input.sourceCommit,lockSha256,
    options:{seed:input.seed??null,flags:[...(input.flags??[])]},
    environment:{node:process.versions.node,v8:process.versions.v8,
      platform:process.platform,architecture:process.arch,osRelease:os.release(),
      runnerImage:input.runnerImage??null,browserVersion:input.browserVersion??null},
    arms
  };
}

/**
 * Check the same exact artifact bytes before native/minified/candidate
 * benchmarks and independent attacker executions. No receipt can prevent an
 * attacker controlling the local runtime from forging both files and report.
 * @param {ArtifactReceipt} receipt
 * @param {ArmInput[]} arms
 * @param {string} lockfile
 * @returns {Promise<void>}
 */
async function verifyArtifactReceipt(receipt,arms,lockfile) {
  assert.equal(receipt.schema,1);
  assert.equal(sha256(await fs.readFile(lockfile)),receipt.lockSha256,
    'Dependency lock changed after artifact freeze');
  assert.deepEqual(await hashArms(arms),receipt.arms,
    'Artifact bytes/load graph changed after experiment freeze');
}

module.exports={collectArtifactReceipt,verifyArtifactReceipt};
