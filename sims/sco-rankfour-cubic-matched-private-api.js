'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const {createHash, randomBytes} = require('node:crypto');
const {transform} = require('esbuild');
const {
  partitionScoSelectedAsyncExports,
  bindScoModuleExports,
  createScoHandler
} = require('../src');
const {
  cloneProjectedCubicValidated
} = require('./rankfour-projected-cubic-validated-peer');
const {evaluate} = require('./rankfour-projected-cubic-rescue');

const TOKEN = 'authorized-rankfour-cubic-study';
const METHOD = 'protectedCubic';
const PROJECTION_MASKS = [0x00015555, 0x0002aaaa, 0x0000f0f0, 0x00033333];

/** @typedef {{origin:string,method:string,credential:string}} Access */
/** @typedef {{witness:number[],verify:number[]}} DrawTapes */
/** @typedef {ReturnType<typeof cloneProjectedCubicValidated>} ValidatedModel */
/**
 * @typedef {Object} ScoResult
 * @property {'sco'} arm
 * @property {string} sourceHash
 * @property {number} queries
 * @property {number} heldouts
 * @property {number} matched
 * @property {number} privateExecutions
 * @property {number} deniedStatus
 * @property {boolean} publishedPrivateNames
 * @property {number} publicFacadeBytes
 * @property {number} privateSourceBytes
 * @property {string} transcriptSha256
 * @property {number} witnessWords
 * @property {number} verificationWords
 * @property {number} fastQueries
 * @property {number} verificationQueries
 * @property {number} verificationSamples
 * @property {boolean} verificationPassed
 * @property {boolean} fallbackUsed
 * @property {boolean} offlineAfterServerClosed
 * @property {string} method
 */
/**
 * @typedef {Object} MinifiedResult
 * @property {'esbuild-minified-private-api'} arm
 * @property {string} sourceHash
 * @property {number} minifiedBytes
 * @property {string} minifiedSha256
 * @property {number} queries
 * @property {number} heldouts
 * @property {number} matched
 * @property {number} privateExecutions
 * @property {number} deniedStatus
 * @property {string} transcriptSha256
 * @property {number} witnessWords
 * @property {number} verificationWords
 * @property {number} fastQueries
 * @property {number} verificationQueries
 * @property {number} verificationSamples
 * @property {boolean} verificationPassed
 * @property {boolean} fallbackUsed
 * @property {boolean} offlineAfterServerClosed
 */

/** A synchronous learner requested a value not yet observed over HTTP. */
class NeedQuery extends Error {
  /** @param {number} input */
  constructor(input) {
    super('The cubic learner requested one missing authorized oracle value');
    this.input = input >>> 0;
  }
}

/**
 * The private function is a 32-bit permutation with a degree-three top part
 * on four independent parity projections. The low 20 output bits are an
 * invertible linear mixing of the low 20 input bits. The nonlinear correction
 * touches only the high 12 output bits, while all four projections depend
 * only on the low 20 input bits, so the map is triangular and invertible.
 *
 * @returns {string}
 */
function privateSource() {
  return [
    'const OBFS_PRIVATE_MASK0=0x00015555;',
    'const OBFS_PRIVATE_MASK1=0x0002aaaa;',
    'const OBFS_PRIVATE_MASK2=0x0000f0f0;',
    'const OBFS_PRIVATE_MASK3=0x00033333;',
    'const OBFS_PRIVATE_OFFSET=0x5a9bc7e1;',
    'function obfsPrivateParity(x){',
    '  x^=x>>>16;x^=x>>>8;x^=x>>>4;x^=x>>>2;x^=x>>>1;',
    '  return x&1;',
    '}',
    'function obfsPrivateMix(x){',
    '  let y=x&0x000fffff;',
    '  y^=(y<<7)&0x000fffff;',
    '  y^=(y<<3)&0x000fffff;',
    '  y^=(y<<11)&0x000fffff;',
    '  return (y|(x&0xfff00000))>>>0;',
    '}',
    'export async function protectedCubic(value){',
    '  const x=value>>>0;',
    '  const z0=obfsPrivateParity(x&OBFS_PRIVATE_MASK0);',
    '  const z1=obfsPrivateParity(x&OBFS_PRIVATE_MASK1);',
    '  const z2=obfsPrivateParity(x&OBFS_PRIVATE_MASK2);',
    '  const z3=obfsPrivateParity(x&OBFS_PRIVATE_MASK3);',
    '  const affine=(obfsPrivateMix(x)^OBFS_PRIVATE_OFFSET)>>>0;',
    '  let nonlinear=0;',
    '  if(z0&z3)nonlinear^=0x10000000;',
    '  if(z1&z3)nonlinear^=0x20000000;',
    '  if(z0&z1&z2)nonlinear^=0x40000000;',
    '  if(z1&z2&z3)nonlinear^=0x80000000;',
    '  return (affine^nonlinear)>>>0;',
    '}',
    'export function publicIdentity(value){return value>>>0;}'
  ].join('\n');
}

