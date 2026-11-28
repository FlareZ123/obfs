'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {isUtf8} = require('node:buffer');
const {obfuscateFiles,createSnoLauncher,createScoHandler} = require('./index');
const {atomicWrite,withDirectoryLock} = require('./atomic');
const {safePath} = require('./core');
const {parse,walk}=require('./ast');
const {portableKeys}=require('./portable-paths');
const {hasTerminalUrlDotSegment,hasUrlPathnameNormalizationHazard}=require('./esm-url-paths');
const {assertSnoDirectBareRequireParity}=require('./sno-bare-audit');

/** @typedef {import('./core').SourceFile} SourceFile */

/**
 * @param {string[]} argv
 * @returns {{root:string,out:string,entry:string,port:number,hosts:string[],seed?:string,closedWorld:boolean,jsModule:boolean,publicAssets:string[],publicScripts:string[],reviewedAssetsPath?:string,experimentalRegisterVm?:Record<string,string[]>,experimentalExpressionVm?:Record<string,string[]>,experimentalNativeGraph?:Record<string,string[]>,experimentalStatementFlow?:Record<string,string[]>,experimentalStatementFlowCompact?:boolean,experimentalPolyvariantAffine?:Record<string,string[]>,experimentalPolyvariantCount?:2|4|8,experimentalWasmI32?:Record<string,string[]>,experimentalSymbolKeys:boolean,auditBareCjs?:boolean}}
 */
