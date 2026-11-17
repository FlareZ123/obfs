'use strict';

const {randomBytes,createHash} = require('node:crypto');
const {isUtf8} = require('node:buffer');
const {parse,walk,applyEdits,observesFunctionSource,observesDistributedSource} = require('./ast');
const {obfuscateFiles,safePath} = require('./core');
const {renameCrossFileProperties,collectVerifiedImportedStrings,collectVerifiedImportedCloneAliases} = require('./cross-properties');
const {getScoBatchCalls} = require('./rpc-batch');
const {ScoIsolationBusyError} = require('./rpc-keyed-isolation');
const {assertNoSourceMapDisclosure} = require('./source-maps');

/** @typedef {import('./core').SourceFile} SourceFile */
/**
 * @typedef {Object} ScoOptions
 * @property {string[]} [allowedHosts] HTTP Host-header routing filter only; a
 *   requester can forge this header, so it is not an authorization boundary.
 *   Use authorizeRead, authorizeRpc and authorizeOperation for server policy.
 * @property {string} [routePrefix]
 * @property {string[]} [publicPaths] Exact, opt-in allowlist of every file
 *   deliberately distributed through this SCO handler. Rejects accidental
 *   extra source files even when a private dependency was not discovered.
 * @property {boolean} [closedWorld]
 * @property {Record<string,(...args:any[])=>unknown|Promise<unknown>>} [remoteMethods]
 * @property {(request:import('node:http').IncomingMessage)=>boolean|Promise<boolean>} [authorizeRpc]
 * @property {(request:import('node:http').IncomingMessage,method:string,args:unknown[])=>boolean|Promise<boolean>} [authorizeOperation]
 * @property {(request:import('node:http').IncomingMessage)=>boolean|Promise<boolean>} [authorizeRead]
 * @property {number} [maxRpcBytes]
 * @property {(request:import('node:http').IncomingMessage,execute:()=>Promise<void>)=>Promise<void>} [runRpcIsolated]
 */

/**
 * HTTP JSON helper that suppresses internal exception information.
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {unknown} payload
 * @returns {void}
 */
function respondJson(response,status,payload) {
  // Serialize before committing the HTTP status. BigInt and cycles can throw.
  const body=JSON.stringify(payload);
  response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  response.end(body);
}

/**
 * Execute one authenticated server-resident operation, never shipping its
 * implementation to the browser. The caller controls operation granularity,
 * because network overhead can exceed the 2.5x runtime budget for tiny calls.
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {Required<Pick<ScoOptions,'remoteMethods'|'authorizeRpc'>> & Pick<ScoOptions,'maxRpcBytes'|'authorizeOperation'|'runRpcIsolated'>} options
 * @returns {Promise<void>}
 */
