'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {fixture}=require('../sims/interfile-api-fuzz');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');

const exec=promisify(execFile);
const KINDS=[0,9,10,11,12];
const SEEDS=[3,11];

/**
 * Node's test host assigns globalThis.window, while the real browser owns a
 * nonwritable Window self-alias. Change only the known host shim, identically
 * across original, protected and source-only normalized distributions.
 * @param {string} filename
 * @param {string} source
 * @returns {string}
 */
function browserSource(filename,source) {
  if(filename!=='api.mjs')return source;
  const adapted=source.replace(
    /^globalThis\.window=\{api:(\{.*\})\};$/u,
    'globalThis.window.api=$1;'
  );
  assert.notEqual(adapted,source,'Host shim did not match the declared graph');
  return adapted;
}

/**
 * A separate, untransformed browser host serializes application outputs.
 * None of this harness source enters the compiler or its closed-world graph.
 * @param {string[]} scenarios
 * @returns {string}
 */
function runner(scenarios) {
  return [
    'const scenarios='+JSON.stringify(scenarios)+';',
    'async function main(){',
    'const results=[];',
    'for(const scenario of scenarios){',
    'for(const variant of ["original","emitted","normalized"]){',
    'const mod=await import("/"+scenario+"/"+variant+"/entry.mjs");',
    'results.push({scenario,variant,value:await mod.value});',
    '}}',
    'const pre=document.createElement("pre");',
    'pre.id="result";pre.textContent=btoa(JSON.stringify(results));',
    'document.body.appendChild(pre);',
    '}',
    'main().catch(error=>{',
    'const pre=document.createElement("pre");pre.id="failure";',
    'pre.textContent=String(error.stack||error);document.body.appendChild(pre);',
    '});'
  ].join('\n');
}

/**
 * Cross-file real Chromium differential test for async forwarding, reflected
 * shared references and the public-only key-label normalizer.
 * @returns {Promise<{cases:number,protectedFields:number,refusedGraphs:number,
 *   attackerRelabeledFields:number,executions:number,nativeBrowserParity:true}>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const sources=new Map();
  /** @type {string[]} */
  const scenarios=[];
  let protectedFields=0;
  let refusedGraphs=0;
  let attackerRelabeledFields=0;

  for(const seed of SEEDS)for(const kind of KINDS) {
    const item=fixture(seed,kind);
    const scenario='seed'+seed+'-kind'+kind;
    scenarios.push(scenario);
    const expected=kind===0?2:0;
    const built=obfuscateFiles(item.files,{
      mode:'coo',closedWorld:true,
      seed:'browser-async-shared-reference/'+scenario,
      strings:false,identifiers:false
    });
    assert.equal(built.crossFile.properties,expected,
      scenario+' must retain protected-yield/refusal distinction');
    const publicFiles=built.files.map(file=>{
      assert.equal(typeof file.code,'string');
      return {path:file.path,sourceType:/** @type {const} */('module'),
        code:/** @type {string} */(file.code)};
    });
    const attacker=normalizeDistributedFiles(publicFiles);
    assert.equal(attacker.properties,expected,
      scenario+' public-only normalizer must relabel every changed field');
    attackerRelabeledFields+=attacker.properties;
    if(expected)protectedFields+=expected;
    else refusedGraphs++;

    /** @type {[string,ReadonlyArray<{path:string,code:string|Buffer}>][]} */
    const distributions=[
      ['original',item.files],
      ['emitted',publicFiles],
      ['normalized',attacker.files]
    ];
    for(const [variant,files] of distributions)for(const file of files) {
      assert.equal(typeof file.code,'string');
      sources.set('/'+scenario+'/'+variant+'/'+file.path,
        browserSource(file.path,/** @type {string} */(file.code)));
    }
  }

  const html='<!doctype html><html><head><meta charset="utf-8">'+
    '<script type="module" src="/runner.mjs"></script></head><body></body></html>';
  const hostSource=runner(scenarios);
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const url=new URL(request.url??'/', 'http://localhost');
    if(url.pathname==='/') {
      response.writeHead(200,{
        'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'"
      });
      response.end(html);
      return;
    }
    const code=url.pathname==='/runner.mjs'?hostSource:sources.get(url.pathname);
    if(code===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(code);
  });

  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('Missing localhost HTTP port');
    const origin='http://127.0.0.1:'+addr.port;
    const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=15000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
    const match=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u);
    assert.ok(match,'Chromium did not complete ESM runner: '+stdout.slice(0,1800));
    const rows=/** @type {{scenario:string,variant:string,value:unknown}[]} */ (
      JSON.parse(Buffer.from(match[1],'base64').toString('utf8'))
    );
    assert.equal(rows.length,scenarios.length*3);
    for(let i=0;i<scenarios.length;i++) {
      const [native,emitted,normalized]=rows.slice(i*3,i*3+3);
      assert.equal(native.scenario,scenarios[i]);
      assert.deepEqual([native.variant,emitted.variant,normalized.variant],
        ['original','emitted','normalized']);
      assert.deepEqual(emitted.value,native.value,
        scenarios[i]+' protected browser graph output mismatch');
      assert.deepEqual(normalized.value,native.value,
        scenarios[i]+' public-only attacker browser graph output mismatch');
      if(scenarios[i].includes('kind9')) {
        assert.equal(typeof native.value,'string');
        assert.match(/** @type {string} */(native.value),/privateField/u,
          'Async reflection must settle to an observable key string');
      } else if(scenarios[i].includes('kind10')) {
        assert.equal(typeof native.value,'number');
      }
    }
    const report={
      cases:scenarios.length,protectedFields,refusedGraphs,
      attackerRelabeledFields,executions:rows.length,
      nativeBrowserParity:/** @type {const} */(true)
    };
    process.stdout.write('INTERFILE_ASYNC_CHROMIUM '+JSON.stringify(report)+'\n');
    return report;
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
