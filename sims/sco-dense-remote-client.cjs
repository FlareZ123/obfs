'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {masksOfWeight,learnBoundedDegreeOracle}=
  require('./bounded-degree-oracle-functional-clone');

/**
 * Isolated attacker entry point: receives its own authorized credential and
 * the target origin. It retrieves only the generated public facade, extracts
 * its RPC route from those HTTP-served bytes and queries 529 low-weight
 * inputs. The parent test holds the hidden source in its private Node heap,
 * inaccessible to this child process through ordinary JS object references.
 * No filesystem or OS sandbox claim is made.
 *
 * @param {string} origin
 * @param {string} credential
 * @returns {Promise<{
 *   model:ReturnType<typeof learnBoundedDegreeOracle>,
 *   sourceSha256:string,transcriptSha256:string,queryCount:number
 * }>}
 */
async function runRemoteClient(origin,credential){
  const publicFile=await fetch(origin+'/obfs/mixed.mjs',{
    headers:{'x-demo-session':credential}
  });
  assert.equal(publicFile.status,200,'Authorized client facade not available');
  const code=await publicFile.text();
  assert.equal(code.includes('OBFS_PRIVATE_DENSE_COEFFICIENTS'),false);
  const match=code.match(
    /export async function protectedDense\([^)]*\)\{return await [\w$]+\("([^"]+)",\[\.\.\.arguments\]\);\}/u);
  assert.ok(match?.[1],'Public facade lacks the expected private RPC route');
  const method=match[1];
  const hash=createHash('sha256');
  /** @type {Map<number,number>} */
  const observed=new Map();
  for(let weight=0;weight<=2;weight++){
    for(const input of masksOfWeight(32,weight)){
      const response=await fetch(origin+'/obfs/rpc',{
        method:'POST',
        headers:{'content-type':'application/json','x-demo-session':credential},
        body:JSON.stringify({method,args:[input]})
      });
      assert.equal(response.status,200,'Authorized RPC failed during learning');
      /** @type {{ok?:boolean,value?:unknown}} */
      const body=await response.json();
      assert.equal(body.ok,true);
      assert.ok(typeof body.value==='number'&&
        Number.isInteger(body.value)&&body.value>=0&&body.value<2**32,
      'Oracle returned non-uint32');
      observed.set(input,body.value);
      hash.update(JSON.stringify([input,body.value])+'\n');
    }
  }
  const model=learnBoundedDegreeOracle(input=>{
    const value=observed.get(input);
    assert.notEqual(value,undefined);
    return /** @type {number} */ (value);
  },32,2);
  assert.equal(model.queryCount,529);
  return {model,sourceSha256:createHash('sha256').update(code).digest('hex'),
    transcriptSha256:hash.digest('hex'),queryCount:observed.size};
}

if(require.main===module){
  const origin=process.argv[2];
  const credential=process.argv[3];
  if(!origin||!credential)throw Error('Expected authorized origin and credential');
  runRemoteClient(origin,credential)
    .then(result=>process.stdout.write(JSON.stringify(result)+'\n'))
    .catch(error=>{
      console.error(error);
      process.exitCode=1;
    });
}

module.exports={runRemoteClient};
