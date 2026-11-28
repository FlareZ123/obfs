'use strict';

const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {parse,walk,staticString}=require('./ast');
const {safePath}=require('./core');
const {createScoHandler}=require('./sco');
const {partitionScoAsyncModule,bindScoModuleExports}=require('./sco-partition');

/** @typedef {{path:string,code:string,sourceType?:'module'}} ScoPrivateModule */
/** @typedef {import('./sco-partition').ScoModulePartition} ScoModulePartition */

/**
 * Source of truth for graphs returned by this compiler invocation. Callers
 * receive a mutable manifest for inspection, but cannot silently replace a
 * generated facade with a modified private source before publication.
 * This protects against accidental integrator mutation, not a compromised
 * server that can execute different code or bypass this handler altogether.
 * @type {WeakMap<object,string>}
 */
const generatedGraphSnapshots=new WeakMap();
/** @typedef {{seed?:string,endpoint?:string,exposedPaths:string[]}} ScoGraphOptions */
/**
 * @typedef {{
 *   clientFiles:ScoModulePartition['clientFile'][],
 *   partitions:Record<string,ScoModulePartition>,
 *   exposedPaths:string[],
 *   privatePaths:string[],
 *   privateSourceDigests:{path:string,sha256:string}[]
 * }} ScoGraphPartition
 */

// Inspector and REPL evaluate hidden strings; cluster.setupPrimary can spawn
// arbitrary worker entry files. All bypass a statically enumerated ESM graph.
const dynamicLoaderBuiltins=new Set(['node:module','node:vm',
  'node:worker_threads','node:child_process','node:cluster',
  'node:inspector','node:inspector/promises','node:repl']);
/**
 * Reject ambiguous module specifiers before promising that the supplied graph
 * is closed over its relative imports. Native Node resolution must still load
 * the original server directory. Browser clients receive only generated stubs.
 * @param {string} source
 * @param {string} specifier
 * @param {ReadonlySet<string>} known
 * @returns {void}
 */
function verifyPrivateImport(source,specifier,known) {
  if(specifier.startsWith('node:')){
    if(dynamicLoaderBuiltins.has(specifier)){
      throw new TypeError('Private SCO graph cannot certify imports from runtime loader builtin: '+specifier);
    }
    return;
  }
  if(typeof specifier!=='string'||specifier.includes('\\')||
      /[?#%\x00-\x1f]/u.test(specifier) ||
      !(specifier.startsWith('./')||specifier.startsWith('../'))) {
    throw new TypeError('Private SCO graph requires relative .mjs or node: imports: '+specifier);
  }
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(source),specifier));
  const relative=path.posix.relative(path.posix.dirname(source),target);
  const canonical=relative.startsWith('.')?relative:'./'+relative;
  if(!target.endsWith('.mjs') || target==='..'||target.startsWith('../')||
      !known.has(target)||specifier!==canonical) {
    throw new TypeError('Missing or noncanonical private SCO import: '+source+' -> '+specifier);
  }
}

const dynamicEvaluatorNames=new Set(['eval','Function']);
const dynamicEvaluatorGlobals=new Set(['globalThis','global','self','window']);
/**
 * Refuse source-level access to ordinary dynamic evaluators in private SCO
 * graphs. Overapproximate shadowed bindings instead of claiming a lexical
 * identity proof. Static property labels are harmless by themselves, whereas
 * computed/global references may manufacture unlisted runtime ESM imports.
 * Derived constructor chains and opaque host aliases remain unproved.
 * @param {import('./ast').AstNode} node
 * @param {import('./ast').AstNode|null} parent
 * @param {string|null} childKey
 * @returns {boolean}
 */
