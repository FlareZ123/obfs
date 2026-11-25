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
/** @typedef {{name:string,kind?:number,renamed:number,files?:BrowserSource[]}} BrowserCase */

/** @type {BrowserCase[]} */
const CASES=[
  {name:'direct-private-read',kind:0,renamed:2},
  {name:'observable-object-keys',kind:4,renamed:0},
  {name:'external-key-callback',kind:13,renamed:0},
  {name:'inherited-prototype-getter',kind:17,renamed:0},
  {name:'unrelated-descriptor-positive',kind:20,renamed:2},
  {name:'external-numeric-positive',kind:23,renamed:2},
  {name:'text-import-default-owner-module-type',renamed:1,files:[
    {path:'state.mjs',sourceType:'module',code:'export default {length:23};'},
    {path:'entry.mjs',sourceType:'module',code:
      'import source from "./state.mjs" with {type:"text"};export const value=source.length??-1;'}
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

/** @returns {string} */
function page() {
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script type="module">',
    'try {',
    'const mod=await import("./entry.mjs");',
    'const pre=document.createElement("pre");',
    'pre.id="result";pre.textContent=btoa(JSON.stringify(mod.value));',
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
 * Test six actual network-served, original vs generated ESM module graphs
 * with Chrome's genuine ESM linker and external host callback support.
 * @returns {Promise<{cases:number,nativeBrowserParity:true,protectedPrivateFields:number,observerRefusals:number,normalizedPublicFields:number}>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const files=new Map();
  let normalizedPublicFields=0;
  for(const item of CASES) {
    const fixture=item.files ?
      {scenario:'custom-import-attribute',files:item.files} :
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
