'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {createHash,generateKeyPairSync,randomBytes,sign}=require('node:crypto');
const {createScoWebAuthnAdmission}=require('../src/sco-webauthn-admission');

/** @typedef {import('../src/sco-webauthn-admission').RegisteredCredential} RegisteredCredential */

/**
 * Sign the real ES256 WebAuthn message: authenticatorData ||
 * SHA256(clientDataJSON). This is a server-side cryptographic fixture, not a
 * synthetic browser origin/RP check (the latter has separate Chromium tests).
 * @param {ReturnType<typeof harness>} h
 * @param {{challengeId:string,challenge:string,rpId:string}} challenge
 * @param {{principal?:string,sessionId?:string,origin?:string,rpId?:string,
 *   type?:string,flags?:number,counter?:number,crossOrigin?:boolean,
 *   credentialId?:string,clientChallenge?:string}} [overrides]
 */
function assertion(h,challenge,overrides={}){
  const client={type:overrides.type??'webauthn.get',
    challenge:overrides.clientChallenge??challenge.challenge,
    origin:overrides.origin??'https://secure.example.com',
    crossOrigin:overrides.crossOrigin??false};
  const clientBytes=Buffer.from(JSON.stringify(client),'utf8');
  const auth=Buffer.alloc(37);
  createHash('sha256').update(overrides.rpId??challenge.rpId).digest().copy(auth,0);
  auth[32]=overrides.flags??0x05;
  auth.writeUInt32BE(overrides.counter??1,33);
  const signed=Buffer.concat([auth,createHash('sha256').update(clientBytes).digest()]);
  const signature=sign('sha256',signed,h.privateKey);
  return {
    principal:overrides.principal??'accountA',
    sessionId:overrides.sessionId??'loginA',
    challengeId:challenge.challengeId,
    credentialId:overrides.credentialId??h.credentialId,
    clientDataJSON:clientBytes.toString('base64url'),
    authenticatorData:auth.toString('base64url'),
    signature:signature.toString('base64url')
  };
}

/**
 * @param {Partial<import('../src/sco-webauthn-admission').ScoWebAuthnAdmissionOptions>} [overrides]
 */
function harness(overrides={}){
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const credentialId=randomBytes(32).toString('base64url');
  /** @type {Map<string,RegisteredCredential>} */
  const records=new Map([[credentialId,{publicKey,signCount:0}]]);
  let signCountUpdates=0;
  let now=1_800_000_000_000;
  const admission=createScoWebAuthnAdmission({
    rpId:'example.com',allowedOrigins:['https://secure.example.com'],
    now:()=>now,
    lookupCredential:async(principal,id)=>principal==='accountA'?records.get(id)??null:null,
    updateSignCount:async(principal,id,oldValue,newValue)=>{
      signCountUpdates++;
      const record=records.get(id);
      if(principal!=='accountA'||!record||oldValue!==record.signCount)return false;
      if((oldValue!==0||newValue!==0)&&newValue<=oldValue)return false;
      record.signCount=newValue;
      return true;
    },
    ...overrides
  });
  /** @param {number} ms */
  function advance(ms){now+=ms;}
  return {admission,privateKey,publicKey,credentialId,records,
    clock:{advance},get updates(){return signCountUpdates;}};
}

test('ES256 assertion binds principal, ceremony, relying party, origin and UV',async()=>{
  const h=harness();
  const challenge=h.admission.issueChallenge('accountA','loginA');
  assert.match(challenge.challenge,/^[A-Za-z0-9_-]{43}$/u);
  assert.match(challenge.challengeId,/^[A-Za-z0-9_-]{43}$/u);
  const verified=await h.admission.verifyAssertion(assertion(h,challenge));
  assert.equal(verified.ok,true);
  if(!verified.ok)return;
  assert.equal(h.updates,1);
  assert.equal(h.admission.authorizeSession(verified.token,'accountA'),true);
  assert.equal(h.admission.authorizeSession(verified.token,'accountB'),false);
  assert.equal((await h.admission.verifyAssertion(assertion(h,challenge))).ok,false);
  assert.equal(h.admission.revokeSession(verified.token),true);
  assert.equal(h.admission.authorizeSession(verified.token,'accountA'),false);
});

test('invalid asserted origin, flags, principal, challenge and credential do not mutate counter',async()=>{
  /** @type {Array<[string,NonNullable<Parameters<typeof assertion>[2]>]>} */
  const scenarios=[
    ['unapproved origin',{origin:'https://bad.example.com'}],
    ['IP alias origin',{origin:'https://127.0.0.1'}],
    ['changed relying party',{rpId:'other.example.com'}],
    ['missing UP',{flags:0x04}],
    ['missing UV',{flags:0x01}],
    ['BS without BE',{flags:0x15}],
    ['cross origin',{crossOrigin:true}],
    ['wrong client type',{type:'webauthn.create'}],
    ['wrong challenge',{clientChallenge:randomBytes(32).toString('base64url')}],
    ['wrong principal',{principal:'accountB'}],
    ['wrong ceremony',{sessionId:'loginB'}],
    ['unknown credential',{credentialId:randomBytes(32).toString('base64url')}]
  ];
  for(const [label,modification] of scenarios){
    const h=harness();
    const challenge=h.admission.issueChallenge('accountA','loginA');
    assert.equal((await h.admission.verifyAssertion(assertion(h,challenge,modification))).ok,false,label);
    assert.equal(h.updates,0,label);
  }
});

