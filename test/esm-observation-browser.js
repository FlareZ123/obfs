'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {makeFixture,SCENARIOS}=require('../sims/esm-observation-matrix');
const {normalizePublicFields}=require('../sims/public-token-normalizer');

const runBrowser=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{name:string,kind:number,renamed:number,files?:ModuleFile[],metricsFile?:string}} BrowserCase */

/** @type {ModuleFile[]} */
const PRIVATE_DECLARATION_READER_GRAPH=[
  {path:'owner.mjs',sourceType:'module',code:[
    'const privateRecord={secretAlpha:23,secretBeta:7};',
    'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
    'function readBeta(ownerBeta){return ownerBeta.secretBeta;}',
    'export function calculate(k){return k*readAlpha(privateRecord)+readBeta(privateRecord);}'
  ].join('\n')},
  {path:'api.mjs',sourceType:'module',code:[
    'import {calculate} from "./owner.mjs";',
    'export function execute(k){return calculate(k)+calculate(k+1);}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {execute} from "./api.mjs";',
    'export {calculate} from "./owner.mjs";',
    'export const value=[execute(0),execute(1),execute(13)];'
  ].join('\n')}
];

/** @type {ModuleFile[]} */
const EXPORTED_DIRECT_READER_GRAPH=[
  {path:'owner.mjs',sourceType:'module',code:[
    'const privateRecord={secretAlpha:23,secretBeta:7};',
    'export function calculate(k){return k*privateRecord.secretAlpha+privateRecord.secretBeta;}'
  ].join('\n')},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {calculate} from "./owner.mjs";',
    'export {calculate};',
    'export const value=[calculate(0),calculate(1),calculate(13)];'
  ].join('\n')}
];

/** @type {BrowserCase[]} */
const CASES=[
  {name:'direct-private-read',kind:0,renamed:2},
  {name:'observable-object-keys',kind:4,renamed:0},
  {name:'external-key-callback',kind:13,renamed:0},
  {name:'inherited-prototype-getter',kind:17,renamed:0},
  {name:'unrelated-descriptor-positive',kind:20,renamed:2},
  {name:'external-numeric-positive',kind:23,renamed:2},
  {name:'private-declaration-reader',kind:-1,renamed:2,
    files:PRIVATE_DECLARATION_READER_GRAPH,metricsFile:'owner.mjs'},
  {name:'exported-direct-reader-refusal',kind:-2,renamed:0,
    files:EXPORTED_DIRECT_READER_GRAPH,metricsFile:'owner.mjs'}
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

/** @returns {string} */
function page() {
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script type="module">',
    'try {',
    'const mod=await import("./entry.mjs");',
    'const pre=document.createElement("pre");',
    'pre.id="result";pre.textContent=btoa(JSON.stringify({value:mod.value,source:typeof mod.calculate==="function"?mod.calculate.toString():null}));',
    'document.body.appendChild(pre);',
    '} catch(error) {',
    'const pre=document.createElement("pre");pre.id="failure";',
    'pre.textContent=String(error.stack||error);',
    'document.body.appendChild(pre);',
    '}',
    '</script></body></html>'
  ].join('\n');
}

/**
 * Test eight actual network-served, original vs generated ESM module graphs
 * with Chrome's genuine ESM linker and external host callback support.
 * @returns {Promise<{cases:number,nativeBrowserParity:true,protectedPrivateFields:number,observerRefusals:number,normalizedPublicFields:number}>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const files=new Map();
  let normalizedPublicFields=0;
  for(const item of CASES) {
    const fixture=item.files?{files:item.files,scenario:null}:makeFixture(7,item.kind);
    if(fixture.scenario!==null)assert.equal(fixture.scenario,SCENARIOS[item.kind]);
    const protectedFiles=obfuscateFiles(fixture.files,{
      mode:'coo',closedWorld:true,identifiers:false,strings:false,
      seed:'esm-observer-browser-'+item.name
    });
    if(item.metricsFile){
      const ownerOutput=protectedFiles.files.find(file=>file.path===item.metricsFile);
      assert.ok(ownerOutput,item.name+': expected owner module');
      assert.equal(ownerOutput.metrics.properties,item.renamed,
        item.name+' should retain the declared protected/refused field count');
    }else{
      assert.equal(protectedFiles.crossFile.properties,item.renamed,
        item.name+' should retain the declared protected/refused field count');
    }
    const attackInputs=protectedFiles.files.map(file=>{
      assert.equal(typeof file.code,'string');
      return {path:file.path,sourceType:/** @type {const} */('module'),
        code:/** @type {string} */(file.code)};
    });
    const attacked=normalizePublicFields(attackInputs);
    assert.equal(attacked.properties,item.renamed,
      item.name+' should normalize every privately renamed public field');
    normalizedPublicFields+=attacked.properties;
    for(const source of attacked.files)files.set('/'+item.name+'/normalized/'+source.path,browserCode(source.path,source.code));
    for(const source of fixture.files)
      files.set('/'+item.name+'/original/'+source.path,browserCode(source.path,source.code));
    for(const source of protectedFiles.files) {
      assert.equal(typeof source.code,'string');
      files.set('/'+item.name+'/emitted/'+source.path,
        browserCode(source.path,/** @type {string} */(source.code)));
    }
  }
  const html=page();
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const url=new URL(request.url??'/', 'http://localhost');
    if(url.pathname.endsWith('/index.html')){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html);
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
        if(target==='original') baseline=result;
        else assert.deepEqual(result,baseline,item.name+' emitted/native browser mismatch');
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
