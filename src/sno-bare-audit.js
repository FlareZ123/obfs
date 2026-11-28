'use strict';

const fs=require('node:fs/promises');
const {isUtf8}=require('node:buffer');
const path=require('node:path');
const {createRequire,isBuiltin}=require('node:module');
const {parse,walk}=require('./ast');
const {collectBindings}=require('./properties');
const {spawnSync}=require('node:child_process');
const {fileURLToPath,pathToFileURL}=require('node:url');

/** @typedef {import('./core').SourceFile} SourceFile */

/**
 * Resolve a future, possibly not-yet-created source tree beneath the
 * nearest existing real ancestor. This models Node's default realpath
 * lookup for build-time comparisons and does not load app modules.
 * @param {string} root
 * @returns {Promise<string>}
 */
async function futureRealRoot(root) {
  const intended=path.resolve(root);
  let existing=intended;
  for(;;) {
    try {
      const actual=await fs.realpath(existing);
      return path.resolve(actual,path.relative(existing,intended));
    } catch(error) {
      if(/** @type {NodeJS.ErrnoException} */(error).code!=='ENOENT')throw error;
      const parent=path.dirname(existing);
      if(parent===existing)throw error;
      existing=parent;
    }
  }
}

/**
 * Collect only direct, string-literal calls to the standard lexical
 * CommonJS require function. This is deliberately a narrow audit:
 * arbitrary dynamic aliases, module.createRequire and custom loaders need
 * separate analysis. Literal ESM import forms are audited independently. A lexical declaration named require
 * could shadow the builtin and is conservatively rejected.
 *
 * @param {SourceFile[]} files
 * @returns {Map<string,string[]>}
 */
function directBareRequires(files) {
  /** @type {Map<string,string[]>} */
  const entries=new Map();
  for(const file of files) {
    if(!/\.(?:cjs|js)$/iu.test(file.path)||file.sourceType==='module')continue;
    if(file.sourceType==='asset'||typeof file.code!=='string') {
      throw new TypeError(
        'SNO bare dependency audit cannot inspect opaque JavaScript: '+file.path);
    }
    const ast=parse(file.code,'commonjs');
    /** @type {string[]} */
    const refs=[];
    const shadow=collectBindings(ast).has('require');
    let dynamicScope=false;
    let unprovedRequire=false;
    walk(ast,(node,parent,key)=>{
      if(node.type==='WithStatement' ||
         node.type==='CallExpression'&&node.callee?.type==='Identifier'&&
           node.callee.name==='eval')dynamicScope=true;
      if(node.type==='Identifier'&&node.name==='require') {
        const direct=parent?.type==='CallExpression'&&key==='callee';
        const nameOnly=parent?.type==='Property'&&key==='key'&&!parent.computed ||
          parent?.type==='MethodDefinition'&&key==='key'&&!parent.computed;
        if(!direct&&!nameOnly)unprovedRequire=true;
      }
      if(node.type!=='CallExpression'||node.callee?.type!=='Identifier'||
          node.callee.name!=='require')return;
      if(!node.arguments?.length ||
         node.arguments[0]?.type!=='Literal'||
         typeof node.arguments[0].value!=='string') {
        unprovedRequire=true;
        return;
      }
      const specifier=/** @type {string} */(node.arguments[0].value);
      if(specifier==='.'||specifier==='..'||
          specifier.startsWith('./')||specifier.startsWith('../')||
          (path.sep==='\\' &&
            (specifier.startsWith('.\\')||specifier.startsWith('..\\')))||
          specifier.startsWith('/')||
          specifier.startsWith('#')||path.isAbsolute(specifier)||
          isBuiltin(specifier))return;
      refs.push(specifier);
    });
    if(unprovedRequire||shadow||dynamicScope) {
      throw new TypeError(
        'SNO bare dependency audit cannot prove direct lexical require in '+file.path);
    }
    if(refs.length)entries.set(file.path,refs.sort());
  }
  return entries;
}

