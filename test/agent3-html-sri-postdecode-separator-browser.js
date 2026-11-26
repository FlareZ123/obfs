'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const path=require('node:path');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/**
 * @param {string} integrity
 * @returns {string}
 */
function html(integrity) {
  return '<!doctype html><html><body>'+
    '<script src="./folder%2F..%2Fclient.js" integrity="'+integrity+'"></script>'+
    '<p>post-decode encoded-separator SRI</p></body></html>';
}

/**
 * A static host that decodes URL path escapes before filesystem normalization
 * can route the encoded separator path to public/client.js.
 */
async function main() {
  const source=[
    'document.documentElement.dataset.sriLoaded="yes";',
    'globalThis.sriSourceCanary="original source bytes must remain pinned";'
  ].join('\n');
  const integrity='sha256-'+createHash('sha256').update(source).digest('base64');
  const protectedFiles=obfuscateFiles([
    {path:'public/client.js',sourceType:'script',code:source},
    {path:'public/index.html',sourceType:'asset',code:Buffer.from(html(integrity))}
  ],{
    mode:'coo',
    seed:'agent3-postdecode-sri-browser',
    strings:true,
    identifiers:false,
    properties:false,
    closedWorld:true
  });
  const emitted=String(protectedFiles.files.find(file=>file.path==='public/client.js')?.code);
  assert.notEqual(emitted,source,'control: the candidate must actually transform script bytes');

  /** @type {string[]} */
  const requests=[];
  const server=http.createServer((request,response)=>{
    const raw=request.url??'/';
    requests.push(raw);
    let decoded;
    try {
      decoded=decodeURIComponent(new URL(raw,'http://127.0.0.1').pathname);
    } catch(error) {
      response.writeHead(400).end();
      return;
    }
    // This is the explicit host contract under test: decode, then normalize
    // the path before resolving it against the published file inventory.
    const resolved=path.posix.normalize(decoded);
    const variant=resolved.startsWith('/native/')?'native':
      resolved.startsWith('/protected/')?'protected':null;
    if(!variant) {
      response.writeHead(404).end();
      return;
    }
    if(resolved.endsWith('/public/index.html')) {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html(integrity));
      return;
    }
    if(resolved.endsWith('/public/client.js')) {
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(variant==='native'?source:emitted);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    const outcomes={};
    for(const variant of ['native','protected']) {
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+variant+'/public/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/post-decode encoded-separator SRI/u);
      outcomes[variant]=/data-sri-loaded="yes"/u.test(stdout);
    }
    assert.ok(requests.some(request=>request.includes('folder%2F..%2Fclient.js')),
      'browser must request the encoded separator spelling');
    process.stdout.write('POST_DECODE_SRI_BROWSER '+JSON.stringify({
      nativeLoaded:outcomes.native,
      protectedLoaded:outcomes.protected,
      requestSeen:requests.some(request=>request.includes('folder%2F..%2Fclient.js'))
    })+'\n');
    assert.equal(outcomes.native,true,'native original bytes should satisfy SRI');
    assert.equal(outcomes.protected,true,
      'protected bytes must remain unchanged when a server maps the encoded path to the pinned script');
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
