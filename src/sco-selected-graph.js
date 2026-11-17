'use strict';

const {createHash}=require('node:crypto');
const {safePath}=require('./core');
const {createScoHandler}=require('./sco');
const {bindScoModuleExports}=require('./sco-partition');
const {partitionScoSelectedAsyncExports}=require('./sco-selective-partition');

/** @typedef {import('./sco-selective-partition').ScoSelectiveOptions} ScoSelectiveOptions */
/** @typedef {import('./sco-selective-partition').ScoSelectivePartition} ScoSelectivePartition */
/** @typedef {{file:{path:string,code:string,sourceType?:'module'},options:ScoSelectiveOptions}} ScoSelectedGraphUnit */
/** @typedef {{path:string,sha256:string}} ScoPrivateSourceDigest */
/**
 * @typedef {{
 *   clientFiles:ScoSelectivePartition['clientFile'][],
 *   partitions:Record<string,ScoSelectivePartition>,
 *   exposedPaths:string[],
 *   privatePaths:string[],
 *   privateSourceDigests:ScoPrivateSourceDigest[]
 * }} ScoSelectedGraph
 */

/**
 * A compiler-owned immutable serialization of the reviewed output. A caller
 * can inspect or accidentally mutate the returned graph but cannot persuade
 * the paired handler to publish those replacement bytes.
 * @type {WeakMap<ScoSelectedGraph,string>}
 */
const generatedSnapshots=new WeakMap();

/**
 * Compose independent, selectively partitioned ESM modules into one SCO
 * publication. Each unit's original private dependencies are audited by the
 * existing single-module partitioner. Public functions may call selected
 * private exports within their own unit; public cross-unit ESM imports are
 * intentionally outside that partitioner's present grammar.
 *
 * Original source is never published by this function. The returned digests
 * are startup consistency commitments, not protection against a compromised
 * trusted server or the authorized online-relay attacker.
 *
 * @param {ScoSelectedGraphUnit[]} units
 * @returns {ScoSelectedGraph}
 */
function partitionScoSelectedGraph(units){
  if(!Array.isArray(units)||units.length===0){
    throw new TypeError('Selected SCO graph requires at least one module');
  }
  /** @type {Record<string,ScoSelectivePartition>} */
  const partitions=Object.create(null);
  /** @type {ScoSelectivePartition['clientFile'][]} */
  const clientFiles=[];
  /** @type {string[]} */
  const exposedPaths=[];
  /** @type {Set<string>} */
  const privatePaths=new Set();
  /** @type {Map<string,string>} */
  const foldedPaths=new Map();
  /** @type {Map<string,string>} */
  const digestByPath=new Map();
  /** @type {Set<string>} */
  const methodIds=new Set();

  /**
   * Paths are case-insensitive for collision admission even when the runtime
   * filesystem itself is case-sensitive.
   * @param {string} filename
   * @returns {string}
   */
  function recordPath(filename){
    const normalized=safePath(filename);
    if(normalized!==filename||!normalized.endsWith('.mjs')){
      throw new TypeError('Selected SCO graph requires canonical .mjs paths');
    }
    const folded=normalized.toLowerCase();
    const existing=foldedPaths.get(folded);
    if(existing!==undefined&&existing!==normalized){
      throw new TypeError('Case-colliding selected SCO module path: '+filename);
    }
    foldedPaths.set(folded,normalized);
    return normalized;
  }

  for(const unit of units){
    const suppliedFile=unit?.file;
    if(!suppliedFile||typeof suppliedFile!=='object'){
      throw new TypeError('Selected SCO graph needs explicit source units');
    }
    // Capture the file accessor and each source property once. Otherwise
    // a getter could supply different source text for auditing and hashing.
    const file={path:suppliedFile.path,code:suppliedFile.code,
      sourceType:suppliedFile.sourceType};
    const options=unit.options;
    const name=recordPath(file.path);
    if(Object.hasOwn(partitions,name)){
      throw new TypeError('Duplicate selected SCO graph entry: '+name);
    }
    const partition=partitionScoSelectedAsyncExports(file,options);
    if(partition.clientFile.path!==name){
      throw new TypeError('Selected SCO graph changed its public path');
    }
    partitions[name]=partition;
    clientFiles.push(partition.clientFile);
    exposedPaths.push(name);
    for(const id of [...Object.values(partition.methodNames),
      ...(partition.batchMethod?[partition.batchMethod]:[])]){
      if(methodIds.has(id)){
        throw new TypeError('Cross-module selected SCO RPC method collision');
      }
      methodIds.add(id);
    }
    const originalDigest=createHash('sha256').update(file.code,'utf8').digest('hex');
    /** @type {ScoPrivateSourceDigest[]} */
    const declarations=partition.privateSourceDigests??[
      {path:name,sha256:originalDigest}
    ];
    for(const entry of declarations){
      const filename=recordPath(entry.path);
      const previous=digestByPath.get(filename);
      if(previous!==undefined&&previous!==entry.sha256){
        throw new TypeError('Conflicting selected SCO private source digest: '+filename);
      }
      digestByPath.set(filename,entry.sha256);
    }
    for(const privatePath of partition.clientFile.privateModulePaths??[]){
      privatePaths.add(recordPath(privatePath));
    }
  }
  const publicSet=new Set(exposedPaths);
  for(const name of privatePaths){
    if(publicSet.has(name)){
      throw new TypeError('Selected SCO public facade overlaps a private dependency: '+name);
    }
  }
  const privateSourceDigests=[...digestByPath].map(([path,sha256])=>({path,sha256}));
  const privateOriginalDigests=[...new Set(privateSourceDigests.map(entry=>entry.sha256))];
  // Every independently served facade carries the entire graph's private
  // source protections; a caller cannot accidentally drop another unit's
  // private path when constructing a handler from this result.
  for(const file of clientFiles){
    file.privateModulePaths=[...privatePaths];
    file.privateOriginalDigests=[...privateOriginalDigests];
  }
  const graph={clientFiles,partitions,exposedPaths,
    privatePaths:[...privatePaths],privateSourceDigests};
  generatedSnapshots.set(graph,JSON.stringify(graph));
  return graph;
}

