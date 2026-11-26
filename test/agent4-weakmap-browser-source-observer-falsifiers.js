'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { obfuscateFiles } = require('../src');

const run = promisify(execFile);

/**
 * @typedef {{path:string,sourceType:'script'|'module',code:string}} SourceFile
 * @typedef {{path:string,code:string}} ExtraFile
 * @typedef {{
 *   name:string,
 *   sourceFiles:SourceFile[],
 *   extraFiles:ExtraFile[],
 *   storagePath:string,
 *   pageSource:string
 * }} Scenario
 */

const patchLines = [
  'const nativeSet=nativePrototype.set;',
  'nativePrototype.set=function(key,value){',
  '  document.title=value;',
  '  return Reflect.apply(nativeSet,this,[key,value]);',
  '};'
];

const storageModuleSource = [
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');

const storageClassicSource = [
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,',
  '    value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("storage-prototype-override",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}',
  'globalThis.sample=sample;'
].join('\n');

const classicPage = [
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<script src="./carrier.js"></script>',
  '<script src="./mutate.js"></script>',
  '<script src="./storage.js"></script>',
  '<script src="./entry.js"></script>',
  '<script>',
  'try{',
  '  const payload={result:globalThis.result,capturedSource:document.title};',
  '  const pre=document.createElement("pre");pre.id="result";',
  '  pre.textContent=btoa(JSON.stringify(payload));document.body.appendChild(pre);',
  '}catch(error){',
  '  const pre=document.createElement("pre");pre.id="failure";',
  '  pre.textContent=String(error.stack||error);document.body.appendChild(pre);',
  '}',
  '</script></body></html>'
].join('');

const esmClassPage = [
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<script type="module">',
  'try{',
  '  const {Derived}=await import("./producer.mjs");',
  '  const nativePrototype=Object.getPrototypeOf(Derived.prototype);',
  ...patchLines,
  '  const {sample}=await import("./entry.mjs");',
  '  const result=sample();',
  '  const payload={result,capturedSource:document.title};',
  '  const pre=document.createElement("pre");pre.id="result";',
  '  pre.textContent=btoa(JSON.stringify(payload));document.body.appendChild(pre);',
  '}catch(error){',
  '  const pre=document.createElement("pre");pre.id="failure";',
  '  pre.textContent=String(error.stack||error);document.body.appendChild(pre);',
  '}',
  '</script></body></html>'
].join('');

const esmImportedFactoryPage = [
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<script type="importmap">{"imports":{"opaque-runtime":"./opaque-runtime.mjs"}}</script>',
  '<script type="module">',
  'try{',
  '  const {sample}=await import("./entry.mjs");',
  '  const result=sample();',
  '  const payload={result,capturedSource:document.title};',
  '  const pre=document.createElement("pre");pre.id="result";',
  '  pre.textContent=btoa(JSON.stringify(payload));document.body.appendChild(pre);',
  '}catch(error){',
  '  const pre=document.createElement("pre");pre.id="failure";',
  '  pre.textContent=String(error.stack||error);document.body.appendChild(pre);',
  '}',
  '</script></body></html>'
].join('');

const scenarios = /** @type {Scenario[]} */ ([
  {
    name: 'classic-cross-unit-lexical-carrier',
    storagePath: 'storage.js',
    pageSource: classicPage,
    extraFiles: [],
    sourceFiles: [
      {
        path: 'carrier.js',
        sourceType: 'script',
        code: 'let carrier=new WeakMap();'
      },
      {
        path: 'mutate.js',
        sourceType: 'script',
        code: [
          'const nativePrototype=Object.getPrototypeOf(carrier);',
          ...patchLines
        ].join('\n')
      },
      {
        path: 'storage.js',
        sourceType: 'script',
        code: storageClassicSource
      },
      {
        path: 'entry.js',
        sourceType: 'script',
        code: 'globalThis.result=globalThis.sample();'
      }
    ]
  },
  {
    name: 'external-esm-derived-class',
    storagePath: 'storage.mjs',
    pageSource: esmClassPage,
    extraFiles: [],
    sourceFiles: [
      {
        path: 'producer.mjs',
        sourceType: 'module',
        code: 'export class Derived extends globalThis.WeakMap {}'
      },
      {
        path: 'entry.mjs',
        sourceType: 'module',
        code: "export {sample} from './storage.mjs';"
      },
      {
        path: 'storage.mjs',
        sourceType: 'module',
        code: storageModuleSource
      }
    ]
  },
  {
    name: 'unresolved-external-esm-factory',
    storagePath: 'storage.mjs',
    pageSource: esmImportedFactoryPage,
    extraFiles: [
      {
        path: 'opaque-runtime.mjs',
        code: 'export function make(){return new WeakMap();}'
      }
    ],
    sourceFiles: [
      {
        path: 'mutate.mjs',
        sourceType: 'module',
        code: [
          "import {make} from 'opaque-runtime';",
          'const nativePrototype=Object.getPrototypeOf(make());',
          ...patchLines
        ].join('\n')
      },
      {
        path: 'entry.mjs',
        sourceType: 'module',
        code: [
          "import './mutate.mjs';",
          "export {sample} from './storage.mjs';"
        ].join('\n')
      },
      {
        path: 'storage.mjs',
        sourceType: 'module',
        code: storageModuleSource
      }
    ]
  }
]);

/**
 * Add a page and its JavaScript resources under one URL prefix.
 * @param {Map<string,string>} resources
 * @param {string} prefix
 * @param {string} pageSource
 * @param {ExtraFile[]} files
 * @param {ExtraFile[]} extraFiles
 * @returns {void}
 */
function addResources(resources, prefix, pageSource, files, extraFiles) {
  resources.set('/' + prefix + '/index.html', pageSource);
  for (const file of files) {
    resources.set('/' + prefix + '/' + file.path, file.code);
  }
  for (const file of extraFiles) {
    resources.set('/' + prefix + '/' + file.path, file.code);
  }
}

/**
 * Execute a browser page and decode its structured result.
 * @param {string} executable
 * @param {string} origin
 * @param {string} prefix
 * @returns {Promise<{result:{value:number,independent:number},capturedSource:string}>}
 */
async function runTarget(executable, origin, prefix) {
  const { stdout } = await run(executable, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--virtual-time-budget=10000',
    '--dump-dom',
    origin + '/' + prefix + '/index.html'
  ], {
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 4 * 1024 * 1024
  });
  const encoded = stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded, prefix + ' Chromium failed: ' + stdout.slice(0, 2500));
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

