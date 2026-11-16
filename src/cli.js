'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {obfuscateFiles,createSnoLauncher,createScoHandler} = require('./index');
const {atomicWrite} = require('./atomic');
const {safePath} = require('./core');
const {parse,walk}=require('./ast');

/** @typedef {import('./core').SourceFile} SourceFile */

/**
 * @param {string[]} argv
 * @returns {{root:string,out:string,entry:string,port:number,hosts:string[],seed?:string,closedWorld:boolean,jsModule:boolean,publicAssets:string[],publicScripts:string[],experimentalRegisterVm?:Record<string,string[]>,experimentalExpressionVm?:Record<string,string[]>,experimentalNativeGraph?:Record<string,string[]>,experimentalPolyvariantAffine?:Record<string,string[]>,experimentalPolyvariantCount?:2|4|8,experimentalWasmI32?:Record<string,string[]>,experimentalSymbolKeys:boolean}}
 */
function readArgs(argv) {
  /** @type {{root:string,out:string,entry:string,port:number,hosts:string[],seed?:string,closedWorld:boolean,jsModule:boolean,publicAssets:string[],publicScripts:string[],experimentalRegisterVm?:Record<string,string[]>,experimentalExpressionVm?:Record<string,string[]>,experimentalNativeGraph?:Record<string,string[]>,experimentalPolyvariantAffine?:Record<string,string[]>,experimentalPolyvariantCount?:2|4|8,experimentalWasmI32?:Record<string,string[]>,experimentalSymbolKeys:boolean}} */
  const opts = {root:'',out:'',entry:'',port:8080,hosts:[],closedWorld:false,jsModule:false,publicAssets:[],publicScripts:[],experimentalSymbolKeys:false};
  for (let i=0;i<argv.length;i++) {
    const option = argv[i];
    if (option === '--closed-world') {opts.closedWorld=true;continue;}
    if (option === '--js-module') {opts.jsModule=true;continue;}
    if (option === '--symbol-keys') {opts.experimentalSymbolKeys=true;continue;}
    const value = argv[++i];
    if (value === undefined) throw new TypeError(`Missing value for ${option}`);
    if (option === '--root') opts.root=value;
    else if (option === '--out') opts.out=value;
    else if (option === '--entry') opts.entry=value;
    else if (option === '--port') opts.port=Number(value);
    else if (option === '--host') opts.hosts.push(value);
    else if (option === '--seed') opts.seed=value;
    else if (option === '--asset') opts.publicAssets.push(value);
    else if (option === '--client') opts.publicScripts.push(value);
    else if (option === '--register-vm') {
      const index=value.lastIndexOf(':');
      if(index<1||index===value.length-1) {
        throw new TypeError('--register-vm expects relative-file:functionName');
      }
      const file=safePath(value.slice(0,index));
      const name=value.slice(index+1);
      opts.experimentalRegisterVm??={};
      (opts.experimentalRegisterVm[file]??=[]).push(name);
    }
    else if (option === '--expression-vm') {
      const index=value.lastIndexOf(':');
      if(index<1||index===value.length-1) {
        throw new TypeError('--expression-vm expects relative-file:functionName');
      }
      const file=safePath(value.slice(0,index));
      const name=value.slice(index+1);
      opts.experimentalExpressionVm??={};
      (opts.experimentalExpressionVm[file]??=[]).push(name);
    }
    else if (option === '--native-graph') {
      const index=value.lastIndexOf(':');
      if(index<1||index===value.length-1) {
        throw new TypeError('--native-graph expects relative-file:functionName');
      }
      const file=safePath(value.slice(0,index));
      const name=value.slice(index+1);
      opts.experimentalNativeGraph??={};
      (opts.experimentalNativeGraph[file]??=[]).push(name);
    }
    else if (option === '--polyvariant-affine') {
      const index=value.lastIndexOf(':');
      if(index<1||index===value.length-1) {
        throw new TypeError('--polyvariant-affine expects relative-file:functionName');
      }
      const file=safePath(value.slice(0,index));
      const name=value.slice(index+1);
      opts.experimentalPolyvariantAffine??={};
      (opts.experimentalPolyvariantAffine[file]??=[]).push(name);
    }
    else if (option === '--polyvariant-count') {
      const count=Number(value);
      if(count!==2&&count!==4&&count!==8) {
        throw new TypeError('--polyvariant-count requires 2, 4 or 8');
      }
      opts.experimentalPolyvariantCount=/** @type {2|4|8} */ (count);
    }
    else if (option === '--wasm-i32') {
      const index=value.lastIndexOf(':');
      if(index<1||index===value.length-1) {
        throw new TypeError('--wasm-i32 expects relative-file:functionName');
      }
      const file=safePath(value.slice(0,index));
      const name=value.slice(index+1);
      opts.experimentalWasmI32??={};
      (opts.experimentalWasmI32[file]??=[]).push(name);
    }
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
      if (item.name.toLowerCase() === 'node_modules' || item.name.toLowerCase() === '.git') continue;
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

/**
 * Check lexical and resolved paths, including existing symlink/junction
 * ancestors of an output directory that has not been created yet.
 * @param {string} root
 * @param {string} destination
 * @returns {Promise<void>}
 */
async function assertOutputOutsideInput(root,destination) {
  /** @param {string} input @param {string} candidate @returns {boolean} */
  const inside=(input,candidate)=>{
    const relative=path.relative(input,candidate);
    return relative==='' || (relative!=='..' &&
      !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative));
  };
  if (inside(root,destination)) throw new Error('Output must be outside the input directory');
  const actualRoot=await fs.realpath(root);
  let ancestor=destination;
  for (;;) {
    try {
      const actualAncestor=await fs.realpath(ancestor);
      const actualDestination=path.resolve(actualAncestor,path.relative(ancestor,destination));
      if (inside(actualRoot,actualDestination)) {
        throw new Error('Output must be outside the input directory');
      }
      return;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code!=='ENOENT') throw error;
      const parent=path.dirname(ancestor);
      if (parent===ancestor) throw error;
      ancestor=parent;
    }
  }
}

