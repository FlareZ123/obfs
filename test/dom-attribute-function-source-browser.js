'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * Compare a browser's native Element.setAttribute DOMString conversion before
 * and after compilation. Return the attribute value for exact source parity.
 * @param {boolean} primitive
 * @returns {string}
 */
function source(primitive) {
  if(primitive)return [
    'const state={secretField:31};',
    'const value=state.secretField;',
    'export function observe(){',
    'const element=document.createElement("div");',
    'element.setAttribute("data-observed","literal");',
    'element.setAttributeNS(null,"data-observed-ns","literal");',
    'return {text:element.getAttribute("data-observed"),',
    'nsText:element.getAttribute("data-observed-ns"),value};',
    '}'
  ].join('\n');
  return [
    'export function observe(){',
    'function inspect(){const state={secretField:31};return state.secretField;}',
    'const element=document.createElement("div");',
    'element.setAttribute("data-observed",inspect);',
    'element.setAttributeNS(null,"data-observed-ns",inspect);',
    'return {text:element.getAttribute("data-observed"),',
    'nsText:element.getAttribute("data-observed-ns"),value:inspect()};',
    '}'
  ].join('\n');
}

/**
 * @param {string} code
 * @param {string} seed
 * @returns {{code:string,metrics:{properties:number,bindings:number,literals:number}}}
 */
function transform(code,seed) {
  const file=obfuscateFiles([{path:'case.mjs',sourceType:'module',code}],{
    mode:'coo',seed,closedWorld:true,
    properties:true,identifiers:true,strings:true
  }).files[0];
  return {code:/** @type {string} */(file.code),metrics:file.metrics};
}

/** @returns {Promise<void>} */
async function main() {
  const beforeNegative=source(false),beforePositive=source(true);
  const negative=transform(beforeNegative,'domstring-attribute-native-negative');
  const positive=transform(beforePositive,'domstring-attribute-native-positive');
  assert.equal(positive.metrics.properties,1,
    'Primitive DOMString positive must still rename a safe private property');
  assert.ok(!positive.code.includes('secretField'),
    'Positive should prove that private property rewriting was exercised');

  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'try {',
    'const [an,bn,ap,bp]=await Promise.all([',
    'import("/native-negative.mjs"),import("/compiled-negative.mjs"),',
    'import("/native-positive.mjs"),import("/compiled-positive.mjs")]);',
    'const a=an.observe(),b=bn.observe(),c=ap.observe(),d=bp.observe();',
    'if(JSON.stringify(a)!==JSON.stringify(b)||JSON.stringify(c)!==JSON.stringify(d))',
    'throw Error("setAttribute DOMString parity mismatch "+JSON.stringify({a,b,c,d}));',
    'if(!a.text.includes("secretField")||',
    '!a.nsText.includes("secretField")||a.value!==31||',
    'c.text!=="literal"||c.nsText!=="literal"||c.value!==31)',
    'throw Error("Browser witness invalid: "+JSON.stringify({a,c}));',
    'document.getElementById("result").textContent="PASS setAttribute DOMString";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}',
    '</script>'
  ].join('\n');
  const bodies=new Map([
    ['/',html],['/native-negative.mjs',beforeNegative],
    ['/compiled-negative.mjs',negative.code],
    ['/native-positive.mjs',beforePositive],
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
    if(!address||typeof address==='string')throw Error('Expected local TCP port');
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run',
        '--virtual-time-budget=4000','--dump-dom',
        'http://127.0.0.1:'+address.port+'/'
      ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,
      /<pre id="result">PASS setAttribute DOMString<\/pre>/u,String(stderr));
    process.stdout.write(JSON.stringify({
      browser:'Chromium',api:'Element.setAttribute',
      sourceObserved:true,positivePropertyRenamed:true,
      nativeEmittedDifferential:'PASS'
    })+'\n');
  }finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
