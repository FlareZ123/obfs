'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const http=require('node:http');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);
const source='document.documentElement.dataset.sriMount="loaded";'+
  'globalThis.sriMountValue="original source bytes remain valid under the alias";';
const digest=createHash('sha384').update(source).digest('base64');

/** @param {string} variant @returns {string} */
function markup(variant) {
  return '<!doctype html><html><head>'+
    '<script src="/'+variant+'/app/v3/renamed-public-entry.js" '+
    'integrity="sha384-'+digest+'"></script></head>'+
    '<body><p>Mounted SRI alias</p></body></html>';
}

/** @returns {Promise<void>} */
async function main() {
  const inputs=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'index.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(markup('safe'))}
  ];
  const safe=obfuscateFiles(inputs,{
    mode:'coo',seed:'real-browser-mounted-sri-digest',
    strings:true,properties:false,identifiers:false
  });
  const unsafe=obfuscateFiles([inputs[0]],{
    mode:'coo',seed:'real-browser-mounted-sri-no-contract',
    strings:true,properties:false,identifiers:false
  });
  assert.equal(safe.files[0].code,source,
    'Compiler must preserve original bytes despite the unknown public mount');
  assert.notEqual(unsafe.files[0].code,source,
    'Control script should be genuinely transformed when no integrity exists');
  /** @type {Map<string,string>} */
  const bodies=new Map([
    ['native',source],
    ['safe',/** @type {string} */(safe.files[0].code)],
    ['unsafe',/** @type {string} */(unsafe.files[0].code)]
  ]);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const parts=pathname.split('/').filter(Boolean);
    const variant=parts[0];
    if(!variant||!bodies.has(variant)){
      response.writeHead(404).end();return;
    }
    if(parts.length===2&&parts[1]==='index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(markup(variant));
      return;
    }
    if(parts.join('/')===variant+'/app/v3/renamed-public-entry.js'){
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(bodies.get(variant));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing local server port');
    const results={native:false,safe:false,unsafe:false};
    for(const variant of /** @type {const} */(['native','safe','unsafe'])){
      const url='http://127.0.0.1:'+address.port+'/'+variant+'/index.html';
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',url
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Mounted SRI alias/u);
      results[variant]=/data-sri-mount="loaded"/u.test(stdout);
    }
    assert.deepEqual(results,{native:true,safe:true,unsafe:false});
    process.stdout.write('SRI_MOUNT_ALIAS_BROWSER '+JSON.stringify({
      ...results,nativeBytes:Buffer.byteLength(source),
      unsafeBytes:Buffer.byteLength(/** @type {string} */(unsafe.files[0].code))
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
