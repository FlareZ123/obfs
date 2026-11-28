'use strict';

const {walk,staticString}=require('./ast');

/**
 * Identify a bounded set of private-function source disclosures before an
 * SCO graph is partitioned into server-resident functions and public RPC
 * facades. This deliberately does not claim complete JS information-flow
 * closure: arbitrary calls, getters, reflective aliases and host effects can
 * also stringify a function. A false negative is possible; a positive is a
 * reason to refuse source-sensitive private execution.
 *
 * Unlike the general emitted-source observer, this guard only tags values
 * proved (or conservatively assumed from private imports) to be functions.
 * Buffer.toString('hex') and ordinary primitive .toString() must remain
 * admissible to avoid disabling the reference SCO HMAC application.
 *
 * @param {import('./ast').AstNode} ast
 * @returns {boolean}
 */
function exposesPrivateFunctionText(ast){
  /** @type {Set<string>} */
  const functions=new Set();
  /** @type {Set<string>} */
  const definitelyLocalFunctions=new Set();
  /** @type {Set<string>} */
  const functionArrays=new Set();

  /**
   * @param {import('./ast').AstNode|null|undefined} node
   * @param {boolean} [localOnly] Require proof of a local function, not a
   *   potentially primitive ESM import. This avoids rejecting ordinary
   *   arithmetic such as a private imported numeric salt plus a string length.
   * @returns {boolean}
   */
  function carriesFunction(node,localOnly=false){
    if(!node)return false;
    if(node.type==='Identifier')return (localOnly?definitelyLocalFunctions:functions).has(node.name);
    if(['ArrowFunctionExpression','FunctionExpression','ClassExpression'].includes(node.type))return true;
    if(node.type==='SequenceExpression'&&node.expressions.length){
      return carriesFunction(node.expressions[node.expressions.length-1],localOnly);
    }
    if(node.type==='ConditionalExpression'){
      return carriesFunction(node.consequent,localOnly)||carriesFunction(node.alternate,localOnly);
    }
    if(node.type==='LogicalExpression'){
      return carriesFunction(node.left,localOnly)||carriesFunction(node.right,localOnly);
    }
    return false;
  }
  /** @param {import('./ast').AstNode|null|undefined} node @returns {boolean} */
  function carriesFunctionArray(node){
    if(!node)return false;
    if(node.type==='Identifier')return functionArrays.has(node.name);
    return node.type==='ArrayExpression'&&node.elements.some(
      (/** @type {import('./ast').AstNode|null} */ entry)=>
        carriesFunction(entry)||carriesFunctionArray(entry));
  }
  /** @param {import('./ast').AstNode|null|undefined} node @returns {string|null} */
  function member(node){
    if(!node||node.type!=='MemberExpression')return null;
    if(node.computed)return staticString(node.property);
    return node.property.type==='Identifier'?node.property.name:null;
  }

  // A local declaration or a relative private import can denote an original
  // server-side function. Call-only uses do not disclose its source spelling.
  walk(ast,node=>{
    if((node.type==='FunctionDeclaration'||node.type==='ClassDeclaration')&&
        node.id?.type==='Identifier'){
      functions.add(node.id.name); definitelyLocalFunctions.add(node.id.name);
    }
    if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&
        node.init&&['FunctionExpression','ArrowFunctionExpression',
          'ClassExpression'].includes(node.init.type)){
      functions.add(node.id.name); definitelyLocalFunctions.add(node.id.name);
    }
    if(node.type==='ImportDeclaration'&&typeof node.source?.value==='string'&&
        (node.source.value.startsWith('./')||node.source.value.startsWith('../'))){
      for(const spec of node.specifiers){
        if(spec.local?.type==='Identifier')functions.add(spec.local.name);
      }
    }
  });
  // Identity-preserving local aliases can be defined after the use site.
  // This is a monotone may-analysis: mutating aliases can overrefuse, not
  // silently discard a previously possible private function identity.
  let changed=true;
  while(changed){
    changed=false;
    walk(ast,node=>{
      if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&node.init){
        if(carriesFunction(node.init)&&!functions.has(node.id.name)){
          functions.add(node.id.name);changed=true;
        }
        if(carriesFunction(node.init,true)&&!definitelyLocalFunctions.has(node.id.name)){
          definitelyLocalFunctions.add(node.id.name);changed=true;
        }
        if(carriesFunctionArray(node.init)&&!functionArrays.has(node.id.name)){
          functionArrays.add(node.id.name);changed=true;
        }
      }
      if(node.type==='AssignmentExpression'&&node.left?.type==='Identifier'){
        if(carriesFunction(node.right)&&!functions.has(node.left.name)){
          functions.add(node.left.name);changed=true;
        }
        if(carriesFunction(node.right,true)&&!definitelyLocalFunctions.has(node.left.name)){
          definitelyLocalFunctions.add(node.left.name);changed=true;
        }
        if(carriesFunctionArray(node.right)&&!functionArrays.has(node.left.name)){
          functionArrays.add(node.left.name);changed=true;
        }
      }
    });
  }
  let exposed=false;
  walk(ast,node=>{
    if(exposed)return;
    if(node.type==='MemberExpression'&&
        ['toString','toLocaleString'].includes(member(node)??'')&&
        carriesFunction(node.object)){
      exposed=true;return;
    }
    if(node.type==='CallExpression'){
      if(node.callee.type==='Identifier'&&node.callee.name==='String'&&
          carriesFunction(node.arguments[0])){
        exposed=true;return;
      }
      const method=member(node.callee);
      if(['join','toString','toLocaleString'].includes(method??'')&&
          carriesFunctionArray(node.callee.object)){
        exposed=true;return;
      }
      // Function.prototype.toString.call(fn), with literal or computed key.
      if(['call','apply'].includes(method??'')&&
          member(node.callee.object)==='toString'&&
          member(node.callee.object.object)==='prototype'&&
          node.callee.object.object.object?.type==='Identifier'&&
          node.callee.object.object.object.name==='Function'&&
          carriesFunction(node.arguments[0])){
        exposed=true;return;
      }
    }
    if(node.type==='TemplateLiteral'&&node.expressions.some(
        (/** @type {import('./ast').AstNode} */ expr)=>carriesFunction(expr))){
      exposed=true;return;
    }
    if(node.type==='BinaryExpression'&&node.operator==='+'&&
        (carriesFunction(node.left,true)||carriesFunction(node.right,true))){
      exposed=true;
    }
  });
  return exposed;
}

module.exports={exposesPrivateFunctionText};
