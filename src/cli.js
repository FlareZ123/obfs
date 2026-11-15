'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {obfuscateFiles,createSnoLauncher,createScoHandler} = require('./index');
const {atomicWrite} = require('./atomic');

/** @typedef {import('./core').SourceFile} SourceFile */

/**
 * @param {string[]} argv
 * @returns {{root:string,out:string,entry:string,port:number,hosts:string[],seed?:string,closedWorld:boolean,jsModule:boolean}}
 */
function readArgs(argv) {
  /** @type {{root:string,out:string,entry:string,port:number,hosts:string[],seed?:string,closedWorld:boolean,jsModule:boolean}} */
  const opts = {root:'',out:'',entry:'',port:8080,hosts:[],closedWorld:false,jsModule:false};
  for (let i=0;i<argv.length;i++) {
    const option = argv[i];
    if (option === '--closed-world') {opts.closedWorld=true;continue;}
    if (option === '--js-module') {opts.jsModule=true;continue;}
    const value = argv[++i];
    if (value === undefined) throw new TypeError(`Missing value for ${option}`);
    if (option === '--root') opts.root=value;
    else if (option === '--out') opts.out=value;
    else if (option === '--entry') opts.entry=value;
    else if (option === '--port') opts.port=Number(value);
    else if (option === '--host') opts.hosts.push(value);
    else if (option === '--seed') opts.seed=value;
    else throw new TypeError(`Unknown option ${option}`);
  }
  if (!opts.root || !opts.entry) throw new TypeError('Required: --root directory --entry relative-file');
  if (!Number.isInteger(opts.port) || opts.port<1 || opts.port>65535) throw new TypeError('Invalid port');
  return opts;
}

/**
 * Read a deterministic source group. Symlinks are deliberately refused.
 * @param {string} root
 * @returns {Promise<SourceFile[]>}
 */
async function readSourceTree(root) {
  /** @type {SourceFile[]} */
  const results = [];
  /** @param {string} directory */
  async function read(directory) {
    const entries = await fs.readdir(path.join(root,directory),{withFileTypes:true});
    entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const item of entries) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const relative = path.posix.join(directory,item.name);
      if (item.isSymbolicLink()) throw new Error(`Symlink in source tree: ${relative}`);
      if(item.isDirectory()) await read(relative);
      else if(item.isFile()) {
        const sourceType = /\.(?:js|cjs|mjs)$/.test(item.name) ? undefined : 'asset';
        const data = await fs.readFile(path.join(root,relative));
        const code = sourceType === 'asset' ? data : data.toString('utf8');
        results.push({path:relative,code,sourceType});
      }
    }
  }
  await read('');
  return results;
}

/**
 * Match Node's nearest package.json scope for a .js entry, including nested
 * package boundaries that can override the top-level package type.
 * @param {SourceFile[]} files
 * @param {string} entry
 * @returns {boolean}
 */
function entryUsesEsmPackage(files,entry) {
  let directory=path.posix.dirname(entry);
  for (;;) {
    const location=path.posix.join(directory,'package.json');
    const pkg=files.find(file=>file.path===location);
    if (pkg) return JSON.parse(String(pkg.code)).type==='module';
    if (directory==='.') return false;
    directory=path.posix.dirname(directory);
  }
}

/** @param {'coo'|'sco'|'sno'} mode @param {string[]} argv @returns {Promise<void>} */
async function main(mode,argv) {
  const {root,out,entry,port,hosts,seed,closedWorld,jsModule} = readArgs(argv);
  if (jsModule && mode==='sno') throw new TypeError('--js-module is for browser COO or SCO JavaScript');
  const absRoot = path.resolve(root);
  const source = (await readSourceTree(absRoot)).map(file =>
    jsModule && file.path.endsWith('.js') ? {...file,sourceType:'module'} : file);
  if (!source.some(file=>file.path===entry)) throw new Error(`Entry ${entry} not found under ${root}`);
  if (mode === 'sco') {
    const server = http.createServer(createScoHandler(source,{allowedHosts:hosts,closedWorld}));
    /** @type {Promise<void>} */
    const listening=new Promise(resolve=>server.listen(port,()=>resolve()));
    await listening;
    process.stdout.write(`SCO listening on port ${port}: /obfs/${entry}\n`);
    return;
  }
  if (!out) throw new TypeError('COO/SNO require --out directory');
  const absOut = path.resolve(out);
  if (absOut === absRoot || absOut.startsWith(absRoot + path.sep)) throw new Error('Output must be outside the input directory');
  // Preflight all predictable errors before writing any output artifact.
  if (mode === 'sno' && source.some(file => file.path.toLowerCase() === 'sno-entry.cjs')) {
    throw new Error('SNO launcher filename collides with an input file');
  }
  const result = obfuscateFiles(source,{mode,seed,allowedHosts:hosts,closedWorld});
  /** @type {string|undefined} */
  let launcher;
  if (mode === 'sno') {
    if (entry.endsWith('.js') && entryUsesEsmPackage(source,entry)) {
      throw new Error('SNO CommonJS launcher cannot require an ESM .js entry; use .cjs');
    }
    const entrySource = result.files.find(file=>file.path===entry);
    if (!entrySource) throw new Error(`Missing obfuscated entry ${entry}`);
    if (entrySource.sourceType==='module') throw new Error('SNO entry must be CommonJS');
    launcher = createSnoLauncher(result.files,entry);
  }
  for (const file of result.files) await atomicWrite(path.join(absOut,file.path),file.code);
  if (launcher !== undefined) await atomicWrite(path.join(absOut,'sno-entry.cjs'),launcher);
  process.stdout.write(`Processed ${result.files.length} files; mode ${mode}; output ${absOut}\n`);
}

module.exports = {main,readArgs,readSourceTree};