function isDirectDynamicEvaluator(node,parent,childKey){
  if(node.type==='Identifier'&&dynamicEvaluatorNames.has(node.name)){
    const staticMember=parent?.type==='MemberExpression'&&
      childKey==='property'&&!parent.computed;
    const staticObjectKey=(
      parent?.type==='Property'||parent?.type==='MethodDefinition'||
      parent?.type==='PropertyDefinition')&&childKey==='key'&&!parent.computed;
    return !staticMember&&!staticObjectKey;
  }
  if(node.type==='MemberExpression'){
    const label=node.computed?staticString(node.property):
      node.property.type==='Identifier'?node.property.name:null;
    // Node's process.getBuiltinModule('module') yields createRequire even
    // without a visible node:module import. Aliased/indirect uses remain
    // outside this syntactic guard.
    if(label==='getBuiltinModule')return true;
    if(node.object.type==='Identifier'&&
        dynamicEvaluatorGlobals.has(node.object.name)){
      return label!==null&&dynamicEvaluatorNames.has(label);
    }
  }
  if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
      node.init?.type==='Identifier'&&dynamicEvaluatorGlobals.has(node.init.name)){
    return node.id.properties.some((/** @type {import('./ast').AstNode} */ property)=>{
      if(property.type!=='Property')return true;
      const label=property.computed?staticString(property.key):
        property.key.type==='Identifier'?property.key.name:
          property.key.type==='Literal'?property.key.value:null;
      return label===null||dynamicEvaluatorNames.has(label);
    });
  }
  return false;
}

/**
 * Compose the existing strict single-module SCO async partitioner over a
 * closed private ESM graph. Only explicitly exposed modules receive public
 * facades. All private imports, secret constants, and non-export modules stay
 * server-resident. A real server must load the original graph from a private
 * directory; this function does not start a server or authenticate clients.
 *
 * The graph proof rejects unresolved relative imports, nonliteral dynamic
 * imports, and directly visible eval/Function loaders (including simple
 * aliases). Only node: and explicit relative .mjs dependencies are
 * accepted as recognized import declarations. JavaScript can still create
 * runtime imports through derived constructors or opaque host capabilities,
 * so this is a syntactic admission rule, not a complete runtime closure
 * proof. It never infers that a source file is safe to publish from the
 * mere presence of an export.
 *
 * @param {ScoPrivateModule[]} files
 * @param {ScoGraphOptions} options
 * @returns {ScoGraphPartition}
 */
