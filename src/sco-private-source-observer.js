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
  /** @type {Set<string>} */
  const sourceReceiverMethods=new Set();
  /** @type {Map<string,import('./ast').AstNode>} */
  const localFunctionDeclarations=new Map();
  /** @type {Set<string>} */
  const functionReturningFunctions=new Set();
  /** @type {Set<string>} */
  const definitelyReturningFunctions=new Set();
  /** @type {Map<string,number>} */
  const forwardedParameters=new Map();

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
    if(node.type==='AwaitExpression')return carriesFunction(node.argument,localOnly);
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'){
      const name=node.callee.name;
      if((localOnly?definitelyReturningFunctions:functionReturningFunctions).has(name)){
        return true;
      }
      const forwarded=forwardedParameters.get(name);
      if(forwarded!==undefined){
        return carriesFunction(node.arguments[forwarded],localOnly);
      }
    }
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

  /**
   * Statically recognized Function.prototype.toString or String.prototype
   * method extracted into a local alias. Any ordinary String-prototype
   * receiver method may implicitly coerce a function and reveal source
   * characters, sometimes through a numeric return value.
   * @param {import('./ast').AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isSourceReceiverMethod(node){
    if(!node)return false;
    if(node.type==='Identifier')return sourceReceiverMethods.has(node.name);
    if(node.type!=='MemberExpression'||member(node.object)!=='prototype'||
        node.object.object?.type!=='Identifier')return false;
    if(node.object.object.name==='String')return true;
    return node.object.object.name==='Function'&&member(node)==='toString';
  }

  // A local declaration or a relative private import can denote an original
  // server-side function. Call-only uses do not disclose its source spelling.
  walk(ast,node=>{
    if((node.type==='FunctionDeclaration'||node.type==='ClassDeclaration')&&
        node.id?.type==='Identifier'){
      functions.add(node.id.name); definitelyLocalFunctions.add(node.id.name);
      if(node.type==='FunctionDeclaration'){
        localFunctionDeclarations.set(node.id.name,node);
      }
    }
    if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&
        node.init&&['FunctionExpression','ArrowFunctionExpression',
          'ClassExpression'].includes(node.init.type)){
      functions.add(node.id.name); definitelyLocalFunctions.add(node.id.name);
      localFunctionDeclarations.set(node.id.name,node.init);
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
        if(isSourceReceiverMethod(node.init)&&!sourceReceiverMethods.has(node.id.name)){
          sourceReceiverMethods.add(node.id.name);changed=true;
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
        if(isSourceReceiverMethod(node.right)&&!sourceReceiverMethods.has(node.left.name)){
          sourceReceiverMethods.add(node.left.name);changed=true;
        }
      }
    });
    // Bounded interprocedural proof. A direct return of a private function,
    // or a directly forwarded parameter, preserves function identity at
    // its local call site. Local control-flow branches and opaque callbacks
    // deliberately remain outside this finite summary.
    for(const [name,fn] of localFunctionDeclarations){
      /** @type {(import('./ast').AstNode|null|undefined)[]} */
      const returned=fn.body?.type==='BlockStatement'?
        fn.body.body.filter(
          (/** @type {import('./ast').AstNode} */ statement)=>
            statement.type==='ReturnStatement').map(
          (/** @type {import('./ast').AstNode} */ statement)=>statement.argument):
        [fn.body];
      for(const expression of returned){
        if(!expression)continue;
        if(carriesFunction(expression)&&!functionReturningFunctions.has(name)){
          functionReturningFunctions.add(name);changed=true;
        }
        if(carriesFunction(expression,true)&&!definitelyReturningFunctions.has(name)){
          definitelyReturningFunctions.add(name);changed=true;
        }
        if(expression.type==='Identifier'){
          const index=fn.params.findIndex(
            (/** @type {import('./ast').AstNode} */ param)=>
              param.type==='Identifier'&&param.name===expression.name);
          if(index>=0&&!forwardedParameters.has(name)){
            forwardedParameters.set(name,index);changed=true;
          }
        }
      }
    }
  }
  let exposed=false;
  walk(ast,node=>{
    if(exposed)return;
    if(node.type==='MemberExpression'&&
        ['toString','toLocaleString'].includes(member(node)??'')&&
        carriesFunction(node.object)){
      exposed=true;return;
    }
    if(node.type==='CallExpression'||node.type==='NewExpression'){
      // These built-ins coerce a function to its exact source string, even if
      // they return an encoded string or a wrapper. A char-at-a-time numeric
      // oracle is covered separately below.
      if(node.callee.type==='Identifier'&&
          ['String','encodeURI','encodeURIComponent','escape','RegExp'].includes(
            node.callee.name)&&carriesFunction(node.arguments[0])){
        exposed=true;return;
      }
      const method=member(node.callee);
      if(['join','toString','toLocaleString'].includes(method??'')&&
          carriesFunctionArray(node.callee.object)){
        exposed=true;return;
      }
      // Detached receiver methods, .call/.apply and .bind share the
      // source-coercion hazard. Source can be reconstructed as numbers (e.g.
      // charCodeAt.call(fn,i)) even if every RPC result appears nontextual.
      if(['call','apply','bind'].includes(method??'')&&
          isSourceReceiverMethod(node.callee.object)&&
          carriesFunction(node.arguments[0])){
        exposed=true;return;
      }
      if(node.callee.type==='MemberExpression'&&
          node.callee.object?.type==='Identifier'&&
          node.callee.object.name==='Reflect'&&method==='apply'&&
          isSourceReceiverMethod(node.arguments[0])&&
          carriesFunction(node.arguments[1])){
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
