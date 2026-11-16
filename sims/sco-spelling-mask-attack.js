'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {parse,walk,applyEdits}=require('../src/ast');
const {createScoHandler}=require('../src');

/**
 * Reconstruct SCO's 32-bit request-local spelling selector from a served file.
 * The supported source family has canonical double-quoted string literals
 * before the server's spelling pass, and at least one eligible 32-code-unit
 * ASCII literal. It uses no seed, private server state, or original file.
 * @param {string} servedSource
 * @returns {{mask:number[],reconstructed:string,matched:boolean,eligible:number,anchor:string}}
 */
function recoverSpellingMask(servedSource) {
  /** @param {string} source @returns {{start:number,end:number,value:string}[]} */
  function eligibleLiterals(source) {
    /** @type {{start:number,end:number,value:string}[]} */
    const literals=[];
    walk(parse(source,'script'),(node,parent,key)=>{
      if(node.type!=='Literal' || typeof node.value!=='string' || !node.value.length ||
         !(parent?.type==='AssignmentExpression' && key==='right' ||
           parent?.type==='VariableDeclarator' && key==='init'))return;
      literals.push({start:node.start,end:node.end,value:node.value});
    });
    return literals;
  }
  const varied=eligibleLiterals(servedSource);
  const anchorIndex=varied.findIndex(literal=>literal.value.length>=32 &&
    [...literal.value.slice(0,32)].every(char=>{
      const unit=char.charCodeAt(0);
      return unit>=32 && unit<=126 && unit!==34 && unit!==92;
    }));
  if(anchorIndex<0)throw new Error('Need a 32-character printable ASCII literal');
  const canonical=applyEdits(servedSource,varied.map(literal=>({
    start:literal.start,end:literal.end,text:JSON.stringify(literal.value)
  })));
  const baseLiterals=eligibleLiterals(canonical);
  assert.equal(baseLiterals.length,varied.length);
  const anchor=varied[anchorIndex];
  const anchorStart=baseLiterals[anchorIndex].start;
  const spelling=servedSource.slice(anchor.start,anchor.end);
  /** @type {number[]} */
  const mask=new Array(32).fill(-1);
  let cursor=1;
  for(let i=0;i<32;i++) {
    const expected=anchor.value.charCodeAt(i);
    let bit;
    if(spelling.startsWith('\\u',cursor)) {
      assert.equal(spelling.slice(cursor+2,cursor+6),expected.toString(16).padStart(4,'0'));
      cursor+=6;
      bit=0;
    } else {
      assert.equal(spelling.charCodeAt(cursor),expected);
      cursor++;
      bit=1;
    }
    mask[(i+anchorStart)%32]=bit;
  }
  /** @param {string} value @param {number} start @returns {string} */
  function respell(value,start) {
    let result='"';
    for(let i=0;i<value.length;i++) {
      const unit=value.charCodeAt(i);
      if(unit>=32 && unit<=126 && unit!==34 && unit!==92 && mask[(i+start)%32]) {
        result+=String.fromCharCode(unit);
      } else result+='\\u'+unit.toString(16).padStart(4,'0');
    }
    return result+'"';
  }
  const reconstructed=applyEdits(canonical,baseLiterals.map(literal=>({
    start:literal.start,end:literal.end,text:respell(literal.value,literal.start)
  })));
  return {mask,reconstructed,matched:reconstructed===servedSource,
    eligible:varied.length,anchor:anchor.value};
}

/** @returns {Promise<void>} */
async function main() {
  const first='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
  const second='ghijklmnopqrstuvwxyz0123456789AB';
  const original='const firstMarker='+JSON.stringify(first)+';\n'+
    'const secondMarker='+JSON.stringify(second)+';\n'+
    'globalThis.maskProof=firstMarker+secondMarker;\n';
  const server=http.createServer(createScoHandler([
    {path:'entry.js',sourceType:'script',code:original}
  ]));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP listener');
    const distinct=new Set();
    for(let n=0;n<24;n++) {
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/entry.js');
      assert.equal(response.status,200);
      const served=await response.text();
      distinct.add(createHash('sha256').update(served).digest('hex'));
      const attack=recoverSpellingMask(served);
      assert.equal(attack.eligible,2);
      assert.equal(attack.anchor,first);
      assert.equal(attack.mask.length,32);
      assert.ok(attack.mask.every(bit=>bit===0||bit===1));
      assert.equal(attack.matched,true,'The predicted full variant must match every byte');
    }
    assert.ok(distinct.size>1,'Independent requests should vary');
    process.stdout.write(JSON.stringify({requests:24,distinctResponses:distinct.size,
      recoveredMaskBitsPerResponse:32,exactPredictions:24,
      originalNonceBits:192,scope:'canonical-double-quoted-literal fixture'})+'\n');
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={recoverSpellingMask};