/** @param {number[]} values @returns {number} */
function binaryRank32(values) {
  const pivots = Array(32).fill(0);
  let rank = 0;
  for (const value of values) {
    let x = value >>> 0;
    for (let bit = 31; bit >= 0; bit--) {
      if (((x >>> bit) & 1) === 0) continue;
      if (pivots[bit] !== 0) x = (x ^ pivots[bit]) >>> 0;
      else {
        pivots[bit] = x;
        rank++;
        break;
      }
    }
  }
  return rank;
}

/** @param {(input:number)=>number} source @param {number[]} directions @returns {number} */
function thirdDerivative(source, directions) {
  let result = 0;
  for (let subset = 0; subset < 8; subset++) {
    let input = 0;
    for (let bit = 0; bit < 3; bit++) {
      if (((subset >>> bit) & 1) !== 0) input ^= directions[bit];
    }
    result ^= source(input);
  }
  return result >>> 0;
}

/** @returns {number} */
function topProjectionRadicalSize() {
  /** @param {number} z @returns {number} */
  function top(z) {
    return (
      (((z & 7) === 7) ? 0x40000000 : 0) ^
      (((z & 14) === 14) ? 0x80000000 : 0)
    ) >>> 0;
  }
  let radicalSize = 0;
  for (let x = 0; x < 16; x++) {
    let inRadical = true;
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        if (thirdDerivative(top, [x, 1 << a, 1 << b]) !== 0) {
          inRadical = false;
          break;
        }
      }
      if (!inRadical) break;
    }
    if (inRadical) radicalSize++;
  }
  return radicalSize;
}

/**
 * Replay the synchronous validated learner against real authenticated HTTP.
 * The two draw tapes survive replay and are shared across the matched arms.
 *
 * @param {Access} access
 * @param {DrawTapes} tapes
 * @returns {Promise<{model:ValidatedModel,queries:number,observed:Set<number>,
 *   transcriptSha256:string,witnessWords:number,verificationWords:number}>}
 */
async function cloneOverHttp(access, tapes) {
  /** @type {Map<number,number>} */
  const observations = new Map();
  const transcript = createHash('sha256');
  for (;;) {
    let witnessIndex = 0;
    let verifyIndex = 0;
    /** @returns {number} */
    function drawWitness() {
      if (witnessIndex === tapes.witness.length) {
        tapes.witness.push(randomBytes(4).readUInt32BE(0));
      }
      return tapes.witness[witnessIndex++];
    }
    /** @returns {number} */
    function drawVerify() {
      if (verifyIndex === tapes.verify.length) {
        tapes.verify.push(randomBytes(4).readUInt32BE(0));
      }
      return tapes.verify[verifyIndex++];
    }
    try {
      const model = /** @type {ValidatedModel} */ (
        cloneProjectedCubicValidated(input => {
          const key = input >>> 0;
          if (!observations.has(key)) throw new NeedQuery(key);
          return /** @type {number} */ (observations.get(key));
        }, 32, drawWitness, drawVerify, 1e-10)
      );
      assert.equal(model.queries, observations.size);
      assert.equal(model.degree, 3, 'The source must exercise the cubic branch');
      assert.equal(model.verificationPassed, true);
      assert.equal(model.fallbackUsed, false);
      assert.ok(model.queries <= 1308);
      return {
        model,
        queries: observations.size,
        observed: new Set(observations.keys()),
        transcriptSha256: transcript.digest('hex'),
        witnessWords: tapes.witness.length,
        verificationWords: tapes.verify.length
      };
    } catch (error) {
      if (!(error instanceof NeedQuery)) throw error;
      const input = error.input;
      const response = await fetch(access.origin + '/obfs/rpc', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-session': access.credential
        },
        body: JSON.stringify({method: access.method, args: [input]})
      });
      assert.equal(response.status, 200, 'Authorized oracle query was rejected');
      /** @type {{ok?:boolean,value?:unknown}} */
      const data = await response.json();
      assert.equal(data.ok, true);
      assert.ok(typeof data.value === 'number' && Number.isInteger(data.value) &&
        data.value >= 0 && data.value < 2 ** 32);
      const value = /** @type {number} */ (data.value);
      observations.set(input, value >>> 0);
      transcript.update(JSON.stringify([input, value >>> 0]) + '\n');
    }
  }
}

