'use strict';

const {randomBytes,createHash} = require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource} = require('./ast');
const {obfuscateFiles} = require('./core');
const {renameCrossFileProperties} = require('./cross-properties');

/** @typedef {import('./core').SourceFile} SourceFile */
/**
 * @typedef {Object} ScoOptions
 * @property {string[]} [allowedHosts]
 * @property {string} [routePrefix]
 * @property {boolean} [closedWorld]
 * @property {Record<string,(...args:any[])=>unknown|Promise<unknown>>} [remoteMethods]
 * @property {(request:import('node:http').IncomingMessage)=>boolean|Promise<boolean>} [authorizeRpc]
 * @property {(request:import('node:http').IncomingMessage,method:string,args:unknown[])=>boolean|Promise<boolean>} [authorizeOperation]
 * @property {(request:import('node:http').IncomingMessage)=>boolean|Promise<boolean>} [authorizeRead]
 * @property {number} [maxRpcBytes]
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
 * @param {Required<Pick<ScoOptions,'remoteMethods'|'authorizeRpc'>> & Pick<ScoOptions,'maxRpcBytes'|'authorizeOperation'>} options
 * @returns {Promise<void>}
 */
async function handleRpc(request,response,options) {
  try {
    if (!await options.authorizeRpc(request)) {
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
    try {
      query=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      respondJson(response,400,{ok:false,error:'Malformed JSON'});
      return;
    }
    if (!query || typeof query !== 'object' || typeof query.method!=='string' ||
        !Object.hasOwn(options.remoteMethods,query.method) || !Array.isArray(query.args)) {
      respondJson(response,400,{ok:false,error:'Unknown method or invalid arguments'});
      return;
    }
    const task=options.remoteMethods[query.method];
    if (typeof task!=='function') {
      respondJson(response,400,{ok:false,error:'Unknown method'});
      return;
    }
    // Route-aware, argument-aware authorization is an independent gate after
    // strict JSON and method validation and before any protected side effects.
    if (options.authorizeOperation && !await options.authorizeOperation(request,query.method,query.args)) {
      respondJson(response,403,{ok:false,error:'Forbidden'});
      return;
    }
    const result=await task(...query.args);
    respondJson(response,200,{ok:true,value:result});
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
  if (options.maxRpcBytes !== undefined && (!Number.isSafeInteger(options.maxRpcBytes) || options.maxRpcBytes<1)) {
    throw new TypeError('maxRpcBytes must be a positive integer');
  }
  /** @type {import('./cross-properties').SourceFile[]} */
  const normalized = sourceFiles.map(file=>({...file,sourceType:file.sourceType ?? (file.path.endsWith('.mjs')?'module' : file.path.endsWith('.cjs')?'commonjs':'script')}));
  const prepared = options.closedWorld ? renameCrossFileProperties(normalized,randomBytes(24).toString('hex')).files : normalized;
  const inputs = new Map(prepared.map(f=>[f.path,f]));
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
    if (options.allowedHosts?.length) {
      const hostname = (request.headers.host ?? '').split(':')[0].toLowerCase();
      if (!options.allowedHosts.map(h=>h.toLowerCase()).includes(hostname)) {
        response.writeHead(403).end();
        return;
      }
    }
    if (url.pathname===`${prefix}rpc` && request.method==='POST' && options.remoteMethods && options.authorizeRpc) {
      void handleRpc(request,response,{
        remoteMethods:options.remoteMethods,
        authorizeRpc:options.authorizeRpc,
        authorizeOperation:options.authorizeOperation,
        maxRpcBytes:options.maxRpcBytes
      });
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405,{'allow':'GET, POST'}).end();
      return;
    }
    const name = url.pathname.slice(prefix.length);
    const file = inputs.get(name);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    /** @param {NonNullable<typeof file>} confirmedFile */
    function serve(confirmedFile) {
      if (confirmedFile.sourceType === 'asset') {
        const contentType = name.endsWith('.json') ? 'application/json' : name.endsWith('.css') ? 'text/css' :
          name.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        response.writeHead(200,{'content-type':contentType,'cache-control':'no-store','x-content-type-options':'nosniff'});
        response.end(confirmedFile.code);
        return;
      }
      try {
        const nonce=randomBytes(24).toString('hex');
        const result=obfuscateFiles([confirmedFile],{mode:'sco',seed:nonce,allowedHosts:options.allowedHosts});
        const output=/** @type {string} */ (result.files[0].code);
        const varied=varyLiteralSpellings(output,confirmedFile.sourceType,nonce);
        response.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
        // The per-request seed is private server state. Publishing it would
        // let source-only adversaries verify candidate hashed names offline.
        response.end(varied);
      } catch (error) {
        response.writeHead(500,{'content-type':'text/plain; charset=utf-8'});
        response.end('Obfuscation failed');
      }
    }
    const authorizeRead=options.authorizeRead;
    if (!authorizeRead) {
      serve(file);
      return;
    }
    // Authentication runs before delivering source or assets; failure closes access.
    void Promise.resolve().then(()=>authorizeRead(request)).then(allowed=>{
      if (response.destroyed) return;
      if (!allowed) {
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
