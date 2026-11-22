'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {promisify}=require('node:util');
const {verifyPublishedDeployment}=require('../src');

const execute=promisify(execFile);

/** @typedef {{path:string,sourceType:'asset',code:Buffer}} Asset */
/** @typedef {{path:string,sha256:string,contentType:string}} Approval */

/** @param {string} browser @param {string} url @returns {Promise<string>} */
async function documentSource(browser,url){
  const {stdout}=await execute(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',url
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * Exhibit why one successful generic Node Fetch check cannot prove a
 * third-party server returns the same representation to a browser script
 * destination. The server is deliberately adversarial and initially lies
 * about response variation, omitting Vary: Sec-Fetch-Dest. With a truthful
 * Vary header, the staging audit conservatively refuses the route.
 * @returns {Promise<void>}
 */
async function main(){
  const page=Buffer.from('<!doctype html><html><head>'+
    '<script src="./payload.blob"></script></head><body>'+
    '<p>request-context deployment boundary</p></body></html>');
  const approvedBlob=Buffer.from('APPROVED_INERT_OCTET_RESOURCE');
  const unapprovedScript=Buffer.from('document.documentElement.setAttribute('+
    '"data-context-executed","true");');
  /** @type {Asset[]} */
  const files=[
    {path:'index.html',sourceType:'asset',code:page},
    {path:'payload.blob',sourceType:'asset',code:approvedBlob}
  ];
  /** @type {Approval[]} */
  const approved=[
    {path:'index.html',sha256:createHash('sha256').update(page).digest('hex'),
      contentType:'text/html; charset=utf-8'},
    {path:'payload.blob',sha256:createHash('sha256').update(approvedBlob).digest('hex'),
      contentType:'application/octet-stream'}
  ];
  /** @type {string[]} */
  const observedDestinations=[];
  let discloseVariant=false;
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const destination=String(request.headers['sec-fetch-dest']??'(absent)');
    if(pathname==='/index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'x-content-type-options':'nosniff'});
      response.end(page);return;
    }
    if(pathname!=='/payload.blob'){
      response.writeHead(404).end();return;
    }
    observedDestinations.push(destination);
    const scriptRequest=destination==='script';
    const contentType=scriptRequest?
      'text/javascript; charset=utf-8':'application/octet-stream';
    /** @type {Record<string,string>} */
    const headers={
      'content-type':contentType,
      'x-content-type-options':'nosniff'
    };
    if(discloseVariant)headers.vary='Sec-Fetch-Dest';
    response.writeHead(200,headers);
    response.end(scriptRequest?unapprovedScript:approvedBlob);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port+'/';
    const report=await verifyPublishedDeployment(origin,files,approved);
    assert.deepEqual(report,{verified:2,sourceFiles:0,assets:2},
      'The generic staging fetch sees only independently approved bytes');
    const dom=await documentSource(process.env.CHROMIUM_BIN??'google-chrome',
      origin+'index.html');
    assert.match(dom,/request-context deployment boundary/u);
    const executed=dom.includes('data-context-executed="true"');
    assert.ok(executed,
      'A browser script destination receives unapproved JS from same URL');
    assert.ok(observedDestinations.includes('script'),
      'The browser emitted script destination fetch metadata');
    assert.ok(observedDestinations.some(dest=>dest!=='script'),
      'The staging fetch occurred under a distinct request context');
    discloseVariant=true;
    await assert.rejects(
      ()=>verifyPublishedDeployment(origin,files,approved),
      /varies by request context/,
      'An honest Vary: Sec-Fetch-Dest header must invalidate staging proof');
    process.stdout.write('REQUEST_CONTEXT_MIME_NEGATIVE_WITNESS '+JSON.stringify({
      nodeStagingAccepted:true,unreviewedBrowserScriptExecuted:executed,
      browserDestinationObserved:true,genericFetchDestinationObserved:true,
      varyHeaderCorrectlyRefused:true,scope:'dishonest context-varying HTTP server'
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
