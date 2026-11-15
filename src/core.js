'use strict';

const path = require('node:path');
const {randomBytes, createHash} = require('node:crypto');
const {parse,walk} = require('./ast');
const {renameLocalProperties,collectBindings} = require('./properties');
const {encodeStrings} = require('./strings');
const {renameCrossFileProperties} = require('./cross-properties');
const {renameLocalIdentifiers} = require('./identifiers');

/** @typedef {'coo'|'sco'|'sno'} ObfuscationMode */
/** @typedef {'module'|'script'|'commonjs'|'asset'} SourceType */
/** @typedef {{path:string,code:string|Buffer,sourceType?:SourceType}} SourceFile */
/** @typedef {{path:string,code:string|Buffer,sourceType:SourceType,metrics:{literals:number,objects:number,properties:number,bindings:number}}} OutputFile */
/**
 * @typedef {{mode?:ObfuscationMode,seed?:string,strings?:boolean,properties?:boolean,identifiers?:boolean,minimumStringLength?:number,allowedHosts?:string[],closedWorld?:boolean}} ObfuscationOptions
 */

/**
 * Reject rooted, ambiguous and traversal paths before writing/serving files.
 * @param {string} file
 * @returns {string}
 */
function safePath(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') || (/[<>:\x22|?*\x00-\x1f]/u.test(file)) ||
      path.posix.isAbsolute(file)) throw new TypeError(`Unsafe file path: ${file}`);
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

/** @param {string} source @param {import('./ast').AstNode} ast @param {string[]} hosts @returns {string} */
function injectHostLock(source, ast, hosts) {
  // Static ESM dependencies execute before this module's body. A body-level
  // host guard cannot protect them, so fail closed instead of claiming a lock.
  if ((/** @type {import('./ast').AstNode[]} */ (ast.body)).some(statement => statement.type === 'ImportDeclaration' ||
      statement.type === 'ExportAllDeclaration' ||
      statement.type === 'ExportNamedDeclaration' && statement.source)) {
    throw new TypeError('Host locking ESM static imports or reexports is unsupported');
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
 * Detect direct writes that can replace the ambient String methods used by
 * the eager decoder. An imported ESM dependency executes before this file's
 * decoder, so a write anywhere in the supplied file group must disable that
 * decoder throughout the group. Indirect aliases and external modules remain
 * outside this deliberately conservative syntactic check.
 * @param {import('./ast').AstNode} ast
 * @returns {boolean}
 */
function mutatesStringIntrinsic(ast) {
  const globalNames=new Set(['globalThis','window','self','global']);
  /** @param {import('./ast').AstNode} node @returns {string|null} */
  function memberName(node) {
    if (node.type!=='MemberExpression') return null;
    return node.computed
      ? node.property.type==='Literal' && typeof node.property.value==='string' ? node.property.value : null
      : node.property.type==='Identifier' ? node.property.name : null;
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isGlobal(node) {
    return node.type==='Identifier' && globalNames.has(node.name);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function touchesString(node) {
    if(node.type==='Identifier')return node.name==='String';
    if(node.type!=='MemberExpression')return false;
    return isGlobal(node.object) && (memberName(node)==='String' || memberName(node)===null) || touchesString(node.object);
  }
  let mutated=false;
  walk(ast,node=>{
    if(node.type==='AssignmentExpression' && touchesString(node.left) ||
       node.type==='UpdateExpression' && touchesString(node.argument) ||
       node.type==='UnaryExpression' && node.operator==='delete' && touchesString(node.argument)) {
      mutated=true;
      return;
    }
    if(node.type!=='CallExpression' || node.callee.type!=='MemberExpression')return;
    const receiver=node.callee.object;
    const method=memberName(node.callee);
    const first=node.arguments[0];
    if(!first || receiver.type!=='Identifier')return;
    if(receiver.name==='Object' && ['defineProperty','defineProperties','assign','setPrototypeOf'].includes(method??'')) {
      if(touchesString(first))mutated=true;
      // Object.assign/defineProperties can change String through a dynamic
      // property bag whose keys are not statically provable here.
      if(isGlobal(first) && (method==='assign'||method==='defineProperties'))mutated=true;
      if(isGlobal(first) && method==='defineProperty' &&
         (node.arguments[1]?.type!=='Literal' || node.arguments[1].value==='String'))mutated=true;
    }
    if(receiver.name==='Reflect' && ['set','defineProperty','deleteProperty','setPrototypeOf'].includes(method??'')) {
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
  const cross = options.closedWorld && options.properties !== false ? renameCrossFileProperties(prepared,seed) : {files:prepared,objects:0,properties:0};
  const shouldEncodeStrings=options.strings === true || (options.strings === undefined && mode === 'sno');
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
      if (mutatesStringIntrinsic(inputAst) ||
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
    let objects = 0;
    let properties = 0;
    if (options.properties !== false && sourceType !== 'script') {
      const modified = renameLocalProperties(code,ast,{seed:salt});
      code = modified.code;
      objects = modified.objects;
      properties = modified.properties;
      ast = parse(code,sourceType);
    }
    let bindings=0;
    if(options.identifiers!==false) {
      const renamed=renameLocalIdentifiers(code,ast,{seed:salt,sourceType});
      code=renamed.code;
      bindings=renamed.bindings;
      ast=parse(code,sourceType);
    }
    let literals = 0;
    // Startup decoding counts toward SCO/COO client runtime. These modes
    // require explicit opt-in for eager string encoding; SNO can amortize init.
    if (shouldEncodeStrings && !unsafeDecoderIntrinsic) {
      const modified = encodeStrings(code,ast,{seed:salt,minimumLength:options.minimumStringLength,reservedNames,reservedSources});
      code = modified.code;
      literals = modified.count;
      ast = parse(code,sourceType);
    }
    if (options.allowedHosts?.length) {
      if (sourceType === 'commonjs') throw new TypeError(`Host lock unavailable for CommonJS file ${filename}`);
      code = injectHostLock(code,ast,options.allowedHosts);
      parse(code,sourceType);
    }
    return {path:filename,code,sourceType,metrics:{literals,objects,properties,bindings}};
  });
  return {files:output,seed,mode,crossFile:{objects:cross.objects,properties:cross.properties}};
}

module.exports = {obfuscateFiles,safePath};
