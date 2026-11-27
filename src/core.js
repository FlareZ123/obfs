'use strict';

const path = require('node:path');
const {hasTerminalUrlDotSegment,hasUrlPathnameNormalizationHazard}=require('./esm-url-paths');
const {isBuiltin}=require('node:module');
const {randomBytes, createHash} = require('node:crypto');
const {parse,walk,observesFunctionSource,observesDistributedSource,staticString,hasUnsafeNativeBindMutationSurface,hasWeakMapPrototypeExposure} = require('./ast');
const {renameLocalProperties,collectBindings,hasUnmodeledNativeBindGlobalReference} = require('./properties');
const {symbolizeLocalProperties} = require('./symbol-properties');
const {encodeStrings} = require('./strings');
const {provenLocalReflectGetCaptures} = require('./decoder-safe-reads');
const {createPathInventory,registerFilePath,safePath} = require('./portable-paths');
const {renameCrossFileProperties,collectVerifiedImportedStrings,collectVerifiedImportedPrimitives,collectVerifiedImportedCloneAliases,collectVerifiedImportedUrlStaticAliases,collectImportedFunctionArrays,collectImportedStorageMethodAliases} = require('./cross-properties');
const {renameLocalIdentifiers} = require('./identifiers');
const {virtualizeRegisterChains} = require('./register-vm');
const {virtualizeExpressionGraphs} = require('./expression-vm');
const {flattenBranchBlocks} = require('./branch-blocks');
const {flattenStatementFlow} = require('./statement-flow');
const {lowerPolyvariantAffine} = require('./affine-native');
const {lowerWasmI32Functions} = require('./wasm-i32');
const {assertNoSourceMapDisclosure} = require('./source-maps');
const {hasPinnedLocalJavaScriptIntegrity}=require('./html-assets');
const {assertReviewedOpaqueAssets}=require('./reviewed-assets');
const {proveSourceObserverIslands}=require('./source-observer-islands');
const {canonicalAllowedHosts}=require('./hosts');

/** @typedef {'coo'|'sco'|'sno'} ObfuscationMode */
/** @typedef {'module'|'script'|'commonjs'|'asset'} SourceType */
/** @typedef {{path:string,code:string|Buffer,sourceType?:SourceType,privateModulePaths?:string[],privateOriginalDigests?:string[]}} SourceFile */
/** @typedef {{path:string,code:string|Buffer,sourceType:SourceType,metrics:{literals:number,objects:number,properties:number,bindings:number,vmFunctions?:number,vmInstructions?:number,expressionVmFunctions?:number,expressionVmInstructions?:number,nativeGraphFunctions?:number,nativeGraphInstructions?:number,branchFunctions?:number,branchBlocks?:number,statementFlowFunctions?:number,statementFlowBlocks?:number,polyvariantFunctions?:number,polyvariantPaths?:number,polyvariantSteps?:number,wasmI32Functions?:number,wasmI32Instructions?:number,wasmI32Bytes?:number,symbolKeys?:number}}} OutputFile */
/**
 * @typedef {{mode?:ObfuscationMode,seed?:string,strings?:boolean,properties?:boolean,identifiers?:boolean,minimumStringLength?:number,experimentalFixedArityStrings?:boolean,allowedHosts?:string[],closedWorld?:boolean,experimentalRegisterVm?:Record<string,string[]>,experimentalExpressionVm?:Record<string,string[]>,experimentalNativeGraph?:Record<string,string[]>,experimentalBranchBlocks?:Record<string,string[]>,experimentalBranchStateBlinding?:boolean,experimentalStatementFlow?:Record<string,string[]>,experimentalStatementFlowCompact?:boolean,experimentalPolyvariantAffine?:Record<string,string[]>,experimentalPolyvariantCount?:2|4|8,experimentalPolyvariantCompact?:boolean,experimentalWasmI32?:Record<string,string[]>,experimentalSymbolKeys?:boolean,experimentalSourceObserverIslands?:string[],reviewedOpaqueAssets?:import('./reviewed-assets').ReviewedOpaqueAsset[]}} ObfuscationOptions
 */

/**
 * A body-level ESM host guard can precede every executable module statement
 * only if every statically imported dependency is present in the same guarded
 * output group. A dependency outside that group would run before its importer
 * checks the host and could perform arbitrary effects.
 *
 * This deliberately excludes opaque assets, scripts, bare package imports,
 * URL/query/fragment and encoded specifiers, repeated-separator paths,
 * case-mismatched filenames, and undeclared dependencies. Module cycles are
 * safe for this boundary because each module body starts with its own guard,
 * irrespective of evaluation order.
 *
 * @param {(SourceFile & {sourceType:SourceType})[]} files
 * @returns {boolean}
 */
function completeGuardedModuleGraph(files) {
  if (!files.length || files.some(file=>file.sourceType!=='module' || typeof file.code!=='string')) return false;
  const known=new Set(files.map(file=>file.path));
  for (const file of files) {
    const ast=parse(/** @type {string} */ (file.code),'module');
    for (const statement of ast.body) {
      if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(statement.type) ||
          !statement.source)continue;
      const specifier=statement.source.value;
      if(typeof specifier!=='string' ||
          (!specifier.startsWith('./')&&!specifier.startsWith('../')) ||
          /[?#%\\\\]/u.test(specifier) || specifier.includes('//') || hasUrlPathnameNormalizationHazard(specifier) || hasTerminalUrlDotSegment(specifier))return false;
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file.path),specifier));
      if(!known.has(target))return false;
    }
  }
  return true;
}

/**
 * @param {string} source
 * @param {import('./ast').AstNode} ast
 * @param {string[]} hosts
 * @param {boolean} [completeStaticGraph]
 * @returns {string}
 */
function injectHostLock(source, ast, hosts, completeStaticGraph=false) {
  // ESM dependencies run before this module body. The closed graph proof
  // allows static imports only when every dependency receives its own guard.
  if (!completeStaticGraph &&
      (/** @type {import('./ast').AstNode[]} */ (ast.body)).some(statement => statement.type === 'ImportDeclaration' ||
      statement.type === 'ExportAllDeclaration' ||
      statement.type === 'ExportNamedDeclaration' && statement.source)) {
    throw new TypeError('Host locking ESM static imports or reexports requires a complete closed-world module group');
  }
  // The guard executes before user declarations. A local globalThis binding
  // can shadow the host object or remain in its temporal dead zone.
  // Conservatively decline whenever the source declares that name, including
  // aliases introduced by imports, destructuring, or function parameters.
  if (collectBindings(ast).has('globalThis')) {
    throw new TypeError('Host locking cannot preserve a shadowed globalThis binding');
  }
  const allowed=canonicalAllowedHosts(hosts);
  const snippet = `;(()=>{const h=globalThis.location?.hostname?.toLowerCase();if(!${JSON.stringify(allowed)}.includes(h))throw Error('Unauthorized execution host')})();\n`;
  let offset = 0;
  if (source.startsWith('#!')) {
    const end = source.indexOf('\n');
    offset = end < 0 ? source.length : end + 1;
  }
  for (const statement of ast.body) {
    if (statement.type === 'ExpressionStatement' && statement.directive) offset = statement.end;
    else break;
  }
  return source.slice(0,offset) + '\n' + snippet + source.slice(offset);
}

/**
 * Conservatively detect a bounded CommonJS flow where one supplied module
 * exports or contains a function that can return native Web Storage and a
 * statically linked sibling writes a potentially callable value through an
 * otherwise opaque property receiver. The receiver provenance crosses the
 * require boundary, so per-file source-observer analysis cannot prove that
 * the named Web Storage setter will not stringify the callable.
 *
 * Literal-only writes intentionally remain outside this guard so the adjacent
 * non-source-observing positive-yield controls can still be transformed.
 * @param {(SourceFile & {sourceType:SourceType})[]} files
 * @returns {boolean}
 */