test('tampered signed data, noncanonical encodings and non-P-256 keys reject',async()=>{
  for(const kind of ['signature','authenticatorData','clientDataJSON','credentialId','other-key']){
    const h=harness();
    const challenge=h.admission.issueChallenge('accountA','loginA');
    const submitted=assertion(h,challenge);
    if(kind==='other-key'){
      const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
      const record=h.records.get(h.credentialId);
      assert.ok(record);
      record.publicKey=publicKey;
    }else if(kind==='credentialId'){
      submitted.credentialId+='=';
    }else if(kind==='clientDataJSON'){
      submitted.clientDataJSON=Buffer.from('{bad-json').toString('base64url');
    }else{
      const field=/** @type {'signature'|'authenticatorData'} */(kind);
      const bytes=Buffer.from(submitted[field],'base64url');
      bytes[bytes.length-1]^=1;
      submitted[field]=bytes.toString('base64url');
    }
    assert.equal((await h.admission.verifyAssertion(submitted)).ok,false,kind);
    assert.equal(h.updates,0,kind);
  }
});

test('challenge consumption is synchronous across 16 simultaneous assertion attempts',async()=>{
  const h=harness();
  const challenge=h.admission.issueChallenge('accountA','loginA');
  const packet=assertion(h,challenge);
  const all=await Promise.all(Array.from({length:16},()=>h.admission.verifyAssertion(packet)));
  assert.equal(all.filter(item=>item.ok).length,1);
  assert.equal(h.updates,1);
});

test('application-owned CAS rejects equal nonzero sign counts on distinct signed challenges',async()=>{
  const h=harness();
  const first=h.admission.issueChallenge('accountA','loginA');
  assert.equal((await h.admission.verifyAssertion(assertion(h,first))).ok,true);
  const second=h.admission.issueChallenge('accountA','loginA');
  assert.equal((await h.admission.verifyAssertion(assertion(h,second))).ok,false);
  assert.equal(h.records.get(h.credentialId)?.signCount,1);
  assert.equal(h.updates,2);
});

test('expiry, bounded in-process storage and principal revocation',async()=>{
  const h=harness({challengeTtlMs:100,sessionTtlMs:200,maxChallenges:1,maxSessions:1});
  const expired=h.admission.issueChallenge('accountA','loginA');
  assert.throws(()=>h.admission.issueChallenge('accountA','loginA'),/capacity/u);
  h.clock.advance(101);
  assert.equal((await h.admission.verifyAssertion(assertion(h,expired))).ok,false);
  const c=h.admission.issueChallenge('accountA','loginA');
  const result=await h.admission.verifyAssertion(assertion(h,c));
  assert.equal(result.ok,true);
  if(!result.ok)return;
  assert.equal(h.admission.authorizeSession(result.token,'accountA'),true);
  h.admission.revokePrincipal('accountA');
  assert.equal(h.admission.authorizeSession(result.token,'accountA'),false);
  const next=h.admission.issueChallenge('accountA','loginA');
  const verified=await h.admission.verifyAssertion(assertion(h,next,{counter:2}));
  assert.equal(verified.ok,true);
  if(!verified.ok)return;
  h.clock.advance(201);
  assert.equal(h.admission.authorizeSession(verified.token,'accountA'),false);
});

test('misconfigured server origins and missing durable counter policy fail at construction',()=>{
  for(const bad of [
    {allowedOrigins:['http://secure.example.com']},
    {allowedOrigins:['https://secure.example.com.evil.com']},
    {allowedOrigins:['https://127.0.0.1']},
    {allowedOrigins:['https://secure.example.com/route']},
    {rpId:'EXAMPLE.COM'}, {rpId:'example.com.'},
    {lookupCredential:null}, {updateSignCount:null}, {maxChallenges:0}
  ]){
    assert.throws(()=>harness(/** @type {any} */(bad)),TypeError);
  }
  assert.doesNotThrow(()=>harness({
    rpId:'localhost',allowedOrigins:['http://localhost:8080'],allowInsecureLocalhost:true
  }));
});

