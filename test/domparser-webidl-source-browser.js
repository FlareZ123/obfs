'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const execFileAsync=promisify(execFile);

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @typedef {{name:string,code:string,publicSource:boolean}} Fixture */

/** @type {Fixture[]} */
const fixtures=[
  {
    name:'domparser-parsefromstring',
    code:"function observed(){return 'source-observed-literal';}"+
      "const doc=new DOMParser().parseFromString(observed,'text/html');"+
      "globalThis.__obfsResult={coerced:doc.body.textContent,value:observed()};",
    publicSource:true
  },
  {
    name:'element-setattribute',
    code:"function observed(){return 'source-observed-literal';}"+
      "const element=document.createElement('span');"+
      "element.setAttribute('data-source',observed);"+
      "globalThis.__obfsResult={coerced:element.getAttribute('data-source'),value:observed()};",
    publicSource:true
  },
  {
    name:'nonescaping-control',
    code:"function observed(){return 'source-observed-literal';}"+
      "globalThis.__obfsResult={coerced:'inert',value:observed()};",
    publicSource:false
  }
];

/** @returns {string} */
function page() {
  return '<!doctype html><html><body><script type="module">'+
    'try{await import("./entry.mjs");'+
    'const pre=document.createElement("pre");pre.id="result";'+
    'pre.textContent=btoa(JSON.stringify(globalThis.__obfsResult));'+
    'document.body.append(pre);'+
    '}catch(error){const pre=document.createElement("pre");pre.id="failure";'+
    'pre.textContent=String(error.stack||error);document.body.append(pre);}' +
    '</script></body></html>';
}

/**
 * @param {string} url
 * @returns {Promise<{coerced:string|null,value:string}>}
 */
async function readBrowser(url) {
  const {stdout}=await execFileAsync(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',url
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  const value=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(value,'Chromium returned no result: '+stdout.slice(0,1800));
  return JSON.parse(Buffer.from(value,'base64').toString('utf8'));
}

/**
 * Capture original-vs-obfuscated browser Web IDL string coercion of functions.
 * The control verifies that the selected encoder can still change a
 * nonescaping private string. This is a diagnostic and deliberately does not
 * assert the candidate's suspected source mismatch before it is reproduced.
 *
 * @returns {Promise<{cases:number,valueMatches:number,sourceMismatches:number,publicStringRewrites:number,privateRewriteControls:number}>}
 */
async function main() {
  /** @type {Map<string,string>} */
  const resources=new Map();
  /** @type {{mode:string,name:string,publicSource:boolean,original:string,emitted:string,literals:number}[]} */
  const pairs=[];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    for(const fixture of fixtures) {
      /** @type {SourceFile[]} */
      const source=[{path:'entry.mjs',sourceType:'module',code:fixture.code}];
      const emitted=obfuscateFiles(source,{
        mode,seed:'domparser-webidl-'+mode+'-'+fixture.name,
        strings:true,properties:false,identifiers:false
      });
      const prefix='/'+mode+'/'+fixture.name;
      const original=prefix+'/original/index.html';
      const compiled=prefix+'/emitted/index.html';
      resources.set(prefix+'/original/entry.mjs',fixture.code);
      resources.set(prefix+'/emitted/entry.mjs',String(emitted.files[0].code));
      resources.set(original,page());
      resources.set(compiled,page());
      pairs.push({
        mode,name:fixture.name,publicSource:fixture.publicSource,
        original,emitted:compiled,literals:emitted.files[0].metrics.literals
      });
    }
  }
  const server=http.createServer((request,response)=>{
    const path=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(path);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  let valueMatches=0;
  let sourceMismatches=0;
  let publicStringRewrites=0;
  let privateRewriteControls=0;
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('No bound loopback address');
    const origin='http://127.0.0.1:'+addr.port;
    for(const pair of pairs) {
      const original=await readBrowser(origin+pair.original);
      const compiled=await readBrowser(origin+pair.emitted);
      const valueEqual=original.value===compiled.value;
      const sourceEqual=original.coerced===compiled.coerced;
      valueMatches+=Number(valueEqual);
      if(pair.publicSource) {
        sourceMismatches+=Number(!sourceEqual);
        publicStringRewrites+=Number(pair.literals>0);
      }else if(pair.literals>0&&valueEqual&&sourceEqual)privateRewriteControls++;
      console.log('WEBIDL_FUNCTION_SOURCE '+JSON.stringify({
        mode:pair.mode,case:pair.name,literals:pair.literals,
        valueEqual,sourceEqual,originalSource:original.coerced,
        compiledSource:compiled.coerced
      }));
      assert.ok(valueEqual,'Ordinary runtime behavior changed: '+pair.mode+'/'+pair.name);
    }
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
  const summary={
    cases:pairs.length,valueMatches,sourceMismatches,
    publicStringRewrites,privateRewriteControls
  };
  assert.equal(summary.cases,9);
  assert.equal(summary.valueMatches,9);
  console.log('WEBIDL_FUNCTION_SOURCE_SUMMARY '+JSON.stringify(summary));
  return summary;
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
