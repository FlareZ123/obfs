'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {makeFixture,SCENARIOS}=require('../sims/esm-observation-matrix');
const {normalizePublicFields}=require('../sims/public-token-normalizer');

const runBrowser=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} BrowserSource */
/** @typedef {{name:string,kind?:number,renamed:number,files?:BrowserSource[],duplicateSeparator?:boolean,expected?:unknown[]}} BrowserCase */

/** @type {BrowserCase[]} */
const CASES=[
  {name:'direct-private-read',kind:0,renamed:2},
  {name:'observable-object-keys',kind:4,renamed:0},
  {name:'external-key-callback',kind:13,renamed:0},
  {name:'inherited-prototype-getter',kind:17,renamed:0},
  {name:'unrelated-descriptor-positive',kind:20,renamed:2},
  {name:'external-numeric-positive',kind:23,renamed:2},
  {name:'sibling-alias-local-reader',renamed:1,files:[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:29};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {state as left} from "./state.mjs";'+
      'import {state as right} from "./state.mjs";'+
      'const alias=right;const getLeft=()=>left;'+
      'const local=value=>value.secretField;'+
      'console.log(local(alias),local(getLeft()));'}
  ]},
  {name:'sibling-alias-imported-reader',renamed:1,files:[
    {path:'state.mjs',sourceType:'module',code:
      'export const state={secretField:29};'+
      'export function peek(value){return value.secretField;}'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {state as left,state as right,peek} from "./state.mjs";'+
      'console.log(peek(left),peek(right));'}
  ]},
  {name:'repeated-separator-distinct-url-identities',renamed:0,duplicateSeparator:true,
    expected:[false,29,29,29,29],files:[
      {path:'state.mjs',sourceType:'module',code:
        'export const state={secretField:29};'+
        'export function peek(value){return value.secretField;}'},
      {path:'entry.mjs',sourceType:'module',code:
        'import {state as left} from "./state.mjs";'+
        'import {state as right,peek} from ".//state.mjs";'+
        'console.log(left===right,peek(left),peek(right),'+
        'left.secretField,right.secretField);'}
    ]},
  {name:'browser-url-dot-segment-target-distinct-from-posix-path',renamed:0,
    expected:[42],files:[
      {path:'state.mjs',sourceType:'module',code:'export const state={secretField:23};'},
      {path:'a/state.mjs',sourceType:'module',code:'export const state={secretField:42};'},
      {path:'entry.mjs',sourceType:'module',code:
        'import {state} from "./a//../state.mjs";console.log(state.secretField);'}
    ]},
  {name:'sibling-alias-escape',renamed:0,files:[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:29};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import {state as left,state as right} from "./state.mjs";'+
      'globalThis.escapedOwner=right;'+
      'const local=value=>value.secretField;'+
      'console.log(local(left));'}
  ]}
];

/**
 * A real browser has a read-only window self-alias. The Node-native host
 * fixture replaces globalThis.window, so adapt its dedicated test shim to
 * install the same API on the existing Window object instead. Apply this
 * identically to original, emitted and attacker-normalized files.
 * @param {string} filename
 * @param {string} source
 * @returns {string}
 */
function browserCode(filename,source) {
  if(filename!=='host.mjs')return source;
  const adapted=source.replace(
    /^globalThis\.window=\{api:(\{.*\})\};$/u,'globalThis.window.api=$1;');
  assert.notEqual(adapted,source,'Expected the known Node host shim');
  return adapted;
}

/**
 * @param {string} entryUrl
 * @returns {string}
 */
function page(entryUrl) {
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script type="module">',
    'let capturedArgs;',
    'let logged=false;',
    'const originalLog=console.log;',
    'console.log=(...args)=>{if(logged)throw Error("Multiple fixture outputs");logged=true;capturedArgs=args;};',
    'try {',
    `const mod=await import(${JSON.stringify(entryUrl)});`,
    'console.log=originalLog;',
    'const hasValue=Object.hasOwn(mod,"value");',
    'if(!hasValue&&!logged)throw Error("Missing fixture output");',
    'const encoded=JSON.stringify(hasValue?mod.value:capturedArgs);',
    'if(typeof encoded!=="string")throw Error("Fixture value is not JSON serializable");',
    'const pre=document.createElement("pre");',
    'pre.id="result";pre.textContent=btoa(encoded);',
    'document.body.appendChild(pre);',
    '} catch(error) {',
    'console.log=originalLog;',
    'const pre=document.createElement("pre");pre.id="failure";',
    'pre.textContent=String(error.stack||error);',
    'document.body.appendChild(pre);',
    '}',
    '</script></body></html>'
  ].join('\n');
}