function partitionScoAsyncGraph(files,options) {
  if(!Array.isArray(files)||!options) {
    throw new TypeError('Expected a private ESM graph and explicit exposedPaths');
  }
  const fileCount=files.length;
  // Keep the exact reviewed exposure list and compilation settings throughout
  // this invocation. Caller accessors and custom array iterators may change.
  const suppliedPaths=options.exposedPaths;
  const suppliedSeed=options.seed;
  const suppliedEndpoint=options.endpoint;
  if(!Array.isArray(suppliedPaths)) {
    throw new TypeError('Expected a private ESM graph and explicit exposedPaths');
  }
  const pathCount=suppliedPaths.length;
  if(fileCount===0||pathCount===0||
      suppliedSeed!==undefined && (typeof suppliedSeed!=='string'||!suppliedSeed)) {
    throw new TypeError('Expected a private ESM graph and explicit exposedPaths');
  }
  /** @type {string[]} */
  const approvedPaths=[];
  for(let index=0;index<pathCount;index++){
    const name=suppliedPaths[index];
    if(typeof name!=='string'){
      throw new TypeError('Expected a private ESM graph and explicit exposedPaths');
    }
    approvedPaths.push(name);
  }
  /** @type {Map<string,ScoPrivateModule>} */
  const modules=new Map();
  /** @type {Set<string>} */
  const folded=new Set();
  for(let index=0;index<fileCount;index++){
    const file=files[index];
    const code=file?.code;
    const sourceType=file?.sourceType;
    if(!file||typeof code!=='string'||
        sourceType!==undefined&&sourceType!=='module') {
      throw new TypeError('Private SCO graph requires ESM text files');
    }
    const filename=safePath(file.path);
    if(!filename.endsWith('.mjs'))throw new TypeError('Private SCO graph supports only .mjs files');
    const lower=filename.toLowerCase();
    if(folded.has(lower))throw new TypeError('Duplicate private graph path: '+filename);
    folded.add(lower);
    modules.set(filename,{path:filename,code,sourceType:'module'});
  }
  const names=new Set(modules.keys());
  for(const [filename,file] of modules) {
    const ast=parse(file.code,'module');
    walk(ast,(node,parent,key)=>{
      if(isDirectDynamicEvaluator(node,parent,key)){
        throw new TypeError('Private SCO graph cannot prove imports through eval or Function');
      }
      if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&
          node.source?.type==='Literal'&&typeof node.source.value==='string') {
        verifyPrivateImport(filename,node.source.value,names);
      }
      if(node.type==='ImportExpression') {
        const specifier=staticString(node.source);
        if(specifier===null)throw new TypeError('Dynamic import expressions need a closed literal target');
        verifyPrivateImport(filename,specifier,names);
      }
    });
  }
  const selected=new Set();
  for(const entry of approvedPaths) {
    const filename=safePath(entry);
    if(!modules.has(filename)||selected.has(filename)) {
      throw new TypeError('Missing or duplicate exposed private graph entry: '+filename);
    }
    selected.add(filename);
  }
  const seed=suppliedSeed??randomBytes(32).toString('hex');
  /** @type {Record<string,ScoModulePartition>} */
  const partitions=Object.create(null);
  /** @type {ScoModulePartition['clientFile'][]} */
  const clientFiles=[];
  /** @type {Set<string>} */
  const methodIds=new Set();
  for(const filename of selected){
    const source=modules.get(filename);
    if(!source)throw new Error('Expected selected private source');
    const partition=partitionScoAsyncModule(source,{
      seed,endpoint:suppliedEndpoint,serverOnlyInitialization:true
    });
    for(const name of partition.names){
      const id=partition.methodNames[name];
      if(methodIds.has(id))throw new TypeError('Cross-module SCO RPC method collision');
      methodIds.add(id);
    }
    partitions[filename]=partition;
    clientFiles.push(partition.clientFile);
  }
  const privatePaths=[...names].filter(filename=>!selected.has(filename));
  // Original input bytes are never a public facade, including originals of
  // explicitly exposed modules. Fingerprints also catch unmodified sources
  // that were accidentally copied under a different public filename.
  const privateSourceDigests=[...modules.values()].map(file=>({
    path:file.path,
    sha256:createHash('sha256').update(file.code,'utf8').digest('hex')
  }));
  const privateOriginalDigests=privateSourceDigests.map(item=>item.sha256);
  // The handler already refuses to co-publish explicitly marked private
  // paths. Carry the closed graph's non-exposed paths on each generated
  // facade, so accidentally adding an original private dependency to the
  // same handler fails before any HTTP source route exists. Each facade must
  // independently retain this proof even if the caller selects just one.
  for(const clientFile of clientFiles) {
    clientFile.privateModulePaths=[...privatePaths];
    clientFile.privateOriginalDigests=[...privateOriginalDigests];
  }
  const graph={clientFiles,partitions,exposedPaths:[...selected],privatePaths,
    privateSourceDigests};
  // Preserve the generated publication and method identities independently
  // of the mutable manifest returned to integrators. This is startup-only.
  generatedGraphSnapshots.set(graph,JSON.stringify(graph));
  return graph;
}

/**
 * Register the original loaded private ESM namespaces against the generated
 * method IDs. Namespaces are indexed by the corresponding graph file paths.
 * Expose this merged registry only through a separately authorized RPC route.
 *
 * @param {ScoGraphPartition} graph
 * @param {Record<string,Record<string,unknown>>} namespaces
 * @returns {Record<string,(...args:any[])=>unknown|Promise<unknown>>}
 */
