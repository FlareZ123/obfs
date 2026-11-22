'use strict';

const {walk}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * Check whether a name is introduced by an ESTree binding pattern. Computed
 * pattern keys and default values are expressions, never binding locations.
 * @param {AstNode|null|undefined} pattern
 * @param {string} name
 * @returns {boolean}
 */
function patternDeclares(pattern,name){
  if(!pattern)return false;
  if(pattern.type==='Identifier')return pattern.name===name;
  if(pattern.type==='RestElement')return patternDeclares(pattern.argument,name);
  if(pattern.type==='AssignmentPattern')return patternDeclares(pattern.left,name);
  if(pattern.type==='ArrayPattern')return pattern.elements.some(
    (/** @type {AstNode|null} */ item)=>patternDeclares(item,name));
  if(pattern.type==='ObjectPattern')return pattern.properties.some(
    (/** @type {AstNode} */ item)=>patternDeclares(
      item.type==='RestElement'?item.argument:item.value,name));
  return false;
}

/**
 * A declaration may be wrapped in a named export. Only direct declarations
 * belong to the given lexical block; declarations inside another function or
 * nested block must not lend their names to this scope.
 * @param {AstNode} statement
 * @param {string} name
 * @returns {boolean}
 */
function statementDeclares(statement,name){
  const node=statement.type==='ExportNamedDeclaration'||
    statement.type==='ExportDefaultDeclaration'?statement.declaration:statement;
  if(!node)return false;
  if(node.type==='VariableDeclaration')return node.declarations.some(
    (/** @type {AstNode} */ item)=>patternDeclares(item.id,name));
  if(['FunctionDeclaration','ClassDeclaration'].includes(node.type)){
    return node.id?.type==='Identifier'&&node.id.name===name;
  }
  if(node.type==='ImportDeclaration')return node.specifiers.some(
    (/** @type {AstNode} */ item)=>item.local?.type==='Identifier'&&
      item.local.name===name);
  return false;
}

/**
 * Check only the lexical ancestor chain of a reference. A syntactically
 * present binding in an unrelated sibling scope is insufficient evidence.
 * The separate var-declaration walk resolves ordinary function/module
 * hoists without lending nested function or class static-block bindings to
 * unrelated scopes.
 * @param {AstNode} scope
 * @param {string} name
 * @returns {boolean}
 */
function scopeDeclares(scope,name){
  if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
    .includes(scope.type)){
    if(scope.id?.type==='Identifier'&&scope.id.name===name)return true;
    return scope.params.some(
      (/** @type {AstNode} */ param)=>patternDeclares(param,name));
  }
  if(['ClassDeclaration','ClassExpression'].includes(scope.type)){
    return scope.id?.type==='Identifier'&&scope.id.name===name;
  }
  if(scope.type==='CatchClause')return patternDeclares(scope.param,name);
  if(['ForStatement','ForInStatement','ForOfStatement'].includes(scope.type)){
    const declaration=scope.type==='ForStatement'?scope.init:scope.left;
    return declaration?.type==='VariableDeclaration'&&
      statementDeclares(declaration,name);
  }
  if(scope.type==='SwitchStatement')return scope.cases.some(
    (/** @type {AstNode} */ item)=>item.consequent.some(
      (/** @type {AstNode} */ statement)=>statementDeclares(statement,name)));
  if(['Program','BlockStatement','StaticBlock'].includes(scope.type)){
    return scope.body.some(
      (/** @type {AstNode} */ statement)=>statementDeclares(statement,name));
  }
  return false;
}

/**
 * Record identifier nodes in binding positions. Default-value expressions
 * and computed destructuring keys are intentionally left as free reads.
 * @param {AstNode|null|undefined} pattern
 * @param {Set<AstNode>} bindings
 * @returns {void}
 */
function collectPatternNodes(pattern,bindings){
  if(!pattern)return;
  if(pattern.type==='Identifier'){bindings.add(pattern);return;}
  if(pattern.type==='RestElement'){
    collectPatternNodes(pattern.argument,bindings);
    return;
  }
  if(pattern.type==='AssignmentPattern'){
    collectPatternNodes(pattern.left,bindings);
    return;
  }
  if(pattern.type==='ArrayPattern'){
    for(const item of pattern.elements)collectPatternNodes(item,bindings);
  }
  if(pattern.type==='ObjectPattern'){
    for(const item of pattern.properties){
      collectPatternNodes(item.type==='RestElement'?item.argument:item.value,bindings);
    }
  }
}

