'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash,generateKeyPairSync,randomBytes,sign}=require('node:crypto');
const {createScoWebAuthnAdmission}=require('../src/sco-webauthn-admission');
const {createScoWebAuthnSqliteStore}=require('../src/sco-webauthn-state');

/**
 * @param {string} filename
 * @param {(filename:string)=>Promise<void>} run
 * @returns {Promise<void>}
 */
async function withDatabase(filename,run){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-wa-shared-'));
  const dbPath=path.join(folder,filename);
  try{await run(dbPath);}finally{await fs.rm(folder,{force:true,recursive:true});}
}

/** @param {string} file @returns {ReturnType<typeof createScoWebAuthnSqliteStore>} */
function store(file){return createScoWebAuthnSqliteStore(file);}

/**
 * A fixture with a genuine independently generated ES256 public/private pair.
 * @param {ReturnType<typeof store>} state
 * @param {{lookupCredential?:import('../src/sco-webauthn-admission').ScoWebAuthnAdmissionOptions['lookupCredential']}} [overrides]
 */
function fixture(state,overrides={}){
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const credentialId=randomBytes(32).toString('base64url');
  const current={signCount:0};
  const gate=createScoWebAuthnAdmission({
    rpId:'localhost',allowedOrigins:['http://localhost:8080'],
    allowInsecureLocalhost:true,stateStore:state,
    lookupCredential:overrides.lookupCredential??((principal,id)=>
      principal==='accountA'&&id===credentialId?
        {publicKey,signCount:current.signCount}:null),
    updateSignCount:(principal,id,previous,next)=>{
      if(principal!=='accountA'||id!==credentialId||
         previous!==current.signCount||next<=previous)return false;
      current.signCount=next;
      return true;
    }
  });
  return {gate,publicKey,privateKey,credentialId,current};
}

/**
 * @param {ReturnType<typeof fixture>} h
 * @param {import('../src/sco-webauthn-admission').IssuedChallenge} issued
 * @param {number} [counter]
 */
function signAssertion(h,issued,counter=1){
  const client=Buffer.from(JSON.stringify({
    type:'webauthn.get',challenge:issued.challenge,origin:'http://localhost:8080'
  }));
  const authData=Buffer.alloc(37);
  createHash('sha256').update('localhost').digest().copy(authData);
  authData[32]=0x05;
  authData.writeUInt32BE(counter,33);
  const signed=Buffer.concat([authData,createHash('sha256').update(client).digest()]);
  return {
    principal:'accountA',sessionId:'loginA',challengeId:issued.challengeId,
    credentialId:h.credentialId,clientDataJSON:client.toString('base64url'),
    authenticatorData:authData.toString('base64url'),
    signature:sign('sha256',signed,h.privateKey).toString('base64url')
  };
}

/**
 * Real separate Node process, independent sqlite handle and crypto verifier.
 * @param {{file:string,publicKey:string,credentialId:string,
 *   assertion:ReturnType<typeof signAssertion>,principal:string,
 *   action:'verify'|'revoke',token?:string}} payload
 * @returns {Promise<{ok?:boolean,token?:string|null,revoked?:boolean,before?:boolean}>}
 */
function child(payload){
  return new Promise((resolve,reject)=>{
    const proc=spawn(process.execPath,[
      path.join(__dirname,'fixtures','sco-webauthn-sqlite-consumer.cjs')
    ],{stdio:['pipe','pipe','pipe']});
    let output='';
    let error='';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data',part=>{output+=part;});
    proc.stderr.on('data',part=>{error+=part;});
    proc.once('error',reject);
    proc.once('close',code=>{
      if(code!==0){reject(new Error('WebAuthn SQLite child failed: '+code+'\n'+error));return;}
      try{resolve(JSON.parse(output));}catch(parseError){reject(parseError);}
    });
    proc.stdin.end(JSON.stringify(payload));
  });
}

test('shared SQLite challenge can be signed on one SCO handler and redeemed on another',async()=>{
  await withDatabase('shared.sqlite',async file=>{
    const a=store(file),b=store(file);
    try{
      const h=fixture(a);
      const gateB=createScoWebAuthnAdmission({
        rpId:'localhost',allowedOrigins:['http://localhost:8080'],
        allowInsecureLocalhost:true,stateStore:b,
        lookupCredential:(principal,id)=>principal==='accountA'&&id===h.credentialId?
          {publicKey:h.publicKey,signCount:h.current.signCount}:null,
        updateSignCount:(principal,id,old,next)=>{
          if(principal!=='accountA'||id!==h.credentialId||old!==h.current.signCount||
             next<=old)return false;
          h.current.signCount=next;return true;
        }
      });
      const issued=h.gate.issueChallenge('accountA','loginA');
      const proof=signAssertion(h,issued);
      const verified=await gateB.verifyAssertion(proof);
      assert.equal(verified.ok,true);
      if(!verified.ok)return;
      assert.equal(h.gate.authorizeSession(verified.token,'accountA'),true);
      assert.equal(gateB.authorizeSession(verified.token,'accountA'),true);
      assert.equal((await h.gate.verifyAssertion(proof)).ok,false,
        'Replayed nonce must fail on issuer process after a different worker redeemed it');
      h.gate.revokePrincipal('accountA');
      assert.equal(gateB.authorizeSession(verified.token,'accountA'),false,
        'Revocation must propagate through the shared SQLite WAL');
    }finally{a.close();b.close();}
  });
});

