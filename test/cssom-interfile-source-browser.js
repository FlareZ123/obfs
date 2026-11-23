'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

/**
 * @param {boolean} primitive
 * @returns {ESMFile[]}
 */
function sources(primitive) {
  const logic=primitive?
    'const state={otherSecret:73};'+
    'export const independentValue=state.otherSecret;'+
    'export function inspect(){return 31;}' :
    'const externalOwner={observedSecret:31};'+
    'const independent={otherSecret:73};'+
    'export function inspect(){return externalOwner.observedSecret;}'+
    'export const independentValue=independent.otherSecret;';
  const observer='import {inspect,independentValue} from "./logic.mjs";'+
    'const style=document.createElement("div").style;'+
    'style.setProperty("--observed",'+(primitive?'"literal"':'inspect')+');'+
    'export const observed={text:style.getPropertyValue("--observed"),'+
    'value:inspect(),independent:independentValue};';
  return [
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ];
}

/**
 * @param {ESMFile[]} files
 * @param {string} seed
 * @returns {{files:ESMFile[],properties:number}}
 */
function compile(files,seed) {
  const compiled=obfuscateFiles(files,{
    mode:'coo',seed,closedWorld:true,
    properties:true,identifiers:true,strings:false
  });
  return {
    files:compiled.files.map(file=>({
      path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
    })),
    properties:compiled.files.reduce((n,file)=>n+file.metrics.properties,0)
  };
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,string>} */
  const paths=new Map();
  /** @type {Array<{id:string,root:string,properties:number}>} */
  const metadata=[];
  for(const primitive of [false,true]) {
    const source=sources(primitive);
    const compiled=compile(source,'cssom-crossfile-chrome/'+String(primitive));
    if(primitive)assert.ok(compiled.properties>0,
      'Primitive-only input must transform an actual owner');
    const label=primitive?'positive':'negative';
    for(const [prefix,files] of [['native',source],['emitted',compiled.files]]) {
      const root='/'+label+'/'+prefix+'/';
      for(const file of files)paths.set(root+file.path,file.code);
      metadata.push({id:label+'/'+prefix,root,properties:compiled.properties});
    }
  }
  /** @type {unknown} */
  let browser=null;
  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'try {',
    'const [a,b,c,d]=await Promise.all([',
    'import("/negative/native/observer.mjs"),',
    'import("/negative/emitted/observer.mjs"),',
    'import("/positive/native/observer.mjs"),',
    'import("/positive/emitted/observer.mjs")]);',
    'const data={nativeNegative:a.observed,emittedNegative:b.observed,',
    'nativePositive:c.observed,emittedPositive:d.observed};',
    'await fetch("/report",{method:"POST",headers:{"Content-Type":"application/json"},',
    'body:JSON.stringify(data)});',
    'document.getElementById("result").textContent="PASS crossfile probe";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}',
    '</script>'
  ].join('\n');
  const server=http.createServer(async(request,response)=>{
    const pathname=request.url??'';
    if(request.method==='POST'&&pathname==='/report') {
      let data='';
      for await(const chunk of request)data+=String(chunk);
      browser=JSON.parse(data);
      response.writeHead(200,{'Content-Type':'text/plain'});
      response.end('ok');
      return;
    }
    const body=pathname==='/'?html:paths.get(pathname);
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':pathname==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Missing local TCP port');
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=5000','--dump-dom',
        'http://127.0.0.1:'+addr.port+'/'
      ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,/<pre id="result">PASS crossfile probe<\/pre>/u,stderr);
    const observed=/** @type {{
      nativeNegative:{text:string,value:number,independent:number},
      emittedNegative:{text:string,value:number,independent:number},
      nativePositive:{text:string,value:number,independent:number},
      emittedPositive:{text:string,value:number,independent:number}
    }} */(browser);
    assert.ok(observed.nativeNegative.text.includes('observedSecret'));
    assert.equal(observed.nativeNegative.value,31);
    assert.equal(observed.emittedNegative.value,31);
    assert.equal(observed.nativeNegative.independent,73);
    assert.equal(observed.emittedNegative.independent,73);
    assert.notEqual(observed.nativeNegative.text,observed.emittedNegative.text,
      'The current compiler is expected to miss cross-file implicit CSSOM source observation');
    assert.equal(JSON.stringify(observed.nativePositive),
      JSON.stringify(observed.emittedPositive),
      'Primitive-only cross-file source may still transform independent owner');
    process.stdout.write('CSSOM_INTERFILE_CHROME '+JSON.stringify({
      observed,metadata,negativeParity:false,positiveParity:true
    })+'\n');
  }finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={main,sources,compile};