test('trusted SCO callback is denied before private work, accepts verified session, then revokes',async()=>{
  // Authentication principal is fixed on the server side, not inferred from a
  // wire-supplied account, Host header, or unverified client assertion.
  const {createScoHandler}=require('../src/sco');
  const h=harness();
  let privateCalls=0;
  const sco=createScoHandler([{
    path:'facade.js',sourceType:'script',code:'globalThis.obfsWebAuthnAdmissionDemo=true;'
  }],{
    publicPaths:['facade.js'],
    remoteMethods:{protectedSum(value){privateCalls++;return Number(value)+17;}},
    authorizeRpc(request){
      const cookie=request.headers.cookie??'';
      const token=/^obfs_auth=([A-Za-z0-9_-]+)$/u.exec(cookie)?.[1]??'';
      return h.admission.authorizeSession(token,'accountA');
    }
  });
  const server=http.createServer(sco);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing test server port');
    const base='http://127.0.0.1:'+address.port;
    /** @param {string} cookie */
    async function requestRpc(cookie){
      const response=await fetch(base+'/obfs/rpc',{
        method:'POST',headers:{'content-type':'application/json',cookie},
        body:JSON.stringify({method:'protectedSum',args:[7]})
      });
      return {status:response.status,body:await response.json()};
    }
    assert.equal((await requestRpc('')).status,403);
    assert.equal(privateCalls,0);
    const challenge=h.admission.issueChallenge('accountA','loginA');
    const allowed=await h.admission.verifyAssertion(assertion(h,challenge));
    assert.equal(allowed.ok,true);
    if(!allowed.ok)return;
    assert.deepEqual(await requestRpc('obfs_auth='+allowed.token),
      {status:200,body:{ok:true,value:24}});
    assert.equal(privateCalls,1);
    assert.equal((await requestRpc('obfs_auth='+allowed.token+'-altered')).status,403);
    h.admission.revokePrincipal('accountA');
    assert.equal((await requestRpc('obfs_auth='+allowed.token)).status,403);
    assert.equal(privateCalls,1);
    const facade=await fetch(base+'/obfs/facade.js');
    assert.equal(facade.status,200);
    assert.doesNotMatch(await facade.text(),
      /protectedSum|createScoWebAuthnAdmission|publicKey|credentialId/u);
  }finally{
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve(undefined)));
  }
});

test('principal revocation cancels assertion paused in credential lookup',async()=>{
  /** @type {()=>void} */
  let release=()=>{};
  const gate=new Promise(resolve=>{release=()=>resolve(undefined);});
  /** @type {ReturnType<typeof harness>} */
  let h;
  h=harness({lookupCredential:async(_principal,id)=>{
    await gate;
    return h.records.get(id)??null;
  }});
  const challenge=h.admission.issueChallenge('accountA','loginA');
  const inFlight=h.admission.verifyAssertion(assertion(h,challenge));
  h.admission.revokePrincipal('accountA');
  release();
  assert.equal((await inFlight).ok,false);
  assert.equal(h.updates,0);
});

test('principal revocation cancels assertion paused in durable counter CAS',async()=>{
  /** @type {()=>void} */
  let release=()=>{};
  /** @type {()=>void} */
  let signal=()=>{};
  const gate=new Promise(resolve=>{release=()=>resolve(undefined);});
  const entered=new Promise(resolve=>{signal=()=>resolve(undefined);});
  /** @type {ReturnType<typeof harness>} */
  let h;
  h=harness({updateSignCount:async(_principal,id,previous,next)=>{
    signal();
    await gate;
    const row=h.records.get(id);
    if(!row||row.signCount!==previous)return false;
    row.signCount=next;
    return true;
  }});
  const challenge=h.admission.issueChallenge('accountA','loginA');
  const inFlight=h.admission.verifyAssertion(assertion(h,challenge));
  await entered;
  h.admission.revokePrincipal('accountA');
  release();
  assert.equal((await inFlight).ok,false,
    'A stale but signed assertion must not mint authority after revocation');
  const after=h.admission.issueChallenge('accountA','loginA');
  assert.equal((await h.admission.verifyAssertion(assertion(h,after,{counter:2}))).ok,true,
    'New independent challenge after revocation may authorize fresh ceremony');
});

test('independent fresh challenges still require an atomic cross-ceremony credential counter CAS',async()=>{
  const h=harness();
  const one=h.admission.issueChallenge('accountA','loginOne');
  const two=h.admission.issueChallenge('accountA','loginTwo');
  const first=assertion(h,one,{sessionId:'loginOne'});
  const second=assertion(h,two,{sessionId:'loginTwo'});
  const outcomes=await Promise.all([
    h.admission.verifyAssertion(first),h.admission.verifyAssertion(second)
  ]);
  assert.equal(outcomes.filter(x=>x.ok).length,1,
    'A valid distinct challenge is insufficient when a credential counter already advanced');
  assert.equal(h.updates,2);
  assert.equal(h.records.get(h.credentialId)?.signCount,1);
});

test('any malformed attempt burns its known challenge ID, blocking retry with corrected bytes',async()=>{
  const h=harness();
  const challenge=h.admission.issueChallenge('accountA','loginA');
  const malicious=assertion(h,challenge,{origin:'https://attacker.example.com'});
  assert.equal((await h.admission.verifyAssertion(malicious)).ok,false);
  assert.equal((await h.admission.verifyAssertion(assertion(h,challenge))).ok,false);
  assert.equal(h.updates,0);
});
