'use strict';

const path = require('node:path');
const {hasTerminalUrlDotSegment,hasUrlPathnameNormalizationHazard}=require('./esm-url-paths');
const {parse,walk,staticString,observesDistributedSource} = require('./ast');
const {collectBindings,staticName} = require('./properties');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {import('./core').SourceFile & {sourceType:import('./core').SourceType}} SourceFile */

/**
 * Return the canonical member spelling; unknown keys do not prove a local
 * primitive read.
 * @param {AstNode} member
 * @returns {string|null}
 */
function memberName(member) {
  return member.computed ? staticString(member.property) : staticName(member.property);
}

/**
 * A deliberately small and side-effect-free exported-function envelope.
 * The exporting module contains only immutable primitive own records,
 * immediate reads of those records, and zero-argument exported functions
 * returning those already-read primitive bindings. No value that could carry
 * a function, module namespace or mutable record escapes this module.
 *
 * @param {AstNode} ast
 * @returns {Set<string>|null}
 */
function purePrimitiveLeafExports(ast) {
  /** @type {Map<string,Set<string>>} */
  const records=new Map();
  const primitiveReads=new Set();
  const exported=new Set();
  const bindings=collectBindings(ast);
  for(const statement of ast.body) {
    if(statement.type==='VariableDeclaration' && statement.kind==='const') {
      for(const declaration of statement.declarations) {
        if(declaration.id.type!=='Identifier' || bindings.get(declaration.id.name)!==1) return null;
        const initial=declaration.init;
        if(initial?.type==='ObjectExpression') {
          const keys=new Set();
          if(!initial.properties.length) return null;
          for(const property of initial.properties) {
            const name=property.type==='Property' &&
              property.kind==='init' && !property.method && !property.shorthand ?
              (property.computed ? staticString(property.key) : staticName(property.key)) : null;
            const value=property.value;
            if(name===null || ['__proto__','constructor','prototype'].includes(name) ||
                keys.has(name) || value.type!=='Literal' || value.regex ||
                ![null,'string','number','boolean','bigint'].includes(value.value===null?null:typeof value.value)) return null;
            keys.add(name);
          }
          records.set(declaration.id.name,keys);
        } else if(initial?.type==='MemberExpression' &&
                  initial.object.type==='Identifier') {
          const name=memberName(initial);
          if(name===null || !records.get(initial.object.name)?.has(name) || initial.optional) return null;
          primitiveReads.add(declaration.id.name);
        } else return null;
      }
    } else if(statement.type==='ExportNamedDeclaration' && !statement.source &&
              statement.declaration?.type==='FunctionDeclaration') {
      const fn=statement.declaration;
      if(!fn.id || bindings.get(fn.id.name)!==1 || fn.async || fn.generator ||
         fn.params.length!==0 || fn.body.body.length!==1 ||
         fn.body.body[0].type!=='ReturnStatement' ||
         fn.body.body[0].argument?.type!=='Identifier' ||
         !primitiveReads.has(fn.body.body[0].argument.name)) return null;
      exported.add(fn.id.name);
    } else return null;
  }
  return records.size && primitiveReads.size && exported.size ? exported : null;
}

/**
 * An exported snapshot whose values are either static primitives or reads
 * from exactly proven primitive-returning imported leaves. This permits
 * browser entry modules to expose a one-time result object without exposing
 * a callable through which an unknown host can inject a source reader.
 * Importing functions that return objects, or exporting function-valued
 * fields, retains the conservative refusal.
 *
 * @param {AstNode} ast
 * @param {string} filename
 * @param {Map<string,{ast:AstNode,bindings:Map<string,number>}>} modules
 * @param {Set<string>} known
 * @returns {boolean}
 */
