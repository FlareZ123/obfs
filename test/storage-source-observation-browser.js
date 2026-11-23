'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

async function main() {
  const source=[
    'function inspect(){const privateLocal=29;return privateLocal;}',
    'function independent(){const independentLocal=7;return independentLocal;}',
    'export function sample(){',
    '  const key="obfs-storage-source-observer";',
    '  localStorage.setItem(key,inspect);',
    '  sessionStorage.setItem(key,inspect);',
    '  return {local:localStorage.getItem(key),session:sessionStorage.getItem(key),',
    '    value:inspect(),independent:independent()};',
    '}'
  ].join('\n');
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'storage-source-observation-browser',
    properties:false,identifiers:true,strings:false
  });
  const emitted=String(result.files[0].code);
  assert.ok(result.files[0].metrics.bindings>=2);
  assert.ok(!emitted.includes('privateLocal'));
  assert.ok(!emitted.includes('independentLocal'));

  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script type="module">',
    'try {',
    '  const [native,compiled]=await Promise.all([',
    '    import("/native.mjs"),import("/compiled.mjs")]);',
    '  const [a,b]=await Promise.all([native.sample(),compiled.sample()]);',
    '  if(a.value!==b.value||a.independent!==b.independent)',
    '    throw Error("ordinary values differ "+JSON.stringify({a,b}));',
    '  if(a.local!==a.session||b.local!==b.session)',
    '    throw Error("local/session Storage disagree "+JSON.stringify({a,b}));',
    '  if(!a.local.includes("privateLocal")||b.local.includes("privateLocal"))',
    '    throw Error("expected native/emitted callback-source mismatch "+JSON.stringify({a,b}));',
    '  if(!b.local.includes("_v"))throw Error("emitted identifier rewrite absent");',
    '  document.getElementById("result").textContent="RED_CONFIRMED "+',
    '    JSON.stringify({nativeSource:a.local,emittedSource:b.local,',
    '      nativeValue:a.value,emittedValue:b.value,independent:b.independent});',
    '} catch(error) {',
    '  document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');
  const bodies=new Map([
    ['/',html],
    ['/native.mjs',source],
    ['/compiled.mjs',emitted]
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
    assert.ok(match,'Expected rendered source-observer result');
    const report=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    console.log(JSON.stringify({browser:'Chromium',metrics:result.files[0].metrics,
      sourceMismatch:report.nativeSource!==report.emittedSource,
      nativeSource:report.nativeSource,emittedSource:report.emittedSource,
      valuesPreserved:report.nativeValue===report.emittedValue&&report.independent===7}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
