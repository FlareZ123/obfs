'use strict';

const path = require('node:path');
const {randomBytes, createHash} = require('node:crypto');
const {parse,walk,observesFunctionSource,observesDistributedSource,staticString} = require('./ast');
const {renameLocalProperties,collectBindings} = require('./properties');
const {symbolizeLocalProperties} = require('./symbol-properties');
const {encodeStrings} = require('./strings');
const {provenLocalReflectGetCaptures} = require('./decoder-safe-reads');
const {renameCrossFileProperties,collectVerifiedImportedStrings,collectVerifiedImportedCloneAliases,collectImportedFunctionArrays} = require('./cross-properties');
const {renameLocalIdentifiers} = require('./identifiers');
const {virtualizeRegisterChains} = require('./register-vm');
const {virtualizeExpressionGraphs} = require('./expression-vm');
const {flattenBranchBlocks} = require('./branch-blocks');
const {flattenStatementFlow} = require('./statement-flow');
const {lowerPolyvariantAffine} = require('./affine-native');
const {lowerWasmI32Functions} = require('./wasm-i32');
const {assertNoSourceMapDisclosure} = require('./source-maps');
const {assertReviewedOpaqueAssets}=require('./reviewed-assets');

/** @typedef {'coo'|'sco'|'sno'} ObfuscationMode */
/** @typedef {'module'|'script'|'commonjs'|'asset'} SourceType */
/** @typedef {{path:string,code:string|Buffer,sourceType?:SourceType,privateModulePaths?:string[],privateOriginalDigests?:string[]}} SourceFile */
/** @typedef {{path:string,code:string|Buffer,sourceType:SourceType,metrics:{literals:number,objects:number,properties:number,bindings:number,vmFunctions?:number,vmInstructions?:number,expressionVmFunctions?:number,expressionVmInstructions?:number,nativeGraphFunctions?:number,nativeGraphInstructions?:number,branchFunctions?:number,branchBlocks?:number,statementFlowFunctions?:number,statementFlowBlocks?:number,polyvariantFunctions?:number,polyvariantPaths?:number,polyvariantSteps?:number,wasmI32Functions?:number,wasmI32Instructions?:number,wasmI32Bytes?:number,symbolKeys?:number}}} OutputFile */
/**
 * @typedef {{mode?:ObfuscationMode,seed?:string,strings?:boolean,properties?:boolean,identifiers?:boolean,minimumStringLength?:number,experimentalFixedArityStrings?:boolean,allowedHosts?:string[],closedWorld?:boolean,experimentalRegisterVm?:Record<string,string[]>,experimentalExpressionVm?:Record<string,string[]>,experimentalNativeGraph?:Record<string,string[]>,experimentalBranchBlocks?:Record<string,string[]>,experimentalBranchStateBlinding?:boolean,experimentalStatementFlow?:Record<string,string[]>,experimentalStatementFlowCompact?:boolean,experimentalPolyvariantAffine?:Record<string,string[]>,experimentalPolyvariantCount?:2|4|8,experimentalWasmI32?:Record<string,string[]>,experimentalSymbolKeys?:boolean,reviewedOpaqueAssets?:import('./reviewed-assets').ReviewedOpaqueAsset[]}} ObfuscationOptions
 */

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
  for (const segment of file.split('/')) {
    if (/[. ]$/u.test(segment) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(segment)) {
      throw new TypeError(`Unsafe Windows filename segment: ${segment}`);
    }
  }
  const normalized = path.posix.normalize(file);
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.' || normalized !== file) {
    throw new TypeError(`Unsafe or noncanonical file path: ${file}`);
  }
  return normalized;
}