/**
 * Audit the location-specific resolution of direct literal CommonJS bare
 * requires before publishing a SNO output directory. Source and output
 * resolve to the *same actual file path* under the native Node resolver,
 * including any package exports/conditional exports rules. A different
 * path can alter __filename, package-relative dependencies, native addon
 * loading or code bytes, so it is refused even if the payload matches.
 *
 * The audit observes only frozen direct literal require sites; it does
 * not certify dynamic imports, require aliases or custom loader hooks.
 *
 * @param {SourceFile[]} original
 * @param {SourceFile[]} generated
 * @param {string} inputRoot
 * @param {string} outputRoot
 * @returns {Promise<{entries:number,files:number}>}
 */
async function assertSnoDirectBareRequireParity(original,generated,inputRoot,outputRoot) {
  const sources=directBareRequires(original);
  const targets=directBareRequires(generated);
  if(sources.size===0&&targets.size===0)return {entries:0,files:0};
  // Resolving before publication cannot see package.json files that this
  // build will emit. They can introduce a self-reference or override an
  // external ancestor's package namespace. Decline the opt-in audit for
  // direct calls beneath a future package scope rather than assert parity
  // against a stale or incomplete resolver environment.
  const packaged=new Set(generated.filter(file=>
    file.path==='package.json'||file.path.endsWith('/package.json')
  ).map(file=>file.path));
  for(const filename of sources.keys()) {
    let directory=path.posix.dirname(filename);
    for(;;) {
      if(packaged.has(path.posix.join(directory,'package.json'))) {
        throw new Error('SNO bare dependency audit cannot model future package scope: '+filename);
      }
      if(directory==='.')break;
      directory=path.posix.dirname(directory);
    }
  }
  for(const [name,refs] of sources) {
    const transformed=targets.get(name);
    if(!transformed||JSON.stringify(transformed)!==JSON.stringify(refs)) {
      throw new Error('SNO bare dependency calls changed during compilation: '+name);
    }
  }
  for(const name of targets.keys())if(!sources.has(name)) {
    throw new Error('SNO bare dependency calls introduced during compilation: '+name);
  }

  const [input,output]=await Promise.all([
    futureRealRoot(inputRoot),futureRealRoot(outputRoot)
  ]);
  await assertEsmPackageScopeParity(original,generated,sources.keys(),input,output);
  let entries=0;
  for(const [filename,specifiers] of sources) {
    const from=createRequire(path.join(input,filename));
    const to=createRequire(path.join(output,filename));
    for(const specifier of specifiers) {
      /** @type {string} */
      let before;
      /** @type {string} */
      let after;
      try {before=from.resolve(specifier);}
      catch(error) {
        throw new Error('SNO source bare dependency could not resolve: '+
          filename+' -> '+specifier+' ('+
          /** @type {Error} */(error).message+')');
      }
      try {after=to.resolve(specifier);}
      catch(error) {
        throw new Error('SNO output bare dependency could not resolve: '+
          filename+' -> '+specifier+' ('+
          /** @type {Error} */(error).message+')');
      }
      if(before!==after) {
        throw new Error('SNO bare dependency resolution differs: '+
          filename+' -> '+specifier+' ('+before+' vs '+after+')');
      }
      entries++;
    }
  }
  return {entries,files:sources.size};
}



/**
 * @typedef {{specifier:string,parentURL:string}} ESMResolveRequest
 * @typedef {{ok:true,url:string}|{ok:false,code:string,message:string}} ESMResolveResult
 */

/**
 * Whether a module specifier is a bare package name handled by Node's
 * package resolver rather than a path, builtin, or URL.
 * @param {string} specifier
 * @returns {boolean}
 */
function isBareImportSpecifier(specifier) {
  if(specifier==='.'||specifier==='..'||
      specifier.startsWith('./')||specifier.startsWith('../')||
      specifier.startsWith('/')||path.isAbsolute(specifier)||
      (path.sep==='\\'&&
        (specifier.startsWith('.\\')||specifier.startsWith('..\\')))||
      /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(specifier)||
      isBuiltin(specifier))return false;
  return true;
}

/**
 * Collect static ESM import/export sources, literal dynamic imports, and
 * direct literal import.meta.resolve calls. Dynamic resolver construction,
 * package-import (#) maps, eval, and opaque JavaScript are refused.
 *
 * @param {SourceFile[]} files
 * @returns {Map<string,string[]>}
 */
