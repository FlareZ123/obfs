'use strict';

const assert = require('node:assert/strict');
const {createHmac, randomBytes, timingSafeEqual} = require('node:crypto');
const {readFileSync} = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');

/** @param {number[]} items @returns {number} */
function median(items) {
  const sorted = [...items].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * A CPU-bound server-private operation. The changing digest makes all rounds
 * input-dependent, and the key is never sent in the HTTP response.
 * @param {Buffer} key
 * @param {string} input
 * @param {number} rounds
 * @returns {string}
 */
function privateOperation(key, input, rounds) {
  let digest = Buffer.from(input, 'utf8');
  for (let i = 0; i < rounds; i++) {
    digest = createHmac('sha256', key).update(digest).digest();
  }
  return digest.toString('hex');
}

/**
 * @param {number} port
 * @param {https.Agent} agent
 * @param {string} authorization
 * @param {number} rounds
 * @param {string} input
 * @returns {Promise<{status:number,payload:any,ms:number}>}
 */
function rpc(port, agent, authorization, rounds, input) {
  const body = JSON.stringify({rounds, input});
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'localhost', port, path: '/rpc', method: 'POST', agent,
      headers: {
        'content-type': 'application/json',
        authorization,
        'content-length': Buffer.byteLength(body)
      }
    }, response => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        try {
          resolve({status: response.statusCode || 0,
            payload: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            ms: performance.now() - started});
        } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

/** Execute certificate-validated local TLS RPC comparisons. */
async function main() {
  const cert = readFileSync(path.join(__dirname, 'fixtures', 'localhost-cert.pem'));
  const key = readFileSync(path.join(__dirname, 'fixtures', 'localhost-key.pem'));
  const secret = randomBytes(32);
  const token = randomBytes(24).toString('hex');
  const tokenBytes = Buffer.from('Bearer ' + token);
  let delayMs = 0;
  let tlsConnections = 0;
  const server = https.createServer({cert, key, minVersion: 'TLSv1.3'}, async (request, response) => {
    try {
      const supplied = Buffer.from(request.headers.authorization || '');
      if (supplied.length !== tokenBytes.length || !timingSafeEqual(supplied, tokenBytes)) {
        response.writeHead(403, {'content-type': 'application/json'}).end('{"ok":false}');
        return;
      }
      if (request.method !== 'POST' || request.url !== '/rpc' ||
          request.headers['content-type'] !== 'application/json') {
        response.writeHead(404, {'content-type': 'application/json'}).end('{"ok":false}');
        return;
      }
      /** @type {Buffer[]} */
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 4096) {
          response.writeHead(413, {'content-type': 'application/json'}).end('{"ok":false}');
          return;
        }
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Number.isSafeInteger(payload.rounds) || payload.rounds < 1 || payload.rounds > 120000 ||
          typeof payload.input !== 'string' || payload.input.length > 100) {
        response.writeHead(400, {'content-type': 'application/json'}).end('{"ok":false}');
        return;
      }
      if (delayMs) await sleep(delayMs);
      response.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'});
      response.end(JSON.stringify({ok:true, value:privateOperation(secret, payload.input, payload.rounds)}));
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(400, {'content-type': 'application/json'}).end('{"ok":false}');
      } else response.destroy();
    }
  });
  server.on('secureConnection', () => { tlsConnections++; });
  await new Promise(resolve => server.listen(0, 'localhost', () => resolve(undefined)));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  const auth = 'Bearer ' + token;
  const warmAgent = new https.Agent({keepAlive: true, maxSockets: 1, ca: cert, minVersion: 'TLSv1.3'});
  const coldAgent = new https.Agent({keepAlive: false, maxSockets: 1, maxCachedSessions: 0, ca: cert, minVersion: 'TLSv1.3'});
  try {
    assert.equal((await rpc(port, warmAgent, 'Bearer incorrect', 1, 'probe')).status, 403);
    // Verify that the fixture is actually validated rather than disabling TLS.
    await assert.rejects(rpc(port, new https.Agent({keepAlive: false}), auth, 1, 'probe'),
      error => /** @type {NodeJS.ErrnoException} */ (error).code === 'DEPTH_ZERO_SELF_SIGNED_CERT');
    for (let i = 0; i < 3; i++) {
      const result = await rpc(port, warmAgent, auth, 1000, 'warmup-' + i);
      assert.equal(result.payload.value, privateOperation(secret, 'warmup-' + i, 1000));
    }
    const results = [];
    for (const artificialWaitMs of [0, 25, 100]) {
      delayMs = artificialWaitMs;
      for (const rounds of [1000, 20000, 100000]) {
        /** @type {{native:number[],reuse:number[],fresh:number[]}} */
        const samples = {native: [], reuse: [], fresh: []};
        for (let sample = 0; sample < 5; sample++) {
          const input = 'scenario-' + artificialWaitMs + '-' + rounds + '-' + sample;
          const started = performance.now();
          const expected = privateOperation(secret, input, rounds);
          samples.native.push(performance.now() - started);
          for (const [label, agent] of sample % 2 ?
            /** @type {const} */ ([['fresh', coldAgent], ['reuse', warmAgent]]) :
            /** @type {const} */ ([['reuse', warmAgent], ['fresh', coldAgent]])) {
            const response = await rpc(port, agent, auth, rounds, input);
            assert.equal(response.status, 200);
            assert.deepEqual(response.payload, {ok:true, value:expected});
            samples[label].push(response.ms);
          }
        }
        const nativeMs = median(samples.native);
        const reuseMs = median(samples.reuse);
        const freshMs = median(samples.fresh);
        results.push({artificialWaitMs, rounds, nativeMs, reuseMs, freshMs,
          reuseRatio:reuseMs / nativeMs, freshRatio:freshMs / nativeMs,
          withinBudgetReuse:reuseMs <= 2.5 * nativeMs,
          withinBudgetFresh:freshMs <= 2.5 * nativeMs, samples});
      }
    }
    return {timestamp:new Date().toISOString(), node:process.version, platform:process.platform,
      cpu:os.cpus()[0]?.model, tls:'TLS using trusted self-signed localhost certificate',
      topology:'One Node process; loopback HTTPS/1.1; authenticated HMAC RPC; 5 paired samples per cell',
      simulatedDelay:'Application wait before the server operation; not a measured WAN RTT',
      tlsConnections, results};
  } finally {
    warmAgent.destroy();
    coldAgent.destroy();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve(undefined)));
  }
}

if (require.main === module) {
  main().then(result => {
    for (const row of result.results) {
      process.stdout.write('wait=' + row.artificialWaitMs + 'ms rounds=' + row.rounds +
        ' TLS reuse=' + row.reuseRatio.toFixed(2) + 'x fresh=' + row.freshRatio.toFixed(2) + 'x\n');
    }
    process.stdout.write('JSON_REPORT=' + JSON.stringify(result) + '\n');
  }).catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
}

module.exports = {main, privateOperation};
