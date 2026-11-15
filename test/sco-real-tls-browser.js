'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {createHash,randomBytes,X509Certificate}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const https=require('node:https');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {promisify}=require('node:util');
const {startServer}=require('../examples/sco-private/server.cjs');

/**
 * Run Chrome with an isolated profile, the certificate's SPKI hash optionally
 * granted a local test-only trust exception, and no blanket TLS-error bypass.
 * @param {string} browser
 * @param {string} url
 * @param {string} profile
 * @param {string|null} testPin
 * @returns {Promise<string>}
 */
async function dumpDom(browser,url,profile,testPin) {
  const args=['--headless','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--virtual-time-budget=10000',
    '--dump-dom','--user-data-dir='+profile];
  if(testPin)args.push('--ignore-certificate-errors-spki-list='+testPin);
  args.push(url);
  const {stdout}=await promisify(execFile)(browser,args,{
    timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
  });
  return stdout;
}

/**
 * Attacker-controlled page modification that records an RPC method identifier
 * and the server response through a fetch wrapper placed before public ESM.
 * Both values stay on the test page; no external exfiltration occurs.
 * @param {string} html
 * @returns {string}
 */
function instrumentHtml(html) {
  const probe='<pre id="rpc-trace">pending</pre><script>'+
    'const originalFetch=window.fetch.bind(window);'+
    'window.fetch=async(resource,options)=>{const result=await originalFetch(resource,options);'+
    'if(String(resource).includes("/obfs/rpc")){'+
    'const method=JSON.parse(String(options.body)).method;'+
    'const copy=await result.clone().json();'+
    'document.getElementById("rpc-trace").textContent=method+":"+copy.value;'+
    '}return result;};</script>';
  assert(html.includes('<script>'));
  return html.replace('<script>',probe+'<script>');
}

/**
 * Exercise a real compiler-emitted ESM SCO client across an HTTPS reverse
 * proxy in Chromium. The original sample server keeps the key and module;
 * the proxy keeps its Node port loopback-only. The browser uses a test-only
 * certificate SPKI exception and no global certificate-error flag.
 * @returns {Promise<void>}
 */
async function main() {
  const originalKey=process.env.OBFS_SCO_DEMO_KEY;
  process.env.OBFS_SCO_DEMO_KEY=randomBytes(32).toString('hex');
  const password='not-a-deployment-secret-tls-browser-fixture';
  const browser=process.env.CHROMIUM_BIN??'chromium';
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-tls-chromium-'));
  const cert=await fs.readFile(path.join(__dirname,'..','sims','fixtures','localhost-cert.pem'));
  const key=await fs.readFile(path.join(__dirname,'..','sims','fixtures','localhost-key.pem'));
  const spki=new X509Certificate(cert).publicKey.export({format:'der',type:'spki'});
  const pin=createHash('sha256').update(spki).digest('base64');
  /** @type {Awaited<ReturnType<typeof startServer>>|null} */
  let hosted=null;
  /** @type {https.Server|null} */
  let tlsServer=null;
  try {
    hosted=await startServer({port:0,password});
    const backendOrigin=hosted.origin;
    // This reverse proxy only transports authenticated public sample pages
    // and RPC; the original protected module never enters its public route.
    tlsServer=https.createServer({cert,key,minVersion:'TLSv1.3'},(request,response)=>{
      const observe=request.method==='GET'&&request.url==='/observe';
      const target=new URL(observe?'/':request.url??'/',backendOrigin);
      const upstream=http.request(target,{
        method:request.method,headers:{...request.headers,host:target.host}
      },upstreamResponse=>{
        if(observe&&upstreamResponse.statusCode===200) {
          let html='';
          upstreamResponse.setEncoding('utf8');
          upstreamResponse.on('data',chunk=>{html+=chunk;});
          upstreamResponse.on('error',()=>response.destroy());
          upstreamResponse.on('end',()=>{
            const headers={...upstreamResponse.headers};
            delete headers['content-length'];
            delete headers['transfer-encoding'];
            response.writeHead(200,headers).end(instrumentHtml(html));
          });
        } else {
          response.writeHead(upstreamResponse.statusCode??502,upstreamResponse.headers);
          upstreamResponse.pipe(response);
        }
      });
      upstream.on('error',()=>{
        if(!response.headersSent)response.writeHead(502).end();
        else response.destroy();
      });
      request.pipe(upstream);
    });
    const activeTlsServer=tlsServer;
    await new Promise(resolve=>activeTlsServer.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=activeTlsServer.address();
    assert(address&&typeof address!=='string');
    const authorizedUrl=new URL('https://127.0.0.1:'+address.port+'/');
    authorizedUrl.username='demo';
    authorizedUrl.password=password;
    const expectedModule=/** @type {{derive:(input:string)=>Promise<string>}} */(
      await import(pathToFileURL(path.join(__dirname,'..','examples','sco-private','before-private.mjs')).href)
    );
    const challenge='0123456789abcdef0123456789abcdef';
    const native=await expectedModule.derive(challenge);
    assert.match(native,/^[a-f0-9]{64}$/u);

    const deniedHtml=await dumpDom(browser,authorizedUrl.href,
      path.join(directory,'untrusted-profile'),null);
    assert.doesNotMatch(deniedHtml,/<pre id="out">[a-f0-9]{64}<\/pre>/u,
      'Untrusted certificate must not run public SCO code');

    const allowedHtml=await dumpDom(browser,authorizedUrl.href,
      path.join(directory,'pinned-profile'),pin);
    const observed=allowedHtml.match(/<pre id="out">([a-f0-9]{64})<\/pre>/u)?.[1];
    assert.equal(observed,native,
      'Real Chromium must execute compiled HTTPS SCO facade and return native HMAC');
    // The attacker controls their page and instruments fetch before the ESM
    // facade executes, without access to the private Node HMAC key.
    const observedUrl=new URL(authorizedUrl.href);
    observedUrl.pathname='/observe';
    const observedHtml=await dumpDom(browser,observedUrl.href,
      path.join(directory,'instrumented-profile'),pin);
    const methodId=hosted.partition.methodNames.derive;
    assert.match(methodId,/^m[a-f0-9]{24}$/u);
    assert.ok(observedHtml.includes('<pre id="rpc-trace">'+methodId+':'+native+'</pre>'),
      'Instrumented Chromium should observe the RPC method ID and value');
    process.stdout.write('Chromium HTTPS SCO ESM matched private reference; untrusted TLS control blocked; attacker fetch instrumentation recovered RPC method and response\n');
  } finally {
    if(tlsServer){
      const activeTlsServer=tlsServer;
      await new Promise((resolve,reject)=>
        activeTlsServer.close(error=>error?reject(error):resolve(undefined)));
    }
    if(hosted){
      const backendServer=hosted.server;
      await new Promise((resolve,reject)=>
        backendServer.close(error=>error?reject(error):resolve(undefined)));
    }
    await fs.rm(directory,{recursive:true,force:true});
    if(originalKey===undefined)delete process.env.OBFS_SCO_DEMO_KEY;
    else process.env.OBFS_SCO_DEMO_KEY=originalKey;
  }
}
if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;
});
module.exports={main};