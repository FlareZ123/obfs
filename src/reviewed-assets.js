'use strict';

const {createHash}=require('node:crypto');

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
    const identity=path.toLowerCase();
    if(expected.has(identity)){
      throw new TypeError('Duplicate reviewedOpaqueAssets path: '+path);
    }
    expected.set(identity,{path,sha256});
  }

  let matched=0;
  for(const file of files){
    if(file.sourceType!=='asset')continue;
    const entry=expected.get(file.path.toLowerCase());
    if(!entry||entry.path!==file.path){
      throw new TypeError('Opaque asset not in reviewedOpaqueAssets: '+file.path);
    }
    const observed=createHash('sha256').update(file.code).digest('hex');
    if(observed!==entry.sha256){
      throw new TypeError('Opaque asset differs from reviewed bytes: '+file.path);
    }
    matched++;
  }
  if(matched!==expected.size){
    throw new TypeError('reviewedOpaqueAssets contains unused or missing published asset paths');
  }
}

module.exports={assertReviewedOpaqueAssets};
