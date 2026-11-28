'use strict';

const {createHash,createPublicKey,randomBytes,timingSafeEqual,verify:verifySignature}=require('node:crypto');
const {domainToASCII}=require('node:url');
const {isUtf8}=require('node:buffer');

/**
 * A deliberately narrow WebAuthn **assertion** admission gate for trusted SCO
 * servers. Registration, pre-ceremony user authentication, credential records,
 * durable signature-counter policy, session cookies and distributed state are
 * application responsibilities. This is not a client-side obfuscation scheme.
 *
 * Only ES256 (P-256/ECDSA with SHA-256) credentials are accepted. Unknown
 * COSE algorithms, attestations and extension-policy claims are NOT verified.
 * @typedef {{publicKey:import('node:crypto').KeyObject|string|Buffer,
 *   signCount:number}} RegisteredCredential
 * @typedef {{
 *   rpId:string, allowedOrigins:string[], requireUserVerification?:boolean,
 *   allowInsecureLocalhost?:boolean, challengeTtlMs?:number, sessionTtlMs?:number,
 *   maxChallenges?:number, maxSessions?:number,
 *   lookupCredential:(principal:string,credentialId:string)=>RegisteredCredential|null|Promise<RegisteredCredential|null>,
 *   updateSignCount:(principal:string,credentialId:string,previous:number,next:number,
 *       flags:{userPresent:boolean,userVerified:boolean,backupEligible:boolean,backedUp:boolean})=>boolean|Promise<boolean>,
 *   now?:()=>number
 * }} ScoWebAuthnAdmissionOptions
 * @typedef {{challengeId:string,challenge:string,rpId:string,expiresAt:number}} IssuedChallenge
 * @typedef {{principal:string,sessionId:string,challengeId:string,credentialId:string,
 *   clientDataJSON:string,authenticatorData:string,signature:string}} AssertionInput
 * @typedef {{ok:true,token:string,expiresAt:number}|{ok:false}} AssertionResult
 */

/**
 * Strict, canonical browser base64url decoding. Do not accept Node Buffer's
 * permissive skipping of invalid characters or alternative textual aliases.
 * @param {unknown} value
 * @param {number} maximum
 * @returns {Buffer|null}
 */
function decodeBase64url(value,maximum) {
  if(typeof value!=='string' || !value.length || value.length>Math.ceil(maximum*4/3)+4 ||
     !/^[A-Za-z0-9_-]+$/u.test(value))return null;
  const decoded=Buffer.from(value,'base64url');
  if(!decoded.length || decoded.length>maximum || decoded.toString('base64url')!==value)return null;
  return decoded;
}

/**
 * Compare exact origins: browser clientDataJSON.origin must match a trusted
 * configured origin, not an origin reconstructed from attacker-supplied HTTP
 * Host/Forwarded headers.
 * @param {string} value
 * @param {string} rpId
 * @param {boolean} allowInsecureLocalhost
 * @returns {string}
 */
function canonicalOrigin(value,rpId,allowInsecureLocalhost) {
  if(typeof value!=='string'||!value.length)throw new TypeError('WebAuthn origin must be a string');
  let url;
  try{url=new URL(value);}catch{throw new TypeError('Invalid WebAuthn origin');}
  if(url.origin!==value || url.username || url.password || url.pathname!=='/' ||
     url.search || url.hash)throw new TypeError('WebAuthn origins must be exact serialized origins');
  const permittedScheme=url.protocol==='https:' ||
    allowInsecureLocalhost && url.protocol==='http:' && url.hostname==='localhost' && rpId==='localhost';
  if(!permittedScheme)throw new TypeError('WebAuthn origin requires HTTPS');
  if(url.hostname!==rpId && !url.hostname.endsWith('.'+rpId))
    throw new TypeError('WebAuthn origin is outside the relying party ID');
  return value;
}

/** @param {unknown} value @param {string} name @returns {number} */
function positiveInteger(value,name){
  if(!Number.isSafeInteger(value)||/** @type {number} */(value)<=0)throw new TypeError(name+' must be a positive safe integer');
  return /** @type {number} */(value);
}

/**
 * Return a public SPKI key, refusing any non-P-256 key or private-key input.
 * @param {RegisteredCredential['publicKey']} provided
 * @returns {import('node:crypto').KeyObject|null}
 */
function publicEs256Key(provided){
  try{
    const key=(typeof provided==='string'||Buffer.isBuffer(provided))?
      createPublicKey(typeof provided==='string'?provided:{key:provided,format:'der',type:'spki'}):provided;
    return key?.type==='public' && key.asymmetricKeyType==='ec' &&
      key.asymmetricKeyDetails?.namedCurve==='prime256v1' ? key : null;
  }catch{return null;}
}

