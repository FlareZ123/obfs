'use strict';

/**
 * A portable file tree cannot contain two spellings of the same directory,
 * nor use a file as a directory. The NFC/case-fold comparison deliberately
 * errs on the side of refusing source trees that could alias on common
 * Windows/macOS filesystems. It is not a complete filesystem case-fold model.
 *
 * @typedef {{files:Set<string>,directories:Map<string,string>}} PathInventory
 */

/** @returns {PathInventory} */
function createPathInventory() {
  return {files:new Set(),directories:new Map()};
}

/**
 * Two conservative name-equivalence keys for cross-platform output trees.
 * Some names (for example Greek final sigma) share an uppercase mapping
 * but differ when lowercased. Some other names share a lowercase mapping
 * but differ when uppercased. Retain both checks to avoid dropping either
 * previously rejected alias family. Uppercase expansion may intentionally
 * reject names that a particular filesystem would keep distinct.
 *
 * @param {string} filename
 * @returns {[string,string]}
 */
function portableKeys(filename) {
  const normalized=filename.normalize('NFC');
  return [
    'lower:'+normalized.toLowerCase().normalize('NFC'),
    'upper:'+normalized.toUpperCase().normalize('NFC')
  ];
}

/**
 * Register a previously validated, POSIX-relative file path. Track every
 * ancestor directory before adding the leaf, so either input order rejects
 * file/directory overlaps and canonical-equivalent directory spellings.
 *
 * @param {PathInventory} inventory
 * @param {string} filename
 * @param {string} [duplicateLabel]
 * @returns {void}
 */
function registerFilePath(inventory,filename,duplicateLabel='Duplicate file ') {
  const keys=portableKeys(filename);
  for(const key of keys) {
    if(inventory.files.has(key))throw new TypeError(duplicateLabel+filename);
    if(inventory.directories.has(key)) {
      throw new TypeError('File conflicts with directory: '+filename);
    }
  }

  const segments=filename.split('/');
  let directory='';
  /** @type {{name:string,keys:[string,string]}[]} */
  const ancestors=[];
  for(let index=0;index<segments.length-1;index++) {
    directory=directory?directory+'/'+segments[index]:segments[index];
    const directoryKeys=portableKeys(directory);
    for(const key of directoryKeys) {
      const known=inventory.directories.get(key);
      if(known!==undefined && known!==directory) {
        throw new TypeError('Ambiguous directory spelling: '+directory);
      }
      if(inventory.files.has(key)) {
        throw new TypeError('File conflicts with directory: '+directory);
      }
    }
    ancestors.push({name:directory,keys:directoryKeys});
  }
  for(const ancestor of ancestors) {
    for(const key of ancestor.keys)inventory.directories.set(key,ancestor.name);
  }
  for(const key of keys)inventory.files.add(key);
}

module.exports={createPathInventory,registerFilePath};
