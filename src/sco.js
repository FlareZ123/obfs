'use strict';

const {randomBytes} = require('node:crypto');
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
  response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  response.end(JSON.stringify(payload));
}

/**
 * Execute one authenticated server-resident operation, never shipping its
 * implementation to the browser. The caller controls operation granularity,
 * because network overhead can exceed the 2.5x runtime budget for tiny calls.
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {Required<Pick<ScoOptions,'remoteMethods'|'authorizeRpc'>> & Pick<ScoOptions,'maxRpcBytes'>} options
 * @returns {Promise<void>}
 */
async function handleRpc(request,response,options) {
  try {
    if (!await options.authorizeRpc(request)) {
      respondJson(response,403,{ok:false,error:'Forbidden'});
      return;
    }
    if (!String(request.headers['content-type']||'').startsWith('application/json')) {
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
    const query=JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
    const result=await task(...query.args);
    respondJson(response,200,{ok:true,value:result});
  } catch (error) {
    // Do not reflect server source code, filenames, stack traces or secrets.
    respondJson(response,error instanceof SyntaxError?400:500,{ok:false,error:'Operation failed'});
  }
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
  if (options.maxRpcBytes !== undefined && (!Number.isSafeInteger(options.maxRpcBytes) || options.maxRpcBytes<1)) {
    throw new TypeError('maxRpcBytes must be a positive integer');
  }
  /** @type {import('./cross-properties').SourceFile[]} */
  const normalized = sourceFiles.map(file=>({...file,sourceType:file.sourceType ?? (file.path.endsWith('.mjs')?'module' : file.path.endsWith('.cjs')?'commonjs':'script')}));
  const prepared = options.closedWorld ? renameCrossFileProperties(normalized,randomBytes(24).toString('hex')).files : normalized;
  const inputs = new Map(prepared.map(f=>[f.path,f]));
  return (request,response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
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
    if (file.sourceType === 'asset') {
      const contentType = name.endsWith('.json') ? 'application/json' : name.endsWith('.css') ? 'text/css' :
        name.endsWith('.html') ? 'text/html' : 'application/octet-stream';
      response.writeHead(200,{'content-type':contentType,'cache-control':'no-store','x-content-type-options':'nosniff'});
      response.end(file.code);
      return;
    }
    try {
      const result = obfuscateFiles([file],{
        mode:'sco',seed:randomBytes(24).toString('hex'),allowedHosts:options.allowedHosts
      });
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
      response.end(result.files[0].code);
    } catch (error) {
      response.writeHead(500,{'content-type':'text/plain; charset=utf-8'});
      response.end('Obfuscation failed');
    }
  };
}

module.exports = {createScoHandler};