async function handleRpc(request,response,options) {
  try {
    // Authorization callbacks must return true explicitly: truthy objects,
    // strings and numeric values are insufficient proof of permission.
    // Preserve the early coarse denial path when no isolation callback is
    // configured. With isolation, authorization occurs inside its critical
    // section after bounded request parsing, avoiding stale policy snapshots.
    if (!options.runRpcIsolated && (await options.authorizeRpc(request))!==true) {
      respondJson(response,403,{ok:false,error:'Forbidden'});
      return;
    }
    const mediaType=String(request.headers['content-type']||'').split(';',1)[0].trim().toLowerCase();
    if (mediaType!=='application/json') {
      respondJson(response,415,{ok:false,error:'Expected JSON'});
      return;
    }
    const maxBytes=options.maxRpcBytes??65536;
    /** @type {Buffer[]} */
    const chunks=[];
    let bytes=0;
    for await(const chunk of request) {
      bytes+=chunk.length;
      if (bytes>maxBytes) {
        respondJson(response,413,{ok:false,error:'Request too large'});
        return;
      }
      chunks.push(chunk);
    }
    /** @type {{method?:unknown,args?:unknown}} */
    let query;
    /** @type {string} */
    let jsonText;
    try {
      // Buffer.toString('utf8') replaces malformed octets with U+FFFD.
      // Reject malformed JSON transport bytes before they can be mistaken for
      // an intentionally submitted replacement character in policy arguments.
      const raw=Buffer.concat(chunks);
      if(!isUtf8(raw))throw new SyntaxError('Invalid UTF-8 JSON');
      jsonText=raw.toString('utf8');
      query=JSON.parse(jsonText);
    } catch (error) {
      respondJson(response,400,{ok:false,error:'Malformed JSON'});
      return;
    }
    if (!query || typeof query !== 'object' || typeof query.method!=='string' ||
        !Object.hasOwn(options.remoteMethods,query.method) || !Array.isArray(query.args)) {
      respondJson(response,400,{ok:false,error:'Unknown method or invalid arguments'});
      return;
    }
    // Preserve JSON-validation narrowing across the async isolation closure.
    const method=/** @type {string} */ (query.method);
    const args=/** @type {unknown[]} */ (query.args);
    const task=options.remoteMethods[method];
    if (typeof task!=='function') {
      respondJson(response,400,{ok:false,error:'Unknown method'});
      return;
    }
    // Run the coarse gate, all inner policy checks and the actual task under
    // the same application-supplied isolation scope. A server-supplied mutex
    // or transaction can then serialize state-changing RPCs for one identity.
    // The isolation scope becomes invalid the moment its wrapper returns.
    // Recheck at every async boundary before more policy or private work.
    let scopeOpen=true;
    const ensureScopeOpen=()=>{
      if(!scopeOpen)throw new TypeError('RPC isolation execution scope has closed');
    };
    const execute=async()=>{
    if (options.runRpcIsolated) {
      const authorized=await options.authorizeRpc(request);
      ensureScopeOpen();
      if(authorized!==true) {
        respondJson(response,403,{ok:false,error:'Forbidden'});
        return;
      }
    }
    // Registered batches with an argument-aware policy require three
    // independent views of the exact validated JSON text: outer policy,
    // inner policy, and execution. Native JSON.parse preserves deep nesting
    // and parsed numeric values without custom recursive clone machinery.
    // No extra parsing happens for unrecognized methods or absent policy.
    const needsBatchViews=options.authorizeOperation &&
      getScoBatchCalls(task,args)!==null;
    const checkedBatchArgs=needsBatchViews ?
      /** @type {unknown[]} */ (JSON.parse(jsonText).args):null;
    const innerPolicyArgs=needsBatchViews ?
      /** @type {unknown[]} */ (JSON.parse(jsonText).args):null;
    // Route-aware, argument-aware authorization is an independent gate after
    // strict JSON and method validation and before any protected side effects.
    if (options.authorizeOperation) {
      const operationAllowed=await options.authorizeOperation(request,method,args);
      ensureScopeOpen();
      if(operationAllowed!==true) {
        respondJson(response,403,{ok:false,error:'Forbidden'});
        return;
      }
      // A permitted batch route is not blanket permission for its individual
      // operations. Check every registered inner method before the batch
      // executes, including later items after an otherwise permitted item.
      const batchCalls=getScoBatchCalls(task,innerPolicyArgs??args);
      if (batchCalls) {
        for (const call of batchCalls) {
          // The batch helper independently rejects malformed calls before
          // execution. Only valid item shapes can reach policy evaluation.
          if (!call || typeof call!=='object' ||
              typeof call.method!=='string' || !Array.isArray(call.args)) continue;
          // This policy-only parsed graph is never passed to the executor.
          // A mutation of this item's arguments cannot change private work.
          const itemAllowed=await options.authorizeOperation(request,call.method,call.args);
          ensureScopeOpen();
          if(itemAllowed!==true) {
            respondJson(response,403,{ok:false,error:'Forbidden'});
            return;
          }
        }
      }
    }
    ensureScopeOpen();
    const result=await task(...(checkedBatchArgs??args));
    ensureScopeOpen();
    respondJson(response,200,{ok:true,value:result});
    };
    if(options.runRpcIsolated) {
      // A trusted integrator callback MUST await execute exactly once and
      // hold whatever transaction or lock is needed until it settles.
      let invoked=false;
      let executionSettled=false;
      // The execution capability is limited to the callback's active scope.
      // A detached promise must never authorize additional private work.
      try{
        await options.runRpcIsolated(request,()=>{
          const pending=(async()=>{
            ensureScopeOpen();
            if(invoked)throw new TypeError('RPC isolation callback invoked execute twice');
            invoked=true;
            try{
              await execute();
            }finally{
              executionSettled=true;
            }
          })();
          // A broken integrator can discard the callback's promise. Observe
          // its eventual rejection to avoid crashing the trusted Node server
          // under strict unhandled-rejection policy, while returning the
          // original rejecting promise to correctly awaiting integrations.
          void pending.catch(()=>{});
          return pending;
        });
      }catch(error){
        // A capacity refusal happens before any protected operation starts.
        // Do not expose errors raised by a running private method as 429.
        if(!invoked && error instanceof ScoIsolationBusyError){
          respondJson(response,429,{ok:false,error:'Too many requests'});
          return;
        }
        throw error;
      }finally{
        scopeOpen=false;
      }
      if(!invoked)throw new TypeError('RPC isolation callback omitted execute');
      if(!executionSettled)throw new TypeError('RPC isolation callback returned before execute settled');
      if(!response.headersSent && !response.destroyed) {
        throw new TypeError('RPC isolation callback completed without an HTTP response');
      }
    } else await execute();
  } catch (error) {
    // Server-resident exceptions must never be classified by their type.
    // The only caller-visible 400 SyntaxError is a malformed JSON request.
    if (!response.headersSent && !response.destroyed) {
      respondJson(response,500,{ok:false,error:'Operation failed'});
    } else response.destroy();
  }
}

