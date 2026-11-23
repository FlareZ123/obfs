'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

async function main() {
  const logic=[
    'export function inspect(){const privateLocal=31;return privateLocal;}',
    'export function independent(){const independentLocal=7;return independentLocal;}'
  ].join('\n');
  const observer=[
    'import {inspect,independent} from "./logic.mjs";',
    'export function sample(){',
    '  const key="obfs-storage-cross-file";',
    '  localStorage.setItem(key,inspect);',
    '  sessionStorage.setItem(key,inspect);',
    '  localStorage[key+"-named"]=inspect;',
    '  return {local:localStorage.getItem(key),session:sessionStorage.getItem(key),',
    '    named:localStorage.getItem(key+"-named"),',
    '    value:inspect(),independent:independent()};',
    '}'
  ].join('\n');
  const result=obfuscateFiles([
    {path:'logic.mjs',sourceType:'module',code:logic},
    {path:'observer.mjs',sourceType:'module',code:observer}
  ],{
    mode:'coo',seed:'storage-source-observation-cross-file-browser',
    closedWorld:true,properties:false,identifiers:true,strings:false
  });
  const logicOut=String(result.files.find(file=>file.path==='logic.mjs').code);
  const observerOut=String(result.files.find(file=>file.path==='observer.mjs').code);
  const metrics=result.files.reduce((sum,file)=>({
    literals:sum.literals+file.metrics.literals,
    objects:sum.objects+file.metrics.objects,
    properties:sum.properties+file.metrics.properties,
    bindings:sum.bindings+file.metrics.bindings
  }),{literals:0,objects:0,properties:0,bindings:0});
  assert.ok(metrics.bindings>=2);
  assert.ok(!logicOut.includes('privateLocal'));
  assert.ok(!logicOut.includes('independentLocal'));

  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script type="module">',
    'try {',
    '  const [native,compiled]=await Promise.all([',
    '    import("/native/observer.mjs"),import("/compiled/observer.mjs")]);',
    '  const [a,b]=await Promise.all([native.sample(),compiled.sample()]);',
    '  if(a.value!==b.value||a.independent!==b.independent)',
    '    throw Error("ordinary values differ "+JSON.stringify({a,b}));',
    '  if(a.local!==a.session||a.local!==a.named||',
    '     b.local!==b.session||b.local!==b.named)',
    '    throw Error("Storage readback paths disagree "+JSON.stringify({a,b}));',
    '  if(!a.local.includes("privateLocal")||b.local.includes("privateLocal"))',
    '    throw Error("expected cross-file source mismatch "+JSON.stringify({a,b}));',
    '  if(!b.local.includes("_v"))throw Error("emitted identifier rewrite absent");',
    '  document.getElementById("result").textContent="RED_CONFIRMED "+',
    '    JSON.stringify({nativeSource:a.local,emittedSource:b.local,',
    '      nativeNamed:a.named,emittedNamed:b.named,nativeValue:a.value,',
    '      emittedValue:b.value,independent:b.independent});',
    '} catch(error) {',
    '  document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');
  const bodies=new Map([
    ['/',html],
    ['/native/logic.mjs',logic],
    ['/native/observer.mjs',observer],
    ['/compiled/logic.mjs',logicOut],
    ['/compiled/observer.mjs',observerOut]
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
    if(!address||typeof address==='string')throw Error('Expected local TCP server');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const args=['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run',
      '--virtual-time-budget=4000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/<pre id="result">RED_CONFIRMED /,String(stderr));
    const match=stdout.match(/<pre id="result">RED_CONFIRMED ([\s\S]*?)<\/pre>/);
    assert.ok(match,'Expected rendered cross-file source-observer result');
    const report=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    console.log(JSON.stringify({browser:'Chromium',metrics,
      sourceMismatch:report.nativeSource!==report.emittedSource,
      nativeSource:report.nativeSource,emittedSource:report.emittedSource,
      nativeNamed:report.nativeNamed,emittedNamed:report.emittedNamed,
      valuesPreserved:report.nativeValue===report.emittedValue&&report.independent===7}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