function purePrimitiveSnapshotExports(ast,filename,modules,known){
  /** @type {Set<string>} */
  const importedPrimitives=new Set();
  for(const statement of ast.body){
    if(statement.type!=='ImportDeclaration')continue;
    const origin=typeof statement.source.value==='string' ?
      resolveKnownImport(filename,statement.source.value,known):null;
    const imported=origin?modules.get(origin):null;
    const leaves=imported?purePrimitiveLeafExports(imported.ast):null;
    if(!leaves)return false;
    for(const spec of statement.specifiers){
      const name=spec.type==='ImportSpecifier'?
        (spec.imported.name??spec.imported.value):null;
      if(typeof name!=='string'||!leaves.has(name)||
         spec.local.type!=='Identifier'||
         modules.get(filename)?.bindings.get(spec.local.name)!==1)return false;
      importedPrimitives.add(spec.local.name);
    }
  }
  let snapshots=0;
  for(const statement of ast.body){
    if(statement.type==='ImportDeclaration')continue;
    if(statement.type!=='ExportNamedDeclaration'||statement.source||
       statement.specifiers?.length||statement.declaration?.type!=='VariableDeclaration'||
       statement.declaration.kind!=='const')return false;
    for(const declaration of statement.declaration.declarations){
      if(declaration.id.type!=='Identifier'||
         declaration.init?.type!=='ObjectExpression'||
         !declaration.init.properties.length)return false;
      const keys=new Set();
      for(const property of declaration.init.properties){
        const key=property.type==='Property' && !property.computed &&
          !property.method && !property.shorthand && property.kind==='init' ?
          staticName(property.key):null;
        if(key===null||keys.has(key)||['__proto__','constructor','prototype'].includes(key))
          return false;
        keys.add(key);
        const value=property.value;
        if(value.type==='Literal'&&!value.regex &&
           (value.value===null||
            ['string','number','boolean','bigint'].includes(typeof value.value)))continue;
        if(value.type!=='CallExpression'||value.optional||value.arguments.length)return false;
        if(value.callee.type==='Identifier' &&
           importedPrimitives.has(value.callee.name))continue;
        if(value.callee.type==='MemberExpression'&&!value.callee.computed &&
           !value.callee.optional&&value.callee.object.type==='Identifier'&&
           importedPrimitives.has(value.callee.object.name) &&
           value.callee.property.type==='Identifier' &&
           value.callee.property.name==='toString')continue;
        return false;
      }
      snapshots++;
    }
  }
  return snapshots>0;
}

/**
 * Exact, declared relative ESM imports only. Refuse URL/query aliases,
 * external packages, reexports, and any unlisted dependency.
 * @param {string} origin
 * @param {string} specifier
 * @param {Set<string>} known
 * @returns {string|null}
 */
function resolveKnownImport(origin,specifier,known) {
  // Browser URL paths preserve empty segments; POSIX normalization does not.
  // Repeated separators can therefore denote a different module-map key.
  if((!specifier.startsWith('./')&&!specifier.startsWith('../')) ||
     /[?#%\\]/u.test(specifier) || specifier.includes('//') || hasUrlPathnameNormalizationHazard(specifier) || hasTerminalUrlDotSegment(specifier))return null;
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(origin),specifier));
  return known.has(target) ? target : null;
}

/**
 * A narrowly reviewed *source-visible compatibility* exception to the
 * group-wide source observer veto. The compiler's default refusal is
 * unchanged. This checker never treats a hostile Node loader, browser
 * debugger, or injected realm intrinsic as a trustworthy isolation boundary.
 *
 * Selected ESM leaves must contain only local primitive record reads and
 * zero-argument primitive-returning named function exports. Every named
 * imported use in the entire supplied group must be a direct zero-argument
 * call. Any namespace import, reexport, dynamic import, source-file reader,
 * opaque global capability or unresolved module dependency fails closed.
 *
 * @param {SourceFile[]} files
 * @param {string[]} selections
 * @returns {Set<string>}
 */