/**
 * Vary string spelling with no runtime decoder in the SCO client.
 * @param {string} source
 * @param {'script'|'module'|'commonjs'} sourceType
 * @param {string} nonce
 * @returns {string}
 */
function varyLiteralSpellings(source,sourceType,nonce) {
  const ast=parse(source,sourceType);
  // Function#toString exposes exact source spelling. The core passes already
  // opt out in this case, so SCO's per-request variant pass must follow suit.
  if(observesFunctionSource(ast))return source;
  const entropy=createHash('sha256').update(nonce).digest();
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  walk(ast,(node,parent,key)=>{
    if(node.type!=='Literal' || typeof node.value!=='string' || !node.value.length ||
       !(parent?.type==='AssignmentExpression' && key==='right' ||
         parent?.type==='VariableDeclarator' && key==='init')) return;
    let spelling='"';
    for(let i=0;i<node.value.length;i++) {
      const unit=node.value.charCodeAt(i);
      if(unit>=32 && unit<=126 && unit!==34 && unit!==92 &&
          (entropy[(i+node.start)%entropy.length]&1)) spelling+=String.fromCharCode(unit);
      else spelling+='\\u'+unit.toString(16).padStart(4,'0');
    }
    spelling+='"';
    edits.push({start:node.start,end:node.end,text:spelling});
  });
  return applyEdits(source,edits);
}

/**
 * Decode one URL pathname segment at a time. WHATWG URL.pathname still
 * contains percent escapes, including those for ordinary Unicode filenames.
 * Never allow an encoded slash or backslash to alias a different public file.
 * The route namespace is already checked before this helper is used.
 * @param {string} encodedName
 * @returns {string|null}
 */