/**
 * Select only the JavaScript explicitly authorized for public delivery.
 * Static ESM imports/reexports are transitively included. Dynamic import()
 * is a runtime-only edge and must be published explicitly with --client,
 * even when its specifier is a literal. This prevents a dormant import in
 * dead code from implicitly exposing private server-side modules.
 *
 * @param {SourceFile[]} files
 * @param {string} entry
 * @param {string[]} publicScripts
 * @param {string[]} publicAssets
 * @returns {SourceFile[]}
 */
function selectScoPublicFiles(files,entry,publicScripts,publicAssets) {
  const byPath=new Map(files.map(file=>[file.path,file]));
  /** @param {string} name @returns {string} */
  function publicPath(name) {
    if(name.startsWith('.') || name.split('/').some(part=>part.startsWith('.'))) {
      throw new TypeError('SCO public file must not be hidden');
    }
    return safePath(name);
  }
  const assets=new Set(publicAssets.map(publicPath));
  for(const name of assets) {
    if(byPath.get(name)?.sourceType!=='asset')throw new Error('SCO public asset not found: '+name);
  }
  const scripts=new Set(publicScripts.map(publicPath));
  for(const name of scripts) {
    const file=byPath.get(name);
    if(!file || file.sourceType==='asset')throw new Error('SCO client JavaScript not found: '+name);
  }
  const included=new Set([entry,...scripts]);
  const queue=[...included];
  for(let i=0;i<queue.length;i++) {
    const filename=queue[i];
    const file=byPath.get(filename);
    if(!file)throw new Error('SCO client JavaScript not found: '+filename);
    if(file.sourceType==='asset') {
      if(!assets.has(filename))throw new Error('SCO dependency requires --asset: '+filename);
      continue;
    }
    const sourceType=file.sourceType??(filename.endsWith('.mjs')?'module':filename.endsWith('.cjs')?'commonjs':'script');
    // Dynamic import() does not imply publication authority for its target.
    // The operator is legal inside classic scripts too, so only the module
    // grammar's static dependencies are followed automatically.
    if(sourceType!=='module')continue;
    const ast=parse(/** @type {string} */ (file.code),sourceType);
    walk(ast,node=>{
      if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) ||
          node.source?.type!=='Literal' || typeof node.source.value!=='string')return;
      const specifier=node.source.value;
      if(!specifier.startsWith('./')&&!specifier.startsWith('../'))return;
      // Module resolution is URL-based. Resolve a single percent-decoding
      // layer per segment so ordinary encoded Unicode, spaces and # names
      // remain reachable, while encoded separators/dot segments cannot
      // change the imported file's publication authority.
      if(specifier.includes('\\'))throw new Error('SCO encoded import path unsupported: '+specifier);
      const rawPath=specifier.split(/[?#]/u,1)[0];
      /** @type {string[]} */
      const segments=[];
      for(const part of rawPath.split('/')) {
        /** @type {string} */
        let decoded;
        try {decoded=decodeURIComponent(part);}
        catch (error) {throw new Error('SCO encoded import path unsupported: '+specifier);}
        if(/[\\/\x00]/u.test(decoded) ||
           part.includes('%') && (decoded==='.'||decoded==='..')) {
          throw new Error('SCO encoded import path unsupported: '+specifier);
        }
        segments.push(decoded);
      }
      const clean=segments.join('/');
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(filename),clean));
      if(target==='..'||target.startsWith('../')||!byPath.has(target)) {
        throw new Error('SCO dependency missing from root: '+specifier);
      }
      if(!included.has(target)) {
        included.add(target);
        queue.push(target);
      }
    });
  }
  return files.filter(file=>included.has(file.path)||assets.has(file.path));
}

