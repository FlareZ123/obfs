'use strict';

const {createScoWebAuthnAdmission}=require('../../src/sco-webauthn-admission');
const {createScoWebAuthnSqliteStore}=require('../../src/sco-webauthn-state');

/**
 * Separate-process SQLite nonce consumer. Parent supplies an already-signed
 * honest ES256 packet; each child has no access to the private signing key.
 * Two independently started Node processes must not both redeem one nonce.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Buffer[]} */
  const chunks=[];
  for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));
  const data=/** @type {{
    file:string,publicKey:string,credentialId:string,
    assertion:import('../../src/sco-webauthn-admission').AssertionInput,
    principal:string,action:'verify'|'revoke',token?:string
  }} */(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  const state=createScoWebAuthnSqliteStore(data.file);
  try{
    if(data.action==='revoke'){
      const before=state.authorizeSession(data.token??'','accountA',Date.now());
      state.revokePrincipal(data.principal);
      process.stdout.write(JSON.stringify({revoked:true,before}));
      return;
    }
    const gate=createScoWebAuthnAdmission({
      rpId:'localhost',allowedOrigins:['http://localhost:8080'],
      allowInsecureLocalhost:true,stateStore:state,
      lookupCredential:(principal,id)=>principal==='accountA'&&id===data.credentialId?
        {publicKey:data.publicKey,signCount:0}:null,
      // The isolated nonce race deliberately makes counter CAS a no-op.
      // The state store's one-use DELETE must stand on its own even when
      // credential policy is permissive (the app still needs a real CAS).
      updateSignCount:()=>true
    });
    const result=await gate.verifyAssertion(data.assertion);
    process.stdout.write(JSON.stringify({
      ok:result.ok,token:result.ok?result.token:null
    }));
  }finally{
    state.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
