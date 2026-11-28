'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const observed=[
  'const owner={secretField:53};',
  'function inspect(){return owner.secretField;}',
  'export const view={text:performance.mark(inspect).name,value:inspect()};'
].join('\n');
const primitive=[
  'const owner={secretField:53};',
  'const value=owner.secretField;',
  'performance.mark("fixed browser mark");',
  'export const view={text:"fixed browser mark",value};'
].join('\n');
const detailObserved=[
  'function inspect(){const owner={secretField:57};return owner.secretField;}',
  'let message="";try{performance.mark("detail",{detail:{nested:[inspect]}});}',
  'catch(error){message=String(error.message);}',
  'export const view={text:message,value:inspect()};'
].join('\n');
const detailPrimitive=[
  'const owner={secretField:57};const value=owner.secretField;',
  'performance.mark("detail",{detail:{nested:[1,2]}});',
  'export const view={text:"detail",value};'
].join('\n');
/** @param {string} code @param {string} seed */
function compile(code,seed) {
  return obfuscateFiles([{path:'case.mjs',sourceType:'module',code}],{
    mode:'coo',seed,strings:true,identifiers:true,properties:true
  }).files[0];
}

const output=compile(observed,'agent19-user-timing-browser-observed');
const safe=compile(primitive,'agent19-user-timing-browser-primitive');
const detailOutput=compile(detailObserved,'agent19-user-timing-browser-detail');
const detailSafe=compile(detailPrimitive,'agent19-user-timing-browser-primitive-detail');
assert.equal(detailOutput.metrics.properties,0,
  'Function-bearing detail clone error must not rewrite function source');
assert.ok(detailSafe.metrics.properties>0,
  'Primitive detail must leave unrelated owner transformation eligible');
assert.equal(output.metrics.properties,0,
  'A real Chrome Performance.mark source sink must veto local rewrite');
assert.equal(output.metrics.bindings,0);
assert.ok(safe.metrics.properties>0,
  'Primitive mark name must leave independent private properties eligible');
assert.ok(!String(safe.code).includes('secretField'));

const html=[
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<pre id="result">pending</pre><script type="module">',
  'try {',
  'const [native,emitted,plain,positive,detailNative,detailCompiled,detailPlain,detailPositive]=await Promise.all([',
  'import("/native.mjs"),import("/emitted.mjs"),',
  'import("/primitive.mjs"),import("/positive.mjs"),',
  'import("/detail-native.mjs"),import("/detail-compiled.mjs"),',
  'import("/detail-primitive.mjs"),import("/detail-positive.mjs")]);',
  'if(!native.view.text.includes("secretField"))',
  'throw Error("Actual native Performance.mark did not expose exact function source");',
  'if(!detailNative.view.text.includes("secretField"))',
  'throw Error("Actual Chrome detail DataCloneError did not carry callable source");',
  'if(JSON.stringify(detailNative.view)!==JSON.stringify(detailCompiled.view)||',
  'JSON.stringify(detailPlain.view)!==JSON.stringify(detailPositive.view)||',
  'JSON.stringify(native.view)!==JSON.stringify(emitted.view)||',
  'JSON.stringify(plain.view)!==JSON.stringify(positive.view))',
  'throw Error("Chrome User Timing native/emitted mismatch "+',
  'JSON.stringify({native:native.view,emitted:emitted.view,plain:plain.view,positive:positive.view}));',
  'document.getElementById("result").textContent="PASS native Chrome User Timing source and positive";',
  '}catch(error){document.getElementById("result").textContent="FAIL "+String(error.stack||error);}',
  '</script></body></html>'
].join('\n');
const bodies=new Map([
  ['/',html],['/native.mjs',observed],['/emitted.mjs',String(output.code)],
  ['/primitive.mjs',primitive],['/positive.mjs',String(safe.code)],
  ['/detail-native.mjs',detailObserved],
  ['/detail-compiled.mjs',String(detailOutput.code)],
  ['/detail-primitive.mjs',detailPrimitive],
  ['/detail-positive.mjs',String(detailSafe.code)]
]);

/** @returns {Promise<void>} */
async function main() {
  const server=http.createServer((req,res)=>{
    const content=bodies.get(req.url??'');
    if(content===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':req.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    res.end(content);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing local Chrome test port');
    const url='http://127.0.0.1:'+address.port+'/';
    const {stdout,stderr}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=4500','--dump-dom',url
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,
      /<pre id="result">PASS native Chrome User Timing source and positive<\/pre>/u,
      String(stderr));
    console.log(JSON.stringify({browser:'Chromium',api:'Performance.mark',
      observedExactSource:true,
      primitiveRewriteCount:safe.metrics.properties,
      primitiveDetailRewriteCount:detailSafe.metrics.properties,
      nativeEmittedParity:true}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
