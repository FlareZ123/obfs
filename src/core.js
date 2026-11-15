'use strict';

const path = require('node:path');
const {randomBytes, createHash} = require('node:crypto');
const {parse,walk,observesFunctionSource} = require('./ast');
const {renameLocalProperties,collectBindings} = require('./properties');
const {encodeStrings} = require('./strings');
const {renameCrossFileProperties} = require('./cross-properties');
const {renameLocalIdentifiers} = require('./identifiers');
const {virtualizeRegisterChains} = require('./register-vm');
const {virtualizeExpressionGraphs} = require('./expression-vm');
const {flattenBranchBlocks} = require('./branch-blocks');
const {lowerWasmI32Functions} = require('./wasm-i32');
const {assertNoSourceMapDisclosure} = require('./source-maps');

/** @typedef {'coo'|'sco'|'sno'} ObfuscationMode */
/** @typedef {'module'|'script'|'commonjs'|'asset'} SourceType */
/** @typedef {{path:string,code:string|Buffer,sourceType?:SourceType}} SourceFile */
/** @typedef {{path:string,code:string|Buffer,sourceType:SourceType,metrics:{literals:number,objects:number,properties:number,bindings:number,vmFunctions?:number,vmInstructions?:number,expressionVmFunctions?:number,expressionVmInstructions?:number,nativeGraphFunctions?:number,nativeGraphInstructions?:number,branchFunctions?:number,branchBlocks?:number,wasmI32Functions?:number,wasmI32Instructions?:number,wasmI32Bytes?:number}}} OutputFile */
/**
 * @typedef {{mode?:ObfuscationMode,seed?:string,strings?:boolean,properties?:boolean,identifiers?:boolean,minimumStringLength?:number,allowedHosts?:string[],closedWorld?:boolean,experimentalRegisterVm?:Record<string,string[]>,experimentalExpressionVm?:Record<string,string[]>,experimentalNativeGraph?:Record<string,string[]>,experimentalBranchBlocks?:Record<string,string[]>,experimentalBranchStateBlinding?:boolean,experimentalWasmI32?:Record<string,string[]>}} ObfuscationOptions
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
 * Detect direct writes that can replace String decoder methods or the Array
 * iterator consumed by chunked string spread. An imported ESM dependency executes before this file's
 * decoder, so a write anywhere in the supplied file group must disable that
 * decoder throughout the group. Indirect aliases and external modules remain
 * outside this deliberately conservative syntactic check.
 * @param {import('./ast').AstNode} ast
 * @returns {boolean}
 */
