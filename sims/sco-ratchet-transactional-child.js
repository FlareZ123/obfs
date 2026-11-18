'use strict';

const assert=require('node:assert/strict');
const {TransactionalRatchet}=require('./sco-ratchet-transactional-store');

/**
 * Separate trusted Node process: receives the shared database pathname and
 * principal, while its 256-bit root is supplied only by the test harness
 * through a child environment variable. The root never appears in stdout.
 * @returns {void}
 */
function main(){
  const [databasePath,principal,startArg,inputsJson]=process.argv.slice(2);
  assert.ok(databasePath&&principal&&startArg&&inputsJson);
  const rootHex=process.env.SCO_RATCHET_TEST_ROOT;
  if(!rootHex||!/^[a-f0-9]{64}$/u.test(rootHex)){
    throw new TypeError('Trusted worker requires a 256-bit root');
  }
  const inputs=/** @type {string[]} */(JSON.parse(inputsJson));
  const ratchet=new TransactionalRatchet(databasePath,Buffer.from(rootHex,'hex'));
  try{
    const result=ratchet.batch(principal,Number(startArg),inputs);
    process.stdout.write(JSON.stringify(result)+'\n');
  }finally{
    ratchet.close();
  }
}

if(require.main===module){
  try{main();}catch(error){console.error(error);process.exitCode=1;}
}
module.exports={main};
