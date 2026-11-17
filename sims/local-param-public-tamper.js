'use strict';

const acorn=require('acorn');
const walk=require('acorn-walk');
const {normalizePublicFields}=require('./public-token-normalizer');

/** @typedef {{path:string,code:string,sourceType?:'module'|'commonjs'|'script'}} PublicFile */

/**
 * Purely public-source attacker. Replace generated private-key spellings
 * with readable stable labels and change the first direct addition of two
 * fields of the same object into subtraction. The attacker sees no original
 * source, compiler seed, private map or compiler API. Unsupported layouts
 * decline rather than pretending to have bypassed them.
 *
 * @param {PublicFile[]} delivered
 * @returns {{files:PublicFile[],tampered:PublicFile[],fields:number}}
 */
function relabelAndTamperOneFieldArithmetic(delivered) {
  const attack=normalizePublicFields(delivered,{preserveFreeMemberReceivers:true});
  /** @type {PublicFile[]} */
  const tampered=[];
  let changed=0;
  for(const file of attack.files){
    const ast=acorn.parse(file.code,{ecmaVersion:'latest',
      sourceType:file.sourceType==='commonjs'?'script':(file.sourceType??'script'),
      allowReturnOutsideFunction:true});
    /** @type {number|null} */
    let operation=null;
    walk.simple(ast,{
      BinaryExpression(node) {
        if(operation!==null||node.operator!=='+'||
          node.left.type!=='MemberExpression'||
          node.right.type!=='MemberExpression'||
          node.left.object.type!=='Identifier'||
          node.right.object.type!=='Identifier'||
          node.left.object.name!==node.right.object.name)return;
        const between=file.code.slice(node.left.end,node.right.start);
        if(!/^\s*\+\s*$/u.test(between))return;
        operation=node.left.end+between.indexOf('+');
      }
    });
    if(operation===null){
      tampered.push(file);
      continue;
    }
    changed++;
    tampered.push({...file,
      code:file.code.slice(0,operation)+'-'+file.code.slice(operation+1)});
  }
  if(changed!==1||attack.properties<1)
    throw new TypeError('No unique directly mutable published field expression');
  return {files:attack.files,tampered,fields:attack.properties};
}

module.exports={relabelAndTamperOneFieldArithmetic};