/**
 * Run the server-controlled SCO arm. Only the generated facade and route
 * string are exposed; the private ESM source remains in the test harness.
 *
 * @param {string} source
 * @param {DrawTapes} tapes
 * @returns {Promise<ScoResult>}
 */
async function runScoArm(source, tapes) {
  const selected = partitionScoSelectedAsyncExports({
    path: 'mixed.mjs',
    sourceType: 'module',
    code: source
  }, {
    seed: 'sco-rankfour-cubic-matched-private-api',
    privateNames: [METHOD]
  });
  const publicCode = selected.clientFile.code;
  const publishedPrivateNames =
    /OBFS_PRIVATE_|obfsPrivateMix|obfsPrivateParity/u.test(publicCode);
  assert.equal(publishedPrivateNames, false);
  const privateModule = await import(
    'data:text/javascript,' + encodeURIComponent(source)
  );
  const bound = bindScoModuleExports(selected, privateModule);
  let privateExecutions = 0;
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const methods = Object.create(null);
  for (const [name, fn] of Object.entries(bound)) {
    methods[name] = (...args) => {
      privateExecutions++;
      return fn(...args);
    };
  }

  /** @type {import('node:http').Server|undefined} */
  let server;
  try {
    server = http.createServer(createScoHandler([selected.clientFile], {
      remoteMethods: methods,
      authorizeRead: req => req.headers['x-demo-session'] === TOKEN,
      authorizeRpc: req => req.headers['x-demo-session'] === TOKEN,
      authorizeOperation: (req, method, args) =>
        req.headers['x-demo-session'] === TOKEN &&
        method === selected.methodNames.protectedCubic &&
        args.length === 1 &&
        Number.isInteger(args[0]) &&
        /** @type {number} */ (args[0]) >= 0 &&
        /** @type {number} */ (args[0]) < 2 ** 32
    }));
    const active = server;
    /** @type {Promise<void>} */
    const listening = new Promise((resolve, reject) => {
      active.once('error', reject);
      active.listen(0, '127.0.0.1', resolve);
    });
    await listening;
    const address = active.address();
    assert.ok(address && typeof address !== 'string');
    const origin = 'http://127.0.0.1:' + address.port;
    const denied = await fetch(origin + '/obfs/rpc', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({method: selected.methodNames.protectedCubic, args: [7]})
    });
    assert.equal(denied.status, 403);
    const published = await fetch(origin + '/obfs/mixed.mjs', {
      headers: {'x-demo-session': TOKEN}
    });
    assert.equal(published.status, 200);
    const servedCode = await published.text();
    assert.equal(servedCode, publicCode);
    assert.doesNotMatch(servedCode, /OBFS_PRIVATE_|obfsPrivateMix|obfsPrivateParity/u);
    const route = servedCode.match(
      /export async function protectedCubic\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u
    );
    assert.ok(route?.[1], 'The public facade did not expose its RPC route');

    const clone = await cloneOverHttp({
      origin,
      method: route[1],
      credential: TOKEN
    }, tapes);
    assert.equal(privateExecutions, clone.queries);
    const snapshot = /** @type {ValidatedModel} */ (
      JSON.parse(JSON.stringify(clone.model))
    );
    const stopped = active;
    /** @type {Promise<void>} */
    const closed = new Promise((resolve, reject) => {
      stopped.close(error => error ? reject(error) : resolve());
    });
    await closed;
    server = undefined;

    let matched = 0;
    let heldouts = 0;
    for (let i = 0; heldouts < 1028; i++) {
      const input = createHash('sha256')
        .update('rankfour-cubic-heldout/' + i)
        .digest().readUInt32BE(0);
      if (clone.observed.has(input)) continue;
      const expected = await privateModule.protectedCubic(input);
      assert.equal(evaluate(snapshot, input), expected);
      heldouts++;
      matched++;
    }
    assert.equal(privateExecutions, clone.queries,
      'Offline evaluation unexpectedly called the private RPC handler');
    return {
      arm: 'sco',
      sourceHash: createHash('sha256').update(source).digest('hex'),
      queries: clone.queries,
      heldouts,
      matched,
      privateExecutions,
      deniedStatus: denied.status,
      publishedPrivateNames,
      publicFacadeBytes: Buffer.byteLength(publicCode),
      privateSourceBytes: Buffer.byteLength(source),
      transcriptSha256: clone.transcriptSha256,
      witnessWords: clone.witnessWords,
      verificationWords: clone.verificationWords,
      fastQueries: clone.model.fastQueries,
      verificationQueries: clone.model.verificationQueries,
      verificationSamples: clone.model.verificationSamples,
      verificationPassed: clone.model.verificationPassed,
      fallbackUsed: clone.model.fallbackUsed,
      offlineAfterServerClosed: true,
      method: route[1]
    };
  } finally {
    if (server) {
      const remaining = server;
      /** @type {Promise<void>} */
      const cleaned = new Promise((resolve, reject) => {
        remaining.close(error => error ? reject(error) : resolve());
      });
      await cleaned;
    }
  }
}

