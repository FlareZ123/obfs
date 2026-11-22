'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const runBrowser=promisify(execFile);

/** @typedef {import('../src/core').SourceFile} SourceFile */

/** @type {SourceFile[]} */
const original=[{
  path:'public.mjs',sourceType:'module',
  code:'export function read(){return "source-visible-secret-value";}'+
    'export class Api{static label="source-visible-class-field";}'
}];

/** @returns {string} */
function page(){
  return '<!doctype html><html><body><script type="module">'+
    'try{const mod=await import("./public.mjs");'+
    'const answer={functionSource:Function.prototype.toString.call(mod.read),'+
    'functionValue:mod.read(),classSource:Function.prototype.toString.call(mod.Api),'+
    'classValue:mod.Api.label};'+
    'const pre=document.createElement("pre");pre.id="result";'+
    'pre.textContent=btoa(JSON.stringify(answer));document.body.appendChild(pre);'+
    '}catch(error){const pre=document.createElement("pre");pre.id="failure";'+
    'pre.textContent=String(error.stack||error);document.body.appendChild(pre);}' +
    '</script></body></html>';
}

/**
 * Browser-side external importer checks whether string encoding changes
 * Function#toString for exported functions/classes while preserving values.
 * @returns {Promise<{browser:'Chromium',literals:number,matchedGraphs:number}>}
 */
async function main(){
  const emitted=obfuscateFiles(original,{
    mode:'coo',seed:'external-string-source-browser',closedWorld:true,
    strings:true,minimumStringLength:1,properties:false,identifiers:false
  });
  const file=emitted.files.find(item=>item.path==='public.mjs');
  assert.ok(file && typeof file.code==='string');
  assert.ok(file.metrics.literals>=2,'both public string literals must be transformed');
  /** @type {Map<string,string>} */
  const resources=new Map();
  /** @type {Array<[string,SourceFile[]]>} */
  const graphs=[['original',original],['emitted',emitted.files]];
  for(const [folder,files] of graphs){
    for(const item of files)resources.set('/'+folder+'/'+item.path,String(item.code));
    resources.set('/'+folder+'/index.html',page());
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing HTTP test port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {unknown} */
    let baseline;
    let matchedGraphs=0;
    for(const folder of ['original','emitted']){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+folder+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,folder+' Chromium failed: '+stdout.slice(0,1500));
      const result=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
      if(folder==='original')baseline=result;
      else assert.deepEqual(result,baseline,'external browser callable/class source mismatch');
      matchedGraphs++;
    }
    const values=/** @type {{functionValue:string,classValue:string}|undefined} */ (baseline);
    assert.deepEqual(values,{functionValue:'source-visible-secret-value',classValue:'source-visible-class-field'});
    const outcome={browser:/** @type {const} */('Chromium'),literals:file.metrics.literals,matchedGraphs};
    console.log('EXPORTED_CALLABLE_STRING_BROWSER '+JSON.stringify(outcome));
    return outcome;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