function readArgs(argv) {
  /** @type {{root:string,out:string,entry:string,port:number,hosts:string[],seed?:string,closedWorld:boolean,jsModule:boolean,publicAssets:string[],publicScripts:string[],reviewedAssetsPath?:string,experimentalRegisterVm?:Record<string,string[]>,experimentalExpressionVm?:Record<string,string[]>,experimentalNativeGraph?:Record<string,string[]>,experimentalStatementFlow?:Record<string,string[]>,experimentalStatementFlowCompact?:boolean,experimentalPolyvariantAffine?:Record<string,string[]>,experimentalPolyvariantCount?:2|4|8,experimentalWasmI32?:Record<string,string[]>,experimentalSymbolKeys:boolean,auditBareCjs?:boolean}} */
  const opts = {root:'',out:'',entry:'',port:8080,hosts:[],closedWorld:false,jsModule:false,publicAssets:[],publicScripts:[],experimentalSymbolKeys:false};
  for (let i=0;i<argv.length;i++) {
    const option = argv[i];
    if (option === '--closed-world') {opts.closedWorld=true;continue;}
    if (option === '--js-module') {opts.jsModule=true;continue;}
    if (option === '--audit-bare-cjs') {opts.auditBareCjs=true;continue;}
    if (option === '--symbol-keys') {opts.experimentalSymbolKeys=true;continue;}
    if (option === '--statement-flow-compact') {opts.experimentalStatementFlowCompact=true;continue;}
    const value = argv[++i];
    if (value === undefined) throw new TypeError(`Missing value for ${option}`);
    if (option === '--root') opts.root=value;
    else if (option === '--out') opts.out=value;
    else if (option === '--entry') opts.entry=value;
    else if (option === '--port') opts.port=Number(value);
    else if (option === '--host') opts.hosts.push(value);
    else if (option === '--seed') opts.seed=value;
    else if (option === '--asset') opts.publicAssets.push(value);
    else if (option === '--reviewed-assets') {
      if(opts.reviewedAssetsPath!==undefined) {
        throw new TypeError('--reviewed-assets must be specified once');
      }
      opts.reviewedAssetsPath=value;
    }
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
    else if (option === '--statement-flow') {
      const index=value.lastIndexOf(':');
      if(index<1||index===value.length-1){
        throw new TypeError('--statement-flow expects relative-file:functionName');
      }
      const file=safePath(value.slice(0,index));
      const name=value.slice(index+1);
      opts.experimentalStatementFlow??={};
      (opts.experimentalStatementFlow[file]??=[]).push(name);
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
  if (opts.experimentalStatementFlowCompact && !opts.experimentalStatementFlow) {
    throw new TypeError('--statement-flow-compact requires --statement-flow relative-file:functionName');
  }
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
    // Raw filename bytes must be checked before conversion to a path.
    // Default UTF-8 readdir would replace invalid bytes with U+FFFD and
    // could alias a different, valid replacement-character filename.
    const entries = await fs.readdir(path.join(root,directory),{
      withFileTypes:true,encoding:'buffer'
    });
    for(const item of entries) {
      if(!Buffer.isBuffer(item.name)||!isUtf8(item.name)) {
        throw new TypeError('Invalid UTF-8 source filename in '+(directory||'.')+
          ': '+Buffer.from(item.name).toString('hex'));
      }
    }
    // Bytewise ordering is independent of ICU locale/collation versions and
    // preserves a reproducible input order on Linux and Windows runners.
    entries.sort((a,b)=>Buffer.compare(a.name,b.name));
    for(const item of entries) {
      const name=String(item.name);
      if (name.toLowerCase() === 'node_modules' || name.toLowerCase() === '.git') continue;
      const relative = path.posix.join(directory,name);
      if (item.isSymbolicLink()) throw new Error(`Symlink in source tree: ${relative}`);
      if(item.isDirectory()) await read(relative);
      else if(item.isFile()) {
        const sourceType = /\.(?:js|cjs|mjs)$/.test(name) ? undefined : 'asset';
        const data = await fs.readFile(path.join(root,relative));
        // Buffer#toString silently substitutes U+FFFD for malformed UTF-8.
        // Validate first; preserving valid BOMs and opaque asset bytes.
        if(sourceType!=='asset'&&!isUtf8(data)) {
          throw new TypeError('Invalid UTF-8 JavaScript source: '+relative);
        }
        const code=sourceType==='asset'?data:data.toString('utf8');
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
    if (pkg) {
      if(Buffer.isBuffer(pkg.code)&&!isUtf8(pkg.code)) {
        throw new TypeError('Invalid UTF-8 package metadata: '+location);
      }
      // Node's package-scope reader accepts one leading UTF-8 BOM.
      // JSON.parse on a JS string would otherwise reject that valid input.
      const json=String(pkg.code);
      return JSON.parse(json.charCodeAt(0)===0xfeff?json.slice(1):json).type==='module';
    }
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
 * Refuse existing symlink/junction ancestors below the chosen output root.
 * A trusted output operator may choose a symlinked root elsewhere, but an
 * inner link must never redirect a generated filename to the source tree or
 * an unrelated directory. Resolve every output path before any file is
 * emitted; this is preflight against accidental aliases, not a race-proof
 * filesystem sandbox against an actively hostile server owner.
 * @param {string} outputRoot
 * @param {string} relativeFile
 * @returns {Promise<void>}
 */
async function assertNoOutputJunctions(outputRoot,relativeFile) {
  let parent=outputRoot;
  const directory=path.dirname(path.normalize(relativeFile));
  if(directory==='.')return;
  for(const part of directory.split(path.sep)) {
    parent=path.join(parent,part);
    /** @type {import('node:fs').Stats} */
    let stat;
    try {
      stat=await fs.lstat(parent);
    }catch(error){
      if(/** @type {NodeJS.ErrnoException} */(error).code==='ENOENT')return;
      throw error;
    }
    if(stat.isSymbolicLink()){
      throw new Error('Output path contains a symlink or junction: '+parent);
    }
    if(!stat.isDirectory()){
      throw new Error('Output parent is not a directory: '+parent);
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
      if(hasUrlPathnameNormalizationHazard(specifier)) {
        throw new Error('SCO noncanonical ESM import path unsupported: '+specifier);
      }
      // Module resolution is URL-based. Resolve a single percent-decoding
      // layer per segment so ordinary encoded Unicode, spaces and # names
      // remain reachable, while encoded separators/dot segments cannot
      // change the imported file's publication authority.
      if(specifier.includes('\\'))throw new Error('SCO encoded import path unsupported: '+specifier);
      const rawPath=specifier.split(/[?#]/u,1)[0];
      // WHATWG URL resolution preserves empty path segments until dot-segment
      // processing. POSIX normalization would collapse them and can select a
      // different file from the one the SCO HTTP route will serve.
      /** @type {string[]} */
      const rawSegments=rawPath.split('/');
      if(rawSegments.some((part,index)=>index>0&&part==='') ||
         hasTerminalUrlDotSegment(specifier)) {
        throw new Error('SCO noncanonical ESM import path unsupported: '+specifier);
      }
      /** @type {string[]} */
      const segments=[];
      for(const part of rawSegments) {
        /** @type {string} */
        let decoded;
        try {decoded=decodeURIComponent(part);}
        catch (error) {throw new Error('SCO encoded import path unsupported: '+specifier);}
        if(/[\\/\x00-\x1f\x7f]/u.test(decoded) ||
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

/**
 * Read a separately approved opaque-asset manifest. It must live outside
 * the source tree, otherwise COO/SNO would also package the review document.
 * The compiler performs exact path and SHA-256 validation after selecting
 * the public file set.
 *
 * @param {string} sourceRoot
 * @param {string|undefined} filename
 * @returns {Promise<import('./reviewed-assets').ReviewedOpaqueAsset[]|undefined>}
 */
async function readReviewedAssets(sourceRoot,filename) {
  if(filename===undefined)return undefined;
  const manifest=await fs.realpath(path.resolve(filename));
  const source=await fs.realpath(sourceRoot);
  const relative=path.relative(source,manifest);
  if(relative==='' || relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative)) {
    throw new TypeError('--reviewed-assets manifest must be outside --root');
  }
  /** @type {unknown} */
  const parsed=JSON.parse(await fs.readFile(manifest,'utf8'));
  if(!Array.isArray(parsed)) {
    throw new TypeError('--reviewed-assets requires a JSON array of {path,sha256} records');
  }
  return /** @type {import('./reviewed-assets').ReviewedOpaqueAsset[]} */ (parsed);
}

/**
 * Refuse a SNO executable whose external package context is not included
 * in its declared source tree. For .js, compare the actual Node module kind
 * with its declared source type. For .js/.cjs/.mjs, refuse an untracked
 * package imports mapping or named package self-reference exports that
 * could change relative to the emitted tree. Node may read ancestor and
 * stale nested package metadata.
 * This checks the current filesystem; relocation requires a new check.
 * @param {SourceFile[]} files
 * @param {string} root
 * @param {'input'|'output'} context
 * @returns {Promise<void>}
 */
async function assertSnoPackageScope(files,root,context) {
  const emitted=new Set(files.map(file=>file.path));
  // Every .js may encounter a stale package.json in a reused output tree,
  // including beneath an emitted package.json that would otherwise govern it.
  const scripts=files.filter(file=>/\.(?:[cm]?js)$/.test(file.path));
  if(scripts.length===0)return;

  // Node resolves filesystem aliases before loading files. Resolve the
  // nearest existing ancestor so a symlinked output does not hide its scope.
  let canonical=path.resolve(root);
  let ancestor=canonical;
  for(;;) {
    try {
      canonical=path.resolve(await fs.realpath(ancestor),path.relative(ancestor,canonical));
      break;
    } catch(error) {
      if(/** @type {NodeJS.ErrnoException} */(error).code!=='ENOENT')throw error;
      const parent=path.dirname(ancestor);
      if(parent===ancestor)throw error;
      ancestor=parent;
    }
  }

  /** @type {Map<string,{type:'module'|'other',hasImports:boolean,hasSelfExports:boolean}|'missing'>} */
  const scopes=new Map();
  for(const file of scripts) {
    const expectedModule=file.sourceType==='module';
    const jsFile=file.path.endsWith('.js');
    let relative=path.posix.dirname(file.path);
    let directory=path.dirname(path.join(canonical,file.path));
    for(;;) {
      // A file that the build will publish controls this scope after the
      // write. Only untracked packages between it and the .js can override.
      if(emitted.has(path.posix.join(relative,'package.json')))break;
      if(path.basename(directory)==='node_modules')break;
      let type=scopes.get(directory);
      if(type===undefined) {
        /** @type {string|undefined} */
        let content;
        try { content=await fs.readFile(path.join(directory,'package.json'),'utf8'); }
        catch(error) {
          if(/** @type {NodeJS.ErrnoException} */(error).code!=='ENOENT')throw error;
        }
        if(content!==undefined) {
          const json=content.charCodeAt(0)===0xfeff?content.slice(1):content;
          const metadata=JSON.parse(json);
          const ownsType=metadata && typeof metadata==='object' &&
            !Array.isArray(metadata) && Object.hasOwn(metadata,'type');
          if(!metadata || typeof metadata!=='object' || Array.isArray(metadata) ||
              ownsType && typeof metadata.type!=='string') {
            throw new TypeError('Invalid SNO '+context+' external package metadata: '+
              path.join(directory,'package.json'));
          }
          type={
            type:ownsType && metadata.type==='module'?'module':'other',
            hasImports:Object.hasOwn(metadata,'imports'),
            hasSelfExports:Object.hasOwn(metadata,'exports') &&
              Object.hasOwn(metadata,'name') &&
              typeof metadata.name==='string' && metadata.name.length>0
          };
        } else type='missing';
        scopes.set(directory,type);
      }
      if(type!=='missing') {
        if(jsFile && (type.type==='module')!==expectedModule) {
          throw new Error('SNO '+context+' .js inherits external '+
            (type.type==='module'?'ESM':'CommonJS')+' package scope: '+
            path.join(directory,'package.json'));
        }
        if(type.hasImports) {
          throw new Error('SNO '+context+' executable inherits external package imports: '+
            path.join(directory,'package.json'));
        }
        if(type.hasSelfExports) {
          throw new Error('SNO '+context+' executable inherits external package self-reference: '+
            path.join(directory,'package.json'));
        }
        break;
      }
      const parent=path.dirname(directory);
      if(parent===directory)break;
      directory=parent;
      relative=relative==='.'?'.':path.posix.dirname(relative);
    }
  }
}

/** @param {'coo'|'sco'|'sno'} mode @param {string[]} argv @returns {Promise<void>} */
async function main(mode,argv) {
  const {root,out,entry,port,hosts,seed,closedWorld,jsModule,publicAssets,publicScripts,reviewedAssetsPath,experimentalRegisterVm,experimentalExpressionVm,experimentalNativeGraph,experimentalStatementFlow,experimentalStatementFlowCompact,experimentalPolyvariantAffine,experimentalPolyvariantCount,experimentalWasmI32,experimentalSymbolKeys,auditBareCjs} = readArgs(argv);
  if (jsModule && mode==='sno') throw new TypeError('--js-module is for browser COO or SCO JavaScript');
  if(auditBareCjs&&mode!=='sno')throw new TypeError('--audit-bare-cjs is SNO-only');
  if (mode==='sco' && (experimentalRegisterVm||experimentalExpressionVm||experimentalNativeGraph||experimentalStatementFlow||experimentalStatementFlowCompact||experimentalPolyvariantAffine||experimentalWasmI32||experimentalSymbolKeys)) throw new TypeError('SCO CLI experimental VMs are unavailable');
  const absRoot = path.resolve(root);
  const reviewedOpaqueAssets=await readReviewedAssets(absRoot,reviewedAssetsPath);
  const sourceTree = await readSourceTree(absRoot);
  // A .js dependency inside a nested {"type":"module"} package is ESM,
  // even when SNO starts from a CommonJS .cjs entry. Preserve Node's
  // nearest-package scope for every file, not only for the launcher entry.
  const source = sourceTree.map(file =>
    file.path.endsWith('.js') && (jsModule || mode === 'sno' && entryUsesEsmPackage(sourceTree,file.path)) ?
      {...file,sourceType:/** @type {'module'} */ ('module')} : file);
  if (!source.some(file=>file.path===entry)) throw new Error(`Entry ${entry} not found under ${root}`);
  if (mode==='sno') await assertSnoPackageScope(source,absRoot,'input');
  if (mode === 'sco') {
    // Server-only .js/.mjs/.cjs files under --root are private by default.
    const clientFiles=selectScoPublicFiles(source,entry,publicScripts,publicAssets);
    const server = http.createServer(createScoHandler(clientFiles,{allowedHosts:hosts.length?hosts:undefined,closedWorld,reviewedOpaqueAssets}));
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
  const reservedLauncherKeys=new Set(portableKeys('sno-entry.cjs'));
  if (mode === 'sno' && source.some(file =>
    portableKeys(file.path.split('/',1)[0]).some(key=>reservedLauncherKeys.has(key)))) {
    throw new Error('SNO launcher filename collides with an input file');
  }
  const result = obfuscateFiles(source,{mode,seed,allowedHosts:hosts.length?hosts:undefined,closedWorld,reviewedOpaqueAssets,experimentalRegisterVm,experimentalExpressionVm,experimentalNativeGraph,experimentalStatementFlow,experimentalStatementFlowCompact,experimentalPolyvariantAffine,experimentalPolyvariantCount,experimentalWasmI32,experimentalSymbolKeys});
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
  // Cooperating builds publish each output tree under one exclusive lock,
  // preventing concurrent compilers from interleaving distinct generations.
  await withDirectoryLock(absOut,async()=>{
    // Resolve every intended output location before the first file write.
    // A nested output symlink/junction can otherwise bypass the root-only
    // outside-input check and silently overwrite original source files.
    for(const file of result.files){
      await assertNoOutputJunctions(absOut,file.path);
      await assertOutputOutsideInput(absRoot,path.join(absOut,file.path));
    }
    if(launcher!==undefined){
      await assertNoOutputJunctions(absOut,'sno-entry.cjs');
      await assertOutputOutsideInput(absRoot,path.join(absOut,'sno-entry.cjs'));
      await assertSnoPackageScope(result.files,absOut,'output');
      if(auditBareCjs)await assertSnoDirectBareRequireParity(source,result.files,absRoot,absOut);
    }
    for (const file of result.files) await atomicWrite(path.join(absOut,file.path),file.code);
    if (launcher !== undefined) await atomicWrite(path.join(absOut,'sno-entry.cjs'),launcher);
  },{timeoutMs:120000});
  process.stdout.write(`Processed ${result.files.length} files; mode ${mode}; output ${absOut}\n`);
}

module.exports = {main,readArgs,readSourceTree};
