'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * Direct scalar DOMString setters retain function text in DOM properties.
 * This is an intentionally adversarial red witness on the unpatched compiler,
 * not a browser feature shim.
 * @param {boolean} primitive
 * @returns {string}
 */
function source(primitive) {
  const text=primitive?'"literal"':'inspect';
  const body=primitive?
    'const state={secretField:57};const answer=state.secretField;':
    'function inspect(){const state={secretField:57};return state.secretField;}';
  return [
    body,
    'const element=document.createElement("div");',
    'element.id='+text+';',
    'element.textContent='+text+';',
    'export const observed={id:element.id,text:element.textContent,value:'+
      (primitive?'answer':'inspect()')+'};'
  ].join('\n');
}

/**
 * @param {string} code
 * @param {string} seed
 * @returns {{code:string,properties:number}}
 */
function compile(code,seed) {
  const file=obfuscateFiles([{path:'case.mjs',sourceType:'module',code}],{
    mode:'coo',seed,closedWorld:true,
    properties:true,identifiers:true,strings:true
  }).files[0];
  return {code:/** @type {string} */(file.code),
    properties:file.metrics.properties};
}

/** @returns {Promise<void>} */
async function main() {
  const aSource=source(false),cSource=source(true);
  const b=compile(aSource,'domstring-reflected-function-negative');
  const d=compile(cSource,'domstring-reflected-primitive-positive');
  assert.equal(d.properties,1,'Safe positive must retain private key yield');
  assert.ok(!d.code.includes('secretField'),'Safe positive was not transformed');

  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'try {',
    'const [a,b,c,d]=await Promise.all([',
    'import("/native-negative.mjs"),import("/compiled-negative.mjs"),',
    'import("/native-positive.mjs"),import("/compiled-positive.mjs")]);',
    'const original=a.observed,emitted=b.observed,',
    'literal=c.observed,transformed=d.observed;',
    'if(original.value!==57||literal.value!==57||',
    '!original.id.includes("secretField")||',
    '!original.text.includes("secretField")||',
    'literal.id!=="literal"||literal.text!=="literal")',
    'throw Error("Native source witness invalid: "+JSON.stringify({original,literal}));',
    'if(JSON.stringify(original)!==JSON.stringify(emitted)||',
    'JSON.stringify(literal)!==JSON.stringify(transformed))',
    'throw Error("DOMString reflected property mismatch "+JSON.stringify({',
    'original,emitted,literal,transformed}));',
    'document.getElementById("result").textContent="PASS DOMString properties";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}',
    '</script>'
  ].join('\n');
  const bodies=new Map([
    ['/',html],['/native-negative.mjs',aSource],
    ['/compiled-negative.mjs',b.code],['/native-positive.mjs',cSource],
    ['/compiled-positive.mjs',d.code]
  ]);
  const server=http.createServer((request,response)=>{
    const code=bodies.get(request.url??'');
    if(code===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('Expected loopback port');
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run',
        '--virtual-time-budget=4000','--dump-dom',
        'http://127.0.0.1:'+addr.port+'/'
      ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    process.stdout.write('DOMSTRING_PROPERTY_METRICS '+JSON.stringify({
      negative:b.properties,positive:d.properties
    })+'\n');
    assert.match(stdout,
      /<pre id="result">PASS DOMString properties<\/pre>/u,String(stderr));
    process.stdout.write('DOMSTRING_PROPERTIES_CHROME_PARITY PASS\n');
  }finally{
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