function decodePublicName(encodedName) {
  /** @type {string[]} */
  const segments=[];
  for(const encoded of encodedName.split('/')) {
    /** @type {string} */
    let segment;
    try {
      segment=decodeURIComponent(encoded);
    } catch (error) {
      return null;
    }
    if(segment==='.'||segment==='..'||/[\\/\x00]/u.test(segment))return null;
    segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Copy private source-manifest entries by their indexed values once.
 * User-owned array methods, iterators and species constructors are not
 * publication-policy authorities; each listed element is copied as data.
 * @template T
 * @param {T[]} declared
 * @returns {T[]}
 */
function snapshotMetadataEntries(declared) {
  /** @type {T[]} */
  const owned=[];
  const length=declared.length;
  for(let index=0;index<length;index++)owned.push(declared[index]);
  return owned;
}

/**
 * Create a polymorphic SCO handler. The serving machine keeps the obfuscator
 * and optional remoteMethods implementations, mutating client code per GET.
 * RPC is disabled unless BOTH remoteMethods and an authorization callback exist.
 * @param {SourceFile[]} sourceFiles
 * @param {ScoOptions} [options]
 * @returns {import('node:http').RequestListener}
 */
function createScoHandler(sourceFiles,options={}) {
  const prefix = options.routePrefix ?? '/obfs/';
  if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new TypeError('routePrefix must start and end with /');
  if (options.remoteMethods && typeof options.authorizeRpc!=='function') {
    throw new TypeError('Remote operations require authorizeRpc');
  }
  if (options.authorizeRead !== undefined && typeof options.authorizeRead!=='function') {
    throw new TypeError('authorizeRead must be a function');
  }
  if (options.authorizeOperation !== undefined && typeof options.authorizeOperation!=='function') {
    throw new TypeError('authorizeOperation must be a function');
  }
  if (options.runRpcIsolated !== undefined && typeof options.runRpcIsolated!=='function') {
    throw new TypeError('runRpcIsolated must be a function');
  }
  if (options.maxRpcBytes !== undefined && (!Number.isSafeInteger(options.maxRpcBytes) || options.maxRpcBytes<1)) {
    throw new TypeError('maxRpcBytes must be a positive integer');
  }
  if(!Array.isArray(sourceFiles))throw new TypeError('SCO sourceFiles must be an array');
  // Both manifest proof and published file normalization must inspect the
  // same indexed inventory. Caller-owned map/iterator overrides cannot
  // silently change which array entries appear at either phase.
  const files=snapshotMetadataEntries(sourceFiles);
  // An explicit positive publication boundary can protect source files that
  // no static private dependency audit could discover. Build the allowlist
  // from independently reviewed public entrypoints and assets, not from
  // whatever sourceFiles happened to be supplied to this handler.
  /** @type {Set<string>|null} */
  const publicAllowlist=options.publicPaths===undefined?null:new Set();
  if(publicAllowlist){
    if(!Array.isArray(options.publicPaths)){
      throw new TypeError('SCO publicPaths must be an array');
    }
    const seenPublic=new Set();
    for(const item of options.publicPaths){
      const filename=safePath(item);
      if(seenPublic.has(filename.toLowerCase())){
        throw new TypeError('Duplicate SCO publicPaths entry: '+filename);
      }
      seenPublic.add(filename.toLowerCase());
      publicAllowlist.add(filename);
    }
  }
  // Generated selective SCO files carry direct server-private module paths.
  // Refuse an accidentally co-served private dependency before constructing
  // any HTTP route, even if the private entry appears before its public facade.
  const forbidden=new Set();
  const privateOriginalDigests=new Set();
  // Read each caller-managed manifest getter only once. Multiple reads can
  // disagree, leaving a declared private source outside the forbidden sets.
  // Keep owned array copies for every later check and publication pass.
  /** @type {Array<{paths:string[]|undefined,digests:string[]|undefined}>} */
  const privateMetadata=files.map(file=>{
    const providedDigests=file.privateOriginalDigests;
    const providedPaths=file.privateModulePaths;
    /** @type {string[]|undefined} */
    let digests;
    if(providedDigests!==undefined){
      if(!Array.isArray(providedDigests)){
        throw new TypeError('SCO privateOriginalDigests must be SHA-256 hex strings');
      }
      // Snapshot index accessors once, then validate exactly the bytes used
      // by the publication policy. Getter values may differ on later reads.
      digests=snapshotMetadataEntries(providedDigests);
      if(digests.some(value=>typeof value!=='string'||
          !/^[0-9a-f]{64}$/u.test(value))){
        throw new TypeError('SCO privateOriginalDigests must be SHA-256 hex strings');
      }
      for(const digest of digests)privateOriginalDigests.add(digest);
    }
    /** @type {string[]|undefined} */
    let paths;
    if(providedPaths!==undefined){
      if(!Array.isArray(providedPaths)){
        throw new TypeError('SCO privateModulePaths must be an array');
      }
      paths=snapshotMetadataEntries(providedPaths).map(safePath);
      for(const privatePath of paths)forbidden.add(privatePath.toLowerCase());
    }
    return {paths,digests};
  });
  // Validate the public route namespace before creating the HTTP handler.
  // Exact duplicates silently overwrite Map values, and case-folded aliases
  // may collide when the source group is deployed on Windows.
  const seen=new Set();
  /** @type {import('./cross-properties').SourceFile[]} */
  const normalized=files.map((file,index)=>{
    const filename=safePath(file.path);
    const collisionKey=filename.toLowerCase();
    if(publicAllowlist&&!publicAllowlist.has(filename)){
      throw new TypeError('SCO source is not in publicPaths: '+filename);
    }
    if(forbidden.has(collisionKey))throw new TypeError('SCO must not serve private source: '+filename);
    if(seen.has(collisionKey))throw new TypeError('Duplicate file '+filename);
    // Snapshot caller-controlled source exactly once before publication
    // policy checks and source scanning. This prevents a getter that returns
    // different values on successive reads from invalidating source proofs.
    const suppliedCode=file.code;
    if(typeof suppliedCode!=='string'&&!Buffer.isBuffer(suppliedCode)){
      throw new TypeError(filename+' content must be a string or Buffer');
    }
    const code=Buffer.isBuffer(suppliedCode)?Buffer.from(suppliedCode):suppliedCode;
    // Reject byte-exact original sources from any supplied private SCO graph,
    // even if an original exposed module replaced its generated facade or a
    // server-only dependency was copied under a new public path.
    if(privateOriginalDigests.has(createHash('sha256').update(code).digest('hex'))){
      throw new TypeError('SCO must not serve original private graph source: '+filename);
    }
    seen.add(collisionKey);
    const sourceType=file.sourceType ??
      (filename.endsWith('.mjs')?'module':filename.endsWith('.cjs')?'commonjs':'script');
    if(!['module','script','commonjs','asset'].includes(sourceType)){
      throw new TypeError('Unknown source type '+sourceType);
    }
    if(sourceType!=='asset'&&typeof code!=='string'){
      throw new TypeError(filename+' JavaScript must be UTF-8 text');
    }
    // Build only the documented SourceFile fields: spreading the caller's
    // object would invoke a code getter again even after taking the snapshot.
    const normalizedFile = {path:filename,code,sourceType,
      privateModulePaths:privateMetadata[index].paths,
      privateOriginalDigests:privateMetadata[index].digests};
    assertNoSourceMapDisclosure(normalizedFile);
    return normalizedFile;
  });
  if(publicAllowlist&&publicAllowlist.size!==normalized.length){
    throw new TypeError('SCO publicPaths must exactly match supplied sourceFiles');
  }
  // Another served module can inspect an exported function's exact source.
  // A per-file request cannot see that observer, so suppress source-spelling
  // transformations for the whole published group when one is present.
  const importedKeyProof=options.closedWorld ?
    collectVerifiedImportedStrings(normalized) : new Map();
  const importedCloneProof=normalized.length>1 ?
    collectVerifiedImportedCloneAliases(normalized) : new Map();
  const interfileSourceObserver=normalized.some(file=>
    file.sourceType!=='asset' && typeof file.code==='string' &&
    (observesDistributedSource(parse(file.code,file.sourceType),importedKeyProof.get(file.path)) ||
      normalized.length>1 && observesFunctionSource(parse(file.code,file.sourceType),
        importedKeyProof.get(file.path),importedCloneProof.get(file.path))));
  if(interfileSourceObserver && options.allowedHosts?.length) {
    throw new TypeError('Host locking cannot preserve observable source bytes');
  }
  const prepared = options.closedWorld ? renameCrossFileProperties(normalized,randomBytes(24).toString('hex')).files : normalized;
  const inputs = new Map(prepared.map(f=>[f.path,f]));
  // The server's admission and authorization configuration belongs to this
  // handler instance. Keep an owned startup snapshot so later mutations of a
  // caller's options, host array or operation registry cannot silently change
  // which requests and server-resident functions the handler authorizes.
  // Callbacks themselves remain live functions for normal credential rotation.
  /** @type {ScoOptions} */
  const policy={...options,
    allowedHosts:options.allowedHosts?[...options.allowedHosts]:undefined,
    // Preserve exact method identity. Batch policy preflight uses a private
    // WeakMap on original function objects; binding/wrapping a method loses
    // its verified transitive operation metadata and is unsafe.
    remoteMethods:options.remoteMethods?{...options.remoteMethods}:undefined};
  return (request,response) => {
    // Node's HTTP parser accepts some malformed absolute-form request targets.
    // WHATWG URL parsing may throw; treat the target as a bad request instead
    // of allowing an uncaught exception to terminate the server process.
    /** @type {URL} */
    let url;
    try {
      url=new URL(request.url ?? '/', 'http://localhost');
    } catch (error) {
      response.writeHead(400,{'cache-control':'no-store'}).end();
      return;
    }
    if (!url.pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    if (policy.allowedHosts?.length) {
      const hostname = (request.headers.host ?? '').split(':')[0].toLowerCase();
      if (!policy.allowedHosts.map(h=>h.toLowerCase()).includes(hostname)) {
        response.writeHead(403).end();
        return;
      }
    }
    if (url.pathname===`${prefix}rpc` && request.method==='POST' && policy.remoteMethods && policy.authorizeRpc) {
      void handleRpc(request,response,{
        remoteMethods:policy.remoteMethods,
        authorizeRpc:policy.authorizeRpc,
        authorizeOperation:policy.authorizeOperation,
        runRpcIsolated:policy.runRpcIsolated,
        maxRpcBytes:policy.maxRpcBytes
      });
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405,{'allow':'GET, POST'}).end();
      return;
    }
    const name=decodePublicName(url.pathname.slice(prefix.length));
    if(name===null) {
      response.writeHead(400,{'cache-control':'no-store'}).end();
      return;
    }
    const file = inputs.get(name);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    /** @param {NonNullable<typeof file>} confirmedFile */
    function serve(confirmedFile) {
      if (confirmedFile.sourceType === 'asset') {
        const contentType = confirmedFile.path.endsWith('.json') ? 'application/json' :
          confirmedFile.path.endsWith('.css') ? 'text/css' :
            confirmedFile.path.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        response.writeHead(200,{'content-type':contentType,'cache-control':'no-store','x-content-type-options':'nosniff'});
        response.end(confirmedFile.code);
        return;
      }
      try {
        const nonce=randomBytes(24).toString('hex');
        const result=obfuscateFiles([confirmedFile],{
          mode:'sco',seed:nonce,allowedHosts:policy.allowedHosts,
          properties:!interfileSourceObserver,identifiers:!interfileSourceObserver
        });
        const output=/** @type {string} */ (result.files[0].code);
        const varied=interfileSourceObserver ? output :
          varyLiteralSpellings(output,confirmedFile.sourceType,nonce);
        response.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
        // The per-request seed is private server state. Publishing it would
        // let source-only adversaries verify candidate hashed names offline.
        response.end(varied);
      } catch (error) {
        response.writeHead(500,{'content-type':'text/plain; charset=utf-8'});
        response.end('Obfuscation failed');
      }
    }
    const authorizeRead=policy.authorizeRead;
    if (!authorizeRead) {
      serve(file);
      return;
    }
    // Authentication runs before delivering source or assets; failure closes access.
    void Promise.resolve().then(()=>authorizeRead(request)).then(allowed=>{
      if (response.destroyed) return;
      if (allowed!==true) {
        response.writeHead(403,{'cache-control':'no-store'}).end();
        return;
      }
      serve(file);
    }).catch(()=>{
      if (!response.headersSent && !response.destroyed) response.writeHead(500).end();
      else response.destroy();
    });
  };
}

module.exports = {createScoHandler};