/**
 * Bind original server-resident module namespaces to all generated methods.
 * @param {ScoSelectedGraph} graph
 * @param {Record<string,Record<string,unknown>>} namespaces
 * @returns {Record<string,(...args:any[])=>unknown|Promise<unknown>>}
 */
function bindScoSelectedGraphExports(graph,namespaces){
  if(!graph||!Array.isArray(graph.exposedPaths)||!graph.partitions||
     !namespaces||typeof namespaces!=='object'){
    throw new TypeError('Selected SCO graph needs original module namespaces');
  }
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const registry=Object.create(null);
  for(const filename of graph.exposedPaths){
    if(!Object.hasOwn(namespaces,filename)){
      throw new TypeError('Missing selected SCO private namespace: '+filename);
    }
    const partition=graph.partitions[filename];
    if(!partition)throw new TypeError('Missing selected SCO module partition: '+filename);
    const methods=bindScoModuleExports(partition,namespaces[filename]);
    for(const [id,fn] of Object.entries(methods)){
      if(Object.hasOwn(registry,id)){
        throw new TypeError('Cross-module selected SCO method registration collision');
      }
      registry[id]=fn;
    }
  }
  return registry;
}

/**
 * Construct the public HTTP handler exclusively from compiler-owned facade
 * bytes and method IDs. Authorize reads, RPC access and individual operations
 * using trusted server callbacks supplied by the integrator.
 *
 * @param {ScoSelectedGraph} graph
 * @param {Record<string,Record<string,unknown>>} namespaces
 * @param {Omit<import('./sco').ScoOptions,'publicPaths'|'remoteMethods'>} options
 * @returns {import('node:http').RequestListener}
 */
function createScoSelectedGraphHandler(graph,namespaces,options){
  if(!graph||!options||typeof options!=='object'||
     Object.hasOwn(options,'publicPaths')||
     Object.hasOwn(options,'remoteMethods')){
    throw new TypeError('Selected SCO graph handler requires authorized server options');
  }
  const stableOptions={...options};
  const snapshot=generatedSnapshots.get(graph);
  if(snapshot===undefined){
    throw new TypeError('Selected SCO graph handler requires an in-process compiler graph');
  }
  if(JSON.stringify(graph)!==snapshot){
    throw new TypeError('Selected SCO graph manifest was modified after partitioning');
  }
  const trusted=/** @type {ScoSelectedGraph} */ (JSON.parse(snapshot));
  const expectedEndpoint=(stableOptions.routePrefix??'/obfs/')+'rpc';
  for(const name of trusted.exposedPaths){
    if(trusted.partitions[name]?.endpoint!==expectedEndpoint){
      throw new TypeError('Selected SCO graph RPC endpoint does not match routePrefix: '+name);
    }
  }
  const remoteMethods=bindScoSelectedGraphExports(trusted,namespaces);
  return createScoHandler(trusted.clientFiles,{
    ...stableOptions,publicPaths:[...trusted.exposedPaths],remoteMethods
  });
}

module.exports={partitionScoSelectedGraph,bindScoSelectedGraphExports,
  createScoSelectedGraphHandler};
