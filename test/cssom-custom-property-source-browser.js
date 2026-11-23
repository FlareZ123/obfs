'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * Observe native CSSStyleDeclaration custom-property string coercion.
 * The public ESM export is a primitive record, never an exposed function.
 * @param {boolean} primitive
 * @returns {string}
 */
function source(primitive) {
  const owner=primitive?
    'const state={secretField:31};const value=state.secretField;':
    'function inspect(){const state={secretField:31};return state.secretField;}';
  return [
    owner,
    'const element=document.createElement("div");',
    'const style=element.style;',
    'style.setProperty("--observed",'+(primitive?'"literal"':'inspect')+');',
    'export const observed={text:style.getPropertyValue("--observed"),',
    'number:'+(primitive?'value':'inspect()')+'};'
  ].join('\n');
}

/**
 * @param {string} code
 * @param {string} seed
 * @returns {{code:string,metrics:{properties:number,bindings:number}}}
 */
function compile(code,seed) {
  const emitted=obfuscateFiles([{path:'case.mjs',sourceType:'module',code}],{
    mode:'coo',seed,closedWorld:true,
    properties:true,identifiers:true,strings:false
  }).files[0];
  return {code:/** @type {string} */(emitted.code),metrics:emitted.metrics};
}

/** @returns {Promise<void>} */
async function main() {
  const originalNegative=source(false),originalPositive=source(true);
  const negative=compile(originalNegative,'cssom-native-source-negative');
  const positive=compile(originalPositive,'cssom-native-source-positive');
  process.stdout.write('CSSOM_BROWSER_METRICS '+JSON.stringify({
    negative:negative.metrics,positive:positive.metrics,
    preservedSourceSpelling:negative.code.includes('secretField')
  })+'\n');
  assert.ok(positive.metrics.properties>0,
    'Primitive custom-property case must exercise real private-field renaming');

  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'try {',
    'const [an,bn,ap,bp]=await Promise.all([',
    'import("/native-negative.mjs"),import("/compiled-negative.mjs"),',
    'import("/native-positive.mjs"),import("/compiled-positive.mjs")]);',
    'const a=an.observed,b=bn.observed,c=ap.observed,d=bp.observed;',
    'if(!a.text.includes("secretField")||a.number!==31||',
    'c.text!=="literal"||c.number!==31)',
    'throw Error("invalid native controls "+JSON.stringify({a,c}));',
    'if(JSON.stringify(a)!==JSON.stringify(b)||JSON.stringify(c)!==JSON.stringify(d))',
    'throw Error("CSSOM source parity mismatch "+JSON.stringify({a,b,c,d}));',
    'document.getElementById("result").textContent="PASS CSSOM source parity";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}',
    '</script>'
  ].join('\n');
  const bodies=new Map([
    ['/',html],
    ['/native-negative.mjs',originalNegative],
    ['/compiled-negative.mjs',negative.code],
    ['/native-positive.mjs',originalPositive],
    ['/compiled-positive.mjs',positive.code]
  ]);
  const server=http.createServer((request,response)=>{
    const body=bodies.get(request.url??'');
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected local HTTP port');
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run',
        '--virtual-time-budget=4000','--dump-dom',
        'http://127.0.0.1:'+address.port+'/'
      ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,
      /<pre id="result">PASS CSSOM source parity<\/pre>/u,String(stderr));
    process.stdout.write(JSON.stringify({
      browser:'Chromium',api:'CSSStyleDeclaration.setProperty',
      positivePropertyRenamed:true,nativeEmittedDifferential:'PASS'
    })+'\n');
  }finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
