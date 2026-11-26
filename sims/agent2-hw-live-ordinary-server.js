'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const readline = require('node:readline');
const esbuild = require('esbuild');

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let initialized = false;
let server = null;
let stopping = false;
let machine = null;
let current = null;
let methodName = null;
let sessionCookie = null;
let publicModule = null;

const stats = {
  http_requests: 0,
  rpc_requests: 0,
  client_module_requests: 0,
  authorized_rpc_requests: 0,
  unauthorized_rpc_requests: 0,
};

/**
 * Write the ordinary control's JSON response using the same application
 * headers and JSON envelope as the generated SCO handler.
 * @param {http.ServerResponse} response
 * @param {number} status
 * @param {Record<string, unknown>} payload
 */
function respondJson(response, status, payload) {
  const body = JSON.stringify(Object.assign(Object.create(null), payload));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

/**
 * Start an ordinary Node HTTP step service with a minified public client.
 * The hidden machine and session token remain in this process.
 * @param {{machine:{next:number[][],output:string[][],initial_state:number},
 *   canary:string,method_name:string,session_token:string}} payload
 */
async function start(payload) {
  assert.ok(payload.machine && Array.isArray(payload.machine.next));
  assert.ok(Array.isArray(payload.machine.output));
  assert.equal(payload.machine.next.length, payload.machine.output.length);
  assert.ok(Number.isInteger(payload.machine.initial_state));
  assert.ok(payload.machine.initial_state >= 0);
  assert.ok(payload.machine.initial_state < payload.machine.next.length);
  assert.equal(typeof payload.canary, 'string');
  assert.equal(typeof payload.method_name, 'string');
  assert.ok(payload.method_name.length > 0);
  assert.equal(typeof payload.session_token, 'string');
  assert.ok(payload.session_token.length >= 32);

  machine = payload.machine;
  current = machine.initial_state;
  methodName = payload.method_name;
  sessionCookie = 'session=' + payload.session_token;
  const privateCanary = payload.canary;
  assert.ok(privateCanary.length > 0);

  const ordinarySource = [
    'export async function step(symbol){',
    'const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method:' +
      JSON.stringify(methodName) + ',args:[symbol]})});',
    'const payload=await response.json();',
    'if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");',
    'return payload.value;',
    '}',
  ].join('');
  const transformed = await esbuild.transform(ordinarySource, {
    format: 'esm',
    minify: true,
  });
  publicModule = transformed.code;

  server = http.createServer((request, response) => {
    stats.http_requests += 1;
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;

    if (request.method === 'GET' && pathname === '/obfs/client.mjs') {
      stats.client_module_requests += 1;
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'set-cookie': sessionCookie + '; HttpOnly; SameSite=Strict; Path=/obfs',
        'x-sco-method': methodName,
      });
      response.end(publicModule);
      return;
    }

    if (request.method !== 'POST' || pathname !== '/obfs/rpc') {
      response.writeHead(404).end();
      return;
    }

    stats.rpc_requests += 1;
    if (request.headers.cookie === sessionCookie) {
      stats.authorized_rpc_requests += 1;
    } else {
      stats.unauthorized_rpc_requests += 1;
    }

    if (request.headers.cookie !== sessionCookie) {
      respondJson(response, 403, { ok: false, error: 'Forbidden' });
      return;
    }

    const mediaType = String(request.headers['content-type'] || '')
      .split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      respondJson(response, 415, { ok: false, error: 'Expected JSON' });
      return;
    }

    let body = '';
    let tooLarge = false;
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > 65536) tooLarge = true;
    });
    request.on('end', () => {
      if (tooLarge) {
        respondJson(response, 413, { ok: false, error: 'Request too large' });
        return;
      }

      /** @type {unknown} */
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        respondJson(response, 400, { ok: false, error: 'Malformed JSON' });
        return;
      }

      if (!parsed || typeof parsed !== 'object' ||
          !Object.hasOwn(parsed, 'method') || !Object.hasOwn(parsed, 'args')) {
        respondJson(response, 400, { ok: false, error: 'Unknown method or invalid arguments' });
        return;
      }
      const operation = /** @type {{method?:unknown,args?:unknown}} */ (parsed);
      if (typeof operation.method !== 'string' || operation.method !== methodName ||
          !Array.isArray(operation.args)) {
        respondJson(response, 400, { ok: false, error: 'Unknown method or invalid arguments' });
        return;
      }

      const args = operation.args;
      if (args.length !== 1 || typeof args[0] !== 'number' ||
          !Number.isInteger(args[0]) || args[0] < 0 || args[0] > 1) {
        respondJson(response, 403, { ok: false, error: 'Forbidden' });
        return;
      }

      const symbol = args[0];
      const previous = current;
      current = machine.next[previous][symbol];
      respondJson(response, 200, {
        ok: true,
        value: machine.output[previous][symbol],
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  process.stdout.write('READY ' + JSON.stringify({
    pid: process.pid,
    uid: process.getuid(),
    environment_keys: Object.keys(process.env).sort(),
    origin: 'http://127.0.0.1:' + address.port,
    method_name: methodName,
    public_module_path: '/obfs/client.mjs',
    rpc_path: '/obfs/rpc',
    server_kind: 'ordinary-esbuild-minified-control',
  }) + '\n');
}

/** Close the ordinary service and report counters. */
async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  await new Promise(resolve => {
    process.stdout.write('STATS ' + JSON.stringify(stats) + '\n', resolve);
  });
  process.exit(0);
}

input.on('line', line => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stderr.write('Invalid JSON on ordinary-server control stdin\n');
    process.exit(2);
    return;
  }

  if (!initialized) {
    initialized = true;
    start(message).catch(error => {
      process.stdout.write('ERROR ' + JSON.stringify({
        message: error.message,
        stack: error.stack,
      }) + '\n');
      process.exit(1);
    });
    return;
  }

  if (message && message.command === 'shutdown') {
    shutdown().catch(error => {
      process.stderr.write(String(error.stack || error) + '\n');
      process.exit(1);
    });
  }
});

process.on('SIGTERM', () => {
  shutdown().catch(() => process.exit(1));
});