/**
 * Find the first unqualified identifier whose value is not proved by the
 * supplied lexical source and explicitly approved module/realm bindings.
 * This is a conservative SCO relocation admission preflight, not a complete
 * whole-program semantics or intrinsic-equivalence proof.
 *
 * @param {AstNode} root The Program or selected function body being moved
 * @param {Set<string>} moduleBindings Trusted module names outside root
 * @param {Set<string>} rootFormals Function parameters outside a body root
 * @param {Set<string>} realmGlobals Explicitly reviewed shared globals
 * @param {boolean} [rootHasArguments] True only for an ordinary root function body
 * @returns {string|null}
 */
function firstUnprovedFreeReference(root,moduleBindings,rootFormals,realmGlobals,
  rootHasArguments=false){
  // var is scoped to the closest function, module or class static block.
  // A selected function body's BlockStatement is the caller-supplied root.
  // Cache per lexical scope to avoid rescanning on every reference.
  /** @type {WeakMap<AstNode,Set<string>>} */
  const hoistedVars=new WeakMap();
  /**
   * Traverse only the current var-environment, excluding nested functions
   * and class static blocks. A for/switch/try/if block does not stop var
   * binding inheritance, including when the branch never executes.
   * @param {AstNode} scope
   * @returns {Set<string>}
   */
  function hoistsIn(scope){
    const known=hoistedVars.get(scope);
    if(known)return known;
    const vars=new Set();
    const body=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
      .includes(scope.type)?scope.body:scope;
    walk(body,(node,_parent,_key,ancestors)=>{
      if(node.type!=='VariableDeclaration'||node.kind!=='var')return;
      if(ancestors.some(ancestor=>ancestor!==body&&
        ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
          'StaticBlock'].includes(ancestor.type)))return;
      // Every binding pattern contributes a var binding, even though computed
      // keys and assignment defaults still carry ordinary reference reads.
      for(const declaration of node.declarations){
        /** @type {Set<AstNode>} */
        const boundNodes=new Set();
        collectPatternNodes(declaration.id,boundNodes);
        for(const part of boundNodes)vars.add(part.name);
      }
    });
    hoistedVars.set(scope,vars);
    return vars;
  }
  /** @type {Set<AstNode>} */
  const bindings=new Set();
  walk(root,node=>{
    if(node.type==='VariableDeclarator')collectPatternNodes(node.id,bindings);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
      .includes(node.type)){
      collectPatternNodes(node.id,bindings);
      for(const param of node.params)collectPatternNodes(param,bindings);
    }
    if(['ClassDeclaration','ClassExpression'].includes(node.type)){
      collectPatternNodes(node.id,bindings);
    }
    if(node.type==='CatchClause')collectPatternNodes(node.param,bindings);
    if(node.type==='ImportDeclaration'){
      for(const specifier of node.specifiers)collectPatternNodes(specifier.local,bindings);
    }
  });
  /** @type {string|null} */
  let unproved=null;
  walk(root,(node,parent,key,ancestors)=>{
    if(unproved!==null||node.type!=='Identifier'||bindings.has(node))return;
    if(parent&&(
      parent.type==='MemberExpression'&&key==='property'&&!parent.computed ||
      ['Property','MethodDefinition','PropertyDefinition'].includes(parent.type)&&
        key==='key'&&!parent.computed ||
      ['ImportSpecifier','ImportDefaultSpecifier','ImportNamespaceSpecifier',
        'ExportSpecifier','MetaProperty'].includes(parent.type) ||
      ['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent.type)&&
        key==='label'))return;
    // Creating an immediate function literal as a typeof operand never
    // evaluates its body or defaults and exposes only the string "function".
    // The literal cannot escape, so unresolved names inside it are inert.
    const inertTypeofFunction=ancestors.some((scope,index)=>
      ['FunctionExpression','ArrowFunctionExpression'].includes(scope.type)&&
      ancestors[index-1]?.type==='UnaryExpression'&&
      ancestors[index-1].operator==='typeof'&&
      ancestors[index-1].argument===scope);
    if(inertTypeofFunction)return;
    // A normal function supplies its own arguments object. Arrows inherit it
    // from the nearest ordinary function, including the selected root body.
    // Top-level audited ESM modules have no implicit arguments binding.
    if(node.name==='arguments'&&(rootHasArguments||
      ancestors.some(scope=>scope.type==='FunctionDeclaration'||
        scope.type==='FunctionExpression')))return;
    const name=node.name;
    const boundLexically=ancestors.some(scope=>scopeDeclares(scope,name));
    const boundByVar=ancestors.some(scope=>
      (scope===root||['Program','FunctionDeclaration','FunctionExpression',
        'ArrowFunctionExpression','StaticBlock'].includes(scope.type))&&
      hoistsIn(scope).has(name));
    if(rootFormals.has(name)||boundLexically||boundByVar||
      moduleBindings.has(name)||realmGlobals.has(name))return;
    unproved=name;
  });
  return unproved;
}

module.exports={firstUnprovedFreeReference};
