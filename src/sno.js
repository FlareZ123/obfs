'use strict';

const {createHash} = require('node:crypto');
const {safePath} = require('./core');

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
  if (!files.some(file => file.path === checkedEntry)) throw new Error(`Missing SNO entry ${entry}`);
  if (!/\.(?:cjs|js)$/.test(checkedEntry)) throw new Error('SNO entry must be a CommonJS .cjs or .js file');
  const manifest = files.map(file => [safePath(file.path), createHash('sha256').update(file.code).digest('hex')]);
  return `'use strict';\n` +
    `const fs=require('node:fs');const crypto=require('node:crypto');const path=require('node:path');\n` +
    `const checks=${JSON.stringify(manifest)};\n` +
    `for(const [file,expected] of checks){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex');if(actual!==expected)throw Error('Integrity check failed: '+file);}\n` +
    `module.exports=require(path.join(__dirname,${JSON.stringify(checkedEntry)}));\n`;
}

module.exports = {createSnoLauncher};
