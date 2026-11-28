'use strict';

const path=require('node:path');

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
 * Four conservative filename-equivalence keys for portable output trees.
 *
 * Preserve the old NFC/lowercase and NFC/uppercase checks exactly: no pair
 * previously rejected by this inventory may become admissible. Additional
 * opposite-case round trips catch Unicode full-casefold collision families
 * missed by checking either one-step map alone, e.g. U+03D1 vs U+03F4
 * (both casefold to theta) and U+1E9E vs the letters "ss".
 *
 * This is intentionally not a complete Unicode full-casefold implementation
 * or a promise of filesystem identity on all volume/Unicode versions.
 *
 * @param {string} filename
 * @returns {[string,string,string,string]}
 */
function portableKeys(filename) {
  const normalized=filename.normalize('NFC');
  const lower=normalized.toLowerCase().normalize('NFC');
  const upper=normalized.toUpperCase().normalize('NFC');
  return [
    'lower:'+lower,
    'upper:'+upper,
    'upper-lower:'+upper.toLowerCase().normalize('NFC'),
    'lower-upper:'+lower.toUpperCase().normalize('NFC')
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
  /** @type {{name:string,keys:ReturnType<typeof portableKeys>}[]} */
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

/**
 * Reject rooted, ambiguous and traversal paths before writing/serving files.
 * @param {string} file
 * @returns {string}
 */
function safePath(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || (/[<>:\x22|?*\x00-\x1f]/u.test(file)) ||
      path.posix.isAbsolute(file)) throw new TypeError(`Unsafe file path: ${file}`);
  // With Unicode mode this range matches lone surrogates, not valid pairs.
  // Node UTF-8 paths encode lone surrogates as U+FFFD, aliasing a distinct name.
  if (/[\uD800-\uDFFF]/u.test(file)) {
    throw new TypeError(`Unsafe non-well-formed Unicode file path: ${file}`);
  }
  // Linux casefolded ext4/f2fs may remove Default_Ignorable_Code_Point
  // characters before lookup (including U+200B and U+202E). Even a lone
  // spelling like ".."+RLO may alias parent/dot or an empty name on certain
  // volumes. Reject these rather than depending on platform kernel patches.
  // Do not echo the raw character in an error: bidi controls can spoof logs.
  if (/\\p{Default_Ignorable_Code_Point}/u.test(file)) {
    throw new TypeError('Default-ignorable Unicode filename: refused portable path');
  }
  for (const segment of file.split('/')) {
    // Windows treats these names as DOS devices, including console handles.
    // Space before an extension can also leave a device stem. Conservative
    // refusal is preferable to writing source bytes to a device endpoint.
    if (/[. ]$/u.test(segment) ||
        /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³]) *(?:\.|$)/iu.test(segment)) {
      throw new TypeError(`Unsafe Windows filename segment: ${segment}`);
    }
    // On NTFS, LONGNAME.MJS can also resolve through LONGNA~1.MJS.
    // Deny common 8.3 alias spellings at build admission, including nested
    // directory components, before Windows output writes or source routing.
    // Short-name generation is volume-dependent, so this is a conservative
    // policy rather than a complete filesystem-identity proof.
    if (/~[0-9]+(?=\.|$)/u.test(segment)) {
      throw new TypeError(`Unsafe Windows short-name alias segment: ${segment}`);
    }
  }
  const normalized = path.posix.normalize(file);
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.' || normalized !== file) {
    throw new TypeError(`Unsafe or noncanonical file path: ${file}`);
  }
  return normalized;
}

module.exports={createPathInventory,registerFilePath,portableKeys,safePath};