function bindScoGraphExports(graph,namespaces){
  if(!graph||!Array.isArray(graph.exposedPaths)||!graph.exposedPaths.length||
      !graph.partitions||!namespaces||typeof namespaces!=='object') {
    throw new TypeError('Expected a graph partition and server module namespaces');
  }
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const registry=Object.create(null);
  for(const filename of graph.exposedPaths) {
    if(!Object.hasOwn(namespaces,filename)) {
      throw new TypeError('Missing private ESM namespace: '+filename);
    }
    const methods=bindScoModuleExports(graph.partitions[filename],namespaces[filename]);
    for(const [method,fn] of Object.entries(methods)){
      if(Object.hasOwn(registry,method))throw new TypeError('Cross-module method registration collision');
      registry[method]=fn;
    }
  }
  return registry;
}


/**
 * Construct an SCO handler from a private graph without accepting an
 * independently assembled sourceFiles list or RPC method map. This keeps
 * the compiler-generated public facades as the complete publication list,
 * derives an exact public-path allowlist, and binds only verified exported
 * server methods. Authorization callbacks are still the integrator's duty.
 *
 * Each facade's transport endpoint must match the handler's RPC route.
 * Source metadata remains internal to the trusted server at construction.
 *
 * @param {ScoGraphPartition} graph
 * @param {Record<string,Record<string,unknown>>} namespaces
 * @param {Omit<import('./sco').ScoOptions,'publicPaths'|'remoteMethods'>} options
 * @returns {import('node:http').RequestListener}
 */
function createScoGraphHandler(graph,namespaces,options){
  if(!graph||!Array.isArray(graph.clientFiles)||
      !Array.isArray(graph.exposedPaths)||!graph.partitions||
      !options||typeof options!=='object'||
      Object.hasOwn(options,'publicPaths')||Object.hasOwn(options,'remoteMethods')){
    throw new TypeError('SCO graph handler requires graph and separately authorized server options');
  }
  const snapshot=generatedGraphSnapshots.get(graph);
  if(snapshot===undefined){
    throw new TypeError('SCO graph handler requires a graph generated in this process');
  }
  if(JSON.stringify(graph)!==snapshot){
    throw new TypeError('SCO graph manifest was modified after partitioning');
  }
  // Build both the RPC registry and the distributed code from the original
  // compiler-generated snapshot. Never read the caller's mutable facade code
  // again after validation: a getter could return benign code during a check
  // and private source to the eventual HTTP handler.
  const trusted=/** @type {ScoGraphPartition} */ (JSON.parse(snapshot));
  // Capture routePrefix exactly once, including inherited and non-enumerable
  // getters that an ordinary spread would discard. Endpoint validation and
  // the HTTP handler must receive the same authoritative route.
  const {routePrefix,...remainingOptions}=options;
  const stableOptions={...remainingOptions,routePrefix};
  // The graph helper spreads own enumerable options; an inherited or
  // nonenumerable admission policy would otherwise silently disappear,
  // forfeiting the promised pre-queue denial. Capture it exactly once
  // without re-reading an already-copied own accessor.
  if(!Object.hasOwn(stableOptions,'admitRpcEarly')&&
     Reflect.has(options,'admitRpcEarly')){
    stableOptions.admitRpcEarly=Reflect.get(options,'admitRpcEarly');
  }
  const expectedEndpoint=(routePrefix??'/obfs/')+'rpc';
  for(const filename of trusted.exposedPaths){
    if(trusted.partitions[filename]?.endpoint!==expectedEndpoint){
      throw new TypeError('SCO graph RPC endpoint does not match routePrefix: '+filename);
    }
  }
  const remoteMethods=bindScoGraphExports(trusted,namespaces);
  return createScoHandler(trusted.clientFiles,{
    ...stableOptions,
    publicPaths:[...trusted.exposedPaths],
    remoteMethods
  });
}

module.exports={partitionScoAsyncGraph,bindScoGraphExports,createScoGraphHandler};