/** @param {'coo'|'sco'|'sno'} mode @param {string[]} argv @returns {Promise<void>} */
async function main(mode,argv) {
  const {root,out,entry,port,hosts,seed,closedWorld,jsModule,publicAssets,publicScripts,experimentalRegisterVm,experimentalExpressionVm,experimentalNativeGraph,experimentalPolyvariantAffine,experimentalPolyvariantCount,experimentalWasmI32,experimentalSymbolKeys} = readArgs(argv);
  if (jsModule && mode==='sno') throw new TypeError('--js-module is for browser COO or SCO JavaScript');
  if (mode==='sco' && (experimentalRegisterVm||experimentalExpressionVm||experimentalNativeGraph||experimentalPolyvariantAffine||experimentalWasmI32||experimentalSymbolKeys)) throw new TypeError('SCO CLI experimental VMs are unavailable');
  const absRoot = path.resolve(root);
  const sourceTree = await readSourceTree(absRoot);
  // A .js dependency inside a nested {"type":"module"} package is ESM,
  // even when SNO starts from a CommonJS .cjs entry. Preserve Node's
  // nearest-package scope for every file, not only for the launcher entry.
  const source = sourceTree.map(file =>
    file.path.endsWith('.js') && (jsModule || mode === 'sno' && entryUsesEsmPackage(sourceTree,file.path)) ?
      {...file,sourceType:/** @type {'module'} */ ('module')} : file);
  if (!source.some(file=>file.path===entry)) throw new Error(`Entry ${entry} not found under ${root}`);
  if (mode === 'sco') {
    // Server-only .js/.mjs/.cjs files under --root are private by default.
    const clientFiles=selectScoPublicFiles(source,entry,publicScripts,publicAssets);
    const server = http.createServer(createScoHandler(clientFiles,{allowedHosts:hosts,closedWorld}));
    /** @type {Promise<void>} */
    const listening=new Promise(resolve=>server.listen(port,()=>resolve()));
    await listening;
    process.stdout.write(`SCO listening on port ${port}: /obfs/${entry}\n`);
    return;
  }
  if (!out) throw new TypeError('COO/SNO require --out directory');
  const absOut = path.resolve(out);
  await assertOutputOutsideInput(absRoot,absOut);
  // Preflight all predictable errors before writing any output artifact.
  if (mode === 'sno' && source.some(file => file.path.toLowerCase() === 'sno-entry.cjs')) {
    throw new Error('SNO launcher filename collides with an input file');
  }
  const result = obfuscateFiles(source,{mode,seed,allowedHosts:hosts,closedWorld,experimentalRegisterVm,experimentalExpressionVm,experimentalNativeGraph,experimentalPolyvariantAffine,experimentalPolyvariantCount,experimentalWasmI32,experimentalSymbolKeys});
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