async function main() {
  const executable = process.env.CHROMIUM_BIN ?? 'google-chrome';
  const version = await run(executable, ['--version'], {
    encoding: 'utf8',
    timeout: 15000
  });
  assert.match(version.stdout, /(Chrome|Chromium)\s+\d+\./u);

  /** @type {Map<string,string>} */
  const resources = new Map();
  const jobs = [];

  for (const scenario of scenarios) {
    const nativeFiles = scenario.sourceFiles.map(file => ({
      path: file.path,
      code: file.code
    }));
    const nativePrefix = scenario.name + '/native';
    addResources(
      resources,
      nativePrefix,
      scenario.pageSource,
      nativeFiles,
      scenario.extraFiles
    );
    jobs.push({ scenario, prefix: nativePrefix, kind: 'native', compiled: null });

    for (const mode of ['coo', 'sco']) {
      const compiled = obfuscateFiles(scenario.sourceFiles, {
        mode,
        seed: 'agent4-browser-weakmap-' + scenario.name + '-' + mode,
        properties: false,
        identifiers: true,
        strings: false,
        closedWorld: true
      });
      const emittedFiles = compiled.files.map(file => ({
        path: file.path,
        code: String(file.code)
      }));
      const storage = compiled.files.find(file => file.path === scenario.storagePath);
      assert.ok(storage, scenario.name + ' missing ' + scenario.storagePath + ' for ' + mode);
      assert.ok(storage.metrics.bindings > 0,
        scenario.name + ' did not transform a storage binding in ' + mode + ': ' +
        JSON.stringify(storage.metrics));

      const prefix = scenario.name + '/' + mode;
      addResources(
        resources,
        prefix,
        scenario.pageSource,
        emittedFiles,
        scenario.extraFiles
      );
      jobs.push({ scenario, prefix, kind: mode, compiled, storage });
    }
  }

  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const body = resources.get(pathname);
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': pathname.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : 'text/javascript; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(body);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing Chromium test port');
    }
    const origin = 'http://127.0.0.1:' + address.port;
    const nativeResults = new Map();

    for (const job of jobs) {
      if (job.kind !== 'native') continue;
      const result = await runTarget(executable, origin, job.prefix);
      assert.ok(result.capturedSource.includes('privateLocal'),
        JSON.stringify({ scenario: job.scenario.name, result }));
      nativeResults.set(job.scenario.name, result);
    }

    let confirmed = 0;
    for (const job of jobs) {
      if (job.kind === 'native') continue;
      const native = nativeResults.get(job.scenario.name);
      assert.ok(native, 'missing native baseline for ' + job.scenario.name);
      const emitted = await runTarget(executable, origin, job.prefix);
      assert.deepEqual(emitted.result, native.result,
        JSON.stringify({ scenario: job.scenario.name, mode: job.kind, native, emitted }));
      assert.notEqual(emitted.capturedSource, native.capturedSource,
        JSON.stringify({ scenario: job.scenario.name, mode: job.kind, native, emitted }));
      assert.ok(!emitted.capturedSource.includes('privateLocal'),
        JSON.stringify({ scenario: job.scenario.name, mode: job.kind, native, emitted }));
      const storage = job.storage;
      assert.ok(storage, 'missing storage metrics for ' + job.scenario.name + '/' + job.kind);
      assert.ok(storage.metrics.bindings > 0,
        JSON.stringify({ scenario: job.scenario.name, mode: job.kind, storageMetrics: storage.metrics }));
      const evidence = {
        browser: version.stdout.trim(),
        scenario: job.scenario.name,
        mode: job.kind,
        storageMetrics: storage.metrics,
        native,
        emitted
      };
      process.stdout.write('EXPECTED_WEAKMAP_BROWSER_SOURCE_CAPTURE_FALSE_SAFE ' +
        JSON.stringify(evidence) + '\n');
      confirmed++;
    }

    assert.equal(confirmed, scenarios.length * 2);
    process.stdout.write('WEAKMAP_BROWSER_FALSE_SAFE_MATRIX_CONFIRMED ' +
      JSON.stringify({
        browser: version.stdout.trim(),
        scenarios: scenarios.map(scenario => scenario.name),
        clientModes: ['coo', 'sco'],
        confirmed
      }) + '\n');
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve(undefined));
    });
  }
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
