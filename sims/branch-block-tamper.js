'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const acorn=require('acorn');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * Patch each public immediate's ciphertext by one bit. This attacker
 * receives the distributed JavaScript text only; it never imports the
 * compiler, original source or seed and does not need to understand
 * the hidden source expression or branch ordering.
 *
 * @param {string} distributed
 * @returns {{code:string,alteredImmediates:number}}
 */
function tamperNativeBlocks(distributed) {
  const ast=/** @type {AstNode} */ (acorn.parse(distributed,{
    ecmaVersion:'latest',sourceType:'script'
  }));
  /** @type {{start:number,end:number,text:string}[]} */
  const patches=[];
  /**
   * @param {AstNode} node
   * @returns {void}
   */
  function visit(node) {
    if(node.type==='AssignmentExpression'&&node.operator!=='='&&
       node.right.type==='BinaryExpression'&&node.right.operator==='^'&&
       node.right.left.type==='Literal'&&
       node.right.right.type==='Literal'&&
       typeof node.right.left.value==='number'&&
       typeof node.right.right.value==='number') {
      const literal=node.right.left;
      patches.push({start:literal.start,end:literal.end,text:String(literal.value^1)});
    }
    for(const [key,value] of Object.entries(node)){
      if(key==='start'||key==='end')continue;
      if(Array.isArray(value)) {
        for(const item of value)if(item&&typeof item==='object'&&
          typeof item.type==='string')visit(item);
      }else if(value&&typeof value==='object'&&typeof value.type==='string') {
        visit(value);
      }
    }
  }
  visit(ast);
  if(!patches.length)throw new TypeError('No public encoded immediate found');
  let code=distributed;
  for(const patch of patches.sort((a,b)=>b.start-a.start)){
    code=code.slice(0,patch.start)+patch.text+code.slice(patch.end);
  }
  acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});
  return {code,alteredImmediates:patches.length};
}

/**
 * Load an untrusted candidate in a separate Node VM context with no
 * filesystem or network capability. This only evaluates the fixed fixture.
 * @param {string} source
 * @returns {(x:number)=>number}
 */
function run(source){
  const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports},{timeout:1000});
  return /** @type {(x:number)=>number} */ (module.exports.gate);
}

if(require.main===module) {
  for(const file of ['gate.cjs','gate-masked.cjs']){
    const original=fs.readFileSync(path.join(__dirname,'../examples/branch-blocks/after',file),'utf8');
    const tampered=tamperNativeBlocks(original);
    const before=run(original),after=run(tampered.code);
    let observedChanges=0;
    for(let i=-512;i<=512;i++){
      const originalValue=before(i),revisedValue=after(i);
      assert.equal(typeof revisedValue,'number');
      if(!Object.is(originalValue,revisedValue))observedChanges++;
    }
    if(observedChanges===0)throw new Error('Public bit-flip did not modify observable output');
    console.log(JSON.stringify({file,alteredImmediates:tampered.alteredImmediates,
      observations:1025,observedChanges,integrityRejected:false}));
  }
}

module.exports={tamperNativeBlocks};
