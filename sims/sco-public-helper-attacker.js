'use strict';

const assert=require('node:assert/strict');

/**
 * Recover an affine-in-UTF-16-string-length behavioral clone using only
 * a published client facade and two authenticated, chosen-input RPC calls.
 * This attacker never opens a private module or imports the obfuscator.
 *
 * The affine model is the attacker's explicit hypothesis, not a universal
 * program synthesis algorithm. Its predicted values must be validated
 * on genuinely held-out inputs by an independent test harness.
 *
 * @param {string} origin
 * @param {string} token
 * @returns {Promise<{clientCode:string,methodId:string,oracleQueries:number,
 *   slope:number,intercept:number,predict:(value:string)=>number}>}
 */
async function inferPublicFacadeClone(origin,token){
  const delivered=await fetch(origin+'/obfs/mixed.mjs',{
    headers:{'x-demo-session':token}
  });
  assert.equal(delivered.status,200);
  const clientCode=await delivered.text();
  const methodId=clientCode.match(/"(m[0-9a-f]{24})",\[\.\.\.arguments\]/u)?.[1];
  if(!methodId)throw Error('Unable to find RPC method identifier in public client');
  let oracleQueries=0;
  /** @param {string} value @returns {Promise<number>} */
  async function oracle(value){
    oracleQueries++;
    const response=await fetch(origin+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json','x-demo-session':token},
      body:JSON.stringify({method:methodId,args:[value]})
    });
    assert.equal(response.status,200);
    const payload=await response.json();
    assert.equal(payload.ok,true);
    assert.equal(typeof payload.value,'number');
    return payload.value;
  }
  const intercept=await oracle('');
  const slope=(await oracle('x'))-intercept;
  /** @param {string} value @returns {number} */
  const predict=value=>intercept+slope*value.length;
  return {clientCode,methodId,oracleQueries,slope,intercept,predict};
}

module.exports={inferPublicFacadeClone};
