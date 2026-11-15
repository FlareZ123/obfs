'use strict';

const {randomBytes} = require('node:crypto');
const {obfuscateFiles} = require('./core');
const {renameCrossFileProperties} = require('./cross-properties');

/**
 * Create a request-time polymorphic SCO handler. The obfuscator library lives
 * on the serving machine. Each request receives a fresh encoding permutation.
 * @param {import('./core').SourceFile[]} sourceFiles
 * @param {{allowedHosts?:string[],routePrefix?:string,closedWorld?:boolean}} [options]
 * @returns {import('node:http').RequestListener}
 */
function createScoHandler(sourceFiles,options={}) {
  const prefix = options.routePrefix ?? '/obfs/';
  if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw new TypeError('routePrefix must start and end with /');
  const prepared = options.closedWorld ? renameCrossFileProperties(sourceFiles,randomBytes(24).toString('hex')).files : sourceFiles;
  const inputs = new Map(prepared.map(f=>[f.path,f]));
  return (request,response) => {
    if (request.method !== 'GET') {
      response.writeHead(405,{'allow':'GET'}).end();
      return;
    }
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const name = url.pathname.slice(prefix.length);
    const file = inputs.get(name);
    if (!file) {
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
