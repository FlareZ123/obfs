'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,createHash,createPublicKey,verify,timingSafeEqual}=require('node:crypto');
const puppeteer=require('puppeteer-core');

/**
 * Resolve a PATH command because puppeteer-core requires an executable path,
 * while the existing CI convention supplies CHROMIUM_BIN as "google-chrome".
 * @param {string} command
 * @returns {string}
 */
function resolveExecutable(command){
  if(path.isAbsolute(command))return command;
  for(const directory of (process.env.PATH??'').split(path.delimiter)){
    if(!directory)continue;
    const candidate=path.join(directory,command);
    if(fs.existsSync(candidate))return candidate;
  }
  throw new Error('Browser executable not found in PATH: '+command);
}

/** @param {Buffer|Uint8Array} value @returns {string} */
function base64url(value){
  return Buffer.from(value).toString('base64url');
}

/** @param {http.IncomingMessage} request @returns {Promise<string>} */
async function readBody(request){
  /** @type {Buffer[]} */
  const chunks=[];
  for await(const chunk of request)chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {Buffer} clientData
 * @param {string} expectedType
 * @param {Buffer} expectedChallenge
 * @param {string} expectedOrigin
 */
function verifyClientData(clientData,expectedType,expectedChallenge,expectedOrigin){
  const parsed=/** @type {{type?:unknown,challenge?:unknown,origin?:unknown}} */(
    JSON.parse(clientData.toString('utf8'))
  );
  assert.equal(parsed.type,expectedType);
  assert.equal(parsed.challenge,base64url(expectedChallenge));
  assert.equal(parsed.origin,expectedOrigin);
}

/**
 * Real Chromium WebAuthn origin-boundary experiment using Chrome's official
 * virtual-authenticator testing surface through Puppeteer CDP.
 * @returns {Promise<void>}
 */
async function main(){
  const rpId='localhost';
  /** @type {Map<string,Buffer>} */
  const challenges=new Map();
  /** @type {import('node:crypto').KeyObject|null} */
  let publicKey=null;
  let credentialId='';
  let acceptedAssertions=0;
  let port=0;

  const server=http.createServer(async(request,response)=>{
    try{
      const url=new URL(request.url??'/','http://localhost');
      if(url.pathname==='/blank'){
        response.writeHead(200,{
          'content-type':'text/html; charset=utf-8',
          'content-security-policy':"default-src 'none'; connect-src 'self'",
          'cache-control':'no-store'
        }).end('<!doctype html><html><body>webauthn-boundary</body></html>');
        return;
      }
      if(url.pathname==='/challenge'){
        const id=randomBytes(12).toString('hex');
        const challenge=randomBytes(32);
        challenges.set(id,challenge);
        response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'})
          .end(JSON.stringify({id,challenge:[...challenge]}));
        return;
      }
      if(url.pathname==='/register'&&request.method==='POST'){
        const body=/** @type {{
          challengeId?:unknown,rawId?:unknown,clientData?:unknown,publicKeySpki?:unknown
        }} */(JSON.parse(await readBody(request)));
        assert.equal(typeof body.challengeId,'string');
        assert.equal(typeof body.rawId,'string');
        assert.equal(typeof body.clientData,'string');
        assert.equal(typeof body.publicKeySpki,'string');
        const challenge=challenges.get(body.challengeId);
        assert.ok(challenge);
        challenges.delete(body.challengeId);
        const clientData=Buffer.from(body.clientData,'base64');
        verifyClientData(clientData,'webauthn.create',challenge,
          'http://localhost:'+port);
        publicKey=createPublicKey({
          key:Buffer.from(body.publicKeySpki,'base64'),
          format:'der',
          type:'spki'
        });
        credentialId=body.rawId;
        response.writeHead(204).end();
        return;
      }
      if(url.pathname==='/verify'&&request.method==='POST'){
        const body=/** @type {{
          challengeId?:unknown,rawId?:unknown,clientData?:unknown,
          authenticatorData?:unknown,signature?:unknown
        }} */(JSON.parse(await readBody(request)));
        if(typeof body.challengeId!=='string'||typeof body.rawId!=='string'||
           typeof body.clientData!=='string'||typeof body.authenticatorData!=='string'||
           typeof body.signature!=='string'||!publicKey||
           body.rawId!==credentialId){
          response.writeHead(403).end();return;
        }
        const challenge=challenges.get(body.challengeId);
        if(!challenge){response.writeHead(403).end();return;}
        const clientData=Buffer.from(body.clientData,'base64');
        const authenticatorData=Buffer.from(body.authenticatorData,'base64');
        const signature=Buffer.from(body.signature,'base64');
        try{
          verifyClientData(clientData,'webauthn.get',challenge,
            'http://localhost:'+port);
          assert.ok(authenticatorData.length>=37);
          const expectedRpHash=createHash('sha256').update(rpId).digest();
          assert.ok(timingSafeEqual(authenticatorData.subarray(0,32),expectedRpHash));
          const flags=authenticatorData[32];
          assert.equal(flags&0x05,0x05,'UP and UV flags must both be set');
          const clientHash=createHash('sha256').update(clientData).digest();
          const signed=Buffer.concat([authenticatorData,clientHash]);
          if(!verify('sha256',signed,publicKey,signature)){
            response.writeHead(403).end();return;
          }
        }catch{
          response.writeHead(403).end();return;
        }
        challenges.delete(body.challengeId);
        acceptedAssertions++;
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
    server.listen(0,()=>resolve());
  });
  await ready;
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    port=address.port;
    const allowedOrigin='http://localhost:'+port;
    browser=await puppeteer.launch({
      executablePath:resolveExecutable(process.env.CHROMIUM_BIN??'chromium'),
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    const cdp=await page.createCDPSession();
    await cdp.send('WebAuthn.enable',{enableUI:false});
    const added=await cdp.send('WebAuthn.addVirtualAuthenticator',{
      options:{
        protocol:'ctap2',
        transport:'usb',
        hasResidentKey:true,
        hasUserVerification:true,
        isUserVerified:true,
        automaticPresenceSimulation:true
      }
    });
    assert.equal(typeof added.authenticatorId,'string');
    await page.goto(allowedOrigin+'/blank');

    const registration=await page.evaluate(async rp=>{
      const challengeInfo=await (await fetch('/challenge')).json();
      const credential=await navigator.credentials.create({publicKey:{
        challenge:new Uint8Array(challengeInfo.challenge),
        rp:{id:rp,name:'obfs WebAuthn boundary'},
        user:{id:new Uint8Array([1,2,3,4]),name:'agent5',displayName:'Agent 5'},
        pubKeyCredParams:[{type:'public-key',alg:-7}],
        authenticatorSelection:{
          residentKey:'required',
          userVerification:'required'
        },
        timeout:10000,
        attestation:'none'
      }});
      if(!(credential instanceof PublicKeyCredential))throw new Error('No credential');
      const response=credential.response;
      if(!(response instanceof AuthenticatorAttestationResponse))
        throw new Error('Unexpected registration response');
      const publicKey=response.getPublicKey();
      if(!publicKey)throw new Error('Missing registration public key');
      const encode=value=>{
        let binary='';
        for(const byte of new Uint8Array(value))binary+=String.fromCharCode(byte);
        return btoa(binary);
      };
      const body={
        challengeId:challengeInfo.id,
        rawId:encode(credential.rawId),
        clientData:encode(response.clientDataJSON),
        publicKeySpki:encode(publicKey)
      };
      const registered=await fetch('/register',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      if(!registered.ok)throw new Error('Registration rejected');
      return body.rawId;
    },rpId);
    assert.equal(typeof registration,'string');

    /**
     * @param {string} label
     * @returns {Promise<number>}
     */
    async function sameOriginAssertion(label){
      return page.evaluate(async({rp,label,rawId})=>{
        const decode=value=>{
          const binary=atob(value);
          return Uint8Array.from(binary,character=>character.charCodeAt(0));
        };
        const encode=value=>{
          let binary='';
          for(const byte of new Uint8Array(value))binary+=String.fromCharCode(byte);
          return btoa(binary);
        };
        const challengeInfo=await (await fetch('/challenge?label='+encodeURIComponent(label))).json();
        const credential=await navigator.credentials.get({publicKey:{
          challenge:new Uint8Array(challengeInfo.challenge),
          rpId:rp,
          allowCredentials:[{type:'public-key',id:decode(rawId)}],
          userVerification:'required',
          timeout:10000
        }});
        if(!(credential instanceof PublicKeyCredential))throw new Error('No assertion');
        const response=credential.response;
        if(!(response instanceof AuthenticatorAssertionResponse))
          throw new Error('Unexpected assertion response');
        const verified=await fetch('/verify',{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({
            challengeId:challengeInfo.id,
            rawId:encode(credential.rawId),
            clientData:encode(response.clientDataJSON),
            authenticatorData:encode(response.authenticatorData),
            signature:encode(response.signature)
          })
        });
        return verified.status;
      },{rp:rpId,label,rawId:registration});
    }

    const honestStatus=await sameOriginAssertion('honest');
    const hostileSameOriginStatus=await sameOriginAssertion('attacker-chosen');
    assert.equal(honestStatus,200);
    assert.equal(hostileSameOriginStatus,200);

    await page.goto('http://127.0.0.1:'+port+'/blank');
    const crossOriginResult=await page.evaluate(async({rp,rawId})=>{
      const decode=value=>{
        const binary=atob(value);
        return Uint8Array.from(binary,character=>character.charCodeAt(0));
      };
      const challengeInfo=await (await fetch('/challenge')).json();
      try{
        await navigator.credentials.get({publicKey:{
          challenge:new Uint8Array(challengeInfo.challenge),
          rpId:rp,
          allowCredentials:[{type:'public-key',id:decode(rawId)}],
          userVerification:'required',
          timeout:2000
        }});
        return 'unexpected-success';
      }catch(error){
        return error instanceof DOMException?error.name:String(error);
      }
    },{rp:rpId,rawId:registration});
    assert.equal(crossOriginResult,'SecurityError');
    assert.equal(acceptedAssertions,2);

    console.log('SCO_WEBAUTHN_ORIGIN_BOUNDARY '+JSON.stringify({
      node:process.version,
      platform:process.platform,
      rpId,
      registrationOrigin:allowedOrigin,
      honestAssertionAccepted:true,
      hostileSameOriginFreshAssertionAccepted:true,
      copiedClientOrigin:'http://127.0.0.1:'+port,
      copiedClientRpAssertionResult:crossOriginResult,
      userVerificationRequired:true,
      acceptedAssertions,
      implication:'WebAuthn enforces the RP/origin boundary, while hostile code already executing at the authorized origin can still request fresh assertions when the authenticator ceremony succeeds.'
    }));
  }finally{
    if(browser)await browser.close();
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
