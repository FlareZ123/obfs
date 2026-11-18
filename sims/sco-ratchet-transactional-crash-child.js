'use strict';

const fs=require('node:fs');
const assert=require('node:assert/strict');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');

/**
 * A fault-injection worker that announces a precise SQL commit boundary
 * synchronously to its parent and then deliberately blocks for process kill.
 * The root and database are trusted test environment, never client-facing.
 * @returns {void}
 */
function main(){
  const dbPath=process.env.SCO_CRASH_DB;
  const rootHex=process.env.SCO_CRASH_ROOT;
  const principal=process.env.SCO_CRASH_PRINCIPAL;
  const mode=process.env.SCO_CRASH_MODE;
  const inputsText=process.env.SCO_CRASH_INPUTS;
  if(!dbPath||!rootHex||!/^[a-f0-9]{64}$/u.test(rootHex)||
     !principal||!inputsText||!['precommit','postcommit'].includes(mode??'')){
    throw new TypeError('Missing trusted crash-test configuration');
  }
  const inputs=/** @type {string[]} */(JSON.parse(inputsText));
  const store=new TransactionalRatchet(dbPath,Buffer.from(rootHex,'hex'));
  const park=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
  if(mode==='precommit'){
    // This hook runs AFTER persistent-row SQL upsert and BEFORE COMMIT,
    // with the writer transaction open and all private HMAC work completed.
    store.batch(principal,0,inputs,()=>{
      fs.writeSync(1,'PRECOMMIT_BARRIER\n');
      park();
      throw new Error('Precommit barrier was not killed');
    });
  }else{
    const decision=store.batch(principal,0,inputs);
    assert.equal(decision.kind,'fresh');
    fs.writeSync(1,'POSTCOMMIT_BARRIER\n');
    park();
    throw new Error('Postcommit barrier was not killed');
  }
}

if(require.main===module){
  try{main();}catch(error){console.error(error);process.exitCode=1;}
}
module.exports={main};