function mutatesDecoderIntrinsic(ast) {
  // Find immutable-looking and reassigned aliases before checking writes.
  // A dependency can mutate String through one of these names before another
  // file's eager decoder initializes; the whole group must then opt out.
  const globalNames=new Set(['globalThis','window','self','global']);
  const stringNames=new Set(['String']);
  const prototypeNames=new Set();
  const arrayNames=new Set(['Array']);
  const arrayPrototypes=new Set();
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
    return node.type==='MemberExpression' && (
      isGlobal(node.object) && (memberName(node)==='Array'||memberName(node)===null) ||
      memberName(node)==='constructor' && isArrayInstance(node.object));
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isArrayPrototype(node) {
    if(node.type==='Identifier')return arrayPrototypes.has(node.name);
    if(node.type==='MemberExpression') {
      // Array literals inherit the same iterator prototype as Array.prototype.
      // A patched iterator would corrupt the chunked decoder's spread.
      if(isArrayInstance(node.object) && memberName(node)==='__proto__')return true;
      return isArrayValue(node.object) &&
        (memberName(node)==='prototype'||memberName(node)===null);
    }
    return node.type==='CallExpression' && node.callee.type==='MemberExpression' &&
      node.callee.object.type==='Identifier' &&
      ['Object','Reflect'].includes(node.callee.object.name) &&
      memberName(node.callee)==='getPrototypeOf' &&
      node.arguments[0] && isArrayInstance(node.arguments[0]);
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
      if(node.type==='VariableDeclarator' && node.init) {
        if(node.id.type==='Identifier') {
          if(isGlobal(node.init))add(globalNames,node.id.name);
          if(isStringValue(node.init))add(stringNames,node.id.name);
          if(isStringPrototype(node.init))add(prototypeNames,node.id.name);
          if(isArrayValue(node.init))add(arrayNames,node.id.name);
          if(isArrayPrototype(node.init))add(arrayPrototypes,node.id.name);
        } else if(node.id.type==='ObjectPattern' &&
                  (isGlobal(node.init)||isStringValue(node.init)||isArrayValue(node.init))) {
          for(const property of node.id.properties) {
            if(property.type!=='Property' || property.computed ||
               property.value.type!=='Identifier')continue;
            const name=property.key.type==='Identifier' ? property.key.name :
              property.key.type==='Literal' ? property.key.value : null;
            if(name==='String'&&isGlobal(node.init))add(stringNames,property.value.name);
            if(name==='prototype'&&isStringValue(node.init))add(prototypeNames,property.value.name);
            if(name==='Array'&&isGlobal(node.init))add(arrayNames,property.value.name);
            if(name==='prototype'&&isArrayValue(node.init))add(arrayPrototypes,property.value.name);
          }
        }
      } else if(node.type==='AssignmentExpression' && node.operator==='=' &&
                node.left.type==='Identifier') {
        if(isGlobal(node.right))add(globalNames,node.left.name);
        if(isStringValue(node.right))add(stringNames,node.left.name);
        if(isStringPrototype(node.right))add(prototypeNames,node.left.name);
        if(isArrayValue(node.right))add(arrayNames,node.left.name);
        if(isArrayPrototype(node.right))add(arrayPrototypes,node.left.name);
      }
    });
  } while(discovered);
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function touchesString(node) {
    if(node.type==='Identifier')return stringNames.has(node.name)||prototypeNames.has(node.name);
    if(node.type!=='MemberExpression')return false;
    return isGlobal(node.object) && (memberName(node)==='String' || memberName(node)===null) ||
      touchesString(node.object);
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
  walk(ast,node=>{
    if(node.type==='Identifier' && dynamicCompilers.has(node.name) ||
       node.type==='MemberExpression' && dynamicCompilers.has(memberName(node)??'')) {
      mutated=true;
      return;
    }
    if(node.type==='AssignmentExpression' &&
         (touchesString(node.left)||isArrayIteratorProperty(node.left)) ||
       node.type==='UpdateExpression' &&
         (touchesString(node.argument)||isArrayIteratorProperty(node.argument)) ||
       node.type==='UnaryExpression' && node.operator==='delete' &&
         (touchesString(node.argument)||isArrayIteratorProperty(node.argument))) {
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
    if(isArrayPrototype(first) && receiver.name==='Object' &&
       ['assign','defineProperty','defineProperties','setPrototypeOf'].includes(method??'')) {
      const key=node.arguments[1];
      if(method!=='defineProperty' || !key || key.type!=='Literal')mutated=true;
    }
    if(isArrayPrototype(first) && receiver.name==='Reflect' &&
       ['set','defineProperty','deleteProperty','setPrototypeOf'].includes(method??'')) {
      const key=node.arguments[1];
      if(method==='setPrototypeOf'||!key||key.type!=='Literal')mutated=true;
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
  // Fail before any output is generated: source maps can undo an entire
  // transformation by retaining original text and symbol mappings.
  for (const file of prepared) assertNoSourceMapDisclosure(file);
  // A function declared in one ESM/classic-script file may have its source
  // observed by another supplied file. File-local proofs cannot see that
  // consumer, so preserve all original source spellings across the file group.
  const remoteSourceObserver=prepared.length>1 && prepared.some(file=>
    file.sourceType!=='asset' && typeof file.code==='string' &&
    observesFunctionSource(parse(file.code,file.sourceType)));
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
    const wasmNames=options.experimentalWasmI32?.[filename]??[];
    let wasmI32Functions=0,wasmI32Instructions=0,wasmI32Bytes=0;
    if(wasmNames.length) {
      if(sourceType==='script'||remoteSourceObserver) {
        throw new TypeError('Wasm i32 requires a module/CommonJS without cross-file source observation');
      }
      if(wasmNames.some(name=>vmNames.includes(name)||expressionNames.includes(name)||
          nativeNames.includes(name)||branchNames.includes(name))) {
        throw new TypeError('Do not select the same function for multiple experimental backends');
      }
      const lowered=lowerWasmI32Functions(code,sourceType,{seed:salt,names:wasmNames});
      code=lowered.code;
      wasmI32Functions=lowered.functions;
      wasmI32Instructions=lowered.instructions;
      wasmI32Bytes=lowered.wasmBytes;
      ast=parse(code,sourceType);
    }
    let objects = 0;
    let properties = 0;
    if (!remoteSourceObserver && options.properties !== false && sourceType !== 'script') {
      const modified = renameLocalProperties(code,ast,{seed:salt});
      code = modified.code;
      objects = modified.objects;
      properties = modified.properties;
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
    /** @type {OutputFile['metrics']} */
    const metrics={literals,objects,properties,bindings};
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
    if(wasmNames.length) {
      metrics.wasmI32Functions=wasmI32Functions;
      metrics.wasmI32Instructions=wasmI32Instructions;
      metrics.wasmI32Bytes=wasmI32Bytes;
    }
    return {path:filename,code,sourceType,metrics};
  });
  return {files:output,seed,mode,crossFile:{objects:cross.objects,properties:cross.properties}};
}

module.exports = {obfuscateFiles,safePath};