test('two independent Node processes cannot both consume one signed SQLite nonce', {timeout:20000},async()=>{
  await withDatabase('cross-process.sqlite',async file=>{
    const a=store(file);
    const h=fixture(a);
    const issued=h.gate.issueChallenge('accountA','loginA');
    const proof=signAssertion(h,issued);
    const payload={
      file,credentialId:h.credentialId,
      publicKey:h.publicKey.export({format:'pem',type:'spki'}).toString(),
      assertion:proof,principal:'accountA',action:/** @type {const} */('verify')
    };
    try{
      const results=await Promise.all([child(payload),child(payload)]);
      assert.equal(results.filter(x=>x.ok===true).length,1,
        'Two unrelated Node processes must obtain exactly one atomic DELETE RETURNING winner');
      const winner=results.find(x=>x.ok===true);
      assert.ok(winner&&typeof winner.token==='string');
      assert.equal(h.gate.authorizeSession(winner.token,'accountA'),true,
        'A bearer minted in an unrelated process is visible in the local SQLite store');
      assert.equal((await h.gate.verifyAssertion(proof)).ok,false,
        'A third verifier must observe the nonce already consumed');
      const revoke=await child({...payload,action:'revoke',token:winner.token});
      assert.equal(revoke.revoked,true);
      assert.equal(h.gate.authorizeSession(winner.token,'accountA'),false,
        'A different process can revoke a valid session created in a third process');
    }finally{a.close();}
  });
});

test('revocation on a second SQLite connection invalidates async lookup before signed mint',async()=>{
  await withDatabase('revoke.sqlite',async file=>{
    const one=store(file),two=store(file);
    /** @type {()=>void} */
    let release=()=>{};
    /** @type {()=>void} */
    let notify=()=>{};
    const gate=new Promise(resolve=>{release=()=>resolve(undefined);});
    const entered=new Promise(resolve=>{notify=()=>resolve(undefined);});
    try{
      const h=fixture(one,{lookupCredential:async(principal,id)=>{
        notify();
        await gate;
        return principal==='accountA'&&id===h.credentialId?
          {publicKey:h.publicKey,signCount:0}:null;
      }});
      const issued=h.gate.issueChallenge('accountA','loginA');
      const inFlight=h.gate.verifyAssertion(signAssertion(h,issued));
      await entered;
      two.revokePrincipal('accountA');
      release();
      assert.equal((await inFlight).ok,false);
      assert.equal(one.generation('accountA'),1);
    }finally{release();one.close();two.close();}
  });
});

test('SQLite session tokens survive restart but not principal revocation',async()=>{
  await withDatabase('restart.sqlite',async file=>{
    let token='';
    const first=store(file);
    try{
      const h=fixture(first);
      const issued=h.gate.issueChallenge('accountA','loginA');
      const result=await h.gate.verifyAssertion(signAssertion(h,issued));
      assert.equal(result.ok,true);
      if(result.ok)token=result.token;
    }finally{first.close();}
    const second=store(file);
    try{
      assert.equal(second.authorizeSession(token,'accountA',Date.now()),true);
      second.revokePrincipal('accountA');
    }finally{second.close();}
    const third=store(file);
    try{assert.equal(third.authorizeSession(token,'accountA',Date.now()),false);}
    finally{third.close();}
  });
});

test('global SQLite challenge capacity and invalid path refuse across connections',async()=>{
  assert.throws(()=>createScoWebAuthnSqliteStore(':memory:'),TypeError);
  assert.throws(()=>createScoWebAuthnSqliteStore('./relative-state.sqlite'),TypeError,
    'All SCO workers must configure the same explicit absolute database path');
  await withDatabase('cap.sqlite',async file=>{
    const a=store(file),b=store(file);
    try{
      const one=fixture(a);
      const two=createScoWebAuthnAdmission({
        rpId:'localhost',allowedOrigins:['http://localhost:8080'],
        allowInsecureLocalhost:true,stateStore:b,maxChallenges:1,
        lookupCredential:()=>null,updateSignCount:()=>false
      });
      one.gate.issueChallenge('accountA','loginA');
      assert.throws(()=>two.issueChallenge('accountA','loginA'),/capacity/u,
        'Capacity counts all unexpired shared challenges, not local map entries');
    }finally{a.close();b.close();}
  });
});

test('SQLite rejects mismatched RP origin/session policy across worker instances',async()=>{
  await withDatabase('policy.sqlite',async file=>{
    const one=store(file),two=store(file);
    try{
      fixture(one);
      assert.doesNotThrow(()=>fixture(two),
        'Identical RP/UV/TTL policy should be admitted by another SQLite handle');
      assert.throws(()=>createScoWebAuthnAdmission({
        rpId:'localhost',allowedOrigins:['http://localhost:8081'],
        allowInsecureLocalhost:true,stateStore:two,
        lookupCredential:()=>null,updateSignCount:()=>false
      }),/replica configuration/u,'Different exact origin must refuse at startup');
      assert.throws(()=>createScoWebAuthnAdmission({
        rpId:'localhost',allowedOrigins:['http://localhost:8080'],
        allowInsecureLocalhost:true,requireUserVerification:false,stateStore:two,
        lookupCredential:()=>null,updateSignCount:()=>false
      }),/replica configuration/u,'Different UV requirement must refuse at startup');
    }finally{one.close();two.close();}
  });
});