function directBareImports(files) {
  /** @type {Map<string,string[]>} */
  const entries=new Map();
  for(const file of files) {
    if(!/\.(?:cjs|js|mjs)$/iu.test(file.path))continue;
    if(file.sourceType==='asset'||typeof file.code!=='string') {
      throw new TypeError(
        'SNO ESM bare dependency audit cannot inspect opaque JavaScript: '+file.path);
    }
    const isModule=file.sourceType==='module'||/\.mjs$/iu.test(file.path);
    const ast=parse(file.code,isModule?'module':'commonjs');
    /** @type {string[]} */
    const refs=[];
    let dynamicCode=false;
    let unprovedImport=false;
    /**
     * @param {string} specifier
     */
    const addSpecifier=specifier=>{
      if(specifier.startsWith('#')) {
        unprovedImport=true;
        return;
      }
      if(isBareImportSpecifier(specifier))refs.push(specifier);
    };
    walk(ast,(node,parent,key)=>{
      if(node.type==='WithStatement'||
          (node.type==='CallExpression'||node.type==='NewExpression')&&
            node.callee?.type==='Identifier'&&
            (node.callee.name==='eval'||node.callee.name==='Function')) {
        dynamicCode=true;
      }
      if((node.type==='ImportDeclaration'||
          node.type==='ExportAllDeclaration'||
          node.type==='ExportNamedDeclaration')&&
          typeof node.source?.value==='string') {
        addSpecifier(node.source.value);
      }
      if(node.type==='ImportExpression') {
        if(node.source?.type==='Literal'&&
            typeof node.source.value==='string') {
          addSpecifier(node.source.value);
        } else unprovedImport=true;
      }
      // A first-class import.meta object may escape through aliases,
      // destructuring, reflection, or forwarding. Such code can invoke
      // .resolve() without a syntactically direct call, invalidating this
      // build-time enumeration of bare package imports. Refuse it rather
      // than silently admit relocated, behavior-changing dependencies.
      if(node.type==='MetaProperty'&&
          node.meta?.name==='import'&&node.property?.name==='meta'&&
          (parent?.type!=='MemberExpression'||key!=='object')) {
        unprovedImport=true;
      }
      if(node.type==='MemberExpression'&&
          node.object?.type==='MetaProperty'&&
          node.object.meta?.name==='import'&&
          node.object.property?.name==='meta') {
        const resolveProperty=node.computed?
          node.property?.type==='Literal'&&node.property.value==='resolve':
          node.property?.type==='Identifier'&&node.property.name==='resolve';
        if(resolveProperty) {
          if(!(parent?.type==='CallExpression'&&key==='callee')) {
            unprovedImport=true;
          }
        } else if(node.computed&&node.property?.type!=='Literal') {
          unprovedImport=true;
        }
      }
      if(node.type==='CallExpression'&&
          node.callee?.type==='MemberExpression'&&
          node.callee.object?.type==='MetaProperty'&&
          node.callee.object.meta?.name==='import'&&
          node.callee.object.property?.name==='meta') {
        const callee=node.callee;
        const resolveProperty=callee.computed?
          callee.property?.type==='Literal'&&callee.property.value==='resolve':
          callee.property?.type==='Identifier'&&callee.property.name==='resolve';
        if(resolveProperty) {
          if(node.arguments?.length!==1||
              node.arguments[0]?.type!=='Literal'||
              typeof node.arguments[0].value!=='string') {
            unprovedImport=true;
            return;
          }
          addSpecifier(node.arguments[0].value);
        }
      }
    });
    if(dynamicCode||unprovedImport) {
      throw new TypeError(
        'SNO ESM bare dependency audit cannot prove literal imports in '+file.path);
    }
    if(refs.length)entries.set(file.path,refs.sort());
  }
  return entries;
}

/**
 * Refuse resolver modes that the parent-URL comparison does not model.
 * NODE_OPTIONS is inherited by the helper process, but process.execArgv is
 * not; custom conditions are therefore explicitly rejected rather than
 * silently compared under different export conditions.
 * @returns {void}
 */