/**
 * Construct a per-process, bounded WebAuthn assertion admission gate.
 * Persist credential records and provide an atomic signature-counter CAS in
 * the supplied application callbacks. For multiple workers, replace this
 * in-memory challenge/session implementation with shared atomic storage;
 * process-local state does not coordinate across replicas or restarts.
 *
 * @param {ScoWebAuthnAdmissionOptions} options
 * @returns {{issueChallenge:(principal:string,sessionId:string)=>IssuedChallenge,
 *   verifyAssertion:(assertion:AssertionInput)=>Promise<AssertionResult>,
 *   authorizeSession:(token:string,principal:string)=>boolean,
 *   revokeSession:(token:string)=>boolean,
 *   revokePrincipal:(principal:string)=>void}}
 */
function createScoWebAuthnAdmission(options){
  if(!options||typeof options!=='object')throw new TypeError('WebAuthn options required');
  if(typeof options.rpId!=='string'||!options.rpId ||
     domainToASCII(options.rpId)!==options.rpId ||
     options.rpId!==options.rpId.toLowerCase() ||
     options.rpId.endsWith('.') || /[:/?#@]/u.test(options.rpId))
    throw new TypeError('WebAuthn relying party ID must be a canonical ASCII hostname');
  if(!Array.isArray(options.allowedOrigins)||!options.allowedOrigins.length ||
     options.allowedOrigins.some(origin=>typeof origin!=='string'))
    throw new TypeError('WebAuthn allowedOrigins must be nonempty strings');
  if(typeof options.lookupCredential!=='function'||typeof options.updateSignCount!=='function')
    throw new TypeError('WebAuthn requires credential lookup and atomic sign-counter policy');
  const rpId=options.rpId;
  const origins=new Set(options.allowedOrigins.map(origin=>canonicalOrigin(origin,rpId,options.allowInsecureLocalhost===true)));
  const requireUV=options.requireUserVerification!==false;
  const challengeTtlMs=positiveInteger(options.challengeTtlMs??60000,'challengeTtlMs');
  const sessionTtlMs=positiveInteger(options.sessionTtlMs??900000,'sessionTtlMs');
  const maxChallenges=positiveInteger(options.maxChallenges??4096,'maxChallenges');
  const maxSessions=positiveInteger(options.maxSessions??4096,'maxSessions');
  const now=options.now??Date.now;
  if(typeof now!=='function')throw new TypeError('WebAuthn now must be a function');
  const rpHash=createHash('sha256').update(rpId,'utf8').digest();
  /** @type {Map<string,{principal:string,sessionId:string,challenge:Buffer,expiresAt:number,version:number}>} */
  const challenges=new Map();
  /** @type {Map<string,{principal:string,expiresAt:number}>} */
  const sessions=new Map();
  /** @type {Map<string,number>} */
  const principalVersions=new Map();
  let lastObservedTime=0;
  /** @returns {number} */
  function clock(){
    const t=now();
    if(!Number.isSafeInteger(t)||t<0)throw new TypeError('WebAuthn requires a valid millisecond clock');
    // An NTP rollback must not make an already-expired session valid again.
    lastObservedTime=Math.max(lastObservedTime,t);
    return lastObservedTime;
  }
  /** @param {number} time */
  function purge(time){
    for(const [id,challenge] of challenges)if(challenge.expiresAt<=time)challenges.delete(id);
    for(const [id,session] of sessions)if(session.expiresAt<=time)sessions.delete(id);
  }
  /** @param {string} value @param {string} name */
  function requireIdentity(value,name){
    if(typeof value!=='string'||!value.length||value.length>512)
      throw new TypeError('WebAuthn '+name+' must be a nonempty bounded string');
  }
  /**
   * Issue a random one-use assertion challenge. The caller MUST independently
   * authenticate principal and bind sessionId to an intended ceremony.
   * @param {string} principal
   * @param {string} sessionId
   * @returns {IssuedChallenge}
   */
  function issueChallenge(principal,sessionId){
    requireIdentity(principal,'principal');
    requireIdentity(sessionId,'sessionId');
    const time=clock();
    purge(time);
    if(challenges.size>=maxChallenges)throw new Error('WebAuthn challenge capacity exhausted');
    const challengeId=randomBytes(32).toString('base64url');
    const challenge=randomBytes(32);
    const expiresAt=time+challengeTtlMs;
    if(!Number.isSafeInteger(expiresAt))throw new RangeError('WebAuthn expiry overflow');
    challenges.set(challengeId,{principal,sessionId,challenge,expiresAt,
      version:principalVersions.get(principal)??0});
    return {challengeId,challenge:challenge.toString('base64url'),rpId,expiresAt};
  }
  /**
   * Consume an assertion at most once. Any attempted assertion for a valid
   * challenge ID burns that challenge before asynchronous application calls,
   * preventing concurrent replays. Reissue after rejection.
   * @param {AssertionInput} assertion
   * @returns {Promise<AssertionResult>}
   */
  async function verifyAssertion(assertion){
    const denied=/** @type {const} */({ok:false});
    if(!assertion||typeof assertion!=='object')return denied;
    const {principal,sessionId,challengeId,credentialId}=assertion;
    if(typeof principal!=='string'||typeof sessionId!=='string'||
       typeof challengeId!=='string'||typeof credentialId!=='string'||
       !principal||!sessionId||!challengeId||!credentialId)return denied;
    const pending=challenges.get(challengeId);
    if(!pending)return denied;
    challenges.delete(challengeId);
    const time=clock();
    if(pending.expiresAt<=time || pending.principal!==principal || pending.sessionId!==sessionId ||
       pending.version!==(principalVersions.get(principal)??0))return denied;
    const credentialBytes=decodeBase64url(credentialId,1024);
    const clientBytes=decodeBase64url(assertion.clientDataJSON,16384);
    const authBytes=decodeBase64url(assertion.authenticatorData,16384);
    const signature=decodeBase64url(assertion.signature,1024);
    if(!credentialBytes||!clientBytes||!isUtf8(clientBytes)||!authBytes||!signature||authBytes.length<37)return denied;
    let client;
    try{client=JSON.parse(clientBytes.toString('utf8'));}catch{return denied;}
    if(!client || typeof client!=='object' || Array.isArray(client) ||
       client.type!=='webauthn.get' || !origins.has(client.origin) ||
       client.crossOrigin===true || (client.crossOrigin!==undefined && client.crossOrigin!==false) ||
       typeof client.challenge!=='string')return denied;
    const submittedChallenge=decodeBase64url(client.challenge,256);
    if(!submittedChallenge || submittedChallenge.length!==pending.challenge.length ||
       !timingSafeEqual(submittedChallenge,pending.challenge))return denied;
    if(!timingSafeEqual(authBytes.subarray(0,32),rpHash))return denied;
    const flags=authBytes[32];
    const userPresent=(flags&0x01)!==0;
    const userVerified=(flags&0x04)!==0;
    const backupEligible=(flags&0x08)!==0;
    const backedUp=(flags&0x10)!==0;
    if(!userPresent || (requireUV&&!userVerified) || (backedUp&&!backupEligible))return denied;
    const signCount=authBytes.readUInt32BE(33);
    let record;
    try{record=await options.lookupCredential(principal,credentialId);}catch{return denied;}
    // Do not start a durable counter mutation for a revoked ceremony.
    if(pending.version!==(principalVersions.get(principal)??0))return denied;
    if(!record || !Number.isSafeInteger(record.signCount) || record.signCount<0 ||
       record.signCount>0xffffffff)return denied;
    const key=publicEs256Key(record.publicKey);
    if(!key)return denied;
    const signed=Buffer.concat([authBytes,createHash('sha256').update(clientBytes).digest()]);
    try{if(!verifySignature('sha256',signed,key,signature))return denied;}
    catch{return denied;}
    if(clock()>=pending.expiresAt)return denied;
    let committed;
    try{
      committed=await options.updateSignCount(principal,credentialId,record.signCount,signCount,
        {userPresent,userVerified,backupEligible,backedUp});
    }catch{return denied;}
    if(committed!==true || clock()>=pending.expiresAt ||
       pending.version!==(principalVersions.get(principal)??0))return denied;
    purge(clock());
    if(sessions.size>=maxSessions)return denied;
    const token=randomBytes(32).toString('base64url');
    const expiresAt=clock()+sessionTtlMs;
    if(!Number.isSafeInteger(expiresAt))return denied;
    sessions.set(token,{principal,expiresAt});
    return {ok:true,token,expiresAt};
  }
  /** @param {string} token @param {string} principal @returns {boolean} */
  function authorizeSession(token,principal){
    if(typeof token!=='string'||typeof principal!=='string')return false;
    const session=sessions.get(token);
    if(!session)return false;
    if(session.expiresAt<=clock()){
      sessions.delete(token);
      return false;
    }
    return session.principal===principal;
  }
  /** @param {string} token @returns {boolean} */
  function revokeSession(token){return sessions.delete(token);}
  /** @param {string} principal @returns {void} */
  function revokePrincipal(principal){
    // A paused lookup/CAS must never mint a session after revocation.
    const nextVersion=(principalVersions.get(principal)??0)+1;
    if(!Number.isSafeInteger(nextVersion))throw new RangeError('WebAuthn principal generation exhausted');
    principalVersions.set(principal,nextVersion);
    for(const [token,session] of sessions)if(session.principal===principal)sessions.delete(token);
    for(const [id,challenge] of challenges)if(challenge.principal===principal)challenges.delete(id);
  }
  return {issueChallenge,verifyAssertion,authorizeSession,revokeSession,revokePrincipal};
}

module.exports={createScoWebAuthnAdmission};
