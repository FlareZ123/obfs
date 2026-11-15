'use strict';
const crypto = require('node:crypto');
const http = require('node:http');
const { transform } = require('./transform');
const { withHostGate } = require('./build');

/** @param {string} candidate @param {string} expected @returns {boolean} */
function authorized(candidate, expected) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}
/**
 * SCO service keeps the compiler and per-request transformation secret on a
 * server. The bearer token authenticates the *builder* rather than clients.
 * @param {{token: string, maxBytes?: number}} config
 * @returns {import('node:http').Server}
 */
function createScoServer(config) {
  if (!config.token || config.token.length < 24) throw new Error('SCO token must contain at least 24 characters');
  const maxBytes = config.maxBytes ?? 2_000_000;
  return http.createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status,{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });res.end(JSON.stringify(body)); };
    if (req.method !== 'POST' || req.url !== '/obfuscate') return send(404,{error:'Not found'});
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ') || !authorized(header.slice(7),config.token)) return send(401,{error:'Unauthorized'});
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (Buffer.byteLength(body) > maxBytes) return send(413,{error:'Request too large'});
      }
      const request = JSON.parse(body);
      if (!request.files || typeof request.files !== 'object' || Array.isArray(request.files)) return send(400,{error:'files must be a name-to-source map'});
      const result = transform(request.files, {seed:crypto.randomBytes(32).toString('hex'),closedWorld:request.closedWorld === true});
      if (request.allowedHost) {
        for (const name of Object.keys(result.files)) result.files[name] = withHostGate(result.files[name],'coo',request.allowedHost);
      }
      return send(200,result);
    } catch (error) { return send(400,{error:error.message}); }
  });
}
module.exports = { createScoServer };
