'use strict';

const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {parse,walk,staticString}=require('./ast');
const {safePath}=require('./core');
const {createScoHandler}=require('./sco');
const {partitionScoAsyncModule,bindScoModuleExports}=require('./sco-partition');

/** @typedef {{path:string,code:string,sourceType?:'module'}} ScoPrivateModule */
/** @typedef {import('./sco-partition').ScoModulePartition} ScoModulePartition */
/** @typedef {{seed?:string,endpoint?:string,exposedPaths:string[]}} ScoGraphOptions */
/**
 * @typedef {{
 *   clientFiles:ScoModulePartition['clientFile'][],
 *   partitions:Record<string,ScoModulePartition>,
 *   exposedPaths:string[],
 *   privatePaths:string[]
 * }} ScoGraphPartition
 */

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
  if(specifier.startsWith('node:'))return;
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

/**
 * Compose the existing strict single-module SCO async partitioner over a
 * closed private ESM graph. Only explicitly exposed modules receive public
 * facades. All private imports, secret constants, and non-export modules stay
 * server-resident. A real server must load the original graph from a private
 * directory; this function does not start a server or authenticate clients.
 *
 * The graph proof rejects unresolved relative imports and dynamic import
 * expressions. Only node: and explicit relative .mjs dependencies are
 * accepted. It never infers that a source file is safe to publish from the
 * mere presence of an export.
 *
 * @param {ScoPrivateModule[]} files
 * @param {ScoGraphOptions} options
 * @returns {ScoGraphPartition}
 */
function partitionScoAsyncGraph(files,options) {
  if(!Array.isArray(files)||!files.length||!options||
      !Array.isArray(options.exposedPaths)||!options.exposedPaths.length ||
      options.exposedPaths.some(name=>typeof name!=='string')||
      options.seed!==undefined && (typeof options.seed!=='string'||!options.seed)) {
    throw new TypeError('Expected a private ESM graph and explicit exposedPaths');
  }
  /** @type {Map<string,ScoPrivateModule>} */
  const modules=new Map();
  /** @type {Set<string>} */
  const folded=new Set();
  for(const file of files){
    if(!file||typeof file.code!=='string'||
        file.sourceType!==undefined&&file.sourceType!=='module') {
      throw new TypeError('Private SCO graph requires ESM text files');
    }
    const filename=safePath(file.path);
    if(!filename.endsWith('.mjs'))throw new TypeError('Private SCO graph supports only .mjs files');
    const lower=filename.toLowerCase();
    if(folded.has(lower))throw new TypeError('Duplicate private graph path: '+filename);
    folded.add(lower);
    modules.set(filename,{path:filename,code:file.code,sourceType:'module'});
  }
  const names=new Set(modules.keys());
  for(const [filename,file] of modules) {
    const ast=parse(file.code,'module');
    walk(ast,node=>{
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
  for(const entry of options.exposedPaths) {
    const filename=safePath(entry);
    if(!modules.has(filename)||selected.has(filename)) {
      throw new TypeError('Missing or duplicate exposed private graph entry: '+filename);
    }
    selected.add(filename);
  }
  const seed=options.seed??randomBytes(32).toString('hex');
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
      seed,endpoint:options.endpoint,serverOnlyInitialization:true
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
  const privateOriginalDigests=[...modules.values()].map(file=>
    createHash('sha256').update(file.code,'utf8').digest('hex'));
  // The handler already refuses to co-publish explicitly marked private
  // paths. Carry the closed graph's non-exposed paths on each generated
  // facade, so accidentally adding an original private dependency to the
  // same handler fails before any HTTP source route exists. Each facade must
  // independently retain this proof even if the caller selects just one.
  for(const clientFile of clientFiles) {
    clientFile.privateModulePaths=[...privatePaths];
    clientFile.privateOriginalDigests=[...privateOriginalDigests];
  }
  return {
    clientFiles,partitions,exposedPaths:[...selected],privatePaths
  };
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
  const expectedEndpoint=(options.routePrefix??'/obfs/')+'rpc';
  for(const filename of graph.exposedPaths){
    if(graph.partitions[filename]?.endpoint!==expectedEndpoint){
      throw new TypeError('SCO graph RPC endpoint does not match routePrefix: '+filename);
    }
  }
  const remoteMethods=bindScoGraphExports(graph,namespaces);
  return createScoHandler(graph.clientFiles,{
    ...options,
    publicPaths:[...graph.exposedPaths],
    remoteMethods
  });
}

module.exports={partitionScoAsyncGraph,bindScoGraphExports,createScoGraphHandler};
