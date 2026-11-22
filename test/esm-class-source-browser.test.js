'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync, execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

const runBrowser = promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
/** @typedef {{label:string,leaf:string,entry:string,expectedRenames:number}} Case */

const owner = 'const owner={privateField:7};' +
  'class Reader{value(){return owner.privateField;}}';

/** @type {Case[]} */
const cases = [
  {
    label: 'exported-instance',
    leaf: owner + 'export const instance=new Reader();',
    entry: 'const intrinsicFunctionSource=Function.prototype.toString;' +
      'const {instance}=await import("./leaf.mjs");' +
      'export const report={value:instance.value(),' +
      'classSource:intrinsicFunctionSource.call(instance.constructor),' +
      'methodSource:intrinsicFunctionSource.call(instance.value)};',
    expectedRenames: 0
  },
  {
    label: 'private-primitive',
    leaf: owner + 'export const primitive=new Reader().value();',
    entry: 'import {primitive} from "./leaf.mjs";' +
      'export const report={value:primitive};',
    expectedRenames: 1
  }
];

/**
 * @param {string} code
 * @returns {{source:Source,properties:number}}
 */
function compile(code) {
  const output = obfuscateFiles([{path:'leaf.mjs',sourceType:'module',code}], {
    mode:'coo', seed:'esm-class-source-browser-v1',
    closedWorld:false, strings:false, identifiers:false
  });
  const leaf = output.files[0];
  assert.equal(typeof leaf.code, 'string');
  return {
    source: {path:'leaf.mjs',sourceType:'module',code: /** @type {string} */ (leaf.code)},
    properties:leaf.metrics.properties
  };
}

/**
 * @param {string} filename
 * @returns {unknown}
 */
function loadNode(filename) {
  const child = spawnSync(process.execPath,[filename], {
    encoding:'utf8', timeout:10000
  });
  assert.ifError(child.error);
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout);
}

/** @returns {string} */
function page() {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script type="module">try{' +
    'const x=await import("./entry.mjs");' +
    'const el=document.createElement("pre");el.id="result";' +
    'el.textContent=btoa(JSON.stringify(x.report));document.body.appendChild(el);' +
    '}catch(error){const el=document.createElement("pre");el.id="failure";' +
    'el.textContent=String(error.stack||error);document.body.appendChild(el);}' +
    '</script></body></html>';
}

/**
 * @param {string} origin
 * @param {string} label
 * @param {string} variant
 * @returns {Promise<unknown>}
 */
async function loadChrome(origin,label,variant) {
  const {stdout} = await runBrowser(process.env.CHROMIUM_BIN || 'google-chrome', [
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',
    origin+'/'+label+'/'+variant+'/index.html'
  ], {encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,label+'/'+variant+' Chromium error: '+stdout.slice(0,1500));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

test('external ESM class-instance source and private-primitive contrast in Node and Chromium',
  async () => {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-esm-class-observer-'));
    /** @type {Map<string,string>} */
    const resources=new Map();
    /** @type {Array<{label:string,variant:string,value:unknown,renamed:number}>} */
    const observations=[];
    try {
      for(const item of cases) {
        const transformed=compile(item.leaf);
        const variants=[
          {name:'original',source:item.leaf},
          {name:'emitted',source:transformed.source.code}
        ];
        for(const variant of variants) {
          const folder=path.join(directory,item.label,variant.name);
          await fs.mkdir(folder,{recursive:true});
          await atomicWrite(path.join(folder,'leaf.mjs'),variant.source);
          await atomicWrite(path.join(folder,'entry.mjs'),item.entry+
            'process.stdout.write(JSON.stringify(report));');
          const value=loadNode(path.join(folder,'entry.mjs'));
          observations.push({label:item.label,variant:variant.name,value,
            renamed:transformed.properties});
          resources.set('/'+item.label+'/'+variant.name+'/leaf.mjs',variant.source);
          resources.set('/'+item.label+'/'+variant.name+'/entry.mjs',item.entry);
          resources.set('/'+item.label+'/'+variant.name+'/index.html',page());
        }
      }
      if(process.platform!=='win32') {
        const server=http.createServer((request,response)=>{
          const pathname=new URL(request.url || '/','http://127.0.0.1').pathname;
          const source=resources.get(pathname);
          if(source===undefined){response.writeHead(404).end();return;}
          response.writeHead(200,{
            'content-type':pathname.endsWith('.html') ?
              'text/html; charset=utf-8':'text/javascript; charset=utf-8',
            'cache-control':'no-store'
          });
          response.end(source);
        });
        await new Promise((resolve,reject)=>{
          server.once('error',reject);
          server.listen(0,'127.0.0.1',()=>resolve(undefined));
        });
        try {
          const address=server.address();
          assert.ok(address && typeof address!=='string');
          const origin='http://127.0.0.1:'+address.port;
          for(const observed of observations) {
            const browser=await loadChrome(origin,observed.label,observed.variant);
            assert.deepEqual(browser,observed.value,
              'Original/emitted host mismatch before differential for '+
              observed.label+'/'+observed.variant);
          }
        } finally {
          await new Promise(resolve=>server.close(resolve));
        }
      }
      for(const item of [...cases].reverse()) {
        const native=observations.find(v=>v.label===item.label && v.variant==='original');
        const emitted=observations.find(v=>v.label===item.label && v.variant==='emitted');
        assert.ok(native && emitted);
        assert.equal(/** @type {{value:number}} */ (native.value).value,7);
        assert.deepEqual(emitted.value,native.value,
          'An independent importer observed changed method or class source');
        assert.equal(emitted.renamed,item.expectedRenames,
          'External callable source requires stable field spelling; private result must still rename');
      }
    } finally {
      await fs.rm(directory,{recursive:true,force:true});
    }
  }
);