function assertDefaultEsmResolverContext() {
  // --no-addons removes the ESM node-addons condition; the isolated helper
  // does not inherit process.execArgv, so its conditional-export selection
  // could otherwise differ from the runtime being audited.
  const unsupported=/^(?:--conditions(?:=.*)?|-C|--no-addons|--preserve-symlinks(?:-main)?|--(?:loader|experimental-loader|import|require)(?:=.*)?|-r)$/u;
  // NODE_OPTIONS accepts double-quoted fragments even inside a flag name,
  // e.g. --no"-"addons. Normalize quotes before screening unsupported
  // switches so an otherwise hidden resolver mode cannot evade the guard.
  const nodeOptions=(process.env.NODE_OPTIONS||'').replace(/"/gu,'')
    .match(/(?:--[^\s]+|-(?:r|C))/gu)||[];
  // Node also accepts an environment variable for symlink-preserving module
  // resolution. The audit canonicalizes its future roots with realpath; if
  // the runtime retains a symlinked importer path, it can instead resolve a
  // package from the symlink's parent directory. Reject this unsupported
  // mode before comparing misleading canonical parent URLs.
  const preserveSymlinks=process.env.NODE_PRESERVE_SYMLINKS==='1';
  if(preserveSymlinks||
      [...process.execArgv,...nodeOptions].some(flag=>unsupported.test(flag))) {
    throw new Error(
      'SNO ESM bare dependency audit does not model custom loaders, preloads, '+
      'symlink-preservation modes or nondefault Node conditions');
  }
}

/**
 * Resolve ESM specifiers using Node's actual import conditions and an
 * explicit parent URL. The helper runs in a separate Node process so
 * resolution does not populate the compiler process's module caches.
 *
 * @param {ESMResolveRequest[]} requests
 * @returns {ESMResolveResult[]}
 */
function resolveEsmRequests(requests) {
  const script=[
    "import {readFileSync} from 'node:fs';",
    "const requests=JSON.parse(readFileSync(0,'utf8'));",
    "const results=requests.map(({specifier,parentURL})=>{",
    "try{return {ok:true,url:import.meta.resolve(specifier,parentURL)};}",
    "catch(error){return {ok:false,code:String(error.code||''),message:String(error.message||error)};}",
    "});",
    "process.stdout.write(JSON.stringify(results));"
  ].join('\n');
  const child=spawnSync(process.execPath,[
    '--experimental-import-meta-resolve','--input-type=module','-e',script
  ],{
    input:JSON.stringify(requests),
    encoding:'utf8',
    timeout:30000,
    maxBuffer:4*1024*1024
  });
  if(child.error)throw child.error;
  if(child.status!==0) {
    throw new Error('SNO ESM resolver helper failed: '+String(child.stderr||''));
  }
  /** @type {ESMResolveResult[]} */
  const results=JSON.parse(child.stdout);
  if(!Array.isArray(results)||results.length!==requests.length) {
    throw new Error('SNO ESM resolver helper returned an invalid result set');
  }
  return results;
}


/**
 * Refuse case-variant package.json names in external ancestor directories.
 * Node may resolve these case-insensitively on Windows but not on POSIX.
 *
 * @param {string} root
 * @param {'source'|'output'} context
 * @returns {Promise<void>}
 */
async function assertNoCaseVariantPackageJsonAncestors(root,context) {
  let directory=path.resolve(root);
  for(;;) {
    /** @type {string[]} */
    let entries;
    try {
      entries=await fs.readdir(directory);
    } catch(error) {
      if(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT') {
        const parent=path.dirname(directory);
        if(parent===directory)break;
        directory=parent;
        continue;
      }
      throw error;
    }
    const variant=entries.find(name=>
      name.toLowerCase()==='package.json'&&name!=='package.json');
    if(variant) {
      throw new Error('SNO ESM bare dependency audit cannot model case-variant package.json ancestor in '+
        context+': '+path.join(directory,variant));
    }
    if(entries.includes('package.json'))break;
    const parent=path.dirname(directory);
    if(parent===directory)break;
    directory=parent;
  }
}

/**
 * Compare emitted package scopes with their source counterparts. A package
 * scope containing imports or a self-reference is refused; a byte-identical
 * scope without those features is safe for this bare-dependency comparison.
 *
 * @param {SourceFile[]} original
 * @param {SourceFile[]} generated
 * @param {Iterable<string>} filenames
 * @param {string} inputRoot
 * @param {string} outputRoot
 * @returns {Promise<void>}
 */
async function assertEsmPackageScopeParity(original,generated,filenames,inputRoot,outputRoot) {
  const auditedFiles=[...filenames];
  const packagePaths=[...original,...generated]
    .filter(file=>path.posix.basename(file.path).toLowerCase()==='package.json')
    .map(file=>file.path);
  for(const filename of auditedFiles) {
    let directory=path.posix.dirname(filename);
    for(;;) {
      const expected=path.posix.join(directory,'package.json');
      const variant=packagePaths.find(name=>
        name.toLowerCase()===expected.toLowerCase()&&name!==expected);
      if(variant) {
        throw new Error('SNO ESM bare dependency audit cannot model case-variant package.json path: '+variant);
      }
      if(directory==='.')break;
      directory=path.posix.dirname(directory);
    }
  }
  /** @type {Map<string,SourceFile>} */
  const sourcePackages=new Map();
  /** @type {Map<string,SourceFile>} */
  const outputPackages=new Map();
  for(const file of original) {
    if(file.path==='package.json'||file.path.endsWith('/package.json')) {
      sourcePackages.set(file.path,file);
    }
  }
  for(const file of generated) {
    if(file.path==='package.json'||file.path.endsWith('/package.json')) {
      outputPackages.set(file.path,file);
    }
  }
  let needsExternalCheck=false;
  for(const filename of auditedFiles) {
    let directory=path.posix.dirname(filename);
    let foundPackageScope=false;
    for(;;) {
      const packagePath=path.posix.join(directory,'package.json');
      const sourcePackage=sourcePackages.get(packagePath);
      const outputPackage=outputPackages.get(packagePath);
      if(sourcePackage||outputPackage) {
        if(!sourcePackage||!outputPackage) {
          throw new Error('SNO ESM bare dependency audit cannot model changed package scope: '+packagePath);
        }
        const sourceBytes=packageJsonBytes(sourcePackage,'source');
        const outputBytes=packageJsonBytes(outputPackage,'output');
        if(!sourceBytes.equals(outputBytes)) {
          throw new Error('SNO ESM bare dependency audit found changed package scope metadata: '+packagePath);
        }
        const jsonText=sourceBytes.toString('utf8');
        const metadata=JSON.parse(jsonText.charCodeAt(0)===0xfeff?jsonText.slice(1):jsonText);
        if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||
            Object.hasOwn(metadata,'imports')||
            Object.hasOwn(metadata,'exports')&&Object.hasOwn(metadata,'name')&&
              typeof metadata.name==='string'&&metadata.name.length>0) {
          throw new Error('SNO ESM bare dependency audit cannot model package imports/self-reference: '+packagePath);
        }
        if(Object.hasOwn(metadata,'type')&&typeof metadata.type!=='string') {
          throw new TypeError('Invalid SNO ESM package scope type: '+packagePath);
        }
        foundPackageScope=true;
        break;
      }
      if(directory==='.')break;
      directory=path.posix.dirname(directory);
    }
    if(!foundPackageScope)needsExternalCheck=true;
  }
  if(needsExternalCheck) {
    await Promise.all([
      assertNoCaseVariantPackageJsonAncestors(inputRoot,'source'),
      assertNoCaseVariantPackageJsonAncestors(outputRoot,'output')
    ]);
  }
}