/**
 * Equal-trust conventional control: the same private source is minified by
 * esbuild, loaded only on the trusted server, and exposed through the same
 * authenticated JSON RPC contract and method route.
 *
 * @param {string} source
 * @param {string} method
 * @param {DrawTapes} tapes
 * @param {Pick<ScoResult,'queries'|'transcriptSha256'>} expected
 * @returns {Promise<MinifiedResult>}
 */
async function runMinifiedArm(source, method, tapes, expected) {
  const minified = (await transform(source, {
    format: 'esm',
    loader: 'js',
    minify: true,
    target: 'es2022'
  })).code;
  const privateModule = await import(
    'data:text/javascript,' + encodeURIComponent(minified)
  );
  assert.equal(typeof privateModule.protectedCubic, 'function');
  let privateExecutions = 0;
  /** @type {import('node:http').Server|undefined} */
  let server;
  try {
    server = http.createServer(async (req, res) => {
      if (req.headers['x-demo-session'] !== TOKEN) {
        res.statusCode = 403;
        res.end(JSON.stringify({ok: false}));
        return;
      }
      if (req.url !== '/obfs/rpc' || req.method !== 'POST') {
        res.statusCode = 404;
        res.end(JSON.stringify({ok: false}));
        return;
      }
      /** @type {Buffer[]} */
      const chunks = [];
      for await (const part of req) chunks.push(Buffer.from(part));
      /** @type {{method?:unknown,args?:unknown}} */
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const args = body.args;
      if (body.method !== method || !Array.isArray(args) ||
          args.length !== 1 || !Number.isInteger(args[0]) ||
          args[0] < 0 || args[0] >= 2 ** 32) {
        res.statusCode = 400;
        res.end(JSON.stringify({ok: false}));
        return;
      }
      privateExecutions++;
      const value = await privateModule.protectedCubic(args[0]);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ok: true, value}));
    });
    const active = server;
    /** @type {Promise<void>} */
    const listening = new Promise((resolve, reject) => {
      active.once('error', reject);
      active.listen(0, '127.0.0.1', resolve);
    });
    await listening;
    const address = active.address();
    assert.ok(address && typeof address !== 'string');
    const origin = 'http://127.0.0.1:' + address.port;
    const denied = await fetch(origin + '/obfs/rpc', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({method, args: [7]})
    });
    assert.equal(denied.status, 403);

    const clone = await cloneOverHttp({origin, method, credential: TOKEN}, tapes);
    assert.equal(clone.queries, expected.queries);
    assert.equal(clone.transcriptSha256, expected.transcriptSha256);
    assert.equal(privateExecutions, clone.queries);
    const snapshot = /** @type {ValidatedModel} */ (
      JSON.parse(JSON.stringify(clone.model))
    );
    const stopped = active;
    /** @type {Promise<void>} */
    const closed = new Promise((resolve, reject) => {
      stopped.close(error => error ? reject(error) : resolve());
    });
    await closed;
    server = undefined;

    let matched = 0;
    let heldouts = 0;
    for (let i = 0; heldouts < 1028; i++) {
      const input = createHash('sha256')
        .update('rankfour-cubic-minified-heldout/' + i)
        .digest().readUInt32BE(0);
      if (clone.observed.has(input)) continue;
      const expectedValue = await privateModule.protectedCubic(input);
      assert.equal(evaluate(snapshot, input), expectedValue);
      heldouts++;
      matched++;
    }
    assert.equal(privateExecutions, clone.queries,
      'Offline evaluation unexpectedly called the minified private API');
    return {
      arm: 'esbuild-minified-private-api',
      sourceHash: createHash('sha256').update(source).digest('hex'),
      minifiedBytes: Buffer.byteLength(minified),
      minifiedSha256: createHash('sha256').update(minified).digest('hex'),
      queries: clone.queries,
      heldouts,
      matched,
      privateExecutions,
      deniedStatus: denied.status,
      transcriptSha256: clone.transcriptSha256,
      witnessWords: clone.witnessWords,
      verificationWords: clone.verificationWords,
      fastQueries: clone.model.fastQueries,
      verificationQueries: clone.model.verificationQueries,
      verificationSamples: clone.model.verificationSamples,
      verificationPassed: clone.model.verificationPassed,
      fallbackUsed: clone.model.fallbackUsed,
      offlineAfterServerClosed: true
    };
  } finally {
    if (server) {
      const remaining = server;
      /** @type {Promise<void>} */
      const cleaned = new Promise((resolve, reject) => {
        remaining.close(error => error ? reject(error) : resolve());
      });
      await cleaned;
    }
  }
}

