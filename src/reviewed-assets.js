'use strict';

const {createHash}=require('node:crypto');
const {createPathInventory,registerFilePath}=require('./portable-paths');

/**
 * @typedef {{path:string,sha256:string}} ReviewedOpaqueAsset
 * @typedef {{path:string,sourceType:string,code:string|Buffer}} PublicFile
 */

/**
 * Bind every opaque asset in a proposed public distribution to a separately
 * reviewed exact file path and SHA-256 digest. An integrator must supply this
 * manifest from an independently approved set, not generate it from the
 * untrusted files just before the same call.
 *
 * This controls which bytes are eligible for publication; it cannot
 * establish that a reviewer-approved asset contains no original source.
 * No runtime checks are inserted into accepted code.
 *
 * @param {PublicFile[]} files
 * @param {ReviewedOpaqueAsset[]|undefined} approved
 * @returns {void}
 */
function assertReviewedOpaqueAssets(files,approved) {
  if(approved===undefined)return;
  if(!Array.isArray(approved)){
    throw new TypeError('reviewedOpaqueAssets must be a reviewed array');
  }
  /** @type {Map<string,{path:string,sha256:string}>} */
  const expected=new Map();
  const approvedPaths=createPathInventory();
  // The approval authority is the indexed array of reviewed records, not
  // caller-defined iteration or accessors that can change between checks.
  // Capture the initial length and each record's fields exactly once.
  const length=approved.length;
  for(let index=0;index<length;index++){
    const record=approved[index];
    if(!record||typeof record!=='object'||Array.isArray(record)){
      throw new TypeError('reviewedOpaqueAssets entries need an exact path and lowercase SHA-256');
    }
    const path=record.path;
    const sha256=record.sha256;
    if(typeof path!=='string'||!path||
        typeof sha256!=='string'||!/^[0-9a-f]{64}$/u.test(sha256)){
      throw new TypeError('reviewedOpaqueAssets entries need an exact path and lowercase SHA-256');
    }
    registerFilePath(approvedPaths,path,'Duplicate reviewedOpaqueAssets path: ');
    const identity=path.toLowerCase();
    if(expected.has(identity)){
      throw new TypeError('Duplicate reviewedOpaqueAssets path: '+path);
    }
    expected.set(identity,{path,sha256});
  }

  if(!Array.isArray(files)){
    throw new TypeError('Published files must be an array');
  }
  // A final-distribution recheck must inspect the caller's indexed output,
  // even when its Array iterator has been replaced. File metadata and bytes
  // are sampled once per entry; the publisher must emit those same bytes.
  /** @type {Set<string>} */
  const matched=new Set();
  const publishedPaths=createPathInventory();
  const fileCount=files.length;
  for(let index=0;index<fileCount;index++){
    const file=files[index];
    if(!file||typeof file!=='object'){
      throw new TypeError('Published files must contain indexed file records');
    }
    const sourceType=file.sourceType;
    if(sourceType!=='asset')continue;
    const path=file.path;
    const code=file.code;
    registerFilePath(publishedPaths,path,'Duplicate published opaque asset path: ');
    const identity=path.toLowerCase();
    if(matched.has(identity)){
      throw new TypeError('Duplicate published opaque asset path: '+path);
    }
    const entry=expected.get(identity);
    if(!entry||entry.path!==path){
      throw new TypeError('Opaque asset not in reviewedOpaqueAssets: '+path);
    }
    const observed=createHash('sha256').update(code).digest('hex');
    if(observed!==entry.sha256){
      throw new TypeError('Opaque asset differs from reviewed bytes: '+path);
    }
    matched.add(identity);
  }
  if(matched.size!==expected.size){
    throw new TypeError('reviewedOpaqueAssets contains unused or missing published asset paths');
  }
}

module.exports={assertReviewedOpaqueAssets};