/**
 * Refuse case-variant package.json files in the resolved dependency's
 * nearest package scope. Stop at the first exact package.json, which
 * shadows all parent scopes under Node's package-scope rules.
 *
 * @param {string} resolvedFile
 * @returns {Promise<void>}
 */
async function assertNoCaseVariantResolvedPackageScope(resolvedFile) {
  let directory=path.dirname(resolvedFile);
  for(;;) {
    const entries=await fs.readdir(directory);
    const variant=entries.find(name=>
      name.toLowerCase()==='package.json'&&name!=='package.json');
    if(variant) {
      throw new Error('SNO ESM bare dependency audit cannot model case-variant package.json dependency scope: '+
        path.join(directory,variant));
    }
    if(entries.includes('package.json'))break;
    const parent=path.dirname(directory);
    if(parent===directory)break;
    directory=parent;
  }
}

/**
 * @param {SourceFile} file
 * @param {'source'|'output'} context
 * @returns {Buffer}
 */
function packageJsonBytes(file,context) {
  /** @type {Buffer} */
  let bytes;
  if(Buffer.isBuffer(file.code))bytes=file.code;
  else if(typeof file.code==='string')bytes=Buffer.from(file.code,'utf8');
  else throw new TypeError('SNO ESM '+context+' package metadata is opaque: '+file.path);
  if(!isUtf8(bytes))throw new TypeError('Invalid UTF-8 SNO ESM '+context+' package metadata: '+file.path);
  return bytes;
}