/** @returns {Promise<object>} */
async function main() {
  assert.equal(binaryRank32(PROJECTION_MASKS), 4,
    'The private source must use four independent parity projections');
  assert.equal(topProjectionRadicalSize(), 1,
    'The top cubic tensor must have zero radical on the four-bit projection');
  const source = privateSource();
  /** @type {DrawTapes} */
  const tapes = {witness: [], verify: []};
  const sco = await runScoArm(source, tapes);
  const minified = await runMinifiedArm(source, sco.method, tapes, sco);
  assert.equal(sco.sourceHash, minified.sourceHash);
  assert.equal(sco.queries, minified.queries);
  assert.equal(sco.transcriptSha256, minified.transcriptSha256);
  assert.equal(sco.deniedStatus, 403);
  assert.equal(minified.deniedStatus, 403);
  assert.equal(sco.heldouts, 1028);
  assert.equal(minified.heldouts, 1028);
  assert.equal(sco.matched, sco.heldouts);
  assert.equal(minified.matched, minified.heldouts);
  assert.equal(sco.privateExecutions, sco.queries);
  assert.equal(minified.privateExecutions, minified.queries);
  assert.equal(sco.verificationPassed, true);
  assert.equal(minified.verificationPassed, true);
  assert.equal(sco.fallbackUsed, false);
  assert.equal(minified.fallbackUsed, false);
  const result = {
    sourceClass: '32-bit permutation, degree<=3, nonlinear input projection rank=4',
    sourceIsPermutation: 'triangular: invertible low-20 linear map; nonlinear corrections only high 12 bits',
    projectionRank: 4,
    topJointRadicalSizeOnProjection: 1,
    topJointRadicalCodimension: 4,
    sourceSha256: sco.sourceHash,
    scoQueries: sco.queries,
    minifiedQueries: minified.queries,
    fastQueries: sco.fastQueries,
    verificationQueries: sco.verificationQueries,
    verificationSamples: sco.verificationSamples,
    heldoutsEach: 1028,
    matchedEach: 1028,
    bothRejectedUnauthorized: true,
    scoPrivateNamesPublished: sco.publishedPrivateNames,
    scoFacadeBytes: sco.publicFacadeBytes,
    privateSourceBytes: sco.privateSourceBytes,
    minifiedPrivateBytes: minified.minifiedBytes,
    minifiedPrivateSha256: minified.minifiedSha256,
    privateExecutionsEach: sco.privateExecutions,
    sameTranscript: true,
    transcriptSha256: sco.transcriptSha256,
    offlineAfterBothServersClosed: true,
    postfitPassed: true,
    fallbackUsed: false
  };
  console.log('SCO_RANKFOUR_CUBIC_MATCHED_PRIVATE_API ' + JSON.stringify(result));
  return result;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  privateSource,
  cloneOverHttp,
  runScoArm,
  runMinifiedArm,
  main
};
