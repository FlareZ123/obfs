'use strict';

const {createHash} = require('node:crypto');
const path = require('node:path');
const {isUtf8} = require('node:buffer');
const {safePath} = require('./core');
const {createPathInventory,registerFilePath,portableKeys} = require('./portable-paths');

/**
 * SNO bootloader: one executable entry point; verifies all artifacts once,
 * then loads the original application's obfuscated entry file via require().
 * This detects accidental tampering but cannot resist a filesystem owner.
 * @param {{path:string,code:string|Buffer}[]} files
 * @param {string} entry
 * @returns {string}
 */
function createSnoLauncher(files,entry) {
  const checkedEntry = safePath(entry);
  if(!Array.isArray(files))throw new TypeError('SNO files must be an array');
  // Read each indexed caller entry and its bytes exactly once. A package
  // scope getter, filename getter or mutable Buffer cannot describe a
  // different manifest after the entry or package checks have run.
  /** @type {{path:string,code:string|Buffer}[]} */
  const snapshots=[];
  const length=files.length;
  for(let index=0;index<length;index++){
    const file=files[index];
    if(!file||typeof file!=='object'){
      throw new TypeError('SNO files must contain indexed file records');
    }
    const name=safePath(file.path);
    const supplied=file.code;
    if(typeof supplied!=='string'&&!Buffer.isBuffer(supplied)){
      throw new TypeError(name+' content must be a string or Buffer');
    }
    snapshots.push({path:name,code:Buffer.isBuffer(supplied)?Buffer.from(supplied):supplied});
  }
  // Root launcher path cannot also be a protected input file.
  const reservedKeys=new Set(portableKeys('sno-entry.cjs'));
  if (snapshots.some(file => portableKeys(file.path).some(key=>reservedKeys.has(key)))) {
    throw new Error('SNO launcher path is reserved: sno-entry.cjs');
  }
  if (!snapshots.some(file => file.path === checkedEntry)) throw new Error(`Missing SNO entry ${entry}`);
  if (!/\.(?:cjs|js)$/.test(checkedEntry)) throw new Error('SNO entry must be a CommonJS .cjs or .js file');
  // A nested package.json overrides its parent scope for a .js entry.
  // The direct API must reject this too, not only the CLI preflight.
  if (checkedEntry.endsWith('.js')) {
    let directory=path.posix.dirname(checkedEntry);
    for (;;) {
      const packageName=path.posix.join(directory,'package.json');
      const packageFile=snapshots.find(file=>file.path===packageName);
      if (packageFile) {
        if(Buffer.isBuffer(packageFile.code)&&!isUtf8(packageFile.code)) {
          throw new TypeError('Invalid UTF-8 package metadata: '+packageName);
        }
        // Node accepts one UTF-8 BOM at the start of package.json.
        const json=String(packageFile.code);
        if (JSON.parse(json.charCodeAt(0)===0xfeff?json.slice(1):json).type==='module') {
          throw new Error('SNO CommonJS launcher cannot require an ESM .js entry; use .cjs');
        }
        break;
      }
      if (directory==='.') break;
      directory=path.posix.dirname(directory);
    }
  }
  // A Linux checkout can contain canonically equivalent Unicode names that
  // address the same APFS file on macOS; refuse an ambiguous SNO manifest.
  const paths=createPathInventory();
  /** @type {[string,string][]} */
  const manifest=[];
  for(const file of snapshots) {
    const name=safePath(file.path);
    registerFilePath(paths,name,'Duplicate SNO file: ');
    const code=file.code;
    // The launcher entry is always executable JavaScript. Other .js paths
    // can be deliberately reviewed opaque Buffers in the direct API, which
    // has no sourceType metadata; keep those byte-exact assets admissible.
    if(name===checkedEntry&&Buffer.isBuffer(code)&&!isUtf8(code)){
      throw new TypeError('Invalid UTF-8 JavaScript source: '+name);
    }
    if(typeof code==='string'&&/[\uD800-\uDFFF]/u.test(code)){
      throw new TypeError(name+
        (/\.(?:js|mjs|cjs)$/.test(name)?' JavaScript source':' text asset')+
        ' contains unpaired surrogate');
    }
    manifest.push([name,createHash('sha256').update(code).digest('hex')]);
  }
  return `'use strict';\n` +
    `const fs=require('node:fs');const crypto=require('node:crypto');const path=require('node:path');\n` +
    `const checks=${JSON.stringify(manifest)};\n` +
    `for(const [file,expected] of checks){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex');if(actual!==expected)throw Error('Integrity check failed: '+file);}\n` +
    `module.exports=require(path.join(__dirname,${JSON.stringify(checkedEntry)}));\n`;
}

module.exports = {createSnoLauncher};