function proveSourceObserverIslands(files,selections) {
  if(!Array.isArray(selections) || selections.some(s=>typeof s!=='string') ||
     new Set(selections).size!==selections.length) {
    throw new TypeError('Source observer islands require unique file path selections');
  }
  const known=new Set(files.map(file=>file.path));
  if(files.some(file=>file.sourceType!=='module' || typeof file.code!=='string')) {
    throw new TypeError('Source observer islands require an exact ESM-only file group');
  }
  /** @type {Map<string,{ast:AstNode,bindings:Map<string,number>}>} */
  const modules=new Map();
  for(const file of files) {
    const ast=parse(/** @type {string} */ (file.code),'module');
    if(observesDistributedSource(ast)) {
      throw new TypeError('Source observer islands refuse distributed source-file readers');
    }
    modules.set(file.path,{ast,bindings:collectBindings(ast)});
  }

  const forbiddenIdentifiers=new Set([
    'process','globalThis','global','window','self','document','navigator',
    // Ambient reflection can reconstruct Function from computed string fragments,
    // then import filesystem readers without a visible import/eval node.
    // A sound allowlist requires an explicit capability proof, so decline both.
    'location','Deno','Bun','require','eval','Function','AsyncFunction',
    'Object','Reflect',
    // Browser timers evaluate string callbacks as source text in the realm,
    // which can fetch a selected leaf without an ESM ImportExpression edge.
    'setTimeout','setInterval',
    'GeneratorFunction','AsyncGeneratorFunction','Worker','SharedWorker',
    'importScripts','fetch','XMLHttpRequest','FileReader','Request','Response',
    // CacheStorage exposes fetched module bytes without an explicit fetch().
    // Cache.add() performs a request, then Cache.match().text() reveals it.
    'caches','CacheStorage',
    // A same-origin host iframe may expose selected .mjs source text to a
    // declared module through the ambient Window.frames collection.
    'frames',
    'URL','Blob','WebSocket','readFile','readFileSync','createRequire',
    'getBuiltinModule'
  ]);
  const forbiddenMembers=new Set([
    'constructor','__proto__','require','createRequire','getBuiltinModule',
    'readFile','readFileSync','fetch','importScripts',
    // An externally supplied HTMLIFrameElement can expose hosted source even
    // when this ESM graph never spells a Window or Document global.
    'contentDocument','contentWindow'
  ]);
  // The *supplied ESM import graph* being closed does not imply the host's
  // global capability namespace is closed. An embedding runtime can expose
  // a file reader as a previously unknown global identifier. Deny every free
  // ambient name that is not a narrowly listed language primitive. A list
  // of suspicious reader methods alone cannot discharge this obligation.
  const inertAmbientNames=new Set([
    'undefined','NaN','Infinity','console','JSON','Math','String','Number',
    'Boolean','BigInt','Symbol','Array','Date','RegExp','Map','Set','WeakMap',
    'WeakSet','Promise','Error','TypeError','RangeError','URIError','SyntaxError',
    'ReferenceError','EvalError','AggregateError','parseInt','parseFloat',
    'isNaN','isFinite','encodeURI','encodeURIComponent','decodeURI',
    'decodeURIComponent','ArrayBuffer','DataView','Int8Array','Uint8Array',
    'Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array',
    'Float32Array','Float64Array','BigInt64Array','BigUint64Array',
    'TextEncoder','TextDecoder','Buffer'
  ]);
  const selectionSet=new Set(selections);
  for(const [filename,module] of modules) {
    // An unselected module is retained byte-for-byte, but exporting an
    // arbitrary callable lets an embedding host supply a callback that reads
    // the selected module's on-disk or served source. That callback is outside
    // this declared ESM graph and cannot be recognized by a source-reader
    // identifier blacklist. Only the inert primitive-returning envelope
    // already accepted for selected leaves is admitted for other exports.
    if(!selectionSet.has(filename) &&
       module.ast.body.some((/** @type {AstNode} */ statement)=>statement.type.startsWith('Export')) &&
       !purePrimitiveLeafExports(module.ast) &&
       !purePrimitiveSnapshotExports(module.ast,filename,modules,known)) {
      throw new TypeError('Source observer islands refuse unreviewed host-callable exports');
    }
    for(const statement of module.ast.body) {
      if(statement.type==='ExportAllDeclaration' ||
         statement.type==='ExportNamedDeclaration' && statement.source) {
        throw new TypeError('Source observer islands refuse reexports');
      }
      if(statement.type==='ImportDeclaration') {
        if(typeof statement.source.value!=='string' ||
           !resolveKnownImport(filename,statement.source.value,known) ||
           statement.attributes?.length || statement.assertions?.length) {
          throw new TypeError('Source observer islands require closed static ESM imports');
        }
      }
    }
    let opaque=false;
    walk(module.ast,(node,parent,key)=>{
      if(node.type==='ImportExpression' || node.type==='MetaProperty' ||
         node.type==='WithStatement') opaque=true;
      if(node.type==='Identifier') {
        const nonReference=Boolean(
          parent?.type==='Property' && key==='key' && !parent.computed ||
          parent?.type==='MemberExpression' && key==='property' && !parent.computed ||
          parent?.type==='ImportSpecifier' && key==='imported' ||
          parent?.type==='ExportSpecifier' && key==='exported' ||
          parent?.type==='LabeledStatement' && key==='label' ||
          parent?.type==='BreakStatement' && key==='label' ||
          parent?.type==='ContinueStatement' && key==='label'
        );
        // Preserve the original syntactic veto even for a noncomputed
        // member key named after an ambient root; the new free-name proof
        // is *additional*, never a relaxation of an existing refusal.
        if(forbiddenIdentifiers.has(node.name) &&
           !(parent?.type==='Property' && key==='key' && !parent.computed))
          opaque=true;
        if(!nonReference && !module.bindings.has(node.name) &&
           !inertAmbientNames.has(node.name))opaque=true;
      }
      if(node.type==='MemberExpression') {
        const name=memberName(node);
        if(name===null || forbiddenMembers.has(name))opaque=true;
      }
      // Destructuring is also property access. An inherited constructor
      // can be extracted without a MemberExpression or direct Function name.
      if(node.type==='Property' && parent?.type==='ObjectPattern') {
        const name=node.computed ? staticString(node.key) : staticName(node.key);
        if(name===null || forbiddenMembers.has(name))opaque=true;
      }
      if(node.type==='Literal' && typeof node.value==='string' &&
         forbiddenMembers.has(node.value))opaque=true;
    });
    if(opaque)throw new TypeError('Source observer islands refuse opaque source or loader access');
  }

  /** @type {Map<string,Set<string>>} */
  const selectedExports=new Map();
  for(const filename of selections) {
    const selected=modules.get(filename);
    const exported=selected && purePrimitiveLeafExports(selected.ast);
    if(!exported)throw new TypeError('Source observer island is not a pure primitive ESM leaf: '+filename);
    selectedExports.set(filename,exported);
  }

  for(const [filename,module] of modules) {
    /** @type {Set<string>} */
    const importedNames=new Set();
    for(const statement of module.ast.body) {
      if(statement.type!=='ImportDeclaration')continue;
      const target=resolveKnownImport(filename,statement.source.value,known);
      const exported=target ? selectedExports.get(target) : null;
      if(!exported)continue;
      for(const spec of statement.specifiers) {
        const exportedName=spec.type==='ImportSpecifier' ?
          (spec.imported.name ?? spec.imported.value) : null;
        if(typeof exportedName!=='string' || !exported.has(exportedName) ||
           spec.local.type!=='Identifier' ||
           module.bindings.get(spec.local.name)!==1 ||
           importedNames.has(spec.local.name)) {
          throw new TypeError('Source observer island exports must be directly named imports');
        }
        importedNames.add(spec.local.name);
      }
    }
    if(!importedNames.size)continue;
    walk(module.ast,(node,parent,key)=>{
      if(node.type!=='Identifier' || !importedNames.has(node.name))return;
      if(parent?.type==='ImportSpecifier' &&
         (parent.local===node || parent.imported===node))return;
      if(parent?.type==='CallExpression' && key==='callee' &&
         parent.callee===node && !parent.optional && parent.arguments.length===0)return;
      throw new TypeError('Source observer island function escapes direct zero-argument calls');
    });
  }
  return new Set(selections);
}

module.exports={proveSourceObserverIslands};
