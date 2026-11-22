'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Two independently fetched native browser modules, preserving the exported
 * function's exact source when CSS.escape reads it from another module.
 * @param {boolean} primitive
 * @returns {ModuleFile[]}
 */
function sources(primitive) {
  const producer=primitive ?
    'const state={secretField:23};const value=state.secretField;'+
      'export function inspect(){return value;}' :
    'export function inspect(){const state={secretField:23};return state.secretField;}';
  return [
    {path:'producer.mjs',sourceType:'module',code:producer},
    {path:'consumer.mjs',sourceType:'module',code:
      'import {inspect} from "./producer.mjs";'+
      'export function observe(){return {text:CSS.escape('+
        (primitive ? '"fixed"' : 'inspect')+'),value:inspect()};}'}
  ];
}

/**
 * @param {ModuleFile[]} files
 * @param {string} seed
 * @returns {ModuleFile[]}
 */
function transform(files,seed) {
  const output=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed,properties:true,
    identifiers:true,strings:true
  });
  return output.files.map(file=>({
    path:file.path,sourceType:'module',code:/** @type {string} */(file.code)
  }));
}

/** @returns {Promise<void>} */
async function main() {
  const negative=sources(false),positive=sources(true);
  const emittedNegative=transform(negative,'css-escape-esm-negative');
  const emittedPositive=transform(positive,'css-escape-esm-positive');
  assert.equal(emittedNegative[0].code,negative[0].code,
    'Exporting function source must be unchanged by an imported CSS observer');
  assert.ok(!emittedPositive[0].code.includes('secretField'),
    'Literal-only imported CSS consumer must permit private-key rewriting');

  const html=[
    '<!doctype html><meta charset="utf-8"><pre id="result">pending</pre>',
    '<script type="module">',
    'try {',
    'const [an,bn,ap,bp]=await Promise.all([',
    'import("/negative/native/consumer.mjs"),',
    'import("/negative/compiled/consumer.mjs"),',
    'import("/positive/native/consumer.mjs"),',
    'import("/positive/compiled/consumer.mjs")]);',
    'const a=an.observe(),b=bn.observe(),c=ap.observe(),d=bp.observe();',
    'if(JSON.stringify(a)!==JSON.stringify(b)||JSON.stringify(c)!==JSON.stringify(d))',
    'throw Error("CSS.escape ESM mismatch "+JSON.stringify({a,b,c,d}));',
    'if(!a.text.includes("secretField")||a.value!==23||c.text!=="fixed")',
    'throw Error("CSS.escape native source witness invalid: "+JSON.stringify({a,c}));',
    'document.getElementById("result").textContent="PASS CSS.escape cross-module";',
    '}catch(error){document.getElementById("result").textContent=',
    '"FAIL "+String(error.stack||error);}',
    '</script>'
  ].join('\n');

  const bodies=new Map([['/',html]]);
  for(const [label,files] of /** @type {[string,ModuleFile[]][]} */([
    ['negative/native',negative],
    ['negative/compiled',emittedNegative],
    ['positive/native',positive],
    ['positive/compiled',emittedPositive]
  ]))for(const file of files)bodies.set('/'+label+'/'+file.path,file.code);

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
    if(!address||typeof address==='string')throw Error('Expected loopback TCP port');
    const url='http://127.0.0.1:'+address.port+'/';
    const {stdout,stderr}=await promisify(execFile)(
      process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu',
        '--disable-dev-shm-usage','--no-first-run',
        '--virtual-time-budget=4000','--dump-dom',url
      ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,
      /<pre id="result">PASS CSS\.escape cross-module<\/pre>/u,String(stderr));
    process.stdout.write(JSON.stringify({
      browser:'Chromium',sourceObserved:true,crossModule:true,
      positivePrivateRenamed:true,nativeEmittedDifferential:'PASS'
    })+'\n');
  }finally{
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
