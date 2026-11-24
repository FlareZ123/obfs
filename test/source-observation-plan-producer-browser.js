'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const run=promisify(execFile);

const source=[
  '// UTF-16 coordinate prefix 😀',
  'const privateRecord = { privateField: 7 };',
  'function observed() { return 29; }',
  'const observedSource = Function.prototype.toString.call(observed);',
  "const label = 'safe-literal';",
  'export const result = privateRecord.privateField;',
  'export const sourceText = observedSource;',
  'export const labelText = label;'
].join('\n');

/** @returns {string} */
function page() {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<script type="module">try{const mod=await import("./entry.mjs");'+
    'const pre=document.createElement("pre");pre.id="result";'+
    'pre.textContent=btoa(JSON.stringify({result:mod.result,sourceText:mod.sourceText,labelText:mod.labelText}));'+
    'document.body.appendChild(pre);}catch(error){const pre=document.createElement("pre");'+
    'pre.id="failure";pre.textContent=String(error.stack||error);document.body.appendChild(pre);}</script>'+
    '</body></html>';
}

/**
 * Compare the real Chromium ESM loader's Function#toString result with the
 * native source while local property, identifier and string passes run around
 * the protected callable span. This is a pristine-intrinsics compatibility
 * control, not an attacker-resistant client integrity test.
 * @returns {Promise<{browser:string,properties:number,bindings:number,literals:number,exactSource:boolean}>}
 */
async function main() {
  const executable=process.env.CHROMIUM_BIN??'google-chrome';
  const version=await run(executable,['--version'],{encoding:'utf8',timeout:15000});
  const runtimeVersion=version.stdout.trim();
  assert.match(runtimeVersion,/(Chrome|Chromium)\s+\d+\./u);
  const result=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',
    seed:'direct-source-plan-chromium',
    strings:true,
    experimentalSourceObservationPlan:{
      runtimeFamily:'Chromium',
      runtimeVersion,
      contractVersion:'coo-direct-function-source-v1',
      pristineIntrinsicsPremise:
        'Fresh page module realm with unmodified Function.prototype.toString, Function.prototype.call, and String.fromCharCode before module evaluation.'
    }
  });
  const emitted=result.files[0];
  assert.ok(emitted&&typeof emitted.code==='string');
  assert.ok(emitted.metrics.properties>=1);
  assert.ok(emitted.metrics.bindings>=1);
  assert.ok(emitted.metrics.literals>=1);
  assert.ok(emitted.code.includes('function observed() { return 29; }'));

  const resources=new Map([
    ['/native/index.html',page()],
    ['/native/entry.mjs',source],
    ['/emitted/index.html',page()],
    ['/emitted/entry.mjs',emitted.code]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing browser test port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {unknown} */
    let baseline;
    for(const target of ['native','emitted']) {
      const {stdout}=await run(executable,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+target+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,target+' Chromium failed: '+stdout.slice(0,1500));
      const value=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
      if(target==='native')baseline=value;
      else assert.deepEqual(value,baseline,'Emitted Chromium module differs from native');
    }
    assert.deepEqual(baseline,{
      result:7,
      sourceText:'function observed() { return 29; }',
      labelText:'safe-literal'
    });
    const report={
      browser:runtimeVersion,
      properties:emitted.metrics.properties,
      bindings:emitted.metrics.bindings,
      literals:emitted.metrics.literals,
      exactSource:true
    };
    process.stdout.write('SOURCE_OBSERVER_PLAN_CHROMIUM '+JSON.stringify(report)+'\n');
    return report;
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main};