/**
 * A body-level ESM host guard can precede every executable module statement
 * only if every statically imported dependency is present in the same guarded
 * output group. A dependency outside that group would run before its importer
 * checks the host and could perform arbitrary effects.
 *
 * This deliberately excludes opaque assets, scripts, bare package imports,
 * URL/query/fragment specifiers, case-mismatched filenames, and undeclared
 * dependencies. Module cycles are safe for this boundary because each module
 * body starts with its own guard, irrespective of evaluation order.
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
          /[?#%\\\\]/u.test(specifier))return false;
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
  const allowed = [...new Set(hosts.map(host => host.toLowerCase()))];
  if (!allowed.length || allowed.some(host => !/^[a-z0-9.-]+$/.test(host))) {
    throw new TypeError('allowedHosts must contain valid lowercase DNS hostnames');
  }
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
 * Detect direct writes that can replace String decoder methods or the Array
 * iterator consumed by chunked string spread. An imported ESM dependency executes before this file's
 * decoder, so a write anywhere in the supplied file group must disable that
 * decoder throughout the group. Indirect aliases and external modules remain
 * outside this deliberately conservative syntactic check.
 * @param {import('./ast').AstNode} ast
 * @returns {boolean}
 */
function mutatesDecoderIntrinsic(ast) {
  const safeCapturedReflectGet=provenLocalReflectGetCaptures(ast);
  // Find immutable-looking and reassigned aliases before checking writes.
  // A dependency can mutate String through one of these names before another
  // file's eager decoder initializes; the whole group must then opt out.
  const globalNames=new Set(['globalThis','window','self','global']);
  const stringNames=new Set(['String']);
  const prototypeNames=new Set();
  const arrayNames=new Set(['Array']);
  const arrayPrototypes=new Set();
  const objectNames=new Set(['Object']);
  const objectPrototypes=new Set();
  const reflectNames=new Set(['Reflect']);
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
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isGlobal(node) {
    return node.type==='Identifier' && globalNames.has(node.name);
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
    return node.type==='Literal' && typeof node.value==='string' ||
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
       node.callee.object.type==='Identifier' &&
       ['Object','Reflect'].includes(node.callee.object.name) &&
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
      if(node.type==='VariableDeclarator' && node.init) {
        recordArrayParentPattern(node.id,node.init);
        if(node.id.type==='Identifier') {
          if(isGlobal(node.init))add(globalNames,node.id.name);
          if(isStringValue(node.init))add(stringNames,node.id.name);
          if(isStringPrototype(node.init))add(prototypeNames,node.id.name);
          if(isArrayValue(node.init))add(arrayNames,node.id.name);
          if(isArrayPrototype(node.init))add(arrayPrototypes,node.id.name);
          if(isObjectIntrinsic(node.init))add(objectNames,node.id.name);
          if(isObjectPrototype(node.init))add(objectPrototypes,node.id.name);
          if(isReflectIntrinsic(node.init))add(reflectNames,node.id.name);
        } else if(node.id.type==='ObjectPattern' &&
                  (isGlobal(node.init)||isStringValue(node.init)||isArrayValue(node.init)||
                   isArrayPrototype(node.init)||isObjectIntrinsic(node.init))) {
          for(const property of node.id.properties) {
            if(property.type!=='Property' || property.computed ||
               property.value.type!=='Identifier')continue;
            const name=property.key.type==='Identifier' ? property.key.name :
              property.key.type==='Literal' ? property.key.value : null;
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
                node.left.type==='ObjectPattern') {
        recordArrayParentPattern(node.left,node.right);
      } else if(node.type==='AssignmentExpression' && node.operator==='=' &&
                node.left.type==='Identifier') {
        if(isGlobal(node.right))add(globalNames,node.left.name);
        if(isStringValue(node.right))add(stringNames,node.left.name);
        if(isStringPrototype(node.right))add(prototypeNames,node.left.name);
        if(isArrayValue(node.right))add(arrayNames,node.left.name);
        if(isArrayPrototype(node.right))add(arrayPrototypes,node.left.name);
        if(isObjectIntrinsic(node.right))add(objectNames,node.left.name);
        if(isObjectPrototype(node.right))add(objectPrototypes,node.left.name);
        if(isReflectIntrinsic(node.right))add(reflectNames,node.left.name);
      }
    });
  } while(discovered);
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
  let mutated=false;
  walk(ast,(node,parent)=>{
    // A captured mutator may be called, bound, or passed into an opaque helper.
    // Its receiver/arguments cannot be proved by the direct-call checks below.
    if(node.type==='MemberExpression') {
      const receiver=node.object;
      const method=memberName(node);
      // Legacy prototype accessor writers may be detached and invoked
      // later with an arbitrary receiver, so only an immediate, statically
      // unrelated key invocation can retain the decoder.
      if(['__defineGetter__','__defineSetter__'].includes(method??'') &&
         (isArrayPrototype(receiver)||isObjectPrototype(receiver)) &&
         !(parent?.type==='CallExpression' && parent.callee===node &&
           !mayInterceptChunkIndex(parent.arguments[0]))) {
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
    if(node.type==='AssignmentExpression' &&
         (touchesString(node.left)||isArrayIteratorProperty(node.left)||
          isArrayPrototypeChainWrite(node.left)) ||
       node.type==='UpdateExpression' &&
         (touchesString(node.argument)||isArrayIteratorProperty(node.argument)||
          isArrayPrototypeChainWrite(node.argument)) ||
       node.type==='UnaryExpression' && node.operator==='delete' &&
         (touchesString(node.argument)||isArrayIteratorProperty(node.argument)||
          isArrayPrototypeChainWrite(node.argument))) {
      mutated=true;
      return;
    }
    if(node.type!=='CallExpression' || node.callee.type!=='MemberExpression')return;
    const receiver=node.callee.object;
    const method=memberName(node.callee);
    const first=node.arguments[0];
    if(!first)return;
    if(method===null && (isObjectIntrinsic(receiver)||isReflectIntrinsic(receiver)) &&
       (touchesString(first)||isArrayPrototype(first)||isGlobal(first))) {
      mutated=true;
      return;
    }
    // Reflective getters of global constructors and the Array prototype
    // can return mutable references or descriptors. An alias held by another
    // function can mutate them after this syntax-only analysis.
    const name=node.arguments[1];
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
  if (mode === 'sno' && options.allowedHosts?.length) throw new TypeError('Browser host locking does not apply to SNO');
  const seed = options.seed ?? randomBytes(24).toString('hex');
  const seen = new Set();
  /** @type {(SourceFile & {sourceType:SourceType})[]} */
  const prepared = files.map(file => {
    const filename = safePath(file.path);
    // Case collisions overwrite files on common Windows volumes.
    const collisionKey = filename.toLowerCase();
    if (seen.has(collisionKey)) throw new TypeError(`Duplicate file ${filename}`);
    seen.add(collisionKey);
    if (typeof file.code !== 'string' && !Buffer.isBuffer(file.code)) throw new TypeError(`${filename} content must be a string or Buffer`);
    const sourceType = file.sourceType ?? (filename.endsWith('.mjs') ? 'module' :
      filename.endsWith('.cjs') ? 'commonjs' : mode === 'sno' ? 'commonjs' : 'script');
    if (!['module','script','commonjs','asset'].includes(sourceType)) throw new TypeError(`Unknown source type ${sourceType}`);
    return {path:filename,code:file.code,sourceType};
  });
  // Validate the entire published static graph before permitting a host
  // guard below an ESM import. Each dependency is independently guarded.
  const completeStaticHostGraph=Boolean(options.allowedHosts?.length && options.closedWorld &&
    completeGuardedModuleGraph(prepared));
  // Fail before any output is generated: source maps can undo an entire
  // transformation by retaining original text and symbol mappings.
  for (const file of prepared) assertNoSourceMapDisclosure(file);
  assertReviewedOpaqueAssets(prepared,options.reviewedOpaqueAssets);
  // A function declared in one ESM/classic-script file may have its source
  // observed by another supplied file. File-local proofs cannot see that
  // consumer, so preserve all original source spellings across the file group.
  const importedStringProof=prepared.length>1 && options.closedWorld ?
    collectVerifiedImportedStrings(prepared) : new Map();
  const importedCloneProof=prepared.length>1 ?
    collectVerifiedImportedCloneAliases(prepared) : new Map();
  const importedFunctionArrays=prepared.length>1 ?
    collectImportedFunctionArrays(prepared) : new Map();
  const remoteSourceObserver=prepared.some(file=>
    file.sourceType!=='asset' && typeof file.code==='string' &&
    (observesDistributedSource(parse(file.code,file.sourceType),importedStringProof.get(file.path)) ||
      prepared.length>1 && observesFunctionSource(parse(file.code,file.sourceType),
        importedStringProof.get(file.path),importedCloneProof.get(file.path),
        importedFunctionArrays.get(file.path))));
  // A hostname wrapper prepends source bytes. Code that can read its own
  // distributed script would observe the wrapper and violate the original
  // source-byte contract, so an explicit host lock must fail closed.
  if(remoteSourceObserver && options.allowedHosts?.length) {
    throw new TypeError('Host locking cannot preserve observable source bytes');
  }
  const cross = !remoteSourceObserver && options.closedWorld && options.properties !== false ?
    renameCrossFileProperties(prepared,seed) : {files:prepared,objects:0,properties:0};
  const shouldEncodeStrings=!remoteSourceObserver &&
    (options.strings === true || (options.strings === undefined && mode === 'sno'));
  /** @type {Set<string>} */
  const reservedNames=new Set();
  /** @type {string[]} */
  const reservedSources=[];
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
      if (mutatesDecoderIntrinsic(inputAst) ||
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
    const vmNames=options.experimentalRegisterVm?.[filename]??[];
    let vmFunctions=0,vmInstructions=0;
    if(vmNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Register VM requires a module/CommonJS without cross-file source observation');
      }
      const virtualized=virtualizeRegisterChains(code,sourceType,{seed:salt,names:vmNames});
      code=virtualized.code;
      vmFunctions=virtualized.functions;
      vmInstructions=virtualized.instructions;
      ast=parse(code,sourceType);
    }
    const expressionNames=options.experimentalExpressionVm?.[filename]??[];
    let expressionVmFunctions=0,expressionVmInstructions=0;
    if(expressionNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Expression VM requires a module/CommonJS without cross-file source observation');
      }
      const virtualized=virtualizeExpressionGraphs(code,sourceType,{seed:salt,names:expressionNames});
      code=virtualized.code;
      expressionVmFunctions=virtualized.functions;
      expressionVmInstructions=virtualized.instructions;
      ast=parse(code,sourceType);
    }
    const nativeNames=options.experimentalNativeGraph?.[filename]??[];
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
      code=optimized.code;
      nativeGraphFunctions=optimized.functions;
      nativeGraphInstructions=optimized.instructions;
      ast=parse(code,sourceType);
    }
    const branchNames=options.experimentalBranchBlocks?.[filename]??[];
    let branchFunctions=0,branchBlocks=0;
    if(branchNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Branch blocks require a module/CommonJS without cross-file source observation');
      }
      const flattened=flattenBranchBlocks(code,sourceType,{seed:salt,names:branchNames,
        stateBlinding:options.experimentalBranchStateBlinding===true});
      code=flattened.code;
      branchFunctions=flattened.functions;
      branchBlocks=flattened.blocks;
      ast=parse(code,sourceType);
    }
    const statementNames=options.experimentalStatementFlow?.[filename]??[];
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
    const wasmNames=options.experimentalWasmI32?.[filename]??[];
    let wasmI32Functions=0,wasmI32Instructions=0,wasmI32Bytes=0;
    if(wasmNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Wasm i32 requires a module/CommonJS without cross-file source observation');
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
    const polyvariantNames=options.experimentalPolyvariantAffine?.[filename]??[];
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
        seed:salt,names:polyvariantNames,variants:options.experimentalPolyvariantCount??(mode==='coo'?2:4)
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
    if (!remoteSourceObserver && options.properties !== false && sourceType !== 'script') {
      const modified = options.experimentalSymbolKeys === true ?
        symbolizeLocalProperties(code,ast,{seed:salt}) :
        renameLocalProperties(code,ast,{seed:salt});
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
    if (options.allowedHosts?.length) {
      if (sourceType === 'commonjs') throw new TypeError(`Host lock unavailable for CommonJS file ${filename}`);
      code = injectHostLock(code,ast,options.allowedHosts,completeStaticHostGraph);
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
