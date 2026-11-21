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
  const canonical=filename.normalize('NFC').toLowerCase();
  if(inventory.files.has(canonical))throw new TypeError(duplicateLabel+filename);
  if(inventory.directories.has(canonical)) {
    throw new TypeError('File conflicts with directory: '+filename);
  }

  const segments=filename.split('/');
  let directory='';
  for(let index=0;index<segments.length-1;index++) {
    directory=directory?directory+'/'+segments[index]:segments[index];
    const key=directory.normalize('NFC').toLowerCase();
    const known=inventory.directories.get(key);
    if(known!==undefined && known!==directory) {
      throw new TypeError('Ambiguous directory spelling: '+directory);
    }
    if(inventory.files.has(key)) {
      throw new TypeError('File conflicts with directory: '+directory);
    }
    inventory.directories.set(key,directory);
  }
  inventory.files.add(canonical);
}

module.exports={createPathInventory,registerFilePath};
