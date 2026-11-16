'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const acorn=require('acorn');

/** @typedef {{start:number,end:number,value:string}} LiteralPosition */

/**
 * Enumerate the precise string literal positions affected by SCO's spelling pass.
 * This attacker uses only a public JavaScript parser, not the obfuscator AST API.
 * @param {string} source
 * @returns {LiteralPosition[]}
 */
function eligibleLiterals(source) {
  const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'});
  /** @type {LiteralPosition[]} */
  const literals=[];
  /** @param {any} node @param {any|null} parent @param {string|null} key */
  function visit(node,parent,key) {
    if(node.type==='Literal' && typeof node.value==='string' && node.value.length>0 &&
       (parent?.type==='AssignmentExpression' && key==='right' ||
        parent?.type==='VariableDeclarator' && key==='init')) {
      literals.push({start:node.start,end:node.end,value:node.value});
    }
    for(const [childKey,child] of Object.entries(node)) {
      if(Array.isArray(child)) {
        for(const item of child)if(item && typeof item==='object' && typeof item.type==='string')
          visit(item,node,childKey);
      } else if(child && typeof child==='object' && typeof child.type==='string') {
        visit(child,node,childKey);
      }
    }
  }
  visit(ast,null,null);
  return literals;
}

/**
 * Substitute nonoverlapping known AST ranges, from right to left.
 * @param {string} source
 * @param {{start:number,end:number,text:string}[]} edits
 * @returns {string}
 */
function edit(source,edits) {
  let output=source;
  for(const item of [...edits].sort((a,b)=>b.start-a.start))
    output=output.slice(0,item.start)+item.text+output.slice(item.end);
  return output;
}

/**
 * Infer a 32-bit spelling selector and reproduce an entire fixed-source SCO
 * response. The pre-variation literals must use canonical double quotes and
 * one eligible literal must start with 32 printable non-quote ASCII units.
 * The attacker receives only the served source, no original or nonce.
 * @param {string} served
 * @returns {{mask:number[],matched:boolean,eligible:number,anchor:string,reconstructed:string}}
 */
function recoverSpellingMask(served) {
  const varied=eligibleLiterals(served);
  const anchorIndex=varied.findIndex(literal=>literal.value.length>=32 &&
    [...literal.value.slice(0,32)].every(char=>{
      const code=char.charCodeAt(0);
      return code>=32 && code<=126 && code!==34 && code!==92;
    }));
  if(anchorIndex<0)throw new Error('Need a 32-character printable ASCII literal');
  const canonical=edit(served,varied.map(literal=>({
    start:literal.start,end:literal.end,text:JSON.stringify(literal.value)
  })));
  const baseline=eligibleLiterals(canonical);
  assert.equal(baseline.length,varied.length);
  const anchor=varied[anchorIndex];
  const quoted=served.slice(anchor.start,anchor.end);
  /** @type {number[]} */
  const mask=new Array(32).fill(-1);
  let cursor=1;
  for(let i=0;i<32;i++) {
    const unit=anchor.value.charCodeAt(i);
    let bit;
    if(quoted.startsWith('\\u',cursor)) {
      assert.equal(quoted.slice(cursor+2,cursor+6),unit.toString(16).padStart(4,'0'));
      cursor+=6;
      bit=0;
    } else {
      assert.equal(quoted.charCodeAt(cursor),unit);
      cursor++;
      bit=1;
    }
    mask[(i+baseline[anchorIndex].start)%32]=bit;
  }
  /** @param {string} value @param {number} start @returns {string} */
  function respell(value,start) {
    let result='"';
    for(let i=0;i<value.length;i++) {
      const unit=value.charCodeAt(i);
      if(unit>=32 && unit<=126 && unit!==34 && unit!==92 && mask[(i+start)%32])
        result+=String.fromCharCode(unit);
      else result+='\\u'+unit.toString(16).padStart(4,'0');
    }
    return result+'"';
  }
  const reconstructed=edit(canonical,baseline.map(literal=>({
    start:literal.start,end:literal.end,text:respell(literal.value,literal.start)
  })));
  return {mask,matched:reconstructed===served,eligible:varied.length,
    anchor:anchor.value,reconstructed};
}

if(require.main===module) {
  // This process has no access to the original fixture or obfuscator library.
  const served=fs.readFileSync(0,'utf8');
  const result=recoverSpellingMask(served);
  process.stdout.write(JSON.stringify({mask:result.mask,matched:result.matched,
    eligible:result.eligible,anchor:result.anchor,
    predictedDigest:createHash('sha256').update(result.reconstructed).digest('hex')})+'\n');
}

module.exports={recoverSpellingMask};
