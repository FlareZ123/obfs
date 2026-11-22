'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const runBrowser=promisify(execFile);

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,files:SourceFile[],target:string,receiver:string,kind:'properties'|'bindings'}} Fixture */

/** @type {Fixture[]} */
const fixtures=[
  {name:'named-alias',files:[{path:'private.mjs',sourceType:'module',
    code:'const owner={secretField:11};function read(){return owner.secretField;}export {read as publicRead};'}],
  target:'private.mjs',receiver:'m.publicRead',kind:'properties'},
  {name:'default-arrow',files:[{path:'private.mjs',sourceType:'module',
    code:'const owner={secretField:17};const read=()=>owner.secretField;export default read;'}],
  target:'private.mjs',receiver:'m.default',kind:'properties'},
  {name:'class-method',files:[{path:'private.mjs',sourceType:'module',
    code:'const owner={secretField:23};export class Api{read(){return owner.secretField;}}'}],
  target:'private.mjs',receiver:'(new m.Api()).read',kind:'properties'},
  {name:'named-reexport',files:[
    {path:'private.mjs',sourceType:'module',
      code:'const owner={secretField:31};function read(){return owner.secretField;}export {read};'},
    {path:'bridge.mjs',sourceType:'module',
      code:'export {read as publicRead} from "./private.mjs";'}
  ],target:'bridge.mjs',receiver:'m.publicRead',kind:'properties'},
  {name:'array-held',files:[{path:'private.mjs',sourceType:'module',
    code:'const owner={secretField:37};export const api=[function read(){return owner.secretField;}];'}],
  target:'private.mjs',receiver:'m.api[0]',kind:'properties'},
  {name:'named-parameter',files:[{path:'private.mjs',sourceType:'module',
    code:'function read(secretParam){return secretParam+1;}export {read as publicRead};'}],
  target:'private.mjs',receiver:'m.publicRead',kind:'bindings'}
];

/**
 * The browser observer runs as an unsupplied consumer. It can read the
 * imported callable's exact Function.prototype.toString source text.
 * @param {Fixture} fixture
 * @returns {string}
 */
function page(fixture) {
  return '<!doctype html><html><body><script type="module">'+
    'try { const m=await import('+JSON.stringify('./'+fixture.target)+');'+
    'const fn='+fixture.receiver+';'+
    'const outcome={source:fn.toString(),value:fn('+(
      fixture.kind==='bindings'?'9':''
    )+')};'+
    'const p=document.createElement("pre");p.id="result";'+
    'p.textContent=btoa(JSON.stringify(outcome));document.body.append(p);'+
    '} catch(error) { const p=document.createElement("pre");p.id="failure";'+
    'p.textContent=String(error.stack||error);document.body.append(p); }'+
    '</script></body></html>';
}

/**
 * One original-versus-compiled comparison for a real browser ESM import.
 * @param {string} url
 * @returns {Promise<{source:string,value:number}>}
 */
async function readPage(url) {
  const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',url
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium observer did not return a value: '+stdout.slice(0,1600));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/**
 * Reproduce the current bounded external-source exposure in a real Chromium
 * module graph. Changed spelling is the expected *negative* observation for
 * this diagnostic, not a correctness acceptance condition for a fixed compiler.
 * The separate Node matrix asserts that actual semantic parity is required.
 *
 * @returns {Promise<{cases:number,sourceMismatches:number,ordinaryValueMatches:number,positiveRewrites:number}>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const resources=new Map();
  /** @type {{mode:'coo'|'sco'|'sno',name:string,sourceUrl:string,emittedUrl:string,rewrites:number}[]} */
  const pairs=[];
  for(const fixture of fixtures) {
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      const prefix='/'+mode+'/'+fixture.name;
      const emitted=obfuscateFiles(fixture.files,{
        mode,closedWorld:true,seed:'esm-external-source-browser-'+fixture.name+'-'+mode,
        strings:false,properties:fixture.kind==='properties',
        identifiers:fixture.kind==='bindings'
      });
      const rewrites=emitted.files.reduce((count,file)=>count+(
        fixture.kind==='properties'?file.metrics.properties:file.metrics.bindings
      ),0);
      for(const [variant,files] of /** @type {Array<[string,SourceFile[]]>} */ (
        [['original',fixture.files],['emitted',emitted.files]]
      )) {
        for(const file of files)resources.set(prefix+'/'+variant+'/'+file.path,String(file.code));
        resources.set(prefix+'/'+variant+'/index.html',page(fixture));
      }
      pairs.push({mode,name:fixture.name,
        sourceUrl:prefix+'/original/index.html',
        emittedUrl:prefix+'/emitted/index.html',rewrites});
    }
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  let sourceMismatches=0;
  let ordinaryValueMatches=0;
  let positiveRewrites=0;
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing loopback server port');
    const origin='http://127.0.0.1:'+address.port;
    for(const pair of pairs) {
      const baseline=await readPage(origin+pair.sourceUrl);
      const transformed=await readPage(origin+pair.emittedUrl);
      const sourceEqual=baseline.source===transformed.source;
      const valueEqual=Object.is(baseline.value,transformed.value);
      sourceMismatches+=Number(!sourceEqual);
      ordinaryValueMatches+=Number(valueEqual);
      positiveRewrites+=Number(pair.rewrites>0);
      console.log('ESM_PUBLIC_BROWSER '+JSON.stringify({
        mode:pair.mode,case:pair.name,sourceEqual,valueEqual,rewrites:pair.rewrites
      }));
    }
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
  const summary={cases:pairs.length,sourceMismatches,ordinaryValueMatches,positiveRewrites};
  assert.equal(summary.cases,18);
  assert.equal(summary.ordinaryValueMatches,18,'Ordinary return values must be equal');
  assert.equal(summary.sourceMismatches,18,
    'Historical red witness no longer reproduces; update to an actual parity test');
  assert.equal(summary.positiveRewrites,18,'Each historical red case must edit source');
  console.log('ESM_PUBLIC_BROWSER_SUMMARY '+JSON.stringify(summary));
  return summary;
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
