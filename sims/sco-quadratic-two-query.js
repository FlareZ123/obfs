'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');

/** @typedef {{a:number,b:number,offset:number}} KnownFamilyModel */
const PROBE=0x894b7023;

/**
 * Exact unsigned 32-bit evaluation of a known structural family.
 * The two rotation amounts and XOR offset are initially private.
 * @param {number} input
 * @param {KnownFamilyModel} parameters
 * @returns {number}
 */
function evaluateKnownFamily(input,parameters){
  const x=input>>>0;
  const {a,b,offset}=parameters;
  const p=(x^(x<<a)^(x>>>(32-a)))>>>0;
  const q=(x^(x<<b)^(x>>>(32-b)))>>>0;
  return (p^(p&q)^offset)>>>0;
}

/**
 * A self-checking exhaustive two-query dictionary. At the fixed public
 * PROBE, all 930 ordered distinct shift pairs give different offset-free
 * outputs. The zero input then separately reveals the full XOR offset.
 * This enumeration needs no oracle, compiler metadata or hidden source.
 *
 * @returns {Map<number,{a:number,b:number}>}
 */
function knownPairDictionary(){
  /** @type {Map<number,{a:number,b:number}>} */
  const dictionary=new Map();
  for(let a=1;a<=31;a++){
    for(let b=1;b<=31;b++){
      if(a===b)continue;
      const value=evaluateKnownFamily(PROBE,{a,b,offset:0});
      assert.equal(dictionary.has(value),false,
        'The fixed two-query discriminator is not injective');
      dictionary.set(value,{a,b});
    }
  }
  assert.equal(dictionary.size,930);
  return dictionary;
}

/**
 * A source-FAMILY-aware adversary needs two legitimate HTTP responses to
 * recover the private numeric function parameters for ALL 930 possible
 * distinct-shift pairs, including the runtime's full-rank subfamily.
 * Generic unknown degree-two functions are not covered by this proof.
 *
 * @param {{origin:string,method:string,credential:string}} access
 * @returns {Promise<{model:KnownFamilyModel,queryCount:number,
 *   transcriptSha256:string,candidatePairs:number}>}
 */
async function cloneKnownFamily(access){
  const transcript=createHash('sha256');
  /** @type {number[]} */
  const values=[];
  for(const input of [0,PROBE]){
    const response=await fetch(access.origin+'/obfs/rpc',{
      method:'POST',
      headers:{'content-type':'application/json','x-demo-session':access.credential},
      body:JSON.stringify({method:access.method,args:[input]})
    });
    assert.equal(response.status,200,'Authenticated source-family query rejected');
    /** @type {{ok?:boolean,value?:unknown}} */
    const payload=await response.json();
    assert.equal(payload.ok,true);
    assert.ok(typeof payload.value==='number'&&
      Number.isInteger(payload.value)&&payload.value>=0&&
      payload.value<2**32);
    values.push(payload.value);
    transcript.update(JSON.stringify([input,payload.value])+'\n');
  }
  const dictionary=knownPairDictionary();
  const offset=values[0];
  const signature=(values[1]^offset)>>>0;
  const pair=dictionary.get(signature);
  assert.ok(pair,'Two-query signature outside declared private source family');
  return {model:{a:pair.a,b:pair.b,offset},queryCount:2,
    transcriptSha256:transcript.digest('hex'),candidatePairs:dictionary.size};
}

module.exports={PROBE,evaluateKnownFamily,knownPairDictionary,cloneKnownFamily};
