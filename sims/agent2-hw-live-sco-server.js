'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const pathModule = require('node:path');
const readline = require('node:readline');
const { pathToFileURL } = require('node:url');
const { atomicWrite } = require('../src/atomic');
const {
  partitionScoAsyncModule,
  bindScoModuleExports,
  createScoHandler,
} = require('../src');

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let initialized = false;
let server = null;
let root = null;
let stopping = false;
const stats = {
  http_requests: 0,
  rpc_requests: 0,
  client_module_requests: 0,
  authorized_rpc_requests: 0,
  unauthorized_rpc_requests: 0,
};

/**
 * Start one generated server-controlled step-only Mealy service.
 * The private machine is supplied over stdin and remains in this process.
 * @param {{machine:{next:number[][],output:number[][],initial_state:number},
 *   canary:string,partition_seed:string,session_token:string}} payload
 */
async function start(payload) {
  const machine = payload.machine;
  assert.ok(machine && Array.isArray(machine.next) && Array.isArray(machine.output));
  assert.equal(typeof payload.canary, 'string');
  assert.equal(typeof payload.partition_seed, 'string');
  assert.equal(typeof payload.session_token, 'string');
  assert.ok(payload.session_token.length >= 32);
  const sessionCookie = 'session=' + payload.session_token;

  const privateSource = [
    'const privateTable=' + JSON.stringify(machine) + ';',
    'const serverCanary=' + JSON.stringify(payload.canary) + ';',
    'let current=privateTable.initial_state;',
    'export async function step(symbol){',
    'if(!Number.isInteger(symbol)||symbol<0||symbol>1)throw TypeError("symbol");',
    'const previous=current;',
    'current=privateTable.next[previous][symbol];',
    'return privateTable.output[previous][symbol];',
    '}',
  ].join('\n');

  const partition = partitionScoAsyncModule({
    path: 'client.mjs',
    sourceType: 'module',
    code: privateSource,
  }, {
    seed: payload.partition_seed,
    serverOnlyInitialization: true,
  });
  assert.deepEqual(partition.names, ['step']);

  root = await fs.mkdtemp(pathModule.join(os.tmpdir(), 'obfs-agent2-hw-live-'));
  const privateFile = pathModule.join(root, 'private', 'actual.mjs');
  await atomicWrite(privateFile, privateSource);
  const privateModule = await import(pathToFileURL(privateFile).href);
  const remoteMethods = bindScoModuleExports(partition, privateModule);

  const handler = createScoHandler([partition.clientFile], {
    remoteMethods,
    authorizeRpc: request => request.headers.cookie === sessionCookie,
    authorizeOperation: (request, method, args) =>
      request.headers.cookie === sessionCookie &&
      method === partition.methodNames.step &&
      args.length === 1 &&
      typeof args[0] === 'number' &&
      Number.isInteger(args[0]) &&
      args[0] >= 0 &&
      args[0] <= 1,
  });

  server = http.createServer((request, response) => {
    stats.http_requests += 1;
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (pathname === '/obfs/client.mjs') {
      stats.client_module_requests += 1;
      response.setHeader(
        'Set-Cookie',
        sessionCookie + '; HttpOnly; SameSite=Strict; Path=/obfs',
      );
      response.setHeader('X-SCO-Method', partition.methodNames.step);
    }
    if (pathname === '/obfs/rpc') {
      stats.rpc_requests += 1;
      if (request.headers.cookie === sessionCookie) {
        stats.authorized_rpc_requests += 1;
      } else {
        stats.unauthorized_rpc_requests += 1;
      }
    }
    try {
      Promise.resolve(handler(request, response)).catch(() => {
        if (!response.headersSent && !response.destroyed) {
          response.writeHead(500).end();
        }
      });
    } catch {
      if (!response.headersSent && !response.destroyed) {
        response.writeHead(500).end();
      }
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  process.stdout.write('READY ' + JSON.stringify({
    origin: 'http://127.0.0.1:' + address.port,
    method_name: partition.methodNames.step,
    public_module_path: '/obfs/client.mjs',
    rpc_path: '/obfs/rpc',
    partition_names: partition.names,
  }) + '\n');
}

/** Close the listener, remove private files, and report server-side counters. */
async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  if (root) {
    await fs.rm(root, { recursive: true, force: true });
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
    process.stderr.write('Invalid JSON on server control stdin\n');
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
