'use strict';

const {createHmac}=require('node:crypto');

/**
 * A private, stable bucket assignment for a server-verified principal.
 * Only power-of-two bucket counts up to 256 are admitted; a single digest
 * byte then yields an unbiased bucket index with no reduction bias.
 *
 * This function is a topology tool and does not authenticate the principal.
 * A verified identity must be supplied by the trusted HTTP auth layer.
 *
 * @param {Buffer} root
 * @param {string} principal
 * @param {number} bucketCount
 * @returns {number}
 */
function bucketOf(root,principal,bucketCount){
  if(!Buffer.isBuffer(root)||root.length!==32)throw new TypeError('A 256-bit trusted root is required');
  if(typeof principal!=='string'||principal.length<1||principal.length>256)
    throw new TypeError('A verified principal is required');
  if(!Number.isSafeInteger(bucketCount)||bucketCount<1||bucketCount>256||
     (bucketCount&(bucketCount-1))!==0)
    throw new TypeError('Bucket count must be a power of two from 1 to 256');
  return createHmac('sha256',root).update('sco-bucket-v1\0')
    .update(principal).digest()[0]&(bucketCount-1);
}

module.exports={bucketOf};
