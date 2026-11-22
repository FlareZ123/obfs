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
 * @param {{path:string,code:string|Buffer,sourceType?:import('./core').SourceType}[]} files
 * @param {string} entry
 * @returns {string}
 */
function createSnoLauncher(files,entry) {
  const checkedEntry = safePath(entry);
  if(!Array.isArray(files))throw new TypeError('SNO files must be an array');
  // Read each indexed caller entry and its bytes exactly once. A package
  // scope getter, filename getter or mutable Buffer cannot describe a
  // different manifest after the entry or package checks have run.
  /** @type {{path:string,code:string|Buffer,sourceType?:import('./core').SourceType}[]} */
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
    const sourceType=file.sourceType;
    if(sourceType!==undefined&&!['script','commonjs','module','asset'].includes(sourceType)) {
      throw new TypeError(name+' has an invalid sourceType');
    }
    snapshots.push({path:name,code:Buffer.isBuffer(supplied)?Buffer.from(supplied):supplied,
      sourceType});
  }
  // Root launcher path cannot also be a protected input file.
  const reservedKeys=new Set(portableKeys('sno-entry.cjs'));
  if (snapshots.some(file => portableKeys(file.path.split('/',1)[0]).some(key=>reservedKeys.has(key)))) {
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
  // A CLI-provided sourceType is stable build provenance. Detect a
  // different effective package scope at execution, including a distribution
  // moved after compilation or loaded through --preserve-symlinks. Direct
  // pathless API records without sourceType retain their earlier behavior.
  /** @type {[string,'module'|'commonjs'][]} */
  const moduleScopes=[];
  for(const file of snapshots) {
    if(!file.path.endsWith('.js') || typeof file.code!=='string' ||
        !['script','commonjs','module'].includes(file.sourceType||''))continue;
    // Node 22 can syntax-detect unscoped ESM. A direct API caller who labels
    // a typeless .js as a module has no demonstrated package-type proof.
    // The SNO CLI always includes its explicit ESM package metadata.
    if(file.sourceType==='module') {
      let directory=path.posix.dirname(file.path);
      let hasPackage=false;
      for(;;) {
        if(snapshots.some(item=>item.path===path.posix.join(directory,'package.json'))) {
          hasPackage=true;
          break;
        }
        if(directory==='.')break;
        directory=path.posix.dirname(directory);
      }
      if(!hasPackage)continue;
    }
    moduleScopes.push([file.path,file.sourceType==='module'?'module':'commonjs']);
  }
  const runtimeScopeCheck=moduleScopes.length ?
    \`const scopes=\${JSON.stringify(moduleScopes)};\\n\` +
    \`for(const [file,expected] of scopes){let folder=path.dirname(path.join(__dirname,file));let kind='commonjs';for(;;){let data;try{data=fs.readFileSync(path.join(folder,'package.json'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}if(data!==undefined){const metadata=JSON.parse(data.charCodeAt(0)===0xfeff?data.slice(1):data);kind=metadata.type==='module'?'module':'commonjs';break;}if(path.basename(folder)==='node_modules')break;const parent=path.dirname(folder);if(parent===folder)break;folder=parent;}if(kind!==expected)throw Error('SNO runtime package-scope mismatch: '+file);}\\n\` : '';
  return `'use strict';\n` +
    `const fs=require('node:fs');const crypto=require('node:crypto');const path=require('node:path');\n` +
    `const checks=${JSON.stringify(manifest)};\n` +
    `for(const [file,expected] of checks){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,file))).digest('hex');if(actual!==expected)throw Error('Integrity check failed: '+file);}\n` +
    runtimeScopeCheck +
    `module.exports=require(path.join(__dirname,${JSON.stringify(checkedEntry)}));\n`;
}

module.exports = {createSnoLauncher};