/**
 * Test eleven actual network-served, original vs generated ESM module graphs
 * with Chrome's genuine ESM linker and a known in-graph host shim.
 * @returns {Promise<{cases:number,nativeBrowserParity:true,protectedPrivateFields:number,observerRefusals:number,normalizedPublicFields:number}>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const files=new Map();
  let normalizedPublicFields=0;
  for(const item of CASES) {
    const fixture=item.files ?
      {scenario:'custom-sibling-alias',files:item.files} :
      makeFixture(7,item.kind??0);
    if(item.kind!==undefined)assert.equal(fixture.scenario,SCENARIOS[item.kind]);
    const protectedFiles=obfuscateFiles(fixture.files,{
      mode:'coo',closedWorld:true,identifiers:false,strings:false,
      seed:'esm-observer-browser-'+item.name
    });
    assert.equal(protectedFiles.crossFile.properties,item.renamed,
      item.name+' should retain the declared protected/refused field count');
    const attackInputs=protectedFiles.files.map(file=>{
      assert.equal(typeof file.code,'string');
      return {path:file.path,sourceType:/** @type {const} */('module'),
        code:/** @type {string} */(file.code)};
    });
    const attacked=normalizePublicFields(attackInputs);
    assert.equal(attacked.properties,item.renamed,
      item.name+' should normalize every privately renamed public field');
    normalizedPublicFields+=attacked.properties;
    for(const source of attacked.files) {
      const pathname='/'+item.name+'/normalized/'+source.path;
      files.set(pathname,browserCode(source.path,source.code));
      if(item.duplicateSeparator&&source.path==='state.mjs')
        files.set('/'+item.name+'/normalized//state.mjs',browserCode(source.path,source.code));
    }
    for(const source of fixture.files) {
      const pathname='/'+item.name+'/original/'+source.path;
      files.set(pathname,browserCode(source.path,source.code));
      if(item.duplicateSeparator&&source.path==='state.mjs')
        files.set('/'+item.name+'/original//state.mjs',browserCode(source.path,source.code));
    }
    for(const source of protectedFiles.files) {
      assert.equal(typeof source.code,'string');
      const pathname='/'+item.name+'/emitted/'+source.path;
      const emitted=browserCode(source.path,/** @type {string} */(source.code));
      files.set(pathname,emitted);
      if(item.duplicateSeparator&&source.path==='state.mjs')
        files.set('/'+item.name+'/emitted//state.mjs',emitted);
    }
  }
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const url=new URL(request.url??'/', 'http://localhost');
    if(url.pathname.endsWith('/index.html')){
      const host=request.headers.host;
      if(typeof host!=='string')throw Error('Browser request must include Host');
      const basePath=url.pathname.slice(0,url.pathname.lastIndexOf('/')+1);
      const entryUrl=new URL('entry.mjs','http://'+host+basePath).href;
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(page(entryUrl));
      return;
    }
    const content=files.get(url.pathname);
    if(content===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(content);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('No localhost listening socket');
    const origin='http://127.0.0.1:'+addr.port;
    let renamed=0,refusals=0;
    for(const item of CASES) {
      /** @type {unknown} */
      let baseline;
      for(const target of ['original','emitted','normalized']) {
        const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=12000','--dump-dom',
          origin+'/'+item.name+'/'+target+'/index.html'
        ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
        const resultText=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
        assert.ok(resultText,item.name+'/'+target+' Chrome failure: '+stdout.slice(0,1200));
        const result=JSON.parse(Buffer.from(resultText,'base64').toString('utf8'));
        if(target==='original') {
          baseline=result;
          if(item.expected)assert.deepEqual(result,item.expected,item.name+' native URL-identity contract');
        } else assert.deepEqual(result,baseline,item.name+' emitted/native browser mismatch');
      }
      if(item.renamed)renamed+=item.renamed;
      else refusals++;
    }
    const report={cases:CASES.length,protectedPrivateFields:renamed,observerRefusals:refusals,
      normalizedPublicFields,
      nativeBrowserParity:/** @type {const} */(true)};
    process.stdout.write('ESM_OBSERVER_CHROMIUM '+JSON.stringify(report)+'\n');
    return report;
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;
});
module.exports={main};
