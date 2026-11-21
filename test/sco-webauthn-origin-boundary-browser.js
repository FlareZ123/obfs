'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,createHash,createPublicKey,generateKeyPairSync,sign,verify,timingSafeEqual}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const {createScoHandler}=require('../src/sco');

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
  /** @type {Set<string>} */
  const activeSessions=new Set();
  /** @type {Map<string,{challenge:Buffer,value:number|number[],method:'proofSum'|'proofBatch'|'proofZero',session:string}>} */
  const operationChallenges=new Map();
  let privateRpcCalls=0;
  let proofRpcCalls=0;
  let proofBatchRpcCalls=0;
  let proofZeroRpcCalls=0;
  /**
   * @param {http.IncomingMessage} request
   * @returns {string|null}
   */
  function sessionToken(request){
    const match=/(?:^|;\s*)webauthn_session=([0-9a-f]{64})(?:;|$)/u
      .exec(request.headers.cookie??'');
    return match?.[1]??null;
  }
  /** @param {http.IncomingMessage} request @returns {boolean} */
  function authorizedSession(request){
    const token=sessionToken(request);
    return token!==null&&activeSessions.has(token);
  }
  const scoHandler=createScoHandler([
    {path:'facade.js',code:'globalThis.obfsWebAuthnTest=true;',sourceType:'script'}
  ],{
    allowedHosts:['localhost'],
    publicPaths:['facade.js'],
    remoteMethods:{
      protectedSum(value){
        privateRpcCalls++;
        return (Number(value)*17+29)>>>0;
      },
      proofSum(value){
        proofRpcCalls++;
        return (Number(value)*17+29)>>>0;
      },
      proofZero(value){
        proofZeroRpcCalls++;
        return Object.is(value,-0)?'negative-zero':'positive-zero';
      },
      /** @param {number[]} values */
      proofBatch(values){
        proofBatchRpcCalls++;
        return values.map(value=>(Number(value)*17+29)>>>0);
      }
    },
    authorizeRpc:authorizedSession,
    authorizeOperation(request,method,args){
      if(method!=='proofSum'&&method!=='proofBatch'&&method!=='proofZero')return true;
      const header=request.headers['x-webauthn-proof'];
      if(typeof header!=='string'||!publicKey)return false;
      try{
        const proof=/** @type {{
          challengeId?:unknown,rawId?:unknown,clientData?:unknown,
          authenticatorData?:unknown,signature?:unknown
        }} */(JSON.parse(Buffer.from(header,'base64').toString('utf8')));
        if(typeof proof.challengeId!=='string'||typeof proof.rawId!=='string'||
           typeof proof.clientData!=='string'||typeof proof.authenticatorData!=='string'||
           typeof proof.signature!=='string'||proof.rawId!==credentialId)return false;
        const record=operationChallenges.get(proof.challengeId);
        if(!record)return false;
        // Consume the one-use challenge even on argument mismatch or bad proof.
        operationChallenges.delete(proof.challengeId);
        if(record.session!==sessionToken(request)||record.method!==method||
           args.length!==1)return false;
        const requested=args[0];
        if(method==='proofSum'||method==='proofZero') {
          if(typeof record.value!=='number'||!Object.is(requested,record.value))return false;
        } else {
          if(!Array.isArray(record.value)||!Array.isArray(requested)||
             requested.length!==128||!record.value.every((value,index)=>
               Object.is(requested[index],value)))return false;
        }
        const clientData=Buffer.from(proof.clientData,'base64');
        const authenticatorData=Buffer.from(proof.authenticatorData,'base64');
        const signature=Buffer.from(proof.signature,'base64');
        verifyClientData(clientData,'webauthn.get',record.challenge,
          'http://localhost:'+port);
        if(authenticatorData.length<37)return false;
        const rpHash=createHash('sha256').update(rpId).digest();
        if(!timingSafeEqual(authenticatorData.subarray(0,32),rpHash))return false;
        if((authenticatorData[32]&0x05)!==0x05)return false;
        const clientHash=createHash('sha256').update(clientData).digest();
        return verify('sha256',Buffer.concat([authenticatorData,clientHash]),
          publicKey,signature);
      }catch{return false;}
    }
  });
  /** @type {Map<string,Buffer>} */
  const challenges=new Map();
  /** @type {import('node:crypto').KeyObject|null} */
  let publicKey=null;
  let credentialId='';
  let acceptedAssertions=0;
  /** @type {string|null} */
  let lastAcceptedAssertion=null;
  let port=0;

  const server=http.createServer(async(request,response)=>{
    try{
      const url=new URL(request.url??'/','http://localhost');
      if(url.pathname.startsWith('/obfs/')){
        scoHandler(request,response);
        return;
      }
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
      if(url.pathname==='/proof-challenge'&&request.method==='POST'){
        const token=sessionToken(request);
        if(token===null||!activeSessions.has(token)){
          response.writeHead(403).end();return;
        }
        const body=/** @type {{method?:unknown,args?:unknown}} */(
          JSON.parse(await readBody(request))
        );
        if(!Array.isArray(body.args)||body.args.length!==1){
          response.writeHead(400).end();return;
        }
        const requested=body.args[0];
        const method=body.method;
        if(method==='proofSum'||method==='proofZero') {
          if(typeof requested!=='number'||!Number.isSafeInteger(requested)){
            response.writeHead(400).end();return;
          }
        } else if(method==='proofBatch') {
          if(!Array.isArray(requested)||requested.length!==128||
             !requested.every(value=>typeof value==='number'&&
               Number.isSafeInteger(value))){
            response.writeHead(400).end();return;
          }
        } else {
          response.writeHead(400).end();return;
        }
        const id=randomBytes(12).toString('hex');
        const challenge=randomBytes(32);
        const value=Array.isArray(requested)?requested.slice():requested;
        operationChallenges.set(id,{challenge,value,method,session:token});
        response.writeHead(200,{
          'content-type':'application/json','cache-control':'no-store'
        }).end(JSON.stringify({id,challenge:[...challenge]}));
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
        lastAcceptedAssertion=JSON.stringify(body);
        const session=randomBytes(32).toString('hex');
        activeSessions.add(session);
        response.writeHead(200,{
          'content-type':'application/json',
          'cache-control':'no-store',
          'set-cookie':'webauthn_session='+session+'; HttpOnly; SameSite=Strict; Path=/'
        }).end('{"ok":true}');
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

    const authorized=await page.evaluate(async()=>{
      const jsCookie=document.cookie;
      const response=await fetch('/obfs/rpc',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({method:'protectedSum',args:[7]})
      });
      return {jsCookie,status:response.status,body:await response.json()};
    });
    assert.equal(authorized.jsCookie,'','HttpOnly must not be exposed to page JS');
    assert.equal(authorized.status,200);
    assert.deepEqual(authorized.body,{ok:true,value:148});
    assert.equal(privateRpcCalls,1);
    const publicFacade=await fetch(allowedOrigin+'/obfs/facade.js');
    assert.equal(publicFacade.status,200);
    const servedSource=await publicFacade.text();
    assert.doesNotMatch(servedSource,/protectedSum|proofSum|proofBatch|webauthn_session|Number\(value\)/u);
    assert.ok(lastAcceptedAssertion);
    const reusedAssertion=await fetch(allowedOrigin+'/verify',{
      method:'POST',headers:{'content-type':'application/json'},
      body:lastAcceptedAssertion
    });
    assert.equal(reusedAssertion.status,403,'consumed WebAuthn challenge replay');
    assert.equal(acceptedAssertions,2);

    const debuggerCookies=await page.browserContext().cookies([allowedOrigin]);
    const exportedCookie=debuggerCookies.find(cookie=>cookie.name==='webauthn_session');
    assert.ok(exportedCookie?.httpOnly,'DevTools must observe HttpOnly bearer');
    assert.match(exportedCookie.value,/^[0-9a-f]{64}$/u);

    /**
     * Sign an operation-specific, one-use server challenge through the real
     * browser WebAuthn API; optionally submit it through same-origin fetch.
     * @param {number|number[]} value
     * @param {number|number[]|null} submitValue
     * @param {'proofSum'|'proofBatch'|'proofZero'} [method]
     * @returns {Promise<{proof:string,status:number|null,body:unknown,signingWallMs:number}>}
     */
    async function browserSignedOperation(value,submitValue,method='proofSum'){
      return page.evaluate(async({rp,rawId,value,submitValue,method,negativeZero})=>{
        const decode=encoded=>{
          const binary=atob(encoded);
          return Uint8Array.from(binary,character=>character.charCodeAt(0));
        };
        const encode=buffer=>{
          let binary='';
          for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);
          return btoa(binary);
        };
        const challengeResponse=await fetch('/proof-challenge',{
          method:'POST',headers:{'content-type':'application/json'},
          body:'{"method":'+JSON.stringify(method)+',"args":['+
            (negativeZero?'-0':JSON.stringify(value))+']}'
        });
        if(!challengeResponse.ok)throw Error('Operation challenge denied');
        const issued=await challengeResponse.json();
        const start=performance.now();
        const credential=await navigator.credentials.get({publicKey:{
          challenge:new Uint8Array(issued.challenge),rpId:rp,
          allowCredentials:[{type:'public-key',id:decode(rawId)}],
          userVerification:'required',timeout:10000
        }});
        if(!(credential instanceof PublicKeyCredential))throw Error('No credential');
        const assertion=credential.response;
        if(!(assertion instanceof AuthenticatorAssertionResponse))
          throw Error('No authenticator assertion');
        const signingWallMs=performance.now()-start;
        const proof=btoa(JSON.stringify({
          challengeId:issued.id,rawId:encode(credential.rawId),
          clientData:encode(assertion.clientDataJSON),
          authenticatorData:encode(assertion.authenticatorData),
          signature:encode(assertion.signature)
        }));
        if(submitValue===null)return {proof,status:null,body:null,signingWallMs};
        const response=await fetch('/obfs/rpc',{
          method:'POST',headers:{
            'content-type':'application/json',
            'x-webauthn-proof':proof
          },
          body:JSON.stringify({method,args:[submitValue]})
        });
        return {proof,status:response.status,body:await response.json(),signingWallMs};
      },{rp:rpId,rawId:registration,value,submitValue,method,
        negativeZero:typeof value==='number'&&Object.is(value,-0)});
    }

    const authorizedProof=await browserSignedOperation(7,7);
    assert.equal(authorizedProof.status,200);
    assert.deepEqual(authorizedProof.body,{ok:true,value:148});
    assert.equal(proofRpcCalls,1);
    assert.ok(authorizedProof.signingWallMs>0);

    const batchValues=Array.from({length:128},(_,index)=>index-64);
    const batchExpected=batchValues.map(value=>(value*17+29)>>>0);
    const authorizedBatch=await browserSignedOperation(
      batchValues,batchValues,'proofBatch');
    assert.equal(authorizedBatch.status,200);
    assert.deepEqual(authorizedBatch.body,{ok:true,value:batchExpected});
    assert.equal(proofBatchRpcCalls,1);

    await cdp.send('WebAuthn.setUserVerified',{
      authenticatorId:added.authenticatorId,
      isUserVerified:false
    });
    const uvRequiredResult=await page.evaluate(async({rp,rawId})=>{
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
    assert.notEqual(uvRequiredResult,'unexpected-success');
    await cdp.send('WebAuthn.setUserVerified',{
      authenticatorId:added.authenticatorId,
      isUserVerified:true
    });

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

    /**
     * @param {string|undefined} token
     * @param {string} [method]
     * @param {number|number[]} [value]
     * @param {string} [proof]
     * @returns {Promise<{status:number,body:unknown}>}
     */
    async function copiedOriginRpc(token,method='protectedSum',value=7,proof){
      const body=method==='proofZero'&&Object.is(value,-0)?
        '{"method":"proofZero","args":[-0]}':
        JSON.stringify({method,args:[value]});
      return new Promise((resolve,reject)=>{
        const request=http.request({
          hostname:'127.0.0.1',port,path:'/obfs/rpc',method:'POST',
          headers:{
            host:'localhost:'+port,
            'content-type':'application/json',
            'content-length':Buffer.byteLength(body),
            ...(token?{cookie:'webauthn_session='+token}:{}),
            ...(proof?{'x-webauthn-proof':proof}:{})
          }
        },async response=>{
          try{
            const raw=await readBody(response);
            resolve({status:response.statusCode??0,body:JSON.parse(raw)});
          }catch(error){reject(error);}
        });
        request.once('error',reject);
        request.end(body);
      });
    }
    const withoutBearer=await copiedOriginRpc(undefined);
    assert.equal(withoutBearer.status,403);
    assert.deepEqual(withoutBearer.body,{ok:false,error:'Forbidden'});
    assert.equal(privateRpcCalls,1);
    const copiedBearer=await copiedOriginRpc(exportedCookie.value);
    assert.equal(copiedBearer.status,200);
    assert.deepEqual(copiedBearer.body,authorized.body);
    assert.equal(privateRpcCalls,2);

    const copiedNoProof=await copiedOriginRpc(exportedCookie.value,'proofSum',7);
    assert.equal(copiedNoProof.status,403);
    assert.equal(proofRpcCalls,1);
    const copiedStaleProof=await copiedOriginRpc(
      exportedCookie.value,'proofSum',7,authorizedProof.proof);
    assert.equal(copiedStaleProof.status,403);
    assert.equal(proofRpcCalls,1);

    await page.goto(allowedOrigin+'/blank');
    const signedForOtherInput=await browserSignedOperation(7,null);
    const copiedSubstituted=await copiedOriginRpc(
      exportedCookie.value,'proofSum',8,signedForOtherInput.proof);
    assert.equal(copiedSubstituted.status,403);
    assert.equal(proofRpcCalls,1);
    // Raw JSON has distinct -0 and 0 numeric values after JSON.parse.
    // This sign-sensitive private method demonstrates that a credential proof
    // issued for -0 must not authorize +0 even when JS === says equal.
    const signedZero=await browserSignedOperation(-0,null,'proofZero');
    const zeroProof=JSON.parse(Buffer.from(signedZero.proof,'base64').toString('utf8'));
    const recordedZero=operationChallenges.get(zeroProof.challengeId)?.value;
    assert.ok(Object.is(recordedZero,-0),'Challenge must preserve raw -0');
    const substitutedZero=await copiedOriginRpc(
      exportedCookie.value,'proofZero',0,signedZero.proof);
    console.log('SCO_WEBAUTHN_SIGNED_ZERO '+JSON.stringify({
      issued:'-0',submitted:'+0',recordedNegativeZero:true,
      substitutedStatus:substitutedZero.status,
      substitutedBody:substitutedZero.body,
      privateCalls:proofZeroRpcCalls
    }));
    assert.equal(substitutedZero.status,403,
      'A valid WebAuthn proof bound to -0 must not authorize +0');
    assert.equal(proofZeroRpcCalls,0,
      'An argument-sign change must not execute the private method');

    const freshZeroAllowed=await browserSignedOperation(0,null,'proofZero');
    const exactPositiveZero=await copiedOriginRpc(
      exportedCookie.value,'proofZero',0,freshZeroAllowed.proof);
    assert.equal(exactPositiveZero.status,200);
    assert.deepEqual(exactPositiveZero.body,{ok:true,value:'positive-zero'});
    assert.equal(proofZeroRpcCalls,1);

    const freshNegativeZero=await browserSignedOperation(-0,null,'proofZero');
    const exactNegativeZero=await copiedOriginRpc(
      exportedCookie.value,'proofZero',-0,freshNegativeZero.proof);
    assert.equal(exactNegativeZero.status,200);
    assert.deepEqual(exactNegativeZero.body,{ok:true,value:'negative-zero'});
    assert.equal(proofZeroRpcCalls,2);

    const signedTampered=await browserSignedOperation(7,null);
    const modifiedProof=JSON.parse(Buffer.from(signedTampered.proof,'base64').toString('utf8'));
    modifiedProof.signature=Buffer.alloc(64).toString('base64');
    const badProof=Buffer.from(JSON.stringify(modifiedProof)).toString('base64');
    const copiedBadSignature=await copiedOriginRpc(
      exportedCookie.value,'proofSum',7,badProof);
    assert.equal(copiedBadSignature.status,403);
    assert.equal(proofRpcCalls,1);

    const signedAndForwarded=await browserSignedOperation(7,null);
    const copiedFreshWithoutSession=await copiedOriginRpc(
      undefined,'proofSum',7,signedAndForwarded.proof);
    assert.equal(copiedFreshWithoutSession.status,403);
    const copiedFreshProof=await copiedOriginRpc(
      exportedCookie.value,'proofSum',7,signedAndForwarded.proof);
    assert.equal(copiedFreshProof.status,200);
    assert.deepEqual(copiedFreshProof.body,authorizedProof.body);
    assert.equal(proofRpcCalls,2);
    const copiedReplay=await copiedOriginRpc(
      exportedCookie.value,'proofSum',7,signedAndForwarded.proof);
    assert.equal(copiedReplay.status,403);
    assert.equal(proofRpcCalls,2);

    const batchNoProof=await copiedOriginRpc(
      exportedCookie.value,'proofBatch',batchValues);
    assert.equal(batchNoProof.status,403);
    assert.equal(proofBatchRpcCalls,1);
    const signedBatchMutation=await browserSignedOperation(
      batchValues,null,'proofBatch');
    const mutatedBatch=batchValues.slice();
    mutatedBatch[63]++;
    const batchArgumentMutation=await copiedOriginRpc(
      exportedCookie.value,'proofBatch',mutatedBatch,signedBatchMutation.proof);
    assert.equal(batchArgumentMutation.status,403);
    assert.equal(proofBatchRpcCalls,1);

    const signedBatchPermutation=await browserSignedOperation(
      batchValues,null,'proofBatch');
    const shuffledBatch=batchValues.slice();
    [shuffledBatch[13],shuffledBatch[14]]=[shuffledBatch[14],shuffledBatch[13]];
    const batchOrderSwap=await copiedOriginRpc(
      exportedCookie.value,'proofBatch',shuffledBatch,signedBatchPermutation.proof);
    assert.equal(batchOrderSwap.status,403);
    assert.equal(proofBatchRpcCalls,1);

    const signedBatchRelay=await browserSignedOperation(
      batchValues,null,'proofBatch');
    const copiedFreshBatch=await copiedOriginRpc(
      exportedCookie.value,'proofBatch',batchValues,signedBatchRelay.proof);
    assert.equal(copiedFreshBatch.status,200);
    assert.deepEqual(copiedFreshBatch.body,{ok:true,value:batchExpected});
    assert.equal(proofBatchRpcCalls,2);
    const copiedBatchReplay=await copiedOriginRpc(
      exportedCookie.value,'proofBatch',batchValues,signedBatchRelay.proof);
    assert.equal(copiedBatchReplay.status,403);
    assert.equal(proofBatchRpcCalls,2);

    /**
     * Measure exactly the same 32 x 128 arithmetic map either in the browser
     * or by fresh operation-bound WebAuthn proof plus real private SCO RPC.
     * These wall timings include browser and transport latency, and are not
     * a measurement of the project's 2.5x compute-CPU constraint.
     * @param {'native'|'protected'} mode
     * @returns {Promise<{mode:string,wallMs:number,checksum:number}>}
     */
    async function sessionWallSample(mode){
      return page.evaluate(async({mode,values,rp,rawId})=>{
        const decode=base64=>{
          const binary=atob(base64);
          return Uint8Array.from(binary,ch=>ch.charCodeAt(0));
        };
        const encode=buffer=>{
          let binary='';
          for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);
          return btoa(binary);
        };
        let checksum=0;
        const start=performance.now();
        for(let sample=0;sample<32;sample++){
          let output;
          if(mode==='native'){
            output=values.map(value=>(Number(value)*17+29)>>>0);
          } else {
            const challengeResponse=await fetch('/proof-challenge',{
              method:'POST',headers:{'content-type':'application/json'},
              body:JSON.stringify({method:'proofBatch',args:[values]})
            });
            if(!challengeResponse.ok)throw Error('Batch challenge failed');
            const issued=await challengeResponse.json();
            const credential=await navigator.credentials.get({publicKey:{
              challenge:new Uint8Array(issued.challenge),rpId:rp,
              allowCredentials:[{type:'public-key',id:decode(rawId)}],
              userVerification:'required',timeout:10000
            }});
            if(!(credential instanceof PublicKeyCredential))
              throw Error('Missing WebAuthn batch credential');
            const assertion=credential.response;
            if(!(assertion instanceof AuthenticatorAssertionResponse))
              throw Error('Invalid WebAuthn batch assertion');
            const proof=btoa(JSON.stringify({
              challengeId:issued.id,rawId:encode(credential.rawId),
              clientData:encode(assertion.clientDataJSON),
              authenticatorData:encode(assertion.authenticatorData),
              signature:encode(assertion.signature)
            }));
            const reply=await fetch('/obfs/rpc',{
              method:'POST',headers:{
                'content-type':'application/json','x-webauthn-proof':proof
              },
              body:JSON.stringify({method:'proofBatch',args:[values]})
            });
            if(!reply.ok)throw Error('Authenticated private batch denied');
            const json=await reply.json();
            if(json.ok!==true||!Array.isArray(json.value))
              throw Error('Unexpected private batch response');
            output=json.value;
          }
          if(output.length!==128)throw Error('Wrong batch length');
          for(let index=0;index<128;index++){
            const expected=(Number(values[index])*17+29)>>>0;
            if(output[index]!==expected)
              throw Error('Mismatched native output at index '+index);
            checksum=(checksum+((output[index]^sample)|0))|0;
          }
        }
        return {mode,wallMs:performance.now()-start,checksum};
      },{mode,values:batchValues,rp:rpId,rawId:registration});
    }
    await sessionWallSample('native');
    await sessionWallSample('protected');
    /** @type {{original:{mode:string,wallMs:number,checksum:number},proof:{mode:string,wallMs:number,checksum:number}}[]} */
    const sessionWallPairs=[];
    for(let pairIndex=0;pairIndex<5;pairIndex++){
      const originalFirst=pairIndex%2===0;
      const first=await sessionWallSample(originalFirst?'native':'protected');
      const second=await sessionWallSample(originalFirst?'protected':'native');
      const original=originalFirst?first:second;
      const proof=originalFirst?second:first;
      assert.equal(proof.checksum,original.checksum);
      assert.ok(original.wallMs>0&&proof.wallMs>0);
      sessionWallPairs.push({original,proof});
    }
    assert.equal(proofBatchRpcCalls,2+32+5*32);
    const medianWall=/** @param {number[]} v */(v)=>
      v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)];
    const nativeMedianMs=medianWall(sessionWallPairs.map(p=>p.original.wallMs));
    const proofMedianMs=medianWall(sessionWallPairs.map(p=>p.proof.wallMs));
    const wallRatio=proofMedianMs/nativeMedianMs;
    console.log('SCO_WEBAUTHN_BATCH_WALL '+JSON.stringify({
      node:process.version,platform:process.platform,
      source:'real-Chromium-32x128-matched-arithmetic',
      securityBoundOperation:'proofBatch',
      warmedUp:true,operationsPerTimedSample:32*128,
      signedProofsPerProtectedSample:32,
      pairs:sessionWallPairs,nativeMedianMs,proofMedianMs,wallRatio,
      meets2_5xWall:wallRatio<=2.5,
      claim:'wall elapsed includes WebAuthn signing, challenge and RPC; excludes signup and login; cannot establish compute CPU ratio'
    }));

    const signedBeforeRevocation=await browserSignedOperation(7,null);
    activeSessions.delete(exportedCookie.value);
    const revokedValidProof=await copiedOriginRpc(
      exportedCookie.value,'proofSum',7,signedBeforeRevocation.proof);
    assert.equal(revokedValidProof.status,403);
    assert.equal(proofRpcCalls,2);
    const afterRevocation=await copiedOriginRpc(exportedCookie.value);
    assert.equal(afterRevocation.status,403);
    assert.equal(privateRpcCalls,2);

    const reloginStatus=await sameOriginAssertion('concurrent-batch-replay');
    assert.equal(reloginStatus,200);
    assert.equal(acceptedAssertions,3);
    const renewedCookies=await page.browserContext().cookies([allowedOrigin]);
    const renewedCookie=renewedCookies.find(cookie=>cookie.name==='webauthn_session');
    assert.ok(renewedCookie?.httpOnly);
    assert.notEqual(renewedCookie.value,exportedCookie.value);
    const signedConcurrentBatch=await browserSignedOperation(
      batchValues,null,'proofBatch');
    const beforeConcurrentPrivateCalls=proofBatchRpcCalls;
    const simultaneous=await Promise.all(Array.from({length:8},()=>
      copiedOriginRpc(renewedCookie.value,'proofBatch',
        batchValues,signedConcurrentBatch.proof)));
    const successes=simultaneous.filter(result=>result.status===200);
    const denials=simultaneous.filter(result=>result.status===403);
    assert.equal(successes.length,1,'at most one successful replayed batch');
    assert.equal(denials.length,7,'seven replayed assertions must be denied');
    assert.deepEqual(successes[0].body,{ok:true,value:batchExpected});
    for(const denied of denials) {
      assert.deepEqual(denied.body,{ok:false,error:'Forbidden'});
    }
    assert.equal(proofBatchRpcCalls,beforeConcurrentPrivateCalls+1);
    const finalConcurrentReplay=await copiedOriginRpc(
      renewedCookie.value,'proofBatch',batchValues,signedConcurrentBatch.proof);
    assert.equal(finalConcurrentReplay.status,403);
    assert.equal(proofBatchRpcCalls,beforeConcurrentPrivateCalls+1);
    console.log('SCO_WEBAUTHN_BATCH_RACE '+JSON.stringify({
      node:process.version,platform:process.platform,
      concurrentRequests:simultaneous.length,
      sharedProofSignedAtAllowedOrigin:true,
      authorizedPrivateExecutions:proofBatchRpcCalls-beforeConcurrentPrivateCalls,
      accepted:successes.length,denied:denials.length,
      responseStatuses:simultaneous.map(result=>result.status),
      finalSequentialReplayStatus:finalConcurrentReplay.status,
      oneUseRecordOwner:'same trusted Node SCO handler'
    }));

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
      failedUserVerificationResult:uvRequiredResult,
      acceptedAssertions,
      privateRpcCalls,
      proofRpcCalls,
      proofBatchRpcCalls,
      authorizedBatchCount:batchValues.length,
      authorizedBatchStatus:authorizedBatch.status,
      copiedBatchWithoutProofStatus:batchNoProof.status,
      copiedBatchArgumentMutationStatus:batchArgumentMutation.status,
      copiedBatchReorderedStatus:batchOrderSwap.status,
      copiedBatchFreshAuthorizedProofStatus:copiedFreshBatch.status,
      copiedBatchSignedProofReplayStatus:copiedBatchReplay.status,
      copiedBatchOutputsMatchNative:true,
      authorizedPrivateRpcStatus:authorized.status,
      authorizedProofRpcStatus:authorizedProof.status,
      copiedOriginProofWithoutAssertionStatus:copiedNoProof.status,
      copiedOriginUsedProofReplayStatus:copiedStaleProof.status,
      copiedOriginArgumentSubstitutionStatus:copiedSubstituted.status,
      copiedOriginFreshAuthorizedProofStatus:copiedFreshProof.status,
      copiedOriginFreshProofReplayStatus:copiedReplay.status,
      copiedOriginBadSignatureStatus:copiedBadSignature.status,
      copiedOriginFreshProofWithoutSessionStatus:copiedFreshWithoutSession.status,
      revokedSessionWithUnusedValidProofStatus:revokedValidProof.status,
      observedBrowserSigningWallMs:authorizedProof.signingWallMs,
      pageJavascriptCookieVisible:authorized.jsCookie.length>0,
      debuggerCanExportHttpOnlySession:true,
      copiedOriginWithoutSessionStatus:withoutBearer.status,
      copiedOriginWithSessionStatus:copiedBearer.status,
      copiedOriginBodyMatchesAuthorized:JSON.stringify(copiedBearer.body)===JSON.stringify(authorized.body),
      consumedAssertionReplayStatus:reusedAssertion.status,
      publicFacadeExposesPrivateMethod:false,
      revokedCopiedSessionStatus:afterRevocation.status,
      concurrentIdenticalSignedBatchRequests:simultaneous.length,
      concurrentSignedBatchAccepted:successes.length,
      concurrentSignedBatchDenied:denials.length,
      concurrentSignedBatchReplayStatus:finalConcurrentReplay.status,
      implication:'WebAuthn RP-binding prevents copied-origin credential assertions, but a conventional post-admission HttpOnly bearer session remains portable through raw HTTP under hostile-client control.'
    }));
    // Independent copied-origin enrolment attack. The prototype's public
    // /register endpoint checks only caller-authored clientDataJSON and
    // caller-supplied SPKI, with no enrollment authorization or attestation.
    // A raw HTTP client can replace the previously trusted credential with
    // a software-generated key and sign its own login and operation proofs.
    const copiedBase='http://127.0.0.1:'+port;
    const attackerKeys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const attackerCredentialId=randomBytes(20).toString('base64');
    /** @param {number[]} bytes @param {string} type @returns {Buffer} */
    function forgedClientData(bytes,type){
      return Buffer.from(JSON.stringify({
        type,challenge:base64url(Buffer.from(bytes)),origin:allowedOrigin
      }));
    }
    /**
     * @param {{id:string,challenge:number[]}} issued
     * @returns {{challengeId:string,rawId:string,clientData:string,authenticatorData:string,signature:string}}
     */
    function forgedAssertion(issued){
      const clientData=forgedClientData(issued.challenge,'webauthn.get');
      const authenticatorData=Buffer.concat([
        createHash('sha256').update(rpId).digest(),
        Buffer.from([0x05,0,0,0,0])
      ]);
      const signed=Buffer.concat([
        authenticatorData,createHash('sha256').update(clientData).digest()
      ]);
      return {
        challengeId:issued.id,rawId:attackerCredentialId,
        clientData:clientData.toString('base64'),
        authenticatorData:authenticatorData.toString('base64'),
        signature:sign('sha256',signed,attackerKeys.privateKey).toString('base64')
      };
    }
    /** @returns {Promise<{id:string,challenge:number[]}>} */
    async function copiedChallenge(){
      const response=await fetch(copiedBase+'/challenge');
      assert.equal(response.status,200);
      return /** @type {{id:string,challenge:number[]}} */(await response.json());
    }
    const registrationChallenge=await copiedChallenge();
    const forgedRegistration=await fetch(copiedBase+'/register',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        challengeId:registrationChallenge.id,
        rawId:attackerCredentialId,
        clientData:forgedClientData(
          registrationChallenge.challenge,'webauthn.create').toString('base64'),
        publicKeySpki:attackerKeys.publicKey.export({
          type:'spki',format:'der'
        }).toString('base64')
      })
    });
    assert.equal(forgedRegistration.status,204,
      'Public enrollment wrongly accepts raw client-supplied key and origin');
    const loginChallenge=await copiedChallenge();
    const forgedLogin=await fetch(copiedBase+'/verify',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(forgedAssertion(loginChallenge))
    });
    assert.equal(forgedLogin.status,200,
      'Software key can now authenticate outside registered WebAuthn origin');
    const newCookie=forgedLogin.headers.get('set-cookie');
    assert.ok(newCookie);
    const cookieMatch=/webauthn_session=([0-9a-f]{64})/u.exec(newCookie);
    assert.ok(cookieMatch);
    const spoofedSession=cookieMatch[1];
    const challengeResponse=await fetch(copiedBase+'/proof-challenge',{
      method:'POST',headers:{
        'content-type':'application/json',cookie:'webauthn_session='+spoofedSession
      },body:JSON.stringify({method:'proofSum',args:[7]})
    });
    assert.equal(challengeResponse.status,200);
    const operationChallenge=/** @type {{id:string,challenge:number[]}} */(
      await challengeResponse.json());
    const forgedProof=Buffer.from(JSON.stringify(
      forgedAssertion(operationChallenge))).toString('base64');
    const beforeSoftwareProof=proofRpcCalls;
    const softwareOriginRpc=await copiedOriginRpc(
      spoofedSession,'proofSum',7,forgedProof);
    assert.equal(softwareOriginRpc.status,200);
    assert.deepEqual(softwareOriginRpc.body,{ok:true,value:148});
    assert.equal(proofRpcCalls,beforeSoftwareProof+1);
    console.log('SCO_WEBAUTHN_UNTRUSTED_ENROLLMENT '+JSON.stringify({
      node:process.version,platform:process.platform,
      copiedOrigin:copiedBase,originClaimOnlyInsideAttackerJson:true,
      initialBrowserCredentialOverwritten:true,
      realWebAuthnOperationsByAttacker:0,
      forgedRegistrationStatus:forgedRegistration.status,
      softwareKeyLoginStatus:forgedLogin.status,
      softwareProofRpcStatus:softwareOriginRpc.status,
      softwareProofRpcValue:softwareOriginRpc.body,
      copiedOriginPrivateExecutions:proofRpcCalls-beforeSoftwareProof,
      boundary:'Experimental unauthenticated /register route only. A production RP must authenticate enrollment, validate the attested public key and account ownership, and prevent unapproved replacement.'
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