function hasCommonJsStorageFactorySourceSink(files) {
  const commonJs=files.filter(file=>
    file.sourceType==='commonjs'&&typeof file.code==='string');
  if(commonJs.length<2)return false;
  let hasStorageFactory=false;
  let hasPotentialCallableMemberWrite=false;
  let hasStaticRelativeRequire=false;
  /** @param {import('./ast').AstNode|null|undefined} node @returns {boolean} */
  function isDirectStorageValue(node) {
    if(!node)return false;
    if(node.type==='Identifier')
      return node.name==='localStorage'||node.name==='sessionStorage';
    if(node.type!=='MemberExpression')return false;
    const root=node.object;
    const key=node.computed?staticString(node.property):
      node.property.type==='Identifier'?node.property.name:null;
    return root.type==='Identifier'&&
      ['globalThis','global','window','self'].includes(root.name)&&
      (key==='localStorage'||key==='sessionStorage');
  }
  for(const file of commonJs) {
    const ast=parse(/** @type {string} */ (file.code),'commonjs');
    walk(ast,node=>{
      if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&
         node.callee.name==='require') {
        const specifier=staticString(node.arguments[0]);
        if(specifier!==null&&
           (specifier.startsWith('./')||specifier.startsWith('../'))&&
           !/[?#%\\\\]/u.test(specifier))hasStaticRelativeRequire=true;
      }
      if(node.type==='ReturnStatement'&&isDirectStorageValue(node.argument))
        hasStorageFactory=true;
      if(node.type==='AssignmentExpression'&&node.operator==='='&&
         node.left.type==='MemberExpression') {
        const value=node.right;
        if(value.type==='Identifier'||value.type==='FunctionExpression'||
           value.type==='ArrowFunctionExpression'||value.type==='CallExpression')
          hasPotentialCallableMemberWrite=true;
      }
    });
  }
  return hasStaticRelativeRequire&&hasStorageFactory&&hasPotentialCallableMemberWrite;
}

/**
 * Find supplied CommonJS modules reached by a static relative require. Only
 * those export surfaces can carry a decoder-sensitive reference into another
 * supplied file through this bounded cross-file proof.
 * @param {(SourceFile & {sourceType:SourceType})[]} files
 * @returns {Set<string>}
 */
function staticallyRequiredCommonJsTargets(files) {
  const known=new Set(files.filter(file=>file.sourceType==='commonjs').map(file=>file.path));
  const required=new Set();
  for(const file of files) {
    if(file.sourceType!=='commonjs'||typeof file.code!=='string')continue;
    const ast=parse(file.code,'commonjs');
    walk(ast,node=>{
      if(node.type!=='CallExpression'||node.callee.type!=='Identifier'||
         node.callee.name!=='require')return;
      const argument=node.arguments[0];
      if(!argument)return;
      const specifier=staticString(argument);
      if(specifier===null||
         (!specifier.startsWith('./')&&!specifier.startsWith('../'))||
         /[?#%\\\\]/u.test(specifier))return;
      const base=path.posix.normalize(
        path.posix.join(path.posix.dirname(file.path),specifier));
      const candidates=path.posix.extname(base)?[base]:
        [base,base+'.js',base+'.cjs',base+'/index.js',base+'/index.cjs'];
      for(const candidate of candidates) {
        if(!known.has(candidate))continue;
        required.add(candidate);
        break;
      }
    });
  }
  return required;
}

/**
 * Find supplied ESM modules reached by static relative imports or reexports.
 * Exact module specifiers are used because ESM path resolution does not imply
 * CommonJS-style extension probing.
 * @param {(SourceFile & {sourceType:SourceType})[]} files
 * @returns {Set<string>}
 */
function staticallyImportedEsmTargets(files) {
  const known=new Set(files.filter(file=>file.sourceType==='module').map(file=>file.path));
  const imported=new Set();
  for(const file of files) {
    if(file.sourceType!=='module'||typeof file.code!=='string')continue;
    const ast=parse(file.code,'module');
    for(const statement of ast.body??[]) {
      if(!['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(statement.type)) {
        continue;
      }
      const source=statement.source;
      if(!source||source.type!=='Literal'||typeof source.value!=='string')continue;
      const specifier=source.value;
      if((!specifier.startsWith('./')&&!specifier.startsWith('../'))||
         /[?#%\\\\]/u.test(specifier) || specifier.includes('//') || hasUrlPathnameNormalizationHazard(specifier) || hasTerminalUrlDotSegment(specifier))continue;
      const target=path.posix.normalize(
        path.posix.join(path.posix.dirname(file.path),specifier));
      if(known.has(target))imported.add(target);
    }
  }
  return imported;
}

/**
 * ESM dependencies execute before a later module's string decoder.
 * This source-graph check accepts syntactically local import paths only
 * under the ordinary unmodified host resolver. Browser import maps or
 * custom Node loader hooks can redirect even supplied relative paths:
 * their deployment provenance is outside this AST proof.
 * Unlisted, computed and otherwise ambiguous imports refuse decoding.
 *
 * @param {import('./ast').AstNode} ast
 * @param {string} filename
 * @param {Set<string>} knownJavaScript
 * @returns {boolean}
 */
function hasUnprovedModuleImport(ast,filename,knownJavaScript) {
  /**
   * @param {import('./ast').AstNode|null|undefined} source
   * @returns {boolean}
   */
  function resolvesInGraph(source) {
    if(source?.type!=='Literal'||typeof source.value!=='string')return false;
    const specifier=source.value;
    if((!specifier.startsWith('./')&&!specifier.startsWith('../'))||
       /[?#%\\]/u.test(specifier) || specifier.includes('//') || hasUrlPathnameNormalizationHazard(specifier) || hasTerminalUrlDotSegment(specifier))return false;
    const target=path.posix.normalize(
      path.posix.join(path.posix.dirname(filename),specifier));
    return knownJavaScript.has(target);
  }
  let unproved=false;
  walk(ast,node=>{
    if(node.type==='ImportExpression') {
      if(node.options||!resolvesInGraph(node.source))unproved=true;
      return;
    }
    if(node.type==='ImportDeclaration'||
       (node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration')&&
       node.source) {
      if(node.attributes?.length||node.assertions?.length||
         !resolvesInGraph(node.source))unproved=true;
    }
  });
  return unproved;
}

/**
 * A CommonJS require can load unlisted application code before a later
 * module's ambient String decoder initializes. Accept exact in-group
 * relative JavaScript modules and Node's ordinary native builtins.
 * Other calls may have unknown source and side effects at runtime. This
 * builtin exception assumes ordinary Node resolution: isBuiltin() classifies
 * a specifier but does not prove that host loader hooks cannot remap a bare
 * name such as 'path'. See docs/SECURITY.md for this host-contract boundary.
 *
 * @param {import('./ast').AstNode} ast
 * @param {string} filename
 * @param {Set<string>} knownJavaScript
 * @returns {boolean}
 */
function hasUnprovedCommonJsRequire(ast,filename,knownJavaScript) {
  let unproved=false;
  walk(ast,node=>{
    if(node.type!=='CallExpression'||node.callee.type!=='Identifier'||
       node.callee.name!=='require')return;
    const specifier=node.arguments.length===1 ?
      staticString(node.arguments[0]) : null;
    if(specifier===null) {
      unproved=true;
      return;
    }
    if(isBuiltin(specifier))return;
    if((!specifier.startsWith('./')&&!specifier.startsWith('../'))||
       /[?#%\\]/u.test(specifier)) {
      unproved=true;
      return;
    }
    const base=path.posix.normalize(
      path.posix.join(path.posix.dirname(filename),specifier));
    const candidates=path.posix.extname(base)?[base]:
      [base,base+'.js',base+'.cjs',base+'.mjs',
       base+'/index.js',base+'/index.cjs',base+'/index.mjs'];
    if(!candidates.some(candidate=>knownJavaScript.has(candidate)))unproved=true;
  });
  return unproved;
}

/**
 * Detect direct writes that can replace String decoder methods or the Array
 * iterator consumed by chunked string spread. An imported ESM dependency executes before this file's
 * decoder, so a write anywhere in the supplied file group must disable that
 * decoder throughout the group. Indirect aliases and external modules remain
 * outside this deliberately conservative syntactic check.
 * @param {import('./ast').AstNode} ast
 * @param {boolean} [rejectCommonJsExportEscape]
 * @param {boolean} [rejectEsmExportEscape]
 * @returns {boolean}
 */
function mutatesDecoderIntrinsic(ast,rejectCommonJsExportEscape=false,rejectEsmExportEscape=false) {
  const safeCapturedReflectGet=provenLocalReflectGetCaptures(ast);
  // A supplied binding named Object, Reflect or Array may replace the
  // presumed intrinsic. Numeric-argument prototype provenance is then unsafe.
  // An unrelated field write remains eligible after may-alias key filtering.
  const locallyBoundIntrinsics=collectBindings(ast);
  // Find immutable-looking and reassigned aliases before checking writes.
  // A dependency can mutate String through one of these names before another
  // file's eager decoder initializes; the whole group must then opt out.
  const globalNames=new Set(['globalThis','window','self','global','top','parent','frames','opener']);
  // Imports and CommonJS require results have unknown value provenance.
  // Any such binding may be a Document, so a later .defaultView.String
  // mutation must disable the ambient decoder even across file boundaries.
  const documentNames=new Set(['document']);
  for(const statement of ast.body??[]) {
    if(statement.type!=='ImportDeclaration')continue;
    for(const specifier of statement.specifiers??[]) {
      if(specifier.local?.type==='Identifier')documentNames.add(specifier.local.name);
    }
  }
  const stringNames=new Set(['String']);
  /** @type {Set<string>} */
  const stringInstances=new Set();
  const prototypeNames=new Set();
  const arrayNames=new Set(['Array']);
  const arrayPrototypes=new Set();
  const objectNames=new Set(['Object']);
  const objectPrototypes=new Set();
  // A runtime getPrototypeOf argument may be a String, Array or Object.
  // Track uncertain results separately to keep harmless unrelated key writes eligible.
  const possiblePrototypes=new Set();
  const possibleConstructors=new Set();
  // Summarize local synchronous function returns and plain returned object
  // fields. Reassigned aliases are joined monotonically; unknown source paths
  // remain outside this bounded, conservative closed-input proof.
  const returnedSensitiveFunctions=new Set();
  /** @type {Map<string,Set<string>>} */
  const returnedSensitiveFields=new Map();
  /** @type {Map<string,Set<string>>} */
  const returnedSensitivePaths=new Map();
  // A finite container can hold a sensitive reference behind a computed key
  // whose exact path cannot be represented by returnedSensitivePaths.
  const unknownSensitiveContainers=new Set();
  let opaqueReflectiveSensitiveWrite=false;
  const reflectNames=new Set(['Reflect']);
  const legacyGetterAliases=new Set();
  const mutatorsObject=new Set(['defineProperty','defineProperties','assign','setPrototypeOf']);
  const mutatorsReflect=new Set(['set','defineProperty','deleteProperty','setPrototypeOf']);
  const sensitiveReadsObject=new Set(['getOwnPropertyDescriptor','getOwnPropertyDescriptors','getPrototypeOf']);
  const sensitiveReadsReflect=new Set(['get','getPrototypeOf']);
  /** @param {import('./ast').AstNode} node @returns {string|null} */
  function memberName(node) {
    if (node.type!=='MemberExpression') return null;
    return node.computed ? staticString(node.property) :
      node.property.type==='Identifier' ? node.property.name : null;
  }
  /**
   * Exact container paths may use numeric computed indices even where the
   * general mutation model intentionally treats computed members as opaque.
   * @param {import('./ast').AstNode} node
   * @returns {string|null}
   */
  function pathMemberName(node) {
    if(node.type!=='MemberExpression')return null;
    if(!node.computed)return node.property.type==='Identifier'?node.property.name:null;
    if(node.property.type==='Literal'&&node.property.regex===undefined&&
       ['string','number','bigint','boolean'].includes(typeof node.property.value)) {
      return String(node.property.value);
    }
    return staticString(node.property);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isDocumentValue(node) {
    return node.type==='Identifier' && documentNames.has(node.name) ||
      node.type==='MemberExpression' && memberName(node)==='document' &&
        isGlobal(node.object);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isGlobal(node) {
    if(node.type==='Identifier')return globalNames.has(node.name);
    if(node.type!=='MemberExpression')return false;
    const field=memberName(node);
    // The active document's defaultView is its WindowProxy. Earlier browser
    // dependencies can therefore replace String.fromCharCode through this
    // path, corrupting a later module's otherwise inert literal decoder.
    // A shadowed/detached document may over-refuse, which is conservative.
    if(field==='defaultView') {
      return isDocumentValue(node.object);
    }
    return ['window','self','globalThis','top','parent','frames','opener'].includes(field??'') &&
      isGlobal(node.object);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isObjectIntrinsic(node) {
    return node.type==='Identifier' && objectNames.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='Object';
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isReflectIntrinsic(node) {
    return node.type==='Identifier' && reflectNames.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='Reflect';
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isStringInstance(node) {
    return node.type==='Identifier' && stringInstances.has(node.name) ||
      node.type==='Literal' && typeof node.value==='string' ||
      node.type==='TemplateLiteral' && node.expressions.length===0 ||
      node.type==='NewExpression' && isStringValue(node.callee);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isStringValue(node) {
    if(node.type==='Identifier')return stringNames.has(node.name);
    if(node.type==='MemberExpression')return (
      isGlobal(node.object) && (memberName(node)==='String' || memberName(node)===null) ||
      memberName(node)==='constructor' && isStringInstance(node.object));
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression' &&
       node.callee.object.type==='Identifier' && node.callee.object.name==='Reflect' &&
       memberName(node.callee)==='get' && node.arguments.length>=2 &&
       isGlobal(node.arguments[0])) {
      const key=node.arguments[1];
      return key.type!=='Literal' || key.value==='String';
    }
    return false;
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isStringPrototype(node) {
    if(node.type==='Identifier')return prototypeNames.has(node.name);
    if(node.type==='MemberExpression') {
      // Primitive string instances expose String.prototype through __proto__.
      // An earlier dependency can mutate the decoder's charCodeAt this way.
      if(isStringInstance(node.object) && memberName(node)==='__proto__')return true;
      return isStringValue(node.object) &&
        (memberName(node)==='prototype'||memberName(node)===null);
    }
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression' &&
       (isObjectIntrinsic(node.callee.object)||isReflectIntrinsic(node.callee.object)) &&
       memberName(node.callee)==='getPrototypeOf' &&
       node.arguments[0] && isStringInstance(node.arguments[0]))return true;
    return false;
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isArrayInstance(node) {
    return node.type==='ArrayExpression' ||
      node.type==='NewExpression' && isArrayValue(node.callee);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isArrayValue(node) {
    if(node.type==='Identifier')return arrayNames.has(node.name);
    if(node.type==='MemberExpression') {
      if(isGlobal(node.object) &&
         (memberName(node)==='Array'||memberName(node)===null) ||
         memberName(node)==='constructor' && isArrayInstance(node.object))return true;
      // A data descriptor of globalThis.Array exposes that same mutable
      // constructor through its .value. A prior module can patch its prototype.
      const descriptor=node.object;
      return memberName(node)==='value' &&
        descriptor.type==='CallExpression' &&
        descriptor.callee.type==='MemberExpression' &&
        isObjectIntrinsic(descriptor.callee.object) &&
        memberName(descriptor.callee)==='getOwnPropertyDescriptor' &&
        descriptor.arguments[0] && isGlobal(descriptor.arguments[0]) &&
        descriptor.arguments[1] && staticString(descriptor.arguments[1])==='Array';
    }
    return node.type==='CallExpression' &&
      node.callee.type==='MemberExpression' &&
      isReflectIntrinsic(node.callee.object) &&
      memberName(node.callee)==='get' &&
      node.arguments[0] && isGlobal(node.arguments[0]) &&
      node.arguments[1] && staticString(node.arguments[1])==='Array';
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isArrayPrototype(node) {
    if(node.type==='Identifier')return arrayPrototypes.has(node.name);
    if(node.type==='MemberExpression') {
      // Array literals inherit the same iterator prototype as Array.prototype.
      // A patched iterator would corrupt the chunked decoder's spread.
      if(isArrayInstance(node.object) && memberName(node)==='__proto__')return true;
      if(isArrayValue(node.object) &&
         (memberName(node)==='prototype'||memberName(node)===null))return true;
      if(memberName(node)==='value') {
        const descriptor=node.object;
        if(descriptor.type==='CallExpression' &&
           descriptor.callee.type==='MemberExpression' &&
           isObjectIntrinsic(descriptor.callee.object) &&
           memberName(descriptor.callee)==='getOwnPropertyDescriptor' &&
           descriptor.arguments[0] && isArrayValue(descriptor.arguments[0]) &&
           descriptor.arguments[1] && staticString(descriptor.arguments[1])==='prototype') {
          return true;
        }
        if(descriptor.type==='MemberExpression' &&
           memberName(descriptor)==='prototype' &&
           descriptor.object.type==='CallExpression' &&
           descriptor.object.callee.type==='MemberExpression' &&
           isObjectIntrinsic(descriptor.object.callee.object) &&
           memberName(descriptor.object.callee)==='getOwnPropertyDescriptors' &&
           descriptor.object.arguments[0] &&
           isArrayValue(descriptor.object.arguments[0]))return true;
      }
      return false;
    }
    return node.type==='CallExpression' && node.callee.type==='MemberExpression' &&
      (memberName(node.callee)==='getPrototypeOf' &&
       (isObjectIntrinsic(node.callee.object)||isReflectIntrinsic(node.callee.object)) &&
       node.arguments[0] && isArrayInstance(node.arguments[0]) ||
       memberName(node.callee)==='get' && isReflectIntrinsic(node.callee.object) &&
       node.arguments[0] && isArrayValue(node.arguments[0]) &&
       node.arguments[1] && staticString(node.arguments[1])==='prototype');
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isObjectPrototype(node) {
    if(node.type==='Identifier')return objectPrototypes.has(node.name);
    if(node.type==='MemberExpression')return (
      isObjectIntrinsic(node.object) && memberName(node)==='prototype' ||
      (isArrayPrototype(node.object)||isStringPrototype(node.object)) &&
        (memberName(node)==='__proto__' ||
         node.computed && memberName(node)===null));
    // Both Array.prototype and String.prototype normally inherit from
    // Object.prototype, whose indexed accessors affect the decoder's [].
    // Unknown host patches can change these parents; overapproximating
    // an alias is safer than silently emitting corrupting array writes.
    return node.type==='CallExpression' &&
      node.callee.type==='MemberExpression' &&
      memberName(node.callee)==='getPrototypeOf' &&
      (isObjectIntrinsic(node.callee.object)||isReflectIntrinsic(node.callee.object)) &&
      Boolean(node.arguments[0] &&
        (isArrayPrototype(node.arguments[0])||isStringPrototype(node.arguments[0])));
  }
  /**
   * The chunked decoder writes its own array indices 0 through 4095.
   * Inherited getters/setters on any of these keys can intercept writes
   * to a newly created [] and corrupt String.fromCharCode(...units).
   * @param {import('./ast').AstNode|null|undefined} key
   * @returns {boolean}
   */
  function mayInterceptChunkIndex(key) {
    if(!key)return true;
    const name=key.type==='Literal' && key.regex===undefined &&
      ['number','bigint','boolean'].includes(typeof key.value) ?
      String(key.value) : staticString(key);
    if(name===null || name==='__proto__')return true;
    if(!/^(?:0|[1-9][0-9]*)$/u.test(name))return false;
    const index=Number(name);
    return Number.isSafeInteger(index) && index<4096;
  }
  /**
   * Encode a static member path without delimiter collisions.
   * @param {string[]} parts
   * @returns {string}
   */
  function sensitivePathKey(parts) {
    return parts.map(part=>part.length+':'+part+';').join('');
  }
  /**
   * Decode the collision-free sensitive path representation.
   * @param {string} pathKey
   * @returns {string[]|null}
   */
  function sensitivePathParts(pathKey) {
    /** @type {string[]} */
    const parts=[];
    let offset=0;
    while(offset<pathKey.length) {
      const colon=pathKey.indexOf(':',offset);
      if(colon<0)return null;
      const length=Number(pathKey.slice(offset,colon));
      if(!Number.isSafeInteger(length)||length<0)return null;
      const start=colon+1;
      const end=start+length;
      if(end>=pathKey.length||pathKey[end]!==';')return null;
      parts.push(pathKey.slice(start,end));
      offset=end+1;
    }
    return parts;
  }
  /**
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function isReturnedSensitiveField(node) {
    if(node.type!=='MemberExpression')return false;
    /** @type {(string|null)[]} */
    const parts=[];
    let cursor=node;
    while(cursor.type==='MemberExpression') {
      parts.unshift(pathMemberName(cursor));
      cursor=cursor.object;
    }
    let ownerName=null;
    if(cursor.type==='CallExpression'&&cursor.callee.type==='Identifier') {
      ownerName=cursor.callee.name;
    } else if(cursor.type==='Identifier') {
      ownerName=cursor.name;
    }
    if(ownerName===null)return false;
    if(unknownSensitiveContainers.has(ownerName))return true;
    const paths=returnedSensitivePaths.get(ownerName);
    if(!paths?.size)return false;
    const unknown=parts.indexOf(null);
    if(unknown<0) {
      return paths.has(sensitivePathKey(/** @type {string[]} */ (parts)));
    }
    const prefix=/** @type {string[]} */ (parts.slice(0,unknown));
    const prefixKey=sensitivePathKey(prefix);
    return [...paths].some(pathKey=>pathKey.startsWith(prefixKey));
  }
  /**
   * A dynamically supplied receiver can resolve to a decoder-sensitive
   * prototype even if no local literal, array or constructor proves its type.
   * Known nonstring primitive literals are a safe precision exception.
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function isPossiblePrototype(node) {
    if(node.type==='Identifier')return possiblePrototypes.has(node.name);
    if(isReturnedSensitiveField(node))return true;
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&
       returnedSensitiveFunctions.has(node.callee.name))return true;
    if(node.type==='MemberExpression')return (
      memberName(node)==='__proto__' && isPossiblePrototype(node.object) ||
      (memberName(node)==='prototype'||memberName(node)===null) &&
        (locallyBoundIntrinsics.has('Array')&&isArrayValue(node.object) ||
         locallyBoundIntrinsics.has('Object')&&isObjectIntrinsic(node.object) ||
         locallyBoundIntrinsics.has('Reflect')&&isReflectIntrinsic(node.object)));
    if(node.type!=='CallExpression'||node.callee.type!=='MemberExpression'||
       memberName(node.callee)!=='getPrototypeOf'||
       !(isObjectIntrinsic(node.callee.object)||isReflectIntrinsic(node.callee.object)))return false;
    const argument=node.arguments[0];
    if(!argument)return false;
    if(isObjectIntrinsic(node.callee.object)&&locallyBoundIntrinsics.has('Object') ||
       isReflectIntrinsic(node.callee.object)&&locallyBoundIntrinsics.has('Reflect'))return true;
    return !(argument.type==='Literal'&&argument.regex===undefined&&
      argument.value!==null&&typeof argument.value!=='string');
  }
  /**
   * The constructor property on an uncertain prototype may expose String,
   * allowing callers to overwrite the decoder's String.fromCharCode.
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function isPossibleConstructor(node) {
    if(node.type==='Identifier')return possibleConstructors.has(node.name);
    if(isReturnedSensitiveField(node))return true;
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&
       returnedSensitiveFunctions.has(node.callee.name))return true;
    if(node.type==='MemberExpression') {
      if(isPossiblePrototype(node.object) &&
         (memberName(node)==='constructor'||memberName(node)===null))return true;
      // A descriptor's value exposes the same constructor without
      // spelling P.constructor in the source.
      const descriptor=node.object;
      return memberName(node)==='value' &&
        descriptor.type==='CallExpression' &&
        descriptor.callee.type==='MemberExpression' &&
        isObjectIntrinsic(descriptor.callee.object) &&
        memberName(descriptor.callee)==='getOwnPropertyDescriptor' &&
        Boolean(descriptor.arguments[0]&&
          isPossiblePrototype(descriptor.arguments[0])&&
          (!descriptor.arguments[1]||
           staticString(descriptor.arguments[1])===null||
           staticString(descriptor.arguments[1])==='constructor'));
    }
    // A reflective read of an opaque prototype's constructor can yield the
    // native String constructor and permit String.fromCharCode replacement.
    return node.type==='CallExpression' &&
      node.callee.type==='MemberExpression' &&
      isReflectIntrinsic(node.callee.object) &&
      memberName(node.callee)==='get' &&
      Boolean(node.arguments[0]&&isPossiblePrototype(node.arguments[0])&&
        (!node.arguments[1]||staticString(node.arguments[1])===null||
         staticString(node.arguments[1])==='constructor'));
  }
  /**
   * A computed unknown key might be Symbol.iterator, charCodeAt or an index
   * inherited by the decoder's fresh temporary array.
   * @param {import('./ast').AstNode|null|undefined} key
   * @returns {boolean}
   */
  function mayTouchDecoderKey(key) {
    if(!key)return true;
    const name=key.type==='Literal'&&key.regex===undefined&&
      ['number','bigint','boolean'].includes(typeof key.value)?
      String(key.value):staticString(key);
    if(name===null||['charCodeAt','fromCharCode','__proto__','constructor'].includes(name))return true;
    if(!/^(?:0|[1-9][0-9]*)$/u.test(name))return false;
    const index=Number(name);
    return Number.isSafeInteger(index)&&index<4096;
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function writesPossibleDecoderIntrinsic(node) {
    if(node.type!=='MemberExpression')return false;
    if(isPossibleConstructor(node.object))return mayTouchDecoderKey(node.property);
    if(!isPossiblePrototype(node.object))return false;
    const name=memberName(node);
    if(name===null||['charCodeAt','__proto__','constructor'].includes(name))return true;
    if(!/^(?:0|[1-9][0-9]*)$/u.test(name))return false;
    return Number(name)<4096;
  }
  // Iterate to a fixed point to see through e.g. G=globalThis; S=G.String,
  // independent of declaration order. A later reassignment may yield a false
  // positive, which is safer than assuming a potentially mutable alias is pure.
  let discovered;
  do {
    discovered=false;
    walk(ast,node=>{
      /** @param {Set<string>} set @param {string} name */
      function add(set,name) {
        if(!set.has(name)){set.add(name);discovered=true;}
      }
      /**
       * Local synchronous functions may return an intrinsic through a direct
       * return value or a named field of an object literal. Summaries are
       * monotonic over aliases and declaration order; unresolved calls remain
       * outside this deliberately limited interprocedural proof.
       * @param {import('./ast').AstNode} value
       * @returns {boolean}
       */
      function sensitiveReturnValue(value) {
        return isStringPrototype(value)||isStringValue(value)||
          isArrayPrototype(value)||isArrayValue(value)||
          isObjectPrototype(value)||isObjectIntrinsic(value)||
          isReflectIntrinsic(value)||isPossiblePrototype(value)||
          isPossibleConstructor(value);
      }
      /**
       * @param {import('./ast').AstNode} fn
       * @returns {boolean}
       */
      function functionReturnsSensitiveValue(fn) {
        if(!['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(fn.type)||
           fn.async||fn.generator)return false;
        if(fn.body.type!=='BlockStatement')return sensitiveReturnValue(fn.body);
        let sensitive=false;
        walk(fn.body,(innerNode,_parent,_key,ancestors)=>{
          if(sensitive||innerNode.type!=='ReturnStatement'||!innerNode.argument)return;
          if(ancestors.some((/** @type {import('./ast').AstNode} */ parent)=>
            ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
             'ClassDeclaration','ClassExpression'].includes(parent.type)))return;
          if(sensitiveReturnValue(innerNode.argument))sensitive=true;
        });
        return sensitive;
      }
      /**
       * Reading an accessor property executes its getter. A data property
       * preserves the existing direct-value semantics.
       * @param {import('./ast').AstNode} property
       * @returns {boolean}
       */
      function propertyReadProducesSensitiveValue(property) {
        return property.type==='Property'&&
          (property.kind==='get'&&functionReturnsSensitiveValue(property.value)||
           property.kind!=='get'&&sensitiveReturnValue(property.value));
      }
      /**
       * @param {string} name
       * @param {string} pathKey
       */
      function addReturnedPathKey(name,pathKey) {
        let paths=returnedSensitivePaths.get(name);
        if(!paths) {
          paths=new Set();
          returnedSensitivePaths.set(name,paths);
        }
        if(!paths.has(pathKey)){paths.add(pathKey);discovered=true;}
      }
      /**
       * @param {string} name
       * @param {string[]} parts
       */
      function addReturnedPath(name,parts) {
        addReturnedPathKey(name,sensitivePathKey(parts));
      }
      /**
       * @param {string} name
       * @param {string} key
       */
      function addReturnedField(name,key) {
        let fields=returnedSensitiveFields.get(name);
        if(!fields) {
          fields=new Set();
          returnedSensitiveFields.set(name,fields);
        }
        if(!fields.has(key)){fields.add(key);discovered=true;}
        addReturnedPath(name,[key]);
      }
      /**
       * Record exact sensitive descendant paths in finite object/array
       * literals. Parent containers remain untainted so a safe sibling can
       * retain decoder yield.
       * @param {string} name
       * @param {import('./ast').AstNode} value
       * @param {string[]} [prefix]
       */
      function recordLiteralSensitivePaths(name,value,prefix=[]) {
        if(value.type==='ObjectExpression') {
          for(const property of value.properties) {
            if(property.type==='SpreadElement') {
              const source=property.argument;
              if(source.type==='ObjectExpression'||source.type==='ArrayExpression') {
                recordLiteralSensitivePaths(name,source,prefix);
                continue;
              }
              const sourceRoot=sensitiveContainerPath(source);
              if(sourceRoot) {
                if(unknownSensitiveContainers.has(sourceRoot.name)) {
                  add(unknownSensitiveContainers,name);
                  continue;
                }
                const sourcePrefix=sensitivePathKey(sourceRoot.parts);
                const targetPrefix=sensitivePathKey(prefix);
                for(const pathKey of returnedSensitivePaths.get(sourceRoot.name)??[]) {
                  if(!pathKey.startsWith(sourcePrefix)||pathKey.length===sourcePrefix.length)continue;
                  addReturnedPathKey(name,targetPrefix+pathKey.slice(sourcePrefix.length));
                }
              } else if(containsDecoderIntrinsic(source)) {
                add(unknownSensitiveContainers,name);
              }
              continue;
            }
            if(property.type!=='Property')continue;
            const key=property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key);
            if(key===null) {
              if(containsDecoderIntrinsic(property.value))add(unknownSensitiveContainers,name);
              continue;
            }
            const pathParts=[...prefix,key];
            if(propertyReadProducesSensitiveValue(property)||
               key==='get'&&property.kind!=='get'&&
                 functionReturnsSensitiveValue(property.value)) {
              addReturnedPath(name,pathParts);
              if(prefix.length===0)addReturnedField(name,key);
            }
            if(property.value.type==='ObjectExpression'||property.value.type==='ArrayExpression') {
              recordLiteralSensitivePaths(name,property.value,pathParts);
            }
          }
          return;
        }
        if(value.type!=='ArrayExpression')return;
        for(let index=0;index<value.elements.length;index++) {
          const element=value.elements[index];
          if(!element)continue;
          if(element.type==='SpreadElement') {
            if(containsDecoderIntrinsic(element.argument))add(unknownSensitiveContainers,name);
            continue;
          }
          const key=String(index);
          const pathParts=[...prefix,key];
          if(sensitiveReturnValue(element)) {
            addReturnedPath(name,pathParts);
            if(prefix.length===0)addReturnedField(name,key);
          }
          if(element.type==='ObjectExpression'||element.type==='ArrayExpression') {
            recordLiteralSensitivePaths(name,element,pathParts);
          }
        }
      }
      /**
       * Finite object/array literals can preserve a decoder-sensitive reference
       * behind a local field. Record only exact static paths.
       * @param {string} name
       * @param {import('./ast').AstNode} value
       */
      function recordLiteralSensitiveFields(name,value) {
        recordLiteralSensitivePaths(name,value);
      }
      /**
       * Resolve a statically named local container path.
       * @param {import('./ast').AstNode} owner
       * @returns {{name:string,parts:string[]}|null}
       */
      function localContainerPath(owner) {
        /** @type {string[]} */
        const parts=[];
        let cursor=owner;
        while(cursor.type==='MemberExpression') {
          const key=pathMemberName(cursor);
          if(key===null)return null;
          parts.unshift(key);
          cursor=cursor.object;
        }
        return cursor.type==='Identifier'?{name:cursor.name,parts}:null;
      }
      /**
       * Resolve a local container or a direct call whose synchronous function
       * has a finite returned-container summary.
       * @param {import('./ast').AstNode} owner
       * @returns {{name:string,parts:string[]}|null}
       */
      function sensitiveContainerPath(owner) {
        const local=localContainerPath(owner);
        if(local)return local;
        if(owner.type==='CallExpression'&&owner.callee.type==='Identifier'&&
           (returnedSensitivePaths.has(owner.callee.name)||
            unknownSensitiveContainers.has(owner.callee.name))) {
          return {name:owner.callee.name,parts:[]};
        }
        return null;
      }
      /**
       * Record a decoder-sensitive descendant at an exact path under a local
       * container. This is shared by direct assignments and reflective writes.
       * @param {import('./ast').AstNode} owner
       * @param {string[]} suffix
       */
      function recordKnownSensitivePath(owner,suffix) {
        const root=localContainerPath(owner);
        if(!root)return;
        const parts=[...root.parts,...suffix];
        if(!parts.length)return;
        addReturnedPath(root.name,parts);
        if(parts.length===1)addReturnedField(root.name,parts[0]);
      }
      /**
       * @param {import('./ast').AstNode} owner
       * @param {string[]} suffix
       * @param {import('./ast').AstNode} value
       */
      function recordSensitivePathWrite(owner,suffix,value) {
        if(sensitiveReturnValue(value))recordKnownSensitivePath(owner,suffix);
      }
      /**
       * Add a sensitive value written after construction to the same exact
       * local member-path summary used for literal initialization.
       * @param {import('./ast').AstNode} target
       * @param {import('./ast').AstNode} value
       */
      function recordSensitiveMemberWrite(target,value) {
        if(target.type!=='MemberExpression')return;
        const key=pathMemberName(target);
        if(key===null)return;
        recordSensitivePathWrite(target.object,[key],value);
      }
      /**
       * Copy known sensitive descendants from a finite source into a target.
       * Object.assign copies reference values, so nested literal containers
       * preserve the same mutable decoder-intrinsic reachability.
       * @param {import('./ast').AstNode} owner
       * @param {import('./ast').AstNode} source
       * @param {string[]} [prefix]
       */
      function recordSensitiveContainerCopy(owner,source,prefix=[]) {
        if(source.type==='ObjectExpression') {
          for(const property of source.properties) {
            if(property.type==='SpreadElement') {
              recordSensitiveContainerCopy(owner,property.argument,prefix);
              continue;
            }
            if(property.type!=='Property')continue;
            const key=property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key);
            if(key===null) {
              if(propertyReadProducesSensitiveValue(property)||
                 containsDecoderIntrinsic(property.value))opaqueReflectiveSensitiveWrite=true;
              continue;
            }
            const pathParts=[...prefix,key];
            if(propertyReadProducesSensitiveValue(property)) {
              recordKnownSensitivePath(owner,pathParts);
            } else {
              recordSensitivePathWrite(owner,pathParts,property.value);
            }
            if(property.value.type==='ObjectExpression'||property.value.type==='ArrayExpression') {
              recordSensitiveContainerCopy(owner,property.value,pathParts);
            }
          }
          return;
        }
        if(source.type==='ArrayExpression') {
          for(let index=0;index<source.elements.length;index++) {
            const element=source.elements[index];
            if(!element||element.type==='SpreadElement')continue;
            const pathParts=[...prefix,String(index)];
            recordSensitivePathWrite(owner,pathParts,element);
            if(element.type==='ObjectExpression'||element.type==='ArrayExpression') {
              recordSensitiveContainerCopy(owner,element,pathParts);
            }
          }
          return;
        }
        const sourceRoot=sensitiveContainerPath(source);
        const targetRoot=localContainerPath(owner);
        if(!sourceRoot||!targetRoot) {
          if(containsDecoderIntrinsic(source))opaqueReflectiveSensitiveWrite=true;
          return;
        }
        if(unknownSensitiveContainers.has(sourceRoot.name)) {
          opaqueReflectiveSensitiveWrite=true;
          return;
        }
        const sourcePrefix=sensitivePathKey(sourceRoot.parts);
        const targetPrefix=sensitivePathKey([...targetRoot.parts,...prefix]);
        for(const pathKey of returnedSensitivePaths.get(sourceRoot.name)??[]) {
          if(!pathKey.startsWith(sourcePrefix)||pathKey.length===sourcePrefix.length)continue;
          addReturnedPathKey(targetRoot.name,targetPrefix+pathKey.slice(sourcePrefix.length));
        }
      }
      /**
       * @param {import('./ast').AstNode} descriptor
       * @returns {boolean}
       */
      function descriptorHasSensitiveValue(descriptor) {
        if(descriptor.type==='ObjectExpression') {
          return descriptor.properties.some((/** @type {import('./ast').AstNode} */ property)=>{
            if(property.type!=='Property')return false;
            const key=property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key);
            if(key==='value')return propertyReadProducesSensitiveValue(property);
            return key==='get'&&property.kind!=='get'&&
              functionReturnsSensitiveValue(property.value);
          });
        }
        return hasSensitiveContainerField(descriptor,'value')||
          hasSensitiveContainerField(descriptor,'get');
      }
      /**
       * Preserve exact decoder-intrinsic provenance for writes performed by
       * built-in reflection APIs rather than AssignmentExpression syntax.
       * @param {import('./ast').AstNode} node
       */
      function recordReflectiveContainerWrite(node) {
        if(node.type!=='CallExpression'||node.callee.type!=='MemberExpression')return;
        const receiver=node.callee.object;
        const method=memberName(node.callee);
        const legacyGetterCallable=
          receiver.type==='Identifier'&&legacyGetterAliases.has(receiver.name)||
          receiver.type==='MemberExpression'&&memberName(receiver)==='__defineGetter__';
        if(legacyGetterCallable&&(method==='call'||method==='apply')) {
          const target=node.arguments[0];
          let keyArgument;
          let getter;
          if(method==='call') {
            keyArgument=node.arguments[1];
            getter=node.arguments[2];
          } else {
            const args=node.arguments[1];
            if(args?.type==='ArrayExpression') {
              const keyElement=args.elements[0];
              const getterElement=args.elements[1];
              keyArgument=keyElement&&keyElement.type!=='SpreadElement'?keyElement:undefined;
              getter=getterElement&&getterElement.type!=='SpreadElement'?getterElement:undefined;
            }
          }
          if(target&&keyArgument&&getter&&functionReturnsSensitiveValue(getter)) {
            const key=staticString(keyArgument);
            if(key===null)opaqueReflectiveSensitiveWrite=true;
            else recordKnownSensitivePath(target,[key]);
          }
          return;
        }
        const target=node.arguments[0];
        if(!target)return;
        if(method==='__defineGetter__') {
          const getter=node.arguments[1];
          if(getter&&functionReturnsSensitiveValue(getter)) {
            const key=staticString(target);
            if(key===null)opaqueReflectiveSensitiveWrite=true;
            else recordKnownSensitivePath(receiver,[key]);
          }
          return;
        }
        if(isObjectIntrinsic(receiver)&&method==='assign') {
          for(const source of node.arguments.slice(1)) {
            recordSensitiveContainerCopy(target,source);
          }
          return;
        }
        if((isObjectIntrinsic(receiver)||isReflectIntrinsic(receiver))&&
           method==='setPrototypeOf') {
          const prototype=node.arguments[1];
          if(prototype)recordSensitiveContainerCopy(target,prototype);
          return;
        }
        if(isObjectIntrinsic(receiver)&&method==='defineProperties') {
          const descriptors=node.arguments[1];
          if(!descriptors)return;
          if(descriptors.type==='ObjectExpression') {
            for(const property of descriptors.properties) {
              if(property.type!=='Property')continue;
              const key=property.computed?staticString(property.key):
                property.key.type==='Identifier'?property.key.name:staticString(property.key);
              if(key===null) {
                if(descriptorHasSensitiveValue(property.value))opaqueReflectiveSensitiveWrite=true;
              } else if(descriptorHasSensitiveValue(property.value)) {
                recordKnownSensitivePath(target,[key]);
              }
            }
            return;
          }
          const descriptorRoot=sensitiveContainerPath(descriptors);
          if(!descriptorRoot)return;
          if(unknownSensitiveContainers.has(descriptorRoot.name)) {
            opaqueReflectiveSensitiveWrite=true;
            return;
          }
          const sourcePrefix=sensitivePathKey(descriptorRoot.parts);
          for(const pathKey of returnedSensitivePaths.get(descriptorRoot.name)??[]) {
            if(!pathKey.startsWith(sourcePrefix)||pathKey.length===sourcePrefix.length)continue;
            const relative=sensitivePathParts(pathKey.slice(sourcePrefix.length));
            if(relative?.length===2&&
               (relative[1]==='value'||relative[1]==='get')) {
              recordKnownSensitivePath(target,[relative[0]]);
            }
          }
          return;
        }
        if((isObjectIntrinsic(receiver)&&method==='defineProperty')||
           (isReflectIntrinsic(receiver)&&method==='defineProperty')) {
          const key=node.arguments[1]?staticString(node.arguments[1]):null;
          const descriptor=node.arguments[2];
          if(descriptor&&descriptorHasSensitiveValue(descriptor)) {
            if(key===null)opaqueReflectiveSensitiveWrite=true;
            else recordKnownSensitivePath(target,[key]);
          }
          return;
        }
        if(isReflectIntrinsic(receiver)&&method==='set') {
          const key=node.arguments[1]?staticString(node.arguments[1]):null;
          const value=node.arguments[2];
          if(value&&sensitiveReturnValue(value)) {
            if(key===null)opaqueReflectiveSensitiveWrite=true;
            else recordKnownSensitivePath(target,[key]);
          }
        }
      }
      /**
       * @param {import('./ast').AstNode} owner
       * @param {string|null} key
       * @returns {boolean}
       */
      function hasSensitiveContainerField(owner,key) {
        const summary=sensitiveContainerPath(owner);
        if(summary) {
          if(unknownSensitiveContainers.has(summary.name))return true;
          const paths=returnedSensitivePaths.get(summary.name);
          if(!paths?.size)return false;
          const requested=key===null?summary.parts:[...summary.parts,key];
          if(key===null&&summary.parts.length===0)return true;
          const prefix=sensitivePathKey(requested);
          return [...paths].some(pathKey=>pathKey.startsWith(prefix));
        }
        if(owner.type==='ObjectExpression') {
          for(const property of owner.properties) {
            if(property.type!=='Property')continue;
            const propertyKey=property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key);
            if((key===null||propertyKey===key)&&sensitiveReturnValue(property.value))return true;
          }
          return false;
        }
        if(owner.type!=='ArrayExpression')return false;
        if(key===null)return owner.elements.some(
          (/** @type {import('./ast').AstNode|null} */ element)=>
            element!==null&&element.type!=='SpreadElement'&&sensitiveReturnValue(element));
        if(!/^(?:0|[1-9][0-9]*)$/u.test(key))return false;
        const element=owner.elements[Number(key)];
        return Boolean(element&&element.type!=='SpreadElement'&&sensitiveReturnValue(element));
      }
      /**
       * Preserve sensitive field provenance through finite destructuring
       * without tainting unrelated sibling fields.
       * @param {import('./ast').AstNode} pattern
       * @param {import('./ast').AstNode} owner
       */
      function recordSensitiveContainerPattern(pattern,owner) {
        if(pattern.type==='ObjectPattern') {
          for(const property of pattern.properties) {
            if(property.type!=='Property')continue;
            const key=property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key);
            if(!hasSensitiveContainerField(owner,key))continue;
            const target=property.value.type==='AssignmentPattern'?
              property.value.left:property.value;
            if(target.type==='Identifier') {
              add(possiblePrototypes,target.name);
              add(possibleConstructors,target.name);
            }
          }
          return;
        }
        if(pattern.type!=='ArrayPattern')return;
        for(let index=0;index<pattern.elements.length;index++) {
          const element=pattern.elements[index];
          if(!element||element.type==='RestElement'||
             !hasSensitiveContainerField(owner,String(index)))continue;
          const target=element.type==='AssignmentPattern'?element.left:element;
          if(target.type==='Identifier') {
            add(possiblePrototypes,target.name);
            add(possibleConstructors,target.name);
          }
        }
      }
      /**
       * @param {string} name
       * @param {import('./ast').AstNode} fn
       */
      function recordLocalReturns(name,fn) {
        if(fn.async||fn.generator)return;
        /** @type {import('./ast').AstNode[]} */
        const returned=[];
        if(fn.body.type==='BlockStatement') {
          walk(fn.body,(innerNode,_parent,_key,ancestors)=>{
            if(innerNode.type!=='ReturnStatement'||!innerNode.argument)return;
            // A declaration or class inside this function has an independent
            // return boundary. Its returned intrinsic does not escape this
            // outer function merely by appearing in a nested body.
            if(ancestors.some((/** @type {import('./ast').AstNode} */ parent)=>
              ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
               'ClassDeclaration','ClassExpression'].includes(parent.type)))return;
            returned.push(innerNode.argument);
          });
        } else returned.push(fn.body);
        for(const value of returned) {
          if(sensitiveReturnValue(value))add(returnedSensitiveFunctions,name);
          if(value.type==='ObjectExpression'||value.type==='ArrayExpression') {
            recordLiteralSensitiveFields(name,value);
          }
          if(value.type==='CallExpression'&&value.callee.type==='Identifier') {
            const sourceName=value.callee.name;
            if(unknownSensitiveContainers.has(sourceName))add(unknownSensitiveContainers,name);
            for(const key of returnedSensitiveFields.get(sourceName)??[]) {
              addReturnedField(name,key);
            }
            for(const pathKey of returnedSensitivePaths.get(sourceName)??[]) {
              addReturnedPathKey(name,pathKey);
            }
          }
        }
      }
      if(node.type==='AssignmentExpression'&&node.operator==='=') {
        recordSensitiveMemberWrite(node.left,node.right);
      }
      recordReflectiveContainerWrite(node);
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier') {
        recordLocalReturns(node.id.name,node);
      }
      if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&
         node.init&&(node.init.type==='FunctionExpression'||
           node.init.type==='ArrowFunctionExpression')) {
        recordLocalReturns(node.id.name,node.init);
      }
      if(node.type==='AssignmentExpression'&&node.operator==='='&&
         node.left.type==='Identifier'&&
         (node.right.type==='FunctionExpression'||node.right.type==='ArrowFunctionExpression')) {
        recordLocalReturns(node.left.name,node.right);
      }
      /**
       * A destructuring pattern can read Array.prototype's inherited
       * __proto__ getter, including with a computed unknown key. Preserve
       * a possible parent alias rather than allowing a later descriptor
       * write to corrupt the chunked decoder's fresh array indices.
       * @param {import('./ast').AstNode} pattern
       * @param {import('./ast').AstNode} owner
       */
      function recordArrayParentPattern(pattern,owner) {
        if(pattern.type!=='ObjectPattern'||!isArrayPrototype(owner))return;
        for(const property of pattern.properties) {
          if(property.type!=='Property')continue;
          const key=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(key!==null&&key!=='__proto__')continue;
          const target=property.value.type==='AssignmentPattern'?
            property.value.left:property.value;
          if(target.type==='Identifier')add(objectPrototypes,target.name);
        }
      }
      /**
       * A constructor destructured from an opaque runtime prototype may be
       * String, whose fromCharCode method the eager decoder invokes.
       * @param {import('./ast').AstNode} pattern
       * @param {import('./ast').AstNode} owner
       */
      function recordPossibleConstructorPattern(pattern,owner) {
        if(pattern.type!=='ObjectPattern'||!isPossiblePrototype(owner))return;
        for(const property of pattern.properties) {
          if(property.type!=='Property')continue;
          const key=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(key!==null&&key!=='constructor')continue;
          const target=property.value.type==='AssignmentPattern'?
            property.value.left:property.value;
          if(target.type==='Identifier')add(possibleConstructors,target.name);
        }
      }
      /**
       * Assignment destructuring can expose the same ambient WindowProxy as
       * declaration destructuring. Propagate both paths to the existing
       * monotonic intrinsic alias sets before deciding decoder safety.
       * @param {import('./ast').AstNode} pattern
       * @param {import('./ast').AstNode} owner
       */
      function recordDocumentPattern(pattern,owner) {
        if(pattern.type!=='ObjectPattern')return;
        for(const property of pattern.properties) {
          if(property.type!=='Property')continue;
          const key=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          const target=property.value.type==='AssignmentPattern'?
            property.value.left:property.value;
          if(target.type!=='Identifier')continue;
          if(key==='document'&&isGlobal(owner))add(documentNames,target.name);
          if(key==='defaultView'&&isDocumentValue(owner))add(globalNames,target.name);
        }
      }
      if(node.type==='VariableDeclarator' && node.init) {
        recordArrayParentPattern(node.id,node.init);
        recordPossibleConstructorPattern(node.id,node.init);
        recordDocumentPattern(node.id,node.init);
        recordSensitiveContainerPattern(node.id,node.init);
        if(node.id.type==='Identifier') {
          recordLiteralSensitiveFields(node.id.name,node.init);
          if(node.init.type==='MemberExpression'&&memberName(node.init)==='__defineGetter__') {
            add(legacyGetterAliases,node.id.name);
          }
          if(node.init.type==='Identifier') {
            if(legacyGetterAliases.has(node.init.name))add(legacyGetterAliases,node.id.name);
            if(unknownSensitiveContainers.has(node.init.name))add(unknownSensitiveContainers,node.id.name);
            if(unknownSensitiveContainers.has(node.id.name))add(unknownSensitiveContainers,node.init.name);
            if(returnedSensitiveFunctions.has(node.init.name)) {
              add(returnedSensitiveFunctions,node.id.name);
            }
            for(const key of returnedSensitiveFields.get(node.init.name)??[]) {
              addReturnedField(node.id.name,key);
            }
            for(const pathKey of returnedSensitivePaths.get(node.init.name)??[]) {
              addReturnedPathKey(node.id.name,pathKey);
            }
            for(const key of returnedSensitiveFields.get(node.id.name)??[]) {
              addReturnedField(node.init.name,key);
            }
            for(const pathKey of returnedSensitivePaths.get(node.id.name)??[]) {
              addReturnedPathKey(node.init.name,pathKey);
            }
          } else if(node.init.type==='CallExpression'&&node.init.callee.type==='Identifier') {
            const sourceName=node.init.callee.name;
            if(unknownSensitiveContainers.has(sourceName))add(unknownSensitiveContainers,node.id.name);
            for(const key of returnedSensitiveFields.get(sourceName)??[]) {
              addReturnedField(node.id.name,key);
            }
            for(const pathKey of returnedSensitivePaths.get(sourceName)??[]) {
              addReturnedPathKey(node.id.name,pathKey);
            }
          }
          if(isGlobal(node.init))add(globalNames,node.id.name);
          if(isDocumentValue(node.init) ||
              node.init.type==='CallExpression' &&
                node.init.callee.type==='Identifier' &&
                node.init.callee.name==='require')
            add(documentNames,node.id.name);
          if(isStringValue(node.init))add(stringNames,node.id.name);
          if(isStringInstance(node.init))add(stringInstances,node.id.name);
          if(isStringPrototype(node.init))add(prototypeNames,node.id.name);
          if(isArrayValue(node.init))add(arrayNames,node.id.name);
          if(isArrayPrototype(node.init))add(arrayPrototypes,node.id.name);
          if(isObjectIntrinsic(node.init))add(objectNames,node.id.name);
          if(isObjectPrototype(node.init))add(objectPrototypes,node.id.name);
          if(isPossiblePrototype(node.init))add(possiblePrototypes,node.id.name);
          if(isPossibleConstructor(node.init))add(possibleConstructors,node.id.name);
          if(isReflectIntrinsic(node.init))add(reflectNames,node.id.name);
        } else if(node.id.type==='ObjectPattern' &&
                  (isGlobal(node.init)||isDocumentValue(node.init)||
                   isStringValue(node.init)||isArrayValue(node.init)||
                   isArrayPrototype(node.init)||isObjectIntrinsic(node.init))) {
          for(const property of node.id.properties) {
            if(property.type!=='Property' || property.computed ||
               property.value.type!=='Identifier')continue;
            const name=property.key.type==='Identifier' ? property.key.name :
              property.key.type==='Literal' ? property.key.value : null;
            if(name==='document'&&isGlobal(node.init))add(documentNames,property.value.name);
            if(name==='defaultView'&&isDocumentValue(node.init))add(globalNames,property.value.name);
            if(name==='String'&&isGlobal(node.init))add(stringNames,property.value.name);
            if(name==='prototype'&&isStringValue(node.init))add(prototypeNames,property.value.name);
            if(name==='Array'&&isGlobal(node.init))add(arrayNames,property.value.name);
            if(name==='prototype'&&isArrayValue(node.init))add(arrayPrototypes,property.value.name);
            if(name==='__proto__'&&isArrayPrototype(node.init))add(objectPrototypes,property.value.name);
            if(name==='Object'&&isGlobal(node.init))add(objectNames,property.value.name);
            if(name==='prototype'&&isObjectIntrinsic(node.init))add(objectPrototypes,property.value.name);
            if(name==='Reflect'&&isGlobal(node.init))add(reflectNames,property.value.name);
          }
        }
      } else if(node.type==='AssignmentExpression' && node.operator==='=' &&
                (node.left.type==='ObjectPattern'||node.left.type==='ArrayPattern')) {
        recordArrayParentPattern(node.left,node.right);
        recordPossibleConstructorPattern(node.left,node.right);
        recordDocumentPattern(node.left,node.right);
        recordSensitiveContainerPattern(node.left,node.right);
      } else if(node.type==='AssignmentExpression' && node.operator==='=' &&
                node.left.type==='Identifier') {
        recordLiteralSensitiveFields(node.left.name,node.right);
        if(node.right.type==='MemberExpression'&&memberName(node.right)==='__defineGetter__') {
          add(legacyGetterAliases,node.left.name);
        }
        if(node.right.type==='Identifier') {
          if(legacyGetterAliases.has(node.right.name))add(legacyGetterAliases,node.left.name);
          if(unknownSensitiveContainers.has(node.right.name))add(unknownSensitiveContainers,node.left.name);
          if(unknownSensitiveContainers.has(node.left.name))add(unknownSensitiveContainers,node.right.name);
          if(returnedSensitiveFunctions.has(node.right.name)) {
            add(returnedSensitiveFunctions,node.left.name);
          }
          for(const key of returnedSensitiveFields.get(node.right.name)??[]) {
            addReturnedField(node.left.name,key);
          }
          for(const pathKey of returnedSensitivePaths.get(node.right.name)??[]) {
            addReturnedPathKey(node.left.name,pathKey);
          }
          for(const key of returnedSensitiveFields.get(node.left.name)??[]) {
            addReturnedField(node.right.name,key);
          }
          for(const pathKey of returnedSensitivePaths.get(node.left.name)??[]) {
            addReturnedPathKey(node.right.name,pathKey);
          }
        } else if(node.right.type==='CallExpression'&&node.right.callee.type==='Identifier') {
          const sourceName=node.right.callee.name;
          if(unknownSensitiveContainers.has(sourceName))add(unknownSensitiveContainers,node.left.name);
          for(const key of returnedSensitiveFields.get(sourceName)??[]) {
            addReturnedField(node.left.name,key);
          }
          for(const pathKey of returnedSensitivePaths.get(sourceName)??[]) {
            addReturnedPathKey(node.left.name,pathKey);
          }
        }
        if(isGlobal(node.right))add(globalNames,node.left.name);
        if(isDocumentValue(node.right) ||
            node.right.type==='CallExpression' &&
              node.right.callee.type==='Identifier' &&
              node.right.callee.name==='require')
          add(documentNames,node.left.name);
        if(isStringValue(node.right))add(stringNames,node.left.name);
        if(isStringInstance(node.right))add(stringInstances,node.left.name);
        if(isStringPrototype(node.right))add(prototypeNames,node.left.name);
        if(isArrayValue(node.right))add(arrayNames,node.left.name);
        if(isArrayPrototype(node.right))add(arrayPrototypes,node.left.name);
        if(isObjectIntrinsic(node.right))add(objectNames,node.left.name);
        if(isObjectPrototype(node.right))add(objectPrototypes,node.left.name);
        if(isPossiblePrototype(node.right))add(possiblePrototypes,node.left.name);
        if(isPossibleConstructor(node.right))add(possibleConstructors,node.left.name);
        if(isReflectIntrinsic(node.right))add(reflectNames,node.left.name);
      }
    });
  } while(discovered);
  /**
   * An intrinsic can escape through a nested array/object literal or argument
   * spread even when the argument's top-level expression has no intrinsic
   * provenance. These finite containers are traversed without executing code.
   * @param {import('./ast').AstNode} expression
   * @returns {boolean}
   */
  function containsDecoderIntrinsic(expression) {
    if(touchesString(expression)||isArrayPrototype(expression)||
       isObjectPrototype(expression)||isPossiblePrototype(expression)||
       isPossibleConstructor(expression))return true;
    if(expression.type==='Identifier'&&unknownSensitiveContainers.has(expression.name))return true;
    if(expression.type==='Identifier'&&returnedSensitivePaths.get(expression.name)?.size)return true;
    if(expression.type==='CallExpression'&&expression.callee.type==='Identifier'&&
       (returnedSensitivePaths.get(expression.callee.name)?.size||
        unknownSensitiveContainers.has(expression.callee.name)))return true;
    if(expression.type==='SpreadElement')return containsDecoderIntrinsic(expression.argument);
    if(expression.type==='SequenceExpression')return expression.expressions.some(
      (/** @type {import('./ast').AstNode} */ part)=>containsDecoderIntrinsic(part));
    if(expression.type==='ConditionalExpression')return (
      containsDecoderIntrinsic(expression.test)||
      containsDecoderIntrinsic(expression.consequent)||
      containsDecoderIntrinsic(expression.alternate));
    if(expression.type==='LogicalExpression')return (
      containsDecoderIntrinsic(expression.left)||
      containsDecoderIntrinsic(expression.right));
    if(expression.type==='ChainExpression')return containsDecoderIntrinsic(expression.expression);
    if(expression.type==='ArrayExpression')return expression.elements.some(
      (/** @type {import('./ast').AstNode|null} */ element)=>
        element!==null&&containsDecoderIntrinsic(element));
    if(expression.type==='ObjectExpression')return expression.properties.some(
      (/** @type {import('./ast').AstNode} */ property)=>{
        if(property.type==='SpreadElement')return containsDecoderIntrinsic(property.argument);
        return property.type==='Property' &&
          (containsDecoderIntrinsic(property.value)||
           property.computed&&containsDecoderIntrinsic(property.key));
      });
    return false;
  }
  // Proxy get traps can return a mutable decoder intrinsic through a property
  // read whose syntactic owner is an otherwise innocent proxy object. Track
  // finite handlers and local factories before the final mutation scan.
  const proxyConstructorNames=new Set(['Proxy']);
  const proxyRevocableNames=new Set();
  const sensitiveProxyGetTraps=new Set();
  const sensitiveProxyHandlers=new Set();
  const sensitiveProxyHandlerFactories=new Set();
  /**
   * @param {import('./ast').AstNode} fn
   * @returns {boolean}
   */
  function proxyGetMayReturnDecoderIntrinsic(fn) {
    if(fn.type==='Identifier')return returnedSensitiveFunctions.has(fn.name)||
      sensitiveProxyGetTraps.has(fn.name);
    if(!['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(fn.type))return false;
    if(fn.body.type!=='BlockStatement')return containsDecoderIntrinsic(fn.body)||
      proxyGetMayReturnDecoderIntrinsic(fn.body);
    let found=false;
    walk(fn.body,(node,_parent,_key,ancestors)=>{
      if(found||node.type!=='ReturnStatement'||!node.argument)return;
      if(ancestors.some((/** @type {import('./ast').AstNode} */ owner)=>
        ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
         'ClassDeclaration','ClassExpression'].includes(owner.type)))return;
      if(containsDecoderIntrinsic(node.argument)||
         proxyGetMayReturnDecoderIntrinsic(node.argument))found=true;
    });
    return found;
  }
  /**
   * @param {import('./ast').AstNode} handler
   * @returns {boolean}
   */
  function proxyHandlerHasSensitiveGet(handler) {
    if(handler.type==='Identifier')return sensitiveProxyHandlers.has(handler.name);
    if(handler.type==='CallExpression'&&handler.callee.type==='Identifier') {
      return sensitiveProxyHandlerFactories.has(handler.callee.name);
    }
    if(handler.type==='ConditionalExpression')return (
      proxyHandlerHasSensitiveGet(handler.consequent)||
      proxyHandlerHasSensitiveGet(handler.alternate));
    if(handler.type==='LogicalExpression')return (
      proxyHandlerHasSensitiveGet(handler.left)||
      proxyHandlerHasSensitiveGet(handler.right));
    if(handler.type!=='ObjectExpression')return false;
    return handler.properties.some((/** @type {import('./ast').AstNode} */ property)=>{
      if(property.type==='SpreadElement')return proxyHandlerHasSensitiveGet(property.argument);
      if(property.type!=='Property')return false;
      const key=property.computed?staticString(property.key):
        property.key.type==='Identifier'?property.key.name:staticString(property.key);
      return (key===null||key==='get')&&
        proxyGetMayReturnDecoderIntrinsic(property.value);
    });
  }
  /**
   * @param {import('./ast').AstNode} fn
   * @returns {boolean}
   */
  function functionReturnsSensitiveProxyHandler(fn) {
    if(!['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(fn.type)||
       fn.async||fn.generator)return false;
    if(fn.body.type!=='BlockStatement')return proxyHandlerHasSensitiveGet(fn.body);
    let found=false;
    walk(fn.body,(node,_parent,_key,ancestors)=>{
      if(found||node.type!=='ReturnStatement'||!node.argument)return;
      if(ancestors.some((/** @type {import('./ast').AstNode} */ owner)=>
        ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
         'ClassDeclaration','ClassExpression'].includes(owner.type)))return;
      if(proxyHandlerHasSensitiveGet(node.argument))found=true;
    });
    return found;
  }
  /**
   * Proxy handlers can be populated by reflection after creation. A
   * descriptor's value, or an accessor returning the trap, may expose the
   * decoder-sensitive getter without a get method in the initial literal.
   * @param {import('./ast').AstNode} descriptor
   * @returns {boolean}
   */
  function proxyDescriptorHasSensitiveGet(descriptor) {
    if(descriptor.type!=='ObjectExpression')return false;
    return descriptor.properties.some((/** @type {import('./ast').AstNode} */ property)=>{
      if(property.type!=='Property')return false;
      const key=property.computed?staticString(property.key):
        property.key.type==='Identifier'?property.key.name:staticString(property.key);
      return (key===null||key==='value'||key==='get')&&
        proxyGetMayReturnDecoderIntrinsic(property.value);
    });
  }
  let discoveredProxyHandler;
  do {
    discoveredProxyHandler=false;
    walk(ast,node=>{
      /** @param {Set<string>} target @param {string} name */
      function add(target,name) {
        if(!target.has(name)){target.add(name);discoveredProxyHandler=true;}
      }
      if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&
         (pathMemberName(node.left)===null||pathMemberName(node.left)==='get')&&
         node.left.object.type==='Identifier'&&
         proxyGetMayReturnDecoderIntrinsic(node.right)) {
        add(sensitiveProxyHandlers,node.left.object.name);
      }
      if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
         node.arguments[0]?.type==='Identifier') {
        const target=node.arguments[0];
        const receiver=node.callee.object;
        const method=memberName(node.callee);
        const key=node.arguments[1]?staticString(node.arguments[1]):null;
        let sensitiveWrite=false;
        if(isReflectIntrinsic(receiver)&&method==='set'&&
           (key===null||key==='get')&&node.arguments[2]&&
           proxyGetMayReturnDecoderIntrinsic(node.arguments[2])) {
          sensitiveWrite=true;
        }
        if(isObjectIntrinsic(receiver)&&method==='assign'&&
           node.arguments.slice(1).some((/** @type {import('./ast').AstNode} */ source)=>
             proxyHandlerHasSensitiveGet(source))) {
          sensitiveWrite=true;
        }
        if(isObjectIntrinsic(receiver)&&method==='defineProperty'&&
           (key===null||key==='get')&&node.arguments[2]&&
           proxyDescriptorHasSensitiveGet(node.arguments[2])) {
          sensitiveWrite=true;
        }
        if(isObjectIntrinsic(receiver)&&method==='defineProperties'&&
           node.arguments[1]?.type==='ObjectExpression'&&
           node.arguments[1].properties.some((/** @type {import('./ast').AstNode} */ property)=>{
             if(property.type!=='Property')return false;
             const propertyKey=property.computed?staticString(property.key):
               property.key.type==='Identifier'?property.key.name:staticString(property.key);
             return (propertyKey===null||propertyKey==='get')&&
               proxyDescriptorHasSensitiveGet(property.value);
           })) {
          sensitiveWrite=true;
        }
        if(sensitiveWrite)add(sensitiveProxyHandlers,target.name);
      }
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'&&
         proxyGetMayReturnDecoderIntrinsic(node)) {
        add(sensitiveProxyGetTraps,node.id.name);
      }
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'&&
         functionReturnsSensitiveProxyHandler(node)) {
        add(sensitiveProxyHandlerFactories,node.id.name);
      }
      let name;
      let value;
      if(node.type==='VariableDeclarator'&&node.id.type==='Identifier') {
        name=node.id.name;
        value=node.init;
      } else if(node.type==='AssignmentExpression'&&node.operator==='='&&
                node.left.type==='Identifier') {
        name=node.left.name;
        value=node.right;
      }
      if(name&&value) {
        if(value.type==='Identifier'&&sensitiveProxyHandlers.has(name)) {
          add(sensitiveProxyHandlers,value.name);
        }
        if(value.type==='Identifier'&&proxyConstructorNames.has(value.name)||
           value.type==='MemberExpression'&&isGlobal(value.object)&&
             memberName(value)==='Proxy') {
          add(proxyConstructorNames,name);
        }
        if(value.type==='Identifier'&&proxyRevocableNames.has(value.name)||
           value.type==='MemberExpression'&&memberName(value)==='revocable'&&
             (value.object.type==='Identifier'&&proxyConstructorNames.has(value.object.name)||
              value.object.type==='MemberExpression'&&isGlobal(value.object.object)&&
                memberName(value.object)==='Proxy')) {
          add(proxyRevocableNames,name);
        }
        if(value.type==='Identifier'&&sensitiveProxyGetTraps.has(value.name)||
           ['FunctionExpression','ArrowFunctionExpression'].includes(value.type)&&
             proxyGetMayReturnDecoderIntrinsic(value)) {
          add(sensitiveProxyGetTraps,name);
        }
        if(proxyHandlerHasSensitiveGet(value))add(sensitiveProxyHandlers,name);
        if(functionReturnsSensitiveProxyHandler(value)) {
          add(sensitiveProxyHandlerFactories,name);
        }
      }
    });
  } while(discoveredProxyHandler);
  /**
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function createsSensitiveProxy(node) {
    if(node.type!=='NewExpression'&&node.type!=='CallExpression')return false;
    const callee=node.callee;
    const direct=callee.type==='Identifier'&&proxyConstructorNames.has(callee.name)||
      callee.type==='MemberExpression'&&isGlobal(callee.object)&&
        memberName(callee)==='Proxy';
    const revocable=callee.type==='Identifier'&&proxyRevocableNames.has(callee.name)||
      callee.type==='MemberExpression'&&memberName(callee)==='revocable'&&
      (callee.object.type==='Identifier'&&proxyConstructorNames.has(callee.object.name)||
       callee.object.type==='MemberExpression'&&isGlobal(callee.object.object)&&
         memberName(callee.object)==='Proxy');
    return Boolean((direct||revocable)&&node.arguments[1]&&
      proxyHandlerHasSensitiveGet(node.arguments[1]));
  }
  /**
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function isCommonJsExportTarget(node) {
    if(node.type!=='MemberExpression')return false;
    if(node.object.type==='Identifier'&&node.object.name==='exports')return true;
    if(node.object.type==='Identifier'&&node.object.name==='module'&&
       memberName(node)==='exports')return true;
    return node.object.type==='MemberExpression'&&isCommonJsExportTarget(node.object);
  }
  /**
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function isSensitiveEsmExport(node) {
    if(node.type==='ExportDefaultDeclaration') {
      const declaration=node.declaration;
      if(declaration.type==='FunctionDeclaration'&&declaration.id?.type==='Identifier') {
        return returnedSensitiveFunctions.has(declaration.id.name);
      }
      return containsDecoderIntrinsic(declaration);
    }
    if(node.type!=='ExportNamedDeclaration'||node.source)return false;
    const declaration=node.declaration;
    if(declaration?.type==='VariableDeclaration'&&declaration.declarations.some(
      (/** @type {import('./ast').AstNode} */ item)=>
        Boolean(item.init&&containsDecoderIntrinsic(item.init))))return true;
    if(declaration?.type==='FunctionDeclaration'&&declaration.id?.type==='Identifier'&&
       returnedSensitiveFunctions.has(declaration.id.name))return true;
    return (node.specifiers??[]).some(
      (/** @type {import('./ast').AstNode} */ specifier)=>
        specifier.local?.type==='Identifier'&&containsDecoderIntrinsic(specifier.local));
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function touchesString(node) {
    if(isStringValue(node)||isStringPrototype(node))return true;
    if(node.type!=='MemberExpression')return false;
    return isGlobal(node.object) && (memberName(node)==='String' || memberName(node)===null) ||
      touchesString(node.object);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isArrayPrototypeChainWrite(node) {
    // A fresh [] inherits numeric accessors installed through a new
    // prototype parent. The chunked decoder's units[i]=... would invoke
    // those setters rather than define the expected own array elements.
    return node.type==='MemberExpression' && memberName(node)==='__proto__' &&
      isArrayPrototype(node.object);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isArrayIteratorProperty(node) {
    if(node.type!=='MemberExpression'||!node.computed||
       !isArrayPrototype(node.object))return false;
    const key=node.property;
    if(key.type==='Literal')return false;
    // A known different well-known Symbol does not affect array spread.
    if(key.type==='MemberExpression' && key.object.type==='Identifier' &&
       key.object.name==='Symbol' && memberName(key)!==null) {
      return memberName(key)==='iterator';
    }
    // Symbol aliases and computed keys require a richer proof.
    return true;
  }
  // Runtime-generated code can modify the intrinsic before another module
  // loads. The call target may also be saved in a local alias, so observing
  // a dynamic compiler as a value is sufficient to disable eager decoding.
  const dynamicCompilers=new Set(['eval','Function','AsyncFunction',
    'GeneratorFunction','AsyncGeneratorFunction']);
  let mutated=opaqueReflectiveSensitiveWrite;
  walk(ast,(node,parent)=>{
    if(createsSensitiveProxy(node)) {
      mutated=true;
      return;
    }
    // A captured mutator may be called, bound, or passed into an opaque helper.
    // Its receiver/arguments cannot be proved by the direct-call checks below.
    if(node.type==='MemberExpression') {
      const receiver=node.object;
      const method=memberName(node);
      // Legacy prototype accessor writers may be detached and invoked
      // later with an arbitrary receiver, so only an immediate, statically
      // unrelated key invocation can retain the decoder.
      if(['__defineGetter__','__defineSetter__'].includes(method??'') &&
         (isArrayPrototype(receiver)||isObjectPrototype(receiver)||
          isPossiblePrototype(receiver)) &&
         !(parent?.type==='CallExpression' && parent.callee===node &&
           !(isPossiblePrototype(receiver)?mayTouchDecoderKey(parent.arguments[0]):
             mayInterceptChunkIndex(parent.arguments[0])))) {
        mutated=true;
        return;
      }
      if((isObjectIntrinsic(receiver) &&
           (method===null||mutatorsObject.has(method)||sensitiveReadsObject.has(method)) ||
          isReflectIntrinsic(receiver) &&
           (method===null||mutatorsReflect.has(method)||sensitiveReadsReflect.has(method))) &&
         !(parent?.type==='CallExpression'&&parent.callee===node) &&
         !safeCapturedReflectGet.has(node)) {
        mutated=true;
        return;
      }
    }
    // Destructured first-class methods can escape through local aliases.
    if(node.type==='VariableDeclarator' && node.init &&
       node.id.type==='ObjectPattern' &&
       (isObjectIntrinsic(node.init)||isReflectIntrinsic(node.init))) {
      const dangerous=isObjectIntrinsic(node.init) ?
        new Set([...mutatorsObject,...sensitiveReadsObject]) :
        new Set([...mutatorsReflect,...sensitiveReadsReflect]);
      if(node.id.properties.some((/** @type {import('./ast').AstNode} */ property)=>{
        if(property.type!=='Property'||property.computed) return true;
        const name=property.key.type==='Identifier'?property.key.name:
          property.key.type==='Literal'?property.key.value:null;
        return typeof name!=='string'||dangerous.has(name);
      })) {
        mutated=true;
        return;
      }
    }
    if(node.type==='Identifier' && dynamicCompilers.has(node.name) ||
       node.type==='MemberExpression' && dynamicCompilers.has(memberName(node)??'')) {
      mutated=true;
      return;
    }
    if(rejectCommonJsExportEscape&&node.type==='AssignmentExpression'&&
       node.operator==='='&&isCommonJsExportTarget(node.left)&&
       containsDecoderIntrinsic(node.right)) {
      mutated=true;
      return;
    }
    if(rejectEsmExportEscape&&isSensitiveEsmExport(node)) {
      mutated=true;
      return;
    }
    if(node.type==='AssignmentExpression' &&
         (touchesString(node.left)||isArrayIteratorProperty(node.left)||
          isArrayPrototypeChainWrite(node.left)||writesPossibleDecoderIntrinsic(node.left)) ||
       node.type==='UpdateExpression' &&
         (touchesString(node.argument)||isArrayIteratorProperty(node.argument)||
          isArrayPrototypeChainWrite(node.argument)||writesPossibleDecoderIntrinsic(node.argument)) ||
       node.type==='UnaryExpression' && node.operator==='delete' &&
         (touchesString(node.argument)||isArrayIteratorProperty(node.argument)||
          isArrayPrototypeChainWrite(node.argument)||writesPossibleDecoderIntrinsic(node.argument))) {
      mutated=true;
      return;
    }
    // An opaque call can forward a mutable String/Array/Object intrinsic into
    // a parameter and patch it before a later module initializes its decoder.
    // Without interprocedural effect proof, passing that reference is an escape.
    // Direct, known reflection reads are handled by the existing alias scanner.
    if(node.type==='TaggedTemplateExpression' &&
       node.quasi.expressions.some((/** @type {import('./ast').AstNode} */ expression)=>
         containsDecoderIntrinsic(expression))) {
      mutated=true;
      return;
    }
    if((node.type==='CallExpression'||node.type==='NewExpression') &&
       node.arguments.some((/** @type {import('./ast').AstNode} */ argument)=>
         containsDecoderIntrinsic(argument))) {
      const callee=node.callee;
      const method=callee.type==='MemberExpression'?memberName(callee):null;
      const modeledIntrinsicCall=callee.type==='MemberExpression' &&
        (isObjectIntrinsic(callee.object) &&
          (mutatorsObject.has(method??'')||sensitiveReadsObject.has(method??'')) ||
         isReflectIntrinsic(callee.object) &&
          (mutatorsReflect.has(method??'')||sensitiveReadsReflect.has(method??'')));
      if(!modeledIntrinsicCall) {
        mutated=true;
        return;
      }
    }
    if(node.type!=='CallExpression' || node.callee.type!=='MemberExpression')return;
    const receiver=node.callee.object;
    const method=memberName(node.callee);
    const first=node.arguments[0];
    if(!first)return;
    if(method===null && (isObjectIntrinsic(receiver)||isReflectIntrinsic(receiver)) &&
       (touchesString(first)||isArrayPrototype(first)||isGlobal(first)||
        isPossiblePrototype(first)||isPossibleConstructor(first))) {
      mutated=true;
      return;
    }
    // Reflective getters of global constructors and the Array prototype
    // can return mutable references or descriptors. An alias held by another
    // function can mutate them after this syntax-only analysis.
    const name=node.arguments[1];
    // Source-visible mutation of a reflective lookup breaks any native
    // prototype/constructor inference that depends on that method. A caller
    // can then get String from an otherwise provably unrelated Number value.
    const modifiedIntrinsicName=name?staticString(name):null;
    if((isObjectIntrinsic(first)||isReflectIntrinsic(first)) &&
       (isObjectIntrinsic(receiver)&&mutatorsObject.has(method??'') ||
        isReflectIntrinsic(receiver)&&mutatorsReflect.has(method??'')) &&
       (method!=='defineProperty'&&method!=='set'&&method!=='deleteProperty' ||
        modifiedIntrinsicName===null ||
        (isObjectIntrinsic(first)?sensitiveReadsObject:sensitiveReadsReflect)
          .has(modifiedIntrinsicName))) {
      mutated=true;
      return;
    }
    const mayReadString=!name||name.type!=='Literal'||name.value==='String';
    const mayReadArray=!name||name.type!=='Literal'||name.value==='Array';
    const mayReadPrototype=!name||name.type!=='Literal'||name.value==='prototype';
    if(isObjectIntrinsic(receiver) &&
       (isGlobal(first) &&
          (method==='getOwnPropertyDescriptors' ||
           method==='getOwnPropertyDescriptor' &&
             (mayReadString||mayReadArray)) ||
        isArrayValue(first) &&
          (method==='getOwnPropertyDescriptors' ||
           method==='getOwnPropertyDescriptor' && mayReadPrototype))) {
      mutated=true;
      return;
    }
    if(isReflectIntrinsic(receiver) && method==='get' &&
       (isGlobal(first) && (mayReadString||mayReadArray) ||
        isArrayValue(first) && mayReadPrototype)) {
      mutated=true;
      return;
    }
    if(isObjectIntrinsic(receiver) && mutatorsObject.has(method??'')) {
      if(touchesString(first))mutated=true;
      if(isPossiblePrototype(first)||isPossibleConstructor(first)) {
        if(method!=='defineProperty'||mayTouchDecoderKey(node.arguments[1]))mutated=true;
      }
      // Object.assign/defineProperties can change String through a dynamic
      // property bag whose keys are not statically provable here.
      if(isGlobal(first) && (method==='assign'||method==='defineProperties'))mutated=true;
      if(isGlobal(first) && method==='defineProperty' &&
         (node.arguments[1]?.type!=='Literal' || node.arguments[1].value==='String'))mutated=true;
    }
    if((isArrayPrototype(first)||isObjectPrototype(first)) &&
       isObjectIntrinsic(receiver) && mutatorsObject.has(method??'')) {
      if(method!=='defineProperty' || mayInterceptChunkIndex(node.arguments[1])) {
        mutated=true;
      }
    }
    if((isArrayPrototype(first)||isObjectPrototype(first)) &&
       isReflectIntrinsic(receiver) && mutatorsReflect.has(method??'')) {
      if(method==='setPrototypeOf' || mayInterceptChunkIndex(node.arguments[1])) {
        mutated=true;
      }
    }
    if(isReflectIntrinsic(receiver) && mutatorsReflect.has(method??'')) {
      if(touchesString(first))mutated=true;
      if(isPossiblePrototype(first)||isPossibleConstructor(first)) {
        if(method==='setPrototypeOf'||mayTouchDecoderKey(node.arguments[1]))mutated=true;
      }
      if(isGlobal(first) && (method==='setPrototypeOf' ||
          node.arguments[1]?.type!=='Literal' || node.arguments[1].value==='String'))mutated=true;
    }
  });
  return mutated;
}

/**
 * Obfuscate an in-memory file group. Internal imports retain their relative paths.
 * Default transformations preserve dependencies and module boundaries.
 * @param {SourceFile[]} files
 * @param {ObfuscationOptions} [options]
 * @returns {{files:OutputFile[],seed:string,mode:ObfuscationMode,crossFile:{objects:number,properties:number}}}
 */
function obfuscateFiles(files, options = {}) {
  if (!Array.isArray(files) || !files.length) throw new TypeError('Expected a nonempty array of source files');
  const mode = options.mode ?? 'coo';
  if (!['coo','sco','sno'].includes(mode)) throw new TypeError(`Unknown mode ${mode}`);
  // Read caller-controlled configuration once. Getter/proxy access may have
  // side effects, and a later read must not silently remove a host policy.
  const suppliedHosts=options.allowedHosts;
  if (mode === 'sno' && suppliedHosts !== undefined) throw new TypeError('Browser host locking does not apply to SNO');
  // An explicitly configured empty/invalid allowlist must not turn the
  // execution guard off. Omission alone selects the unlocked build mode.
  const allowedHosts=suppliedHosts===undefined ? undefined :
    canonicalAllowedHosts(suppliedHosts);
  const seed = options.seed ?? randomBytes(24).toString('hex');
  const paths = createPathInventory();
  /** @type {(SourceFile & {sourceType:SourceType})[]} */
  const prepared = files.map(file => {
    const filename = safePath(file.path);
    // Validate the entire emitted tree, including ancestors that can alias
    // on other filesystems even when the full file paths differ.
    registerFilePath(paths,filename);
    // Snapshot caller-controlled data once. Re-reading a code getter or
    // retaining a mutable Buffer after a reviewed digest check would let
    // the caller publish different bytes from those actually approved.
    const suppliedCode=file.code;
    if (typeof suppliedCode !== 'string' && !Buffer.isBuffer(suppliedCode)) throw new TypeError(`${filename} content must be a string or Buffer`);
    const code=Buffer.isBuffer(suppliedCode)?Buffer.from(suppliedCode):suppliedCode;
    const sourceType = file.sourceType ?? (filename.endsWith('.mjs') ? 'module' :
      filename.endsWith('.cjs') ? 'commonjs' : mode === 'sno' ? 'commonjs' : 'script');
    if (!['module','script','commonjs','asset'].includes(sourceType)) throw new TypeError(`Unknown source type ${sourceType}`);
    // Node's UTF-8 writer substitutes U+FFFD for raw unpaired UTF-16
    // surrogates in JavaScript or textual assets. Require intended runtime
    // surrogate code units to be escaped in JavaScript or JSON syntax.
    // The Unicode flag treats valid astral surrogate pairs as one code point.
    if (typeof code==='string' && /[\uD800-\uDFFF]/u.test(code)) {
      throw new TypeError(filename+
        (sourceType==='asset'?' text asset':' JavaScript source')+
        ' contains unpaired surrogate');
    }
    return {path:filename,code,sourceType};
  });
  // A requested backend is an explicit protection requirement. Silently
  // ignoring a misspelled filename would publish untransformed code even
  // though the caller selected a protected function in that file.
  const knownJavaScript=new Set(prepared.filter(file=>file.sourceType!=='asset')
    .map(file=>file.path));
  /** @type {Array<[string,Record<string,string[]>|undefined]>} */
  const selectedFunctionBackends=[
    ['Register VM',options.experimentalRegisterVm],
    ['Expression VM',options.experimentalExpressionVm],
    ['Native graph',options.experimentalNativeGraph],
    ['Branch blocks',options.experimentalBranchBlocks],
    ['Statement flow',options.experimentalStatementFlow],
    ['Wasm i32',options.experimentalWasmI32],
    ['Polyvariant affine',options.experimentalPolyvariantAffine]
  ];
  // Keep the validated selection arrays for code generation. This also
  // prevents a lazy options getter or mutable caller-owned array from
  // silently dropping the required transformation on a later read.
  /** @type {Map<string,Map<string,string[]>>} */
  const selectedFunctionNames=new Map();
  for(const [backend,selections] of selectedFunctionBackends){
    /** @type {Map<string,string[]>} */
    const byPath=new Map();
    selectedFunctionNames.set(backend,byPath);
    if(!selections)continue;
    for(const [selectedPath,names] of Object.entries(selections)){
      if(!Array.isArray(names)){
        throw new TypeError(backend+' selected function names must be an array in '+selectedPath);
      }
      if(names.length && !knownJavaScript.has(selectedPath)){
        throw new TypeError(backend+' selects missing or non-JavaScript input '+selectedPath);
      }
      byPath.set(selectedPath,names.slice());
    }
  }
  // Snapshot every selected function list before reading the lazy closedWorld
  // option: its getter may mutate caller-owned selection arrays.
  // Admit the narrow native-bind target proof only for a closed source graph
  // whose files satisfy the strict top-level fn.bind(null) grammar and have no
  // unresolved ambient identifiers or imports. This is a rewrite-eligibility
  // proof, not source secrecy: a hostile host preloader can capture the
  // already-transformed target function.
  const allowBoundFunctionTargets=options.closedWorld===true&&prepared.length>0&&
    prepared.every(file=>{
      if(file.sourceType==='asset'||typeof file.code!=='string')return false;
      const inputAst=parse(file.code,file.sourceType);
      return !hasUnsafeNativeBindMutationSurface(inputAst)&&
        !hasUnmodeledNativeBindGlobalReference(inputAst,file.sourceType==='commonjs')&&
        !hasUnprovedModuleImport(inputAst,file.path,knownJavaScript)&&
        !(file.sourceType==='commonjs'&&
          hasUnprovedCommonJsRequire(inputAst,file.path,knownJavaScript));
    });
  // Validate the entire published static graph before permitting a host
  // guard below an ESM import. Each dependency is independently guarded.
  const completeStaticHostGraph=Boolean(allowedHosts?.length && options.closedWorld &&
    completeGuardedModuleGraph(prepared));
  // Fail before any output is generated: source maps can undo an entire
  // transformation by retaining original text and symbol mappings.
  for (const file of prepared) assertNoSourceMapDisclosure(file);
  assertReviewedOpaqueAssets(prepared,options.reviewedOpaqueAssets);
  // Function source can be observed locally or by another supplied file.
  // Analyze every file, seeding cross-file import provenance where available,
  // before any source-coordinate or identifier rewrite is permitted.
  const importedStringProof=prepared.length>1 && options.closedWorld ?
    collectVerifiedImportedStrings(prepared) : new Map();
  const importedPrimitiveProof=prepared.length>1 && options.closedWorld ?
    collectVerifiedImportedPrimitives(prepared) : new Map();
  const importedCloneProof=prepared.length>1 ?
    collectVerifiedImportedCloneAliases(prepared) : new Map();
  const importedUrlStaticProof=prepared.length>1 ?
    collectVerifiedImportedUrlStaticAliases(prepared) : new Map();
  const importedFunctionArrays=prepared.length>1 ?
    collectImportedFunctionArrays(prepared) : new Map();
  const importedStorageMethodAliases=prepared.length>1 ?
    collectImportedStorageMethodAliases(prepared) : new Map();
  // Parse the supplied JavaScript files once for source-observer analysis.
  // The WeakMap prototype is shared across modules, so an exposure in any
  // supplied file must invalidate reference-only Storage proofs in siblings.
  const hasPinnedSource=hasPinnedLocalJavaScriptIntegrity(prepared);
  const sourceObserverFiles=(!hasPinnedSource||Boolean(allowedHosts?.length))?
    prepared.flatMap(file=>{
      if(file.sourceType==='asset'||typeof file.code!=='string')return [];
      return [{file,ast:parse(file.code,file.sourceType)}];
    }):[];
  // A different module can publish a WeakMap instance or a factory that
  // the source-observer module later imports. Summarize the complete supplied
  // graph, not only modules that independently look like source observers.
  const classicScriptAsts=sourceObserverFiles.filter(({file})=>
    file.sourceType==='script').map(({ast})=>ast);
  // Browser classic scripts in one output group share one realm and one
  // global lexical environment. Analyze their ordered top-level statements
  // together so a carrier declared in one file cannot disappear at the
  // boundary before a sibling reads or mutates WeakMap.prototype.
  const sharedClassicScriptWeakMapExposure=classicScriptAsts.length>1?
    hasWeakMapPrototypeExposure({
      type:'Program',start:0,end:0,
      body:classicScriptAsts.flatMap(ast=>ast.body??[])
    }):false;
  const sharedWeakMapPrototypeExposure=sharedClassicScriptWeakMapExposure||
    sourceObserverFiles.some(({ast})=>hasWeakMapPrototypeExposure(ast));
  let remoteSourceObserver=hasPinnedSource;
  let hostLockSourceObserver=false;
  for(const {file,ast} of sourceObserverFiles) {
    const distributed=observesDistributedSource(ast,importedStringProof.get(file.path));
    const functionSource=observesFunctionSource(ast,
      importedStringProof.get(file.path),importedCloneProof.get(file.path),
      importedFunctionArrays.get(file.path),importedPrimitiveProof.get(file.path),
      importedUrlStaticProof.get(file.path),
      importedStorageMethodAliases.get(file.path),sharedWeakMapPrototypeExposure);
    if(distributed||functionSource)remoteSourceObserver=true;
    if(functionSource)hostLockSourceObserver=true;
    if(remoteSourceObserver&&(!allowedHosts?.length||hostLockSourceObserver))break;
  }
  hostLockSourceObserver=Boolean(allowedHosts?.length)&&hostLockSourceObserver;
  // Only explicitly selected, proved primitive-returning ESM leaves can
  // retain local property renaming despite a separate source observer.
  // No other backend is enabled by this exception, and it is opt-in.
  if(options.experimentalSourceObserverIslands?.length && !options.closedWorld) {
    throw new TypeError('Source observer islands require closedWorld');
  }
  if(options.experimentalSourceObserverIslands?.length && options.experimentalSymbolKeys===true) {
    // Symbol lowering injects executable Symbol() initializers. Another
    // source-visible ESM dependency may replace that ambient constructor
    // before this module executes, unlike native own-key renaming.
    throw new TypeError('Source observer islands support literal property renaming only');
  }
  const sourceObserverIslands=options.experimentalSourceObserverIslands?.length ?
    proveSourceObserverIslands(prepared,options.experimentalSourceObserverIslands) : new Set();
  // A hostname wrapper prepends source bytes and source coordinates. Code
  // that observes either must reject the explicit host lock rather than
  // publishing a semantically different stack/source view.
  if((remoteSourceObserver||hostLockSourceObserver) && allowedHosts?.length) {
    throw new TypeError('Host locking cannot preserve observable source bytes');
  }
  const cross = !remoteSourceObserver && options.closedWorld && options.properties !== false ?
    renameCrossFileProperties(prepared,seed,allowBoundFunctionTargets) : {files:prepared,objects:0,properties:0};
  const shouldEncodeStrings=!remoteSourceObserver &&
    (options.strings === true || (options.strings === undefined && mode === 'sno'));
  /** @type {Set<string>} */
  const reservedNames=new Set();
  /** @type {string[]} */
  const reservedSources=[];
  const requiredCommonJsTargets=shouldEncodeStrings?
    staticallyRequiredCommonJsTargets(cross.files):new Set();
  const importedEsmTargets=shouldEncodeStrings?
    staticallyImportedEsmTargets(cross.files):new Set();
  let unsafeDecoderIntrinsic=false;
  if (shouldEncodeStrings) {
    // Classic scripts share one page-global lexical environment. Reserve every
    // identifier, including Unicode-escaped spellings and free references,
    // before any single file introduces a top-level decoder helper.
    for (const input of cross.files) {
      if (input.sourceType==='asset' || typeof input.code!=='string') continue;
      const inputAst=parse(input.code,input.sourceType);
      walk(inputAst,node=>{
        if (node.type==='Identifier') reservedNames.add(node.name);
      });
      reservedSources.push(input.code);
      if (mutatesDecoderIntrinsic(inputAst,requiredCommonJsTargets.has(input.path),
            importedEsmTargets.has(input.path)) ||
          hasUnprovedModuleImport(inputAst,input.path,knownJavaScript) ||
          input.sourceType==='commonjs' &&
            hasUnprovedCommonJsRequire(inputAst,input.path,knownJavaScript) ||
          input.sourceType==='script' && collectBindings(inputAst).has('String')) {
        unsafeDecoderIntrinsic=true;
      }
    }
  }
  const output = cross.files.map(file => {
    const filename = file.path;
    const sourceType = file.sourceType;
    if (sourceType === 'asset') {
      return {path:filename,code:file.code,sourceType,metrics:{literals:0,objects:0,properties:0,bindings:0}};
    }
    if (typeof file.code !== 'string') throw new TypeError(`${filename} JavaScript must be UTF-8 text`);
    let code = file.code;
    let ast = parse(code,sourceType);
    const salt = createHash('sha256').update(`${seed}/${filename}`).digest('hex');
    const vmNames=selectedFunctionNames.get('Register VM')?.get(filename)??[];
    let vmFunctions=0,vmInstructions=0;
    if(vmNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Register VM requires a module/CommonJS without cross-file source observation');
      }
      const virtualized=virtualizeRegisterChains(code,sourceType,{seed:salt,names:vmNames});
      if(virtualized.declined){
        throw new TypeError('Register VM declined '+virtualized.declined+
          ' selected function(s) in '+filename);
      }
      code=virtualized.code;
      vmFunctions=virtualized.functions;
      vmInstructions=virtualized.instructions;
      ast=parse(code,sourceType);
    }
    const expressionNames=selectedFunctionNames.get('Expression VM')?.get(filename)??[];
    let expressionVmFunctions=0,expressionVmInstructions=0;
    if(expressionNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Expression VM requires a module/CommonJS without cross-file source observation');
      }
      const virtualized=virtualizeExpressionGraphs(code,sourceType,{seed:salt,names:expressionNames});
      if(virtualized.declined){
        throw new TypeError('Expression VM declined '+virtualized.declined+
          ' selected function(s) in '+filename);
      }
      code=virtualized.code;
      expressionVmFunctions=virtualized.functions;
      expressionVmInstructions=virtualized.instructions;
      ast=parse(code,sourceType);
    }
    const nativeNames=selectedFunctionNames.get('Native graph')?.get(filename)??[];
    let nativeGraphFunctions=0,nativeGraphInstructions=0;
    if(nativeNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Native graph requires a module/CommonJS without cross-file source observation');
      }
      if(nativeNames.some(name=>expressionNames.includes(name))) {
        throw new TypeError('Do not select the same function for two expression graph backends');
      }
      const optimized=virtualizeExpressionGraphs(code,sourceType,{
        seed:salt,names:nativeNames,backend:'native'
      });
      if(optimized.declined){
        throw new TypeError('Native graph declined '+optimized.declined+
          ' selected function(s) in '+filename);
      }
      code=optimized.code;
      nativeGraphFunctions=optimized.functions;
      nativeGraphInstructions=optimized.instructions;
      ast=parse(code,sourceType);
    }
    const branchNames=selectedFunctionNames.get('Branch blocks')?.get(filename)??[];
    let branchFunctions=0,branchBlocks=0;
    if(branchNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Branch blocks require a module/CommonJS without cross-file source observation');
      }
      const flattened=flattenBranchBlocks(code,sourceType,{seed:salt,names:branchNames,
        stateBlinding:options.experimentalBranchStateBlinding===true});
      if(flattened.declined){
        throw new TypeError('Branch blocks declined '+flattened.declined+
          ' selected function(s) in '+filename);
      }
      code=flattened.code;
      branchFunctions=flattened.functions;
      branchBlocks=flattened.blocks;
      ast=parse(code,sourceType);
    }
    const statementNames=selectedFunctionNames.get('Statement flow')?.get(filename)??[];
    let statementFlowFunctions=0,statementFlowBlocks=0;
    if(statementNames.length){
      if(sourceType==='script'||remoteSourceObserver){
        throw new TypeError('Statement flow requires a module/CommonJS without cross-file source observation');
      }
      if(statementNames.some(name=>vmNames.includes(name)||expressionNames.includes(name)||
          nativeNames.includes(name)||branchNames.includes(name))){
        throw new TypeError('Do not select the same function for multiple experimental backends');
      }
      const transformed=flattenStatementFlow(code,sourceType,{seed:salt,names:statementNames,
        compactCases:options.experimentalStatementFlowCompact===true});
      if(transformed.declined){
        throw new TypeError('Statement flow declined '+transformed.declined+
          ' selected function(s) in '+filename+
          '; require a supported multi-statement if/else function');
      }
      code=transformed.code;
      statementFlowFunctions=transformed.functions;
      statementFlowBlocks=transformed.blocks;
      ast=parse(code,sourceType);
    }
    const wasmNames=selectedFunctionNames.get('Wasm i32')?.get(filename)??[];
    let wasmI32Functions=0,wasmI32Instructions=0,wasmI32Bytes=0;
    if(wasmNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        const wasmRefusalReason=prepared.length>1
          ?'Wasm i32 requires a module/CommonJS without cross-file source observation'
          :'requires a module/CommonJS without function-source observation';
        throw new TypeError('Wasm i32 declined: '+wasmRefusalReason);
      }
      if(wasmNames.some(name=>vmNames.includes(name)||expressionNames.includes(name)||
          nativeNames.includes(name)||branchNames.includes(name)||statementNames.includes(name))) {
        throw new TypeError('Do not select the same function for multiple experimental backends');
      }
      const lowered=lowerWasmI32Functions(code,sourceType,{seed:salt,names:wasmNames});
      // Explicit selection is a security expectation: never silently publish
      // a requested function in unchanged source when the proof declines.
      if(lowered.declined) {
        throw new TypeError('Wasm i32 declined '+lowered.declined+
          ' explicitly selected function(s) in '+filename+
          '; restrict to pure return-only Int32 bitvector functions');
      }
      code=lowered.code;
      wasmI32Functions=lowered.functions;
      wasmI32Instructions=lowered.instructions;
      wasmI32Bytes=lowered.wasmBytes;
      ast=parse(code,sourceType);
    }
    const polyvariantNames=selectedFunctionNames.get('Polyvariant affine')?.get(filename)??[];
    let polyvariantFunctions=0,polyvariantPaths=0,polyvariantSteps=0;
    if(polyvariantNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Polyvariant affine requires a module/CommonJS without cross-file source observation');
      }
      if(polyvariantNames.some(name=>vmNames.includes(name)||expressionNames.includes(name)||
          nativeNames.includes(name)||branchNames.includes(name)||wasmNames.includes(name)||
          statementNames.includes(name))) {
        throw new TypeError('Do not select the same function for multiple experimental backends');
      }
      const transformed=lowerPolyvariantAffine(code,sourceType,{
        seed:salt,names:polyvariantNames,variants:options.experimentalPolyvariantCount??(mode==='coo'?2:4),
        compact:options.experimentalPolyvariantCompact===true
      });
      if(transformed.declined) {
        throw new TypeError('Polyvariant affine declined '+transformed.declined+
          ' selected function(s) in '+filename+
          '; require a return-only integer-normalized +/- chain');
      }
      code=transformed.code;
      polyvariantFunctions=transformed.functions;
      polyvariantPaths=transformed.paths;
      polyvariantSteps=transformed.steps;
      ast=parse(code,sourceType);
    }
    let objects = 0;
    let properties = 0;
    let symbolKeys = 0;
    if ((!remoteSourceObserver || sourceObserverIslands.has(filename)) &&
        options.properties !== false && sourceType !== 'script') {
      const modified = options.experimentalSymbolKeys === true ?
        symbolizeLocalProperties(code,ast,{seed:salt}) :
        renameLocalProperties(code,ast,{seed:salt,closedWorld:options.closedWorld===true,allowBoundFunctionTargets});
      code = modified.code;
      objects = modified.objects;
      properties = modified.properties;
      if (options.experimentalSymbolKeys === true) symbolKeys = modified.properties;
      ast = parse(code,sourceType);
    }
    let bindings=0;
    if(!remoteSourceObserver && options.identifiers!==false) {
      const renamed=renameLocalIdentifiers(code,ast,{seed:salt,sourceType});
      code=renamed.code;
      bindings=renamed.bindings;
      ast=parse(code,sourceType);
    }
    let literals = 0;
    // Startup decoding counts toward SCO/COO client runtime. These modes
    // require explicit opt-in for eager string encoding; SNO can amortize init.
    if (shouldEncodeStrings && !unsafeDecoderIntrinsic) {
      const modified = encodeStrings(code,ast,{seed:salt,minimumLength:options.minimumStringLength,reservedNames,reservedSources,fixedArity:options.experimentalFixedArityStrings===true});
      code = modified.code;
      literals = modified.count;
      ast = parse(code,sourceType);
    }
    if (allowedHosts?.length) {
      if (sourceType === 'commonjs') throw new TypeError(`Host lock unavailable for CommonJS file ${filename}`);
      code = injectHostLock(code,ast,allowedHosts,completeStaticHostGraph);
      parse(code,sourceType);
    }
    /** @type {OutputFile['metrics']} */
    const metrics={literals,objects,properties,bindings};
    if(options.experimentalSymbolKeys === true)metrics.symbolKeys=symbolKeys;
    if(vmNames.length) {
      metrics.vmFunctions=vmFunctions;
      metrics.vmInstructions=vmInstructions;
    }
    if(expressionNames.length) {
      metrics.expressionVmFunctions=expressionVmFunctions;
      metrics.expressionVmInstructions=expressionVmInstructions;
    }
    if(nativeNames.length) {
      metrics.nativeGraphFunctions=nativeGraphFunctions;
      metrics.nativeGraphInstructions=nativeGraphInstructions;
    }
    if(branchNames.length) {
      metrics.branchFunctions=branchFunctions;
      metrics.branchBlocks=branchBlocks;
    }
    if(statementNames.length){
      metrics.statementFlowFunctions=statementFlowFunctions;
      metrics.statementFlowBlocks=statementFlowBlocks;
    }
    if(polyvariantNames.length) {
      metrics.polyvariantFunctions=polyvariantFunctions;
      metrics.polyvariantPaths=polyvariantPaths;
      metrics.polyvariantSteps=polyvariantSteps;
    }
    if(wasmNames.length) {
      metrics.wasmI32Functions=wasmI32Functions;
      metrics.wasmI32Instructions=wasmI32Instructions;
      metrics.wasmI32Bytes=wasmI32Bytes;
    }
    return {path:filename,code,sourceType,metrics};
  });
  // Recheck final emitted module dependencies after optional backends run:
  // a future transformation must not silently introduce an unguarded import.
  if(completeStaticHostGraph && !completeGuardedModuleGraph(output)) {
    throw new TypeError('Transformed host-lock module graph is no longer closed');
  }
  return {files:output,seed,mode,crossFile:{objects:cross.objects,properties:cross.properties}};
}

module.exports = {obfuscateFiles,safePath};
