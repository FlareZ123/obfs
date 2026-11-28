'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const {randomBytes,createPublicKey}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const {createScoHandler}=require('../src/sco');
const {createScoWebAuthnAdmission}=require('../src/sco-webauthn-admission');

/** @param {string} value @returns {string} */
function resolveExecutable(value){
  if(path.isAbsolute(value))return value;
  for(const directory of (process.env.PATH??'').split(path.delimiter)){
    const candidate=path.join(directory,value);
    if(directory&&fs.existsSync(candidate))return candidate;
  }
  throw new Error('Chromium executable not found: '+value);
}

/** @param {http.IncomingMessage} req @returns {Promise<string>} */
async function readBody(req){
  /** @type {Buffer[]} */
  const chunks=[];
  for await(const chunk of req)chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Real browser boundary for the production SCO admission helper. The test
 * harness injects a genuine virtual-authenticator credential directly into
 * trusted Node state; there is no network-accessible /register endpoint.
 * This is not an application credential enrollment implementation.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Map<string,{publicKey:import('node:crypto').KeyObject,signCount:number}>} */
  const credentials=new Map();
  /** @type {ReturnType<typeof createScoWebAuthnAdmission>} */
  let admission;
  /** @type {http.RequestListener} */
  let sco;
  let protectedCalls=0;
  /** @type {string|null} */
  let lastSubmission=null;
  const server=http.createServer(async(req,res)=>{
    try{
      const pathname=(req.url??'').split('?',1)[0];
      if(req.method==='GET'&&pathname==='/blank'){
        res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><title>WebAuthn SCO</title>');
        return;
      }
      if(req.method==='GET'&&pathname==='/challenge'){
        const challenge=admission.issueChallenge('accountA','loginA');
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(challenge));
        return;
      }
      if(req.method==='POST'&&pathname==='/assert'){
        const payload=JSON.parse(await readBody(req));
        lastSubmission=JSON.stringify(payload);
        const result=await admission.verifyAssertion({...payload,principal:'accountA',sessionId:'loginA'});
        if(!result.ok){res.writeHead(403).end();return;}
        res.writeHead(204,{'set-cookie':'obfs_auth='+result.token+'; HttpOnly; SameSite=Strict; Path=/','cache-control':'no-store'}).end();
        return;
      }
      sco(req,res);
    }catch(error){
      if(!res.headersSent)res.writeHead(500,{'content-type':'text/plain'});
      res.end(String(error));
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,()=>resolve(undefined));
  });
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const port=address.port;
    const origin='http://localhost:'+port;
    admission=createScoWebAuthnAdmission({
      rpId:'localhost',allowedOrigins:[origin],allowInsecureLocalhost:true,
      lookupCredential:(_principal,id)=>credentials.get(id)??null,
      updateSignCount:(_principal,id,previous,next)=>{
        const record=credentials.get(id);
        if(!record||record.signCount!==previous ||
           (previous!==0&&next<=previous))return false;
        record.signCount=next;
        return true;
      }
    });
    sco=createScoHandler([{
      path:'facade.js',sourceType:'script',code:'globalThis.obfsBrowserAdmission=true;'
    }],{
      allowedHosts:['localhost'],publicPaths:['facade.js'],
      remoteMethods:{protectedSum(n){protectedCalls++;return Number(n)*17+29;}},
      authorizeRpc(request){
        const bearer=/(?:^|;\s*)obfs_auth=([A-Za-z0-9_-]+)(?:;|$)/u.exec(request.headers.cookie??'')?.[1]??'';
        return admission.authorizeSession(bearer,'accountA');
      }
    });
    browser=await puppeteer.launch({
      executablePath:resolveExecutable(process.env.CHROMIUM_BIN??'chromium'),
      headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    const cdp=await page.createCDPSession();
    await cdp.send('WebAuthn.enable',{enableUI:false});
    await cdp.send('WebAuthn.addVirtualAuthenticator',{
      options:{protocol:'ctap2',transport:'usb',hasResidentKey:true,
        hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}
    });
    await page.goto(origin+'/blank');
    // The privileged test harness captures registration out of band.
    const registered=await page.evaluate(async()=>{
      const encode=buffer=>{
        let text='';
        for(const byte of new Uint8Array(buffer))text+=String.fromCharCode(byte);
        return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'');
      };
      const credential=await navigator.credentials.create({publicKey:{
        challenge:crypto.getRandomValues(new Uint8Array(32)),
        rp:{id:'localhost',name:'obfs SCO test'},
        user:{id:new Uint8Array([1,2,3,4]),name:'accountA',displayName:'Account A'},
        pubKeyCredParams:[{type:'public-key',alg:-7}],
        authenticatorSelection:{residentKey:'required',userVerification:'required'},
        attestation:'none',timeout:10000
      }});
      if(!(credential instanceof PublicKeyCredential))throw new Error('No WebAuthn registration');
      const attestation=credential.response;
      if(!(attestation instanceof AuthenticatorAttestationResponse))throw new Error('No attestation response');
      const spki=attestation.getPublicKey();
      if(!spki)throw new Error('No authenticator SPKI');
      return {id:encode(credential.rawId),publicKey:encode(spki)};
    });
    credentials.set(registered.id,{
      publicKey:createPublicKey({
        key:Buffer.from(registered.publicKey,'base64url'),format:'der',type:'spki'
      }),signCount:0
    });
    const valid=await page.evaluate(async id=>{
      const decode=value=>{
        const padded=value.replaceAll('-','+').replaceAll('_','/');
        return Uint8Array.from(atob(padded+'='.repeat((4-padded.length%4)%4)),c=>c.charCodeAt(0));
      };
      const encode=buffer=>{
        let text='';
        for(const byte of new Uint8Array(buffer))text+=String.fromCharCode(byte);
        return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'');
      };
      const challenge=await (await fetch('/challenge')).json();
      const credential=await navigator.credentials.get({publicKey:{
        challenge:decode(challenge.challenge),rpId:'localhost',
        allowCredentials:[{type:'public-key',id:decode(id)}],
        userVerification:'required',timeout:10000
      }});
      if(!(credential instanceof PublicKeyCredential))throw new Error('No WebAuthn assertion');
      const proof=credential.response;
      if(!(proof instanceof AuthenticatorAssertionResponse))throw new Error('No assertion response');
      const response=await fetch('/assert',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({challengeId:challenge.challengeId,credentialId:encode(credential.rawId),
          clientDataJSON:encode(proof.clientDataJSON),
          authenticatorData:encode(proof.authenticatorData),signature:encode(proof.signature)})
      });
      const authorized=await fetch('/obfs/rpc',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({method:'protectedSum',args:[7]})
      });
      return {assertionStatus:response.status,rpcStatus:authorized.status,
        rpcBody:await authorized.json(),jsCookie:document.cookie};
    },registered.id);
    assert.deepEqual(valid,{assertionStatus:204,rpcStatus:200,
      rpcBody:{ok:true,value:148},jsCookie:''});
    assert.equal(protectedCalls,1);
    const replay=await fetch(origin+'/assert',{
      method:'POST',headers:{'content-type':'application/json'},body:lastSubmission??''
    });
    assert.equal(replay.status,403);
    const cookies=await page.browserContext().cookies([origin]);
    const token=cookies.find(cookie=>cookie.name==='obfs_auth');
    assert.ok(token?.httpOnly);
    // A copied bearer can still relay permitted work. This is NOT anti-relay.
    const forwarded=await new Promise((resolve,reject)=>{
      const request=http.request({hostname:'127.0.0.1',port,
        path:'/obfs/rpc',method:'POST',headers:{
          host:'localhost:'+port,'content-type':'application/json',
          cookie:'obfs_auth='+token.value
        }},response=>{
          /** @type {Buffer[]} */
          const data=[];
          response.on('data',item=>data.push(Buffer.from(item)));
          response.once('end',()=>resolve({status:response.statusCode,
            body:JSON.parse(Buffer.concat(data).toString('utf8'))}));
        });
      request.once('error',reject);
      request.end(JSON.stringify({method:'protectedSum',args:[7]}));
    });
    assert.deepEqual(forwarded,{status:200,body:{ok:true,value:148}});
    assert.equal(protectedCalls,2);
    await page.goto('http://127.0.0.1:'+port+'/blank');
    const outside=await page.evaluate(async id=>{
      const decode=value=>{
        const padded=value.replaceAll('-','+').replaceAll('_','/');
        return Uint8Array.from(atob(padded+'='.repeat((4-padded.length%4)%4)),c=>c.charCodeAt(0));
      };
      try{
        await navigator.credentials.get({publicKey:{
          challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:'localhost',
          allowCredentials:[{type:'public-key',id:decode(id)}],
          userVerification:'required',timeout:1500
        }});
        return 'unexpected-success';
      }catch(error){return error instanceof DOMException?error.name:String(error);}
    },registered.id);
    assert.equal(outside,'SecurityError');
    admission.revokePrincipal('accountA');
    const denied=await fetch(origin+'/obfs/rpc',{
      method:'POST',headers:{'content-type':'application/json',cookie:'obfs_auth='+token.value},
      body:JSON.stringify({method:'protectedSum',args:[7]})
    });
    assert.equal(denied.status,403);
    assert.equal(protectedCalls,2);
    console.log('SCO_WEBAUTHN_ADMISSION_BROWSER '+JSON.stringify({
      trueAuthenticator:true,originalRpc:valid.rpcBody,originCopyResult:outside,
      replayDenied:replay.status,stolenCookieRelay:forwarded,
      principalRevocationDenied:denied.status,protectedCalls
    }));
  }finally{
    if(browser)await browser.close();
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module){main().catch(error=>{console.error(error);process.exitCode=1;});}
module.exports={main};