/**
 * Compare Node's ESM bare-package resolution for every statically proven
 * import site before publishing a SNO output tree. This uses the ESM
 * resolver's import conditions rather than CommonJS require conditions.
 *
 * @param {SourceFile[]} original
 * @param {SourceFile[]} generated
 * @param {string} inputRoot
 * @param {string} outputRoot
 * @returns {Promise<{entries:number,files:number}>}
 */
async function assertSnoDirectBareImportParity(original,generated,inputRoot,outputRoot) {
  const sources=directBareImports(original);
  const targets=directBareImports(generated);
  if(sources.size===0&&targets.size===0)return {entries:0,files:0};
  assertDefaultEsmResolverContext();
  for(const [name,specifiers] of sources) {
    const transformed=targets.get(name);
    if(!transformed||JSON.stringify(transformed)!==JSON.stringify(specifiers)) {
      throw new Error('SNO ESM bare dependency specifiers changed during compilation: '+name);
    }
  }
  for(const name of targets.keys())if(!sources.has(name)) {
    throw new Error('SNO ESM bare dependency specifiers introduced during compilation: '+name);
  }

  const [input,output]=await Promise.all([
    futureRealRoot(inputRoot),futureRealRoot(outputRoot)
  ]);
  // Compare source and emitted module scopes before trusting identical bare
  // specifier strings: package imports and self-reference change resolution.
  await assertEsmPackageScopeParity(original,generated,sources.keys(),input,output);
  /** @type {ESMResolveRequest[]} */
  const requests=[];
  /** @type {{filename:string,specifier:string,sourceIndex:number,outputIndex:number}[]} */
  const pairs=[];
  for(const [filename,specifiers] of sources) {
    const sourceURL=pathToFileURL(path.join(input,filename)).href;
    const outputURL=pathToFileURL(path.join(output,filename)).href;
    for(const specifier of specifiers) {
      const sourceIndex=requests.length;
      requests.push({specifier,parentURL:sourceURL});
      const outputIndex=requests.length;
      requests.push({specifier,parentURL:outputURL});
      pairs.push({filename,specifier,sourceIndex,outputIndex});
    }
  }
  const resolved=resolveEsmRequests(requests);
  for(const result of resolved) {
    if(!result.ok)continue;
    if(typeof result.url!=='string'||!result.url.startsWith('file:')) {
      throw new Error('SNO ESM bare dependency audit cannot model non-file resolver target: '+String(result.url));
    }
    await assertNoCaseVariantResolvedPackageScope(fileURLToPath(result.url));
  }
  for(const pair of pairs) {
    const before=resolved[pair.sourceIndex];
    const after=resolved[pair.outputIndex];
    if(!before||!after)throw new Error('SNO ESM resolver helper omitted a resolution result');
    if(!before.ok) {
      throw new Error('SNO source ESM bare dependency could not resolve: '+
        pair.filename+' -> '+pair.specifier+' ('+before.message+')');
    }
    if(!after.ok) {
      throw new Error('SNO output ESM bare dependency could not resolve: '+
        pair.filename+' -> '+pair.specifier+' ('+after.message+')');
    }
    if(before.url!==after.url) {
      throw new Error('SNO ESM bare dependency resolution differs: '+
        pair.filename+' -> '+pair.specifier+' ('+before.url+' vs '+after.url+')');
    }
  }
  return {entries:pairs.length,files:sources.size};
}

module.exports={directBareRequires,assertSnoDirectBareRequireParity,directBareImports,assertSnoDirectBareImportParity};
