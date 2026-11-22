'use strict';

const {walk}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * Convert binding patterns into stable name sets. The node collector excludes
 * computed keys and initializer expressions, which are reads, not bindings.
 * @param {AstNode|null|undefined} pattern
 * @param {Set<string>} names
 * @returns {void}
 */
function addPatternNames(pattern,names){
  /** @type {Set<AstNode>} */
  const nodes=new Set();
  collectPatternNodes(pattern,nodes);
  for(const node of nodes)names.add(node.name);
}

/**
 * Include only direct declarations in the current lexical statement list.
 * Nested blocks/functions cannot donate lexical names to this scope.
 * @param {AstNode} statement
 * @param {Set<string>} names
 * @returns {void}
 */
function addStatementNames(statement,names){
  const node=statement.type==='ExportNamedDeclaration'||
    statement.type==='ExportDefaultDeclaration'?statement.declaration:statement;
  if(!node)return;
  if(node.type==='VariableDeclaration'){
    for(const declaration of node.declarations)addPatternNames(declaration.id,names);
    return;
  }
  if(['FunctionDeclaration','ClassDeclaration'].includes(node.type)){
    addPatternNames(node.id,names);
    return;
  }
  if(node.type==='ImportDeclaration'){
    for(const specifier of node.specifiers)addPatternNames(specifier.local,names);
  }
}

/**
 * Resolve lexical membership from a cached per-scope declaration inventory.
 * A switch discriminant evaluates outside its case-block lexical environment.
 * @param {AstNode} scope
 * @param {string} name
 * @param {AstNode} reference
 * @param {WeakMap<AstNode,Set<string>>} cache
 * @returns {boolean}
 */
function scopeDeclares(scope,name,reference,cache){
  if(scope.type==='SwitchStatement'&&
     reference.start>=scope.discriminant.start&&
     reference.end<=scope.discriminant.end)return false;
  let names=cache.get(scope);
  if(!names){
    names=new Set();
    cache.set(scope,names);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
      .includes(scope.type)){
      addPatternNames(scope.id,names);
      for(const param of scope.params)addPatternNames(param,names);
    }else if(['ClassDeclaration','ClassExpression'].includes(scope.type)){
      addPatternNames(scope.id,names);
    }else if(scope.type==='CatchClause'){
      addPatternNames(scope.param,names);
    }else if(['ForStatement','ForInStatement','ForOfStatement'].includes(scope.type)){
      const declaration=scope.type==='ForStatement'?scope.init:scope.left;
      if(declaration?.type==='VariableDeclaration')addStatementNames(declaration,names);
    }else if(scope.type==='SwitchStatement'){
      for(const clause of scope.cases){
        for(const statement of clause.consequent)addStatementNames(statement,names);
      }
    }else if(['Program','BlockStatement','StaticBlock'].includes(scope.type)){
      for(const statement of scope.body)addStatementNames(statement,names);
    }
  }
  return names.has(name);
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
  const lexicalNames=new WeakMap();
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
    // Stop at nested function/static-block environments before visiting their
    // descendants. A full subtree walk per function has quadratic work on
    // nested-function ladders despite ignoring their var declarations.
    /** @type {AstNode[]} */
    const todo=[body];
    while(todo.length){
      const node=todo.pop();
      if(!node)continue;
      if(node!==body&&['FunctionDeclaration','FunctionExpression',
        'ArrowFunctionExpression','StaticBlock'].includes(node.type))continue;
      if(node.type==='VariableDeclaration'&&node.kind==='var'){
        for(const declaration of node.declarations){
          /** @type {Set<AstNode>} */
          const boundNodes=new Set();
          collectPatternNodes(declaration.id,boundNodes);
          for(const part of boundNodes)vars.add(part.name);
        }
      }
      for(const [key,child] of Object.entries(node)){
        if(key==='parent'||key==='comments')continue;
        if(Array.isArray(child)){
          for(const item of child){
            if(item&&typeof item==='object'&&typeof item.type==='string')todo.push(item);
          }
        }else if(child&&typeof child==='object'&&typeof child.type==='string'){
          todo.push(child);
        }
      }
    }
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
    const boundLexically=ancestors.some(scope=>
      scopeDeclares(scope,name,node,lexicalNames));
    const boundByVar=ancestors.some(scope=>{
      if(scope!==root&&!['Program','FunctionDeclaration','FunctionExpression',
        'ArrowFunctionExpression','StaticBlock'].includes(scope.type))return false;
      // Parameter initializers execute before the function body environment
      // exists. Body var bindings cannot satisfy their free reads, even if
      // both share the same function syntax node.
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
        .includes(scope.type)&&!ancestors.includes(scope.body))return false;
      return hoistsIn(scope).has(name);
    });
    if(rootFormals.has(name)||boundLexically||boundByVar||
      moduleBindings.has(name)||realmGlobals.has(name))return;
    unproved=name;
  });
  return unproved;
}

module.exports={firstUnprovedFreeReference};
