'use strict';

const {resolveLexicalReferences}=require('./agent1-lexical-reference-resolver');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {'module'|'script'|'commonjs'} SourceType */
/** @typedef {{kind:'unknown-call'|'unresolved-local-call'|'new-expression'|'tagged-template'|'await'|'yield'|'dynamic-import'|'transitive-local-call'|'with-binding-lookup'|'implicit-iterator'|'implicit-object-enumeration'|'implicit-proxy-has'|'implicit-instanceof'|'implicit-delete'|'implicit-destructuring'|'implicit-spread'|'to-primitive'|'to-property-key'|'promise-thenable-assimilation'|'host-held-callable'|'thrown-callable-value'|'closure-captured-callable-value'|'unresolved-callable-argument-flow'|'returned-callable-value'|'yielded-callable-value'|'callable-metadata-observer'|'callable-coercion-observer'|'direct-eval-local-scope'|'debugger-local-scope'|'debugger-inspection'|'classic-script-global-lexical'|'module-exported-callable'|'host-global-exported-callable'|'unknown-this-callable-escape'|'unknown-member-access',start:number,end:number,targetStart?:number,effect?:'DynamicFrame'|'HostHeldCallable'|'ExternalReachability'}} AmbientCallReason */
/** @typedef {{node:AstNode,start:number,end:number,bindingIds:number[],bindingNames:string[],ambient:boolean,dynamicFrame:boolean,hostHeldCallable:boolean,externallyReachable:boolean,safe:boolean,reasons:AmbientCallReason[]}} AmbientCallSummary */

/**
 * @param {unknown} value
 * @returns {value is AstNode}
 */
function isAstNode(value) {
  return Boolean(value && typeof value==='object' &&
    typeof /** @type {{type?:unknown}} */ (value).type==='string');
}

/**
 * Walk an Acorn tree without relying on identifier spellings or parent
 * properties. The resolver's declaration-node BindingIds remain authoritative.
 * @param {AstNode} root
 * @param {(node:AstNode,parent:AstNode|null,key:string|null)=>void} visitor
 * @returns {void}
 */
function walkAst(root,visitor) {
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key */
  function visit(node,parent,key) {
    visitor(node,parent,key);
    for(const [childKey,value] of Object.entries(node)) {
      if(childKey==='parent'||childKey==='comments')continue;
      if(Array.isArray(value)) {
        for(const child of value)if(isAstNode(child))visit(child,node,childKey);
      } else if(isAstNode(value))visit(value,node,childKey);
    }
  }
  visit(root,null,null);
}

/**
 * Visit only executable syntax belonging to one function. A nested function
 * is summarized separately and reaches this function only through a resolved
 * local call edge.
 * @param {AstNode} root
 * @param {(node:AstNode)=>void} visitor
 * @returns {void}
 */
function walkExecutableFunctionBody(root,visitor) {
  /** @param {AstNode} node */
  function visit(node) {
    if(node!==root&&[
      'FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'
    ].includes(node.type))return;
    visitor(node);
    for(const value of Object.values(node)) {
      if(Array.isArray(value)) {
        for(const child of value)if(isAstNode(child))visit(child);
      } else if(isAstNode(value))visit(value);
    }
  }
  visit(root);
}

/**
 * A small primitive-expression recognizer for deciding whether an operation
 * can invoke ToPrimitive/ToPropertyKey user code. Unknown identifiers and
 * member reads remain unknown; this is not a value analysis.
 * @param {AstNode|null|undefined} node
 * @returns {boolean}
 */
function definitelyPrimitiveExpression(node) {
  if(!node)return false;
  switch(node.type) {
    case 'Literal': return !node.regex;
    case 'TemplateLiteral': return true;
    case 'UnaryExpression':
      if(['typeof','void','!'].includes(node.operator))return true;
      return ['+','-','~'].includes(node.operator)&&
        definitelyPrimitiveExpression(node.argument);
    case 'BinaryExpression':
      if(['in','instanceof'].includes(node.operator))return false;
      return definitelyPrimitiveExpression(node.left)&&
        definitelyPrimitiveExpression(node.right);
    case 'ConditionalExpression':
      return definitelyPrimitiveExpression(node.consequent)&&
        definitelyPrimitiveExpression(node.alternate);
    case 'SequenceExpression':
      return node.expressions.length>0&&
        definitelyPrimitiveExpression(node.expressions[node.expressions.length-1]);
    case 'ParenthesizedExpression':
      return definitelyPrimitiveExpression(node.expression);
    default: return false;
  }
}

/**
 * Return a statically known key for an ordinary object/member property.
 * @param {AstNode} property
 * @param {boolean} computed
 * @returns {string|null}
 */
function staticPropertyKey(property,computed) {
  if(!computed&&property.type==='Identifier')return property.name;
  if(property.type==='Literal'&&
     (typeof property.value==='string'||typeof property.value==='number'))
    return String(property.value);
  return null;
}

const CALLABLE_OBSERVER_PROPERTIES=new Set([
  'toString','toLocaleString','valueOf','join','name','length','caller','arguments','prototype','constructor'
]);

/**
 * Build a research-only ambient caller/stack effect summary using Agent 1's
 * read-only lexical BindingIds. It recognizes only direct local function
 * declarations, const-bound function expressions, and immutable const
 * identifier aliases. Every other call target is ambient/unknown.
 *
 * This summary is deliberately narrower than a complete host-effect model:
 * unknown member reads/writes are rejected except for proven non-escaping
 * primitive own-data records. Web IDL, cross-file imported bodies, dynamic
 * call results, deep/proxy-mediated values, and error-stack observation remain
 * unresolved. Simple const object/array aliases, direct return values and
 * local class-instance method values are followed conservatively. Callable
 * arguments crossing any call boundary are marked HostHeldCallable because
 * parameter escape is not analyzed. This is not transform authorization;
 * safe means only that no modeled effect was found.
 *
 * @param {AstNode} ast
 * @param {SourceType} sourceType
 * @param {{trustedPrototypeSemantics?:boolean}} [options] Caller asserts a pristine Object.prototype and no hostile preloader when enabling local prototype-shadow precision.
 * @returns {{summaries:AmbientCallSummary[],ambientBindingIds:number[],hostHeldCallableBindingIds:number[],externallyReachableBindingIds:number[],unsafeBindingIds:number[],safeBindingIds:number[]}}
 */
function summarizeAmbientCallEffects(ast,sourceType,options) {
  const trustedPrototypeSemantics=options?.trustedPrototypeSemantics===true;
  const resolved=resolveLexicalReferences(ast,sourceType);
  /** @type {Map<AstNode,typeof resolved.declarations[number]>} */
  const declarationByNode=new Map();
  /** @type {Map<number,typeof resolved.declarations>} */
  const declarationsByBinding=new Map();
  for(const declaration of resolved.declarations) {
    declarationByNode.set(declaration.node,declaration);
    if(declaration.bindingId!==null) {
      const rows=declarationsByBinding.get(declaration.bindingId)??[];
      rows.push(declaration);
      declarationsByBinding.set(declaration.bindingId,rows);
    }
  }

  /** @type {Map<AstNode,AstNode>} */
  const parentByNode=new Map();
  /** @type {Set<AstNode>} */
  const allFunctionNodes=new Set();
  walkAst(ast,(node,parent)=>{
    if(parent)parentByNode.set(node,parent);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))
      allFunctionNodes.add(node);
  });
  /** @param {AstNode} node @returns {boolean} */
  function isWithinFunctionOrClass(node) {
    let current=node;
    while(parentByNode.has(current)) {
      const parent=parentByNode.get(current);
      if(!parent)break;
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
          'ClassDeclaration','ClassExpression','MethodDefinition','PropertyDefinition','StaticBlock'].includes(parent.type))
        return true;
      current=parent;
    }
    return false;
  }

  /** @param {AstNode} node @returns {AstNode|null} */
  function enclosingFunction(node) {
    let current=node;
    while(parentByNode.has(current)) {
      const parent=parentByNode.get(current);
      if(!parent)break;
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(parent.type))
        return parent;
      current=parent;
    }
    return null;
  }

  /** @param {AstNode} node @returns {boolean} */
  function isInsideWithBody(node) {
    let current=node;
    while(parentByNode.has(current)) {
      const parent=parentByNode.get(current);
      if(!parent)break;
      if(parent.type==='WithStatement'&&parent.body===current)return true;
      current=parent;
    }
    return false;
  }
  /** @param {AstNode} node @returns {boolean} */
  function hasAnnexBBlockFunctionScope(node) {
    if(sourceType==='module')return false;
    const parent=parentByNode.get(node);
    if(parent?.type==='SwitchCase')return true;
    if(parent?.type!=='BlockStatement')return false;
    const grandparent=parentByNode.get(parent);
    return !(grandparent&&
      ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(grandparent.type)&&
      grandparent.body===parent);
  }

  /** @type {Set<number>} */
  const writtenBindings=new Set();
  for(const reference of resolved.references) {
    if(reference.resolution.kind==='local' &&
       ['write','read-write'].includes(reference.role)) {
      writtenBindings.add(reference.resolution.bindingId);
    }
  }

  // Only a fresh, non-escaping const object literal with primitive own data
  // fields can make a member read locally inert. Every other member read/write
  // remains an unknown getter/Proxy/host effect.
  /** @type {Map<number,Set<string>>} */
  const plainRecordProperties=new Map();
  for(const [bindingId,rows] of declarationsByBinding) {
    if(rows.length!==1||rows[0].kind!=='const'||writtenBindings.has(bindingId))continue;
    const declarator=parentByNode.get(rows[0].node);
    const declaration=declarator&&parentByNode.get(declarator);
    if(declarator?.type!=='VariableDeclarator'||declaration?.type!=='VariableDeclaration'||
       declaration.kind!=='const'||parentByNode.get(declaration)===ast||
       declarator.init?.type!=='ObjectExpression')continue;
    const keys=new Set();
    let valid=true;
    for(const property of declarator.init.properties) {
      if(property.type!=='Property'||property.kind!=='init'||property.method||property.computed||
         !definitelyPrimitiveExpression(property.value)) {
        valid=false;
        break;
      }
      const key=staticPropertyKey(property.key,false);
      if(key===null||key==='__proto__') {
        valid=false;
        break;
      }
      keys.add(key);
    }
    if(!valid||keys.size===0)continue;
    for(const reference of resolved.references) {
      if(reference.resolution.kind!=='local'||reference.resolution.bindingId!==bindingId)continue;
      const member=parentByNode.get(reference.node);
      if(reference.role!=='read'||member?.type!=='MemberExpression'||
         member.object!==reference.node||member.optional) {
        valid=false;
        break;
      }
      const key=staticPropertyKey(member.property,member.computed);
      const use=parentByNode.get(member);
      if(key===null||!keys.has(key)||
         (use?.type==='CallExpression'&&use.callee===member)||
         (use?.type==='NewExpression'&&use.callee===member)||
         (use?.type==='TaggedTemplateExpression'&&use.tag===member)||
         (use?.type==='AssignmentExpression'&&use.left===member)||
         (use?.type==='UpdateExpression'&&use.argument===member)||
         (use?.type==='UnaryExpression'&&use.operator==='delete'&&use.argument===member)||
         (use?.type==='ForInStatement'&&use.left===member)||
         (use?.type==='ForOfStatement'&&use.left===member)) {
        valid=false;
        break;
      }
    }
    if(valid)plainRecordProperties.set(bindingId,keys);
  }

  /** @param {AstNode} node @returns {boolean} */
  function isPlainRecordMemberRead(node) {
    if(node.type!=='MemberExpression'||node.optional||node.object.type!=='Identifier')return false;
    const reference=resolved.at(node.object.start);
    if(reference?.resolution.kind!=='local')return false;
    const keys=plainRecordProperties.get(reference.resolution.bindingId);
    const key=staticPropertyKey(node.property,node.computed);
    if(!keys||key===null||!keys.has(key))return false;
    const use=parentByNode.get(node);
    return !((use?.type==='CallExpression'&&use.callee===node)||
      (use?.type==='NewExpression'&&use.callee===node)||
      (use?.type==='TaggedTemplateExpression'&&use.tag===node)||
      (use?.type==='AssignmentExpression'&&use.left===node)||
      (use?.type==='UpdateExpression'&&use.argument===node)||
      (use?.type==='UnaryExpression'&&use.operator==='delete'&&use.argument===node)||
      (use?.type==='ForInStatement'&&use.left===node)||
      (use?.type==='ForOfStatement'&&use.left===node));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isDefinitelyPrimitive(node) {
    return definitelyPrimitiveExpression(node)||Boolean(node&&isPlainRecordMemberRead(node));
  }

  // A VariableDeclarator initializer is a runtime binding write even though
  // its identifier is correctly represented as a declaration, not a reference.
  // A same-ID var helper = callback can therefore overwrite a function declaration.
  /** @type {Set<number>} */
  const initializerOverwrittenFunctionBindings=new Set();
  for(const [bindingId,rows] of declarationsByBinding) {
    if(!rows.some(row=>row.kind==='function'))continue;
    for(const row of rows) {
      const parent=parentByNode.get(row.node);
      if(parent?.type==='VariableDeclarator'&&parent.init!==null)
        initializerOverwrittenFunctionBindings.add(bindingId);
    }
  }

  /** @type {Set<number>} */
  const topLevelScriptBindings=new Set();
  /** @type {Set<number>} */
  const mutableTopLevelScriptBindings=new Set();
  /** @type {Set<AstNode>} */
  const externallyReachableFunctions=new Set();
  if(sourceType==='script') {
    walkAst(ast,(node,parent)=>{
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'&&
         !isWithinFunctionOrClass(node)) {
        externallyReachableFunctions.add(node);
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null)topLevelScriptBindings.add(id);
      }
      const globalScriptVariable=node.type==='VariableDeclarator'&&
        parent?.type==='VariableDeclaration'&&node.id.type==='Identifier'&&
        (parentByNode.get(parent)===ast||(parent.kind==='var'&&!isWithinFunctionOrClass(node)));
      if(globalScriptVariable) {
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null) {
          topLevelScriptBindings.add(id);
          if(parent.kind!=='const')mutableTopLevelScriptBindings.add(id);
        }
        if(node.init&&['FunctionExpression','ArrowFunctionExpression'].includes(node.init.type))
          externallyReachableFunctions.add(node.init);
      }
    });
  }

  /** @type {Map<number,AstNode>} */
  const functionNodeByBinding=new Map();
  /** @type {Set<number>} */
  const ambiguousFunctionBindings=new Set();
  /**
   * @param {number|null} bindingId
   * @param {AstNode} fn
   * @returns {void}
   */
  function addFunctionBinding(bindingId,fn) {
    if(bindingId===null||writtenBindings.has(bindingId)||
       initializerOverwrittenFunctionBindings.has(bindingId)||
       mutableTopLevelScriptBindings.has(bindingId)||
       ambiguousFunctionBindings.has(bindingId))return;
    const existing=functionNodeByBinding.get(bindingId);
    if(existing&&existing!==fn) {
      functionNodeByBinding.delete(bindingId);
      ambiguousFunctionBindings.add(bindingId);
      return;
    }
    functionNodeByBinding.set(bindingId,fn);
  }

  /** @type {Map<number,number>} */
  const aliasTargets=new Map();
  walkAst(ast,(node,parent)=>{
    if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier') {
      // Classic-script function declarations are not fixed call targets:
      // global-object and Annex-B binding closure is not proven here.
      if(sourceType!=='script'&&!hasAnnexBBlockFunctionScope(node))
        addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node);
    } else if(node.type==='FunctionExpression'&&node.id?.type==='Identifier') {
      addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node);
    } else if(node.type==='VariableDeclarator'&&parent?.type==='VariableDeclaration'&&
              parent.kind==='const'&&node.id.type==='Identifier'&&
              (node.init?.type==='FunctionExpression'||
               node.init?.type==='ArrowFunctionExpression')) {
      addFunctionBinding(declarationByNode.get(node.id)?.bindingId??null,node.init);
    }
    if(node.type==='VariableDeclarator'&&parent?.type==='VariableDeclaration'&&
       parent.kind==='const'&&node.id.type==='Identifier'&&
       node.init?.type==='Identifier') {
      const aliasBinding=declarationByNode.get(node.id)?.bindingId??null;
      const sourceReference=resolved.at(node.init.start);
      if(aliasBinding!==null&&!writtenBindings.has(aliasBinding)&&
         sourceReference?.resolution.kind==='local') {
        aliasTargets.set(aliasBinding,sourceReference.resolution.bindingId);
      }
    }
  });

  /**
   * Resolve a local binding or const alias to one uniquely known function.
   * @param {number} bindingId
   * @param {Set<number>} [seen]
   * @returns {AstNode|null}
   */
  function resolveFunctionNode(bindingId,seen=new Set()) {
    if(ambiguousFunctionBindings.has(bindingId))return null;
    const direct=functionNodeByBinding.get(bindingId);
    if(direct)return direct;
    if(seen.has(bindingId))return null;
    const target=aliasTargets.get(bindingId);
    if(target===undefined)return null;
    const next=new Set(seen);
    next.add(bindingId);
    return resolveFunctionNode(target,next);
  }

  /** @type {Map<number,AstNode>} */
  const constInitializersByBinding=new Map();
  /** @type {Map<number,AstNode[]>} */
  const bindingValueExpressions=new Map();
  /** @param {number} bindingId @param {AstNode} value @returns {void} */
  function addBindingValueExpression(bindingId,value) {
    const values=bindingValueExpressions.get(bindingId)??[];
    values.push(value);
    bindingValueExpressions.set(bindingId,values);
  }
  walkAst(ast,node=>{
    if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier') {
      const id=declarationByNode.get(node.id)?.bindingId??null;
      if(id!==null)addBindingValueExpression(id,node);
    } else if(node.type==='ClassDeclaration'&&node.id?.type==='Identifier') {
      const id=declarationByNode.get(node.id)?.bindingId??null;
      if(id!==null)addBindingValueExpression(id,node);
    } else if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.init) {
      const id=declarationByNode.get(node.id)?.bindingId??null;
      if(id!==null)addBindingValueExpression(id,node.init);
    } else if(node.type==='AssignmentPattern'&&node.left.type==='Identifier'&&node.right) {
      // Default parameter and destructuring defaults are runtime writes to
      // their binding; retain the initializer for later closure/value-flow.
      const id=declarationByNode.get(node.left)?.bindingId??null;
      if(id!==null)addBindingValueExpression(id,node.right);
    } else if(node.type==='AssignmentExpression'&&node.left.type==='Identifier') {
      const reference=resolved.at(node.left.start);
      if(reference?.resolution.kind==='local')
        addBindingValueExpression(reference.resolution.bindingId,node.right);
    }
  });
  /** @type {Map<number,AstNode>} */
  const classNodeByBinding=new Map();
  walkAst(ast,node=>{
    if(node.type==='ClassDeclaration'&&node.id?.type==='Identifier') {
      const id=declarationByNode.get(node.id)?.bindingId??null;
      if(id!==null)classNodeByBinding.set(id,node);
    }
    if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&
       node.init?.type==='ClassExpression') {
      const id=declarationByNode.get(node.id)?.bindingId??null;
      if(id!==null)classNodeByBinding.set(id,node.init);
    }
  });
  for(const [bindingId,rows] of declarationsByBinding) {
    if(rows.length!==1)continue;
    const declarator=parentByNode.get(rows[0].node);
    const declaration=declarator&&parentByNode.get(declarator);
    if(declarator?.type==='VariableDeclarator'&&declaration?.type==='VariableDeclaration'&&
       declaration.kind==='const'&&declarator.init)
      constInitializersByBinding.set(bindingId,declarator.init);
  }

  /** @param {number} bindingId @param {Set<number>} [seen] @returns {AstNode|null} */
  function initializerForBinding(bindingId,seen=new Set()) {
    if(seen.has(bindingId))return null;
    const initializer=constInitializersByBinding.get(bindingId);
    if(!initializer)return null;
    if(initializer.type==='Identifier') {
      const reference=resolved.at(initializer.start);
      if(reference?.resolution.kind==='local') {
        const next=new Set(seen);
        next.add(bindingId);
        return initializerForBinding(reference.resolution.bindingId,next);
      }
    }
    return initializer;
  }

  // Local mutation of Function.prototype invocation helpers or Reflect.apply
  // disables the intrinsic fast path. The analysis assumes standard intrinsics
  // only when the source itself provides no evidence that they were replaced.
  let callLikeIntrinsicsUnmodified=true;
  walkAst(ast,node=>{
    if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression') {
      const key=staticPropertyKey(node.left.property,node.left.computed);
      if(key!==null&&['call','apply','bind','__proto__'].includes(key))
        callLikeIntrinsicsUnmodified=false;
    } else if(node.type==='UpdateExpression'&&node.argument.type==='MemberExpression') {
      const key=staticPropertyKey(node.argument.property,node.argument.computed);
      if(key!==null&&['call','apply','bind','__proto__'].includes(key))
        callLikeIntrinsicsUnmodified=false;
    } else if(node.type==='UnaryExpression'&&node.operator==='delete'&&
              node.argument.type==='MemberExpression') {
      const key=staticPropertyKey(node.argument.property,node.argument.computed);
      if(key!==null&&['call','apply','bind','__proto__'].includes(key))
        callLikeIntrinsicsUnmodified=false;
    } else if(node.type==='CallExpression'&&node.callee.type==='MemberExpression') {
      const objectName=node.callee.object.type==='Identifier'?node.callee.object.name:null;
      const key=staticPropertyKey(node.callee.property,node.callee.computed);
      if((objectName==='Object'&&key!==null&&
          ['defineProperty','defineProperties','assign','setPrototypeOf'].includes(key))||
         (objectName==='Reflect'&&key!==null&&
          ['defineProperty','set','setPrototypeOf'].includes(key)))
        callLikeIntrinsicsUnmodified=false;
    } else if(node.type==='MemberExpression') {
      // Merely taking an alias to a mutation primitive is enough to make a
      // later call/apply/bind proof unreliable, even when the invocation name
      // itself no longer mentions Object or Reflect.
      const objectName=node.object.type==='Identifier'?node.object.name:null;
      const key=staticPropertyKey(node.property,node.computed);
      if((objectName==='Object'&&
          (key===null||['defineProperty','defineProperties','assign','setPrototypeOf'].includes(key)))||
         (objectName==='Reflect'&&
          (key===null||['defineProperty','set','setPrototypeOf'].includes(key))))
        callLikeIntrinsicsUnmodified=false;
    } else if(node.type==='WithStatement') {
      callLikeIntrinsicsUnmodified=false;
    } else if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&
              node.callee.name==='eval') {
      const reference=resolved.at(node.callee.start);
      if(reference?.resolution.kind==='unknown'&&
         reference.resolution.reason==='unproven-free-name')
        callLikeIntrinsicsUnmodified=false;
    } else if(node.type==='AssignmentExpression'&&node.left.type==='Identifier'&&
              ['Function','Reflect'].includes(node.left.name)) {
      callLikeIntrinsicsUnmodified=false;
    }
  });

  // A narrowly proved local record may receive callable values without
  // publishing them. Require a direct const object literal, own primitive data
  // slots, and references confined to same-function static member accesses.
  // Any alias, whole-object escape, closure capture, accessor, spread, proxy
  // boundary, or unproved key falls back to the existing fail-closed rule.
  /** @type {Map<number,Set<string>>} */
  const localRecordOwnerKeys=new Map();
  // A with environment can intercept a same-scope identifier through its
  // HasBinding trap. Disable local-owner proofs in the containing function
  // scope, not in unrelated sibling functions.
  /** @type {Set<AstNode|null>} */
  const withFunctionScopes=new Set();
  walkAst(ast,node=>{
    if(node.type==='WithStatement')
      withFunctionScopes.add(enclosingFunction(node));
  });
  /** @param {number} bindingId @returns {Set<string>|null} */
  function localRecordKeysForBinding(bindingId) {
    const cached=localRecordOwnerKeys.get(bindingId);
    if(cached)return cached;
    const rows=declarationsByBinding.get(bindingId)??[];
    if(rows.length!==1||rows[0].kind!=='const'||writtenBindings.has(bindingId))return null;
    const ownerFunction=enclosingFunction(rows[0].node);
    if(withFunctionScopes.has(ownerFunction)||isInsideWithBody(rows[0].node))return null;
    const initializer=constInitializersByBinding.get(bindingId);
    if(initializer?.type!=='ObjectExpression')return null;
    const keys=new Set();
    for(const property of initializer.properties) {
      if(property.type!=='Property'||property.kind!=='init'||property.method||property.computed)
        return null;
      const key=staticPropertyKey(property.key,false);
      if(key===null||key==='__proto__'||keys.has(key)||
         !definitelyPrimitiveExpression(property.value))return null;
      keys.add(key);
    }
    if(keys.size===0)return null;
    for(const reference of resolved.references) {
      if(reference.resolution.kind!=='local'||reference.resolution.bindingId!==bindingId)continue;
      const member=parentByNode.get(reference.node);
      if(member?.type!=='MemberExpression'||member.object!==reference.node||member.optional)
        return null;
      const key=staticPropertyKey(member.property,member.computed);
      if(key===null||!keys.has(key)||enclosingFunction(reference.node)!==ownerFunction||
         isInsideWithBody(reference.node))
        return null;
      const use=parentByNode.get(member);
      if((use?.type==='CallExpression'&&use.callee===member)||
         (use?.type==='NewExpression'&&use.callee===member)||
         (use?.type==='TaggedTemplateExpression'&&use.tag===member)||
         (use?.type==='AssignmentExpression'&&use.left===member&&use.operator!=='=')||
         (use?.type==='UpdateExpression'&&use.argument===member)||
         (use?.type==='UnaryExpression'&&use.operator==='delete'&&use.argument===member)||
         (use?.type==='ForInStatement'&&use.left===member)||
         (use?.type==='ForOfStatement'&&use.left===member))
        return null;
    }
    localRecordOwnerKeys.set(bindingId,keys);
    return keys;
  }

  /** @type {Map<number,Map<string,AstNode[]>>} */
  const localRecordMemberValues=new Map();
  /** @param {number} bindingId @param {string} key @param {AstNode} value @returns {void} */
  function addLocalRecordMemberValue(bindingId,key,value) {
    const fields=localRecordMemberValues.get(bindingId)??new Map();
    const values=fields.get(key)??[];
    values.push(value);
    fields.set(key,values);
    localRecordMemberValues.set(bindingId,fields);
  }
  walkAst(ast,node=>{
    if(node.type!=='AssignmentExpression'||node.operator!=='='||
       node.left.type!=='MemberExpression'||node.left.object.type!=='Identifier')return;
    const reference=resolved.at(node.left.object.start);
    if(reference?.resolution.kind!=='local')return;
    const bindingId=reference.resolution.bindingId;
    const key=staticPropertyKey(node.left.property,node.left.computed);
    const keys=localRecordKeysForBinding(bindingId);
    if(key!==null&&keys?.has(key))
      addLocalRecordMemberValue(bindingId,key,node.right);
  });

  /** @param {AstNode} node @returns {boolean} */
  function isLocalRecordMemberAccess(node) {
    if(node.type!=='MemberExpression'||node.optional||node.object.type!=='Identifier')return false;
    const reference=resolved.at(node.object.start);
    if(reference?.resolution.kind!=='local')return false;
    const keys=localRecordKeysForBinding(reference.resolution.bindingId);
    const key=staticPropertyKey(node.property,node.computed);
    if(!keys||key===null||!keys.has(key))return false;
    const use=parentByNode.get(node);
    return !((use?.type==='CallExpression'&&use.callee===node)||
      (use?.type==='NewExpression'&&use.callee===node)||
      (use?.type==='TaggedTemplateExpression'&&use.tag===node)||
      (use?.type==='AssignmentExpression'&&use.left===node&&use.operator!=='=')||
      (use?.type==='UpdateExpression'&&use.argument===node)||
      (use?.type==='UnaryExpression'&&use.operator==='delete'&&use.argument===node)||
      (use?.type==='ForInStatement'&&use.left===node)||
      (use?.type==='ForOfStatement'&&use.left===node));
  }

  /**
   * Prove one deliberately narrow local prototype write is shadowed at every
   * observed instance read. This optimization is disabled unless the caller
   * explicitly supplies the trusted-prototype-semantics contract.
   * @param {AstNode} assignment
   * @returns {boolean}
   */
  function isProvenShadowedLocalPrototypeWrite(assignment) {
    if(!trustedPrototypeSemantics||assignment.type!=='AssignmentExpression'||
      assignment.operator!=='='||assignment.left.type!=='MemberExpression') return false;
    const target=assignment.left;
    const prototypeAccess=target.object;
    if(prototypeAccess.type!=='MemberExpression'||prototypeAccess.optional||
      prototypeAccess.object.type!=='Identifier'||
      staticPropertyKey(prototypeAccess.property,prototypeAccess.computed)!=='prototype') return false;
    const propertyKey=staticPropertyKey(target.property,target.computed);
    if(propertyKey===null||propertyKey==='__proto__') return false;
    const constructorReference=resolved.at(prototypeAccess.object.start);
    if(constructorReference?.resolution.kind!=='local') return false;
    const constructorBindingId=constructorReference.resolution.bindingId;
    const constructorDeclarations=declarationsByBinding.get(constructorBindingId)??[];
    if(constructorDeclarations.length!==1) return false;
    const constructorDeclarationNode=constructorDeclarations[0].node;
    const constructorDeclarationParent=parentByNode.get(constructorDeclarationNode);
    if(!((constructorDeclarationParent?.type==='FunctionDeclaration'||
      constructorDeclarationParent?.type==='ClassDeclaration')&&
      constructorDeclarationParent.id===constructorDeclarationNode)) return false;
    const classNode=classNodeByBinding.get(constructorBindingId);
    const constructorFunction=resolveFunctionNode(constructorBindingId);
    if(!classNode&&(!constructorFunction||
      !['FunctionDeclaration','FunctionExpression'].includes(constructorFunction.type))) return false;
    if(classNode&&(classNode.type!=='ClassDeclaration'&&classNode.type!=='ClassExpression')) return false;
    if(classNode?.superClass) return false;

    // Only accept an empty constructor, one same-key class field, or a
    // straight-line function constructor consisting solely of same-key
    // this assignments. Other members/statements fail closed.
    let constructorModelValid=false;
    let constructorOwnWrite=false;
    if(classNode) {
      const elements=classNode.body.body;
      if(elements.length===0) {
        constructorModelValid=true;
      } else if(elements.length===1) {
        const element=elements[0];
        if(element.type==='PropertyDefinition'&&!element.static&&
          staticPropertyKey(element.key,element.computed)===propertyKey) {
          constructorModelValid=true;
          constructorOwnWrite=true;
        }
      }
    } else if(constructorFunction&&
      (constructorFunction.type==='FunctionDeclaration'||constructorFunction.type==='FunctionExpression')) {
      const body=constructorFunction.body;
      if(body.type==='BlockStatement') {
        if(body.body.length===0) {
          constructorModelValid=true;
        } else {
          /** @type {AstNode[]} */
          const constructorStatements=body.body;
          constructorOwnWrite=constructorStatements.every(statement=>{
            if(statement.type!=='ExpressionStatement') return false;
            const expression=statement.expression;
            return expression.type==='AssignmentExpression'&&expression.operator==='='&&
              expression.left.type==='MemberExpression'&&expression.left.object.type==='ThisExpression'&&
              staticPropertyKey(expression.left.property,expression.left.computed)===propertyKey;
          });
          constructorModelValid=constructorOwnWrite;
        }
      }
    }
    if(!constructorModelValid) return false;

    // The constructor may be referenced only by this prototype write and by
    // the single local new-expression. Exports, aliases, reflection, and
    // additional prototype operations invalidate the proof.
    let constructorUsesValid=true;
    walkAst(ast,node=>{
      if(node.type!=='Identifier') return;
      const reference=resolved.at(node.start);
      if(reference?.resolution.kind!=='local'||
        reference.resolution.bindingId!==constructorBindingId) return;
      const parent=parentByNode.get(node);
      if((parent?.type==='FunctionDeclaration'||parent?.type==='FunctionExpression'||
        parent?.type==='ClassDeclaration'||parent?.type==='ClassExpression')&&parent.id===node) return;
      if(parent?.type==='NewExpression'&&parent.callee===node) return;
      if(parent?.type==='MemberExpression'&&parent.object===node&&
        staticPropertyKey(parent.property,parent.computed)==='prototype') {
        const outer=parentByNode.get(parent);
        if(outer&&outer===target&&parentByNode.get(outer)===assignment) return;
      }
      constructorUsesValid=false;
    });
    if(!constructorUsesValid) return false;

    /** @type {AstNode[]} */
    const allocations=[];
    walkAst(ast,node=>{
      if(node.type!=='NewExpression'||node.callee.type!=='Identifier') return;
      const reference=resolved.at(node.callee.start);
      if(reference?.resolution.kind==='local'&&
        reference.resolution.bindingId===constructorBindingId) allocations.push(node);
    });
    if(allocations.length!==1) return false;
    const allocation=allocations[0];
    if(assignment.start>=allocation.start) return false;
    const declarator=parentByNode.get(allocation);
    if(declarator?.type!=='VariableDeclarator'||declarator.init!==allocation||
      declarator.id.type!=='Identifier') return false;
    const declaration=parentByNode.get(declarator);
    if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const') return false;
    const ownerId=declarator.id;
    const ownerBindingId=declarationByNode.get(ownerId)?.bindingId;
    if(ownerBindingId===null||ownerBindingId===undefined) return false;
    const fn=enclosingFunction(allocation);
    if(!fn||fn!==enclosingFunction(assignment)||fn.body.type!=='BlockStatement') return false;

    /** @param {AstNode} node @returns {AstNode|null} */
    const topLevelStatement=node=>{
      let current=node;
      while(current) {
        const parent=parentByNode.get(current);
        if(parent===fn.body) return current;
        if(!parent) return null;
        current=parent;
      }
      return null;
    };
    const bodyStatements=fn.body.body;
    const prototypeStatement=topLevelStatement(assignment);
    const allocationStatement=topLevelStatement(allocation);
    if(prototypeStatement?.type!=='ExpressionStatement'||
      prototypeStatement.expression!==assignment||allocationStatement?.type!=='VariableDeclaration') return false;
    const prototypeIndex=bodyStatements.indexOf(prototypeStatement);
    const allocationIndex=bodyStatements.indexOf(allocationStatement);
    // Require adjacency and declaration-only setup before the prototype write:
    // no source-local call can interpose a mutation of Object.prototype.
    if(prototypeIndex<0||allocationIndex!==prototypeIndex+1) return false;
    for(let i=0;i<prototypeIndex;i++) {
      const statement=bodyStatements[i];
      if(statement.type!=='FunctionDeclaration'&&statement.type!=='ClassDeclaration') return false;
    }

    /** @type {AstNode[]} */
    const ownerReads=[];
    /** @type {AstNode[]} */
    const ownerWrites=[];
    let ownerUsesValid=true;
    walkAst(ast,node=>{
      if(node.type!=='Identifier') return;
      const reference=resolved.at(node.start);
      if(reference?.resolution.kind!=='local'||reference.resolution.bindingId!==ownerBindingId) return;
      if(enclosingFunction(node)!==fn) {
        ownerUsesValid=false;
        return;
      }
      const parent=parentByNode.get(node);
      if(parent?.type==='VariableDeclarator'&&parent.id===node) return;
      if(parent?.type!=='MemberExpression'||parent.object!==node||parent.optional||
        staticPropertyKey(parent.property,parent.computed)!==propertyKey) {
        ownerUsesValid=false;
        return;
      }
      const use=parentByNode.get(parent);
      if(use?.type==='AssignmentExpression'&&use.left===parent&&use.operator==='=') {
        ownerWrites.push(use);
        return;
      }
      if(use?.type==='CallExpression'&&use.arguments.includes(parent)&&
        use.callee.type==='Identifier'&&!use.optional) {
        const calleeReference=resolved.at(use.callee.start);
        if(calleeReference?.resolution.kind==='local') {
          ownerUsesValid=false;
          return;
        }
        ownerReads.push(use);
        return;
      }
      ownerUsesValid=false;
    });
    if(!ownerUsesValid||ownerReads.length===0) return false;

    const operationStatements=[...ownerWrites,...ownerReads].map(topLevelStatement);
    if(operationStatements.some(statement=>statement?.type!=='ExpressionStatement')) return false;
    for(let i=0;i<ownerWrites.length;i++) {
      const statement=operationStatements[i];
      if(statement?.type!=='ExpressionStatement'||statement.expression!==ownerWrites[i]) return false;
    }
    for(let i=0;i<ownerReads.length;i++) {
      const statement=operationStatements[ownerWrites.length+i];
      if(statement?.type!=='ExpressionStatement'||statement.expression!==ownerReads[i]) return false;
    }
    const lastIndex=Math.max(...operationStatements.map(statement=>
      statement?bodyStatements.indexOf(statement):-1));
    if(lastIndex<=allocationIndex) return false;
    for(let i=allocationIndex+1;i<=lastIndex;i++) {
      if(!operationStatements.includes(bodyStatements[i])) return false;
    }
    for(const read of ownerReads) {
      if(read.start<=allocation.start) return false;
      if(!constructorOwnWrite&&!ownerWrites.some(write=>
        write.start>allocation.start&&write.start<read.start)) return false;
    }
    return true;
  }

  /** @param {AstNode} classNode @returns {number|null} */
  function classBindingId(classNode) {
    if(classNode.type==='ClassDeclaration'&&classNode.id?.type==='Identifier')
      return declarationByNode.get(classNode.id)?.bindingId??null;
    if(classNode.type==='ClassExpression') {
      const parent=parentByNode.get(classNode);
      if(parent?.type==='VariableDeclarator'&&parent.id.type==='Identifier')
        return declarationByNode.get(parent.id)?.bindingId??null;
    }
    return null;
  }

  /** @param {AstNode} fn @returns {boolean} */
  function fieldFunctionUsesInstanceReceiver(fn) {
    let usesInstanceReceiver=false;
    walkAst(fn,(/** @type {AstNode} */ node)=>{
      if(node.type==='ThisExpression'||node.type==='Super')
        usesInstanceReceiver=true;
    });
    return usesInstanceReceiver;
  }

  /** @param {AstNode|null} value @returns {boolean} */
  function isSafeClassFieldInitializer(value) {
    if(!value)return true;
    if(value.type==='Literal')
      return value.value===null||['string','number','boolean','bigint'].includes(typeof value.value);
    if(['FunctionExpression','ArrowFunctionExpression'].includes(value.type))
      return !fieldFunctionUsesInstanceReceiver(value);
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local'||
         classNodeByBinding.has(reference.resolution.bindingId)||
         writtenBindings.has(reference.resolution.bindingId))return false;
      const fn=resolveFunctionNode(reference.resolution.bindingId);
      return fn!==null&&!fieldFunctionUsesInstanceReceiver(fn);
    }
    return false;
  }

  /** @param {AstNode} element @param {AstNode} classNode @returns {boolean} */
  function isSafeClassFieldGetter(element,classNode) {
    if(element.type!=='MethodDefinition'||element.kind!=='get'||element.static||element.computed||
       element.key.type==='PrivateIdentifier'||!element.value?.body||element.value.body.type!=='BlockStatement')
      return false;
    const statements=element.value.body.body;
    if(statements.length!==1||statements[0].type!=='ReturnStatement'||!statements[0].argument)
      return false;
    const returned=statements[0].argument;
    if(returned.type==='Literal')
      return returned.value===null||['string','number','boolean','bigint'].includes(typeof returned.value);
    if(returned.type!=='MemberExpression'||returned.object.type!=='ThisExpression')return false;
    const key=staticPropertyKey(returned.property,returned.computed);
    if(key===null)return false;
    const field=classNode.body.body.find((/** @type {AstNode} */ candidate)=>
      candidate.type==='PropertyDefinition'&&!candidate.static&&
      staticPropertyKey(candidate.key,candidate.computed)===key);
    return Boolean(field&&isSafeClassFieldInitializer(field.value));
  }

  /** @param {AstNode} classNode @returns {boolean} */
  function classHasOnlyPublicInstanceFieldsAndSimpleGetters(classNode) {
    if(classNode.superClass||classNode.body.body.length===0)return false;
    return classNode.body.body.every((/** @type {AstNode} */ element)=>
      (element.type==='PropertyDefinition'&&!element.static&&!element.computed&&
        element.key.type!=='PrivateIdentifier'&&isSafeClassFieldInitializer(element.value))||
      isSafeClassFieldGetter(element,classNode));
  }

  /** @param {AstNode} field @returns {boolean} */
  function isDeferredClassField(field) {
    if(field.type!=='PropertyDefinition'||!field.value)return false;
    let current=field;
    /** @type {AstNode|null} */
    let classNode=null;
    while(parentByNode.has(current)) {
      const parent=parentByNode.get(current);
      if(!parent)break;
      if(parent.type==='ClassDeclaration'||parent.type==='ClassExpression') {
        classNode=parent;
        break;
      }
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(parent.type))
        return false;
      current=parent;
    }
    if(!classNode||!classHasOnlyPublicInstanceFieldsAndSimpleGetters(classNode))return false;
    const bindingId=classBindingId(classNode);
    if(bindingId===null||writtenBindings.has(bindingId)||
       (declarationsByBinding.get(bindingId)?.length??0)!==1)return false;
    if(['FunctionExpression','ArrowFunctionExpression'].includes(field.value.type))
      return true;
    if(field.value.type==='Identifier') {
      const reference=resolved.at(field.value.start);
      return reference?.resolution.kind==='local'&&
        !classNodeByBinding.has(reference.resolution.bindingId)&&
        resolveFunctionNode(reference.resolution.bindingId)!==null;
    }
    return false;
  }

  /** @param {AstNode} classNode @param {Set<AstNode>} [seen] @returns {AstNode[]} */
  function classMethodFunctions(classNode,seen=new Set()) {
    if(!['ClassDeclaration','ClassExpression'].includes(classNode.type)||seen.has(classNode))return [];
    const next=new Set(seen);
    next.add(classNode);
    const own=classNode.body.body.flatMap((/** @type {AstNode} */ element)=>{
      if(element.type==='MethodDefinition'&&element.value)return [element.value];
      if(element.type==='PropertyDefinition'&&element.value&&
         (['FunctionExpression','ArrowFunctionExpression'].includes(element.value.type)||
          isDeferredClassField(element)))
        return callableNodesForValue(element.value);
      return [];
    });
    /** @type {AstNode[]} */
    let inherited=[];
    if(classNode.superClass?.type==='Identifier') {
      const reference=resolved.at(classNode.superClass.start);
      if(reference?.resolution.kind==='local') {
        const parentClass=classNodeByBinding.get(reference.resolution.bindingId);
        if(parentClass)inherited=classMethodFunctions(parentClass,next);
      }
    } else if(['ClassExpression','ClassDeclaration'].includes(classNode.superClass?.type)) {
      inherited=classMethodFunctions(classNode.superClass,next);
    }
    return [...new Set([...own,...inherited])];
  }

  /**
   * Return only values explicitly returned by one resolved function.
   * @param {AstNode} fn
   * @returns {AstNode[]}
   */
  function functionReturnExpressions(fn) {
    if(!fn.body)return [];
    if(fn.body.type!=='BlockStatement')return [fn.body];
    /** @type {AstNode[]} */
    const returns=[];
    walkAst(fn.body,node=>{
      if(node.type==='ReturnStatement'&&node.argument&&enclosingFunction(node)===fn)
        returns.push(node.argument);
    });
    return returns;
  }
  /**
   * Return only yield operands belonging to one generator function.
   * @param {AstNode} fn
   * @returns {AstNode[]}
   */
  function functionYieldExpressions(fn) {
    if(!fn.body||fn.body.type!=='BlockStatement')return [];
    /** @type {AstNode[]} */
    const yields=[];
    walkAst(fn.body,node=>{
      if(node.type==='YieldExpression'&&node.argument&&enclosingFunction(node)===fn)
        yields.push(node.argument);
    });
    return yields;
  }
  /** @returns {Set<number>} */
  function newNumericSeenSet() {
    return new Set();
  }

  /** @returns {Set<AstNode>} */
  function newAstSeenSet() {
    return new Set();
  }

  /**
   * Resolve a direct this-rooted member chain against a known getter/method receiver.
   * Unknown or dynamic chains fall back to the receiver so callers fail closed.
   * @param {AstNode} expression
   * @param {AstNode} receiver
   * @param {Set<number>} [seen]
   * @returns {AstNode[]}
   */
  function memberReturnExpressionsWithReceiver(expression,receiver,seen=new Set()) {
    if(expression.type==='ThisExpression')return [receiver];
    if(expression.type==='ChainExpression')
      return memberReturnExpressionsWithReceiver(expression.expression,receiver,seen);
    if(expression.type==='CallExpression'&&expression.callee.type==='MemberExpression') {
      /** @type {string[]} */
      const keys=[];
      let root=expression.callee;
      while(root.type==='MemberExpression') {
        const key=staticPropertyKey(root.property,root.computed);
        if(key===null)return [receiver];
        keys.unshift(key);
        root=root.object;
      }
      if(root.type==='ThisExpression'&&keys.length) {
        const marker=-2000000000-(receiver.start??0);
        if(seen.has(marker))return [receiver];
        const next=new Set(seen);
        next.add(marker);
        let objects=[receiver];
        for(const key of keys.slice(0,-1)) {
          /** @type {Set<number>} */
          const propertySeen=new Set();
          for(const item of next)if(typeof item==='number')propertySeen.add(item);
          const resolvedValues=objects.flatMap(candidate=>
            memberValueExpressionsForProperty(candidate,key,propertySeen));
          if(!resolvedValues.length)return [receiver];
          objects=[...new Set(resolvedValues)];
        }
        /** @type {AstNode[]} */
        const returned=[];
        for(const object of objects) {
          /** @type {Set<number>} */
          const propertySeen=new Set();
          for(const item of next)if(typeof item==='number')propertySeen.add(item);
          const methodValues=memberValueExpressionsForProperty(object,keys[keys.length-1],propertySeen);
          const methods=methodValues.flatMap(methodValue=>callableNodesForValue(methodValue,propertySeen));
          if(!methods.length)return [receiver];
          for(const method of methods) {
            for(const returnedExpression of functionReturnExpressions(method))
              returned.push(...memberReturnExpressionsWithReceiver(returnedExpression,object,next));
          }
        }
        return returned.length?[...new Set(returned)]:[];
      }
    }
    if(expression.type==='MemberExpression') {
      /** @type {string[]} */
      const keys=[];
      let root=expression;
      while(root.type==='MemberExpression') {
        const key=staticPropertyKey(root.property,root.computed);
        if(key===null)return [receiver];
        keys.unshift(key);
        root=root.object;
      }
      if(root.type==='ThisExpression') {
        const marker=-1000000000-(receiver.start??0);
        if(seen.has(marker))return [receiver];
        const next=new Set(seen);
        next.add(marker);
        let values=[receiver];
        for(const key of keys) {
          /** @type {Set<number>} */
          const propertySeen=new Set();
          for(const item of next)if(typeof item==='number')propertySeen.add(item);
          const resolvedValues=values.flatMap(candidate=>
            memberValueExpressionsForProperty(candidate,key,propertySeen));
          if(!resolvedValues.length)return [receiver];
          values=[...new Set(resolvedValues)];
        }
        return values;
      }
    }
    if(expression.type==='ConditionalExpression')
      return [...new Set([
        ...memberReturnExpressionsWithReceiver(expression.consequent,receiver,seen),
        ...memberReturnExpressionsWithReceiver(expression.alternate,receiver,seen)
      ])];
    if(expression.type==='LogicalExpression')
      return [...new Set([
        ...memberReturnExpressionsWithReceiver(expression.left,receiver,seen),
        ...memberReturnExpressionsWithReceiver(expression.right,receiver,seen)
      ])];
    if(expression.type==='SequenceExpression'&&expression.expressions.length)
      return memberReturnExpressionsWithReceiver(expression.expressions[expression.expressions.length-1],receiver,seen);
    if(expression.type==='AssignmentExpression')
      return memberReturnExpressionsWithReceiver(expression.right,receiver,seen);
    if(expression.type==='AwaitExpression'&&expression.argument)
      return memberReturnExpressionsWithReceiver(expression.argument,receiver,seen);
    let usesThis=false;
    const rootFunction=enclosingFunction(expression);
    walkAst(expression,node=>{
      if((node.type==='ThisExpression'||node.type==='Super')&&
         enclosingFunction(node)===rootFunction)usesThis=true;
    });
    return usesThis?[expression,receiver]:[expression];
  }

  /**
   * Resolve a local call target and expose its possible return expressions.
   * Unknown calls deliberately produce no local-value proof.
   * @param {AstNode} call
   * @param {Set<number>} [seen]
   * @returns {AstNode[]}
   */
  function callReturnExpressions(call,seen=new Set()) {
    if(call.type!=='CallExpression')return [];
    const directInvocation=localInvocationDetails(call);
    if(directInvocation?.kind==='bind')return [];
    const boundInvocation=boundInvocationForCallee(call.callee);
    /** @type {AstNode[]} */
    let targets=[];
    /** @type {AstNode|null} */
    let receiverOverride=null;
    let hasReceiverOverride=false;
    if(directInvocation) {
      targets=directInvocation.targets;
      receiverOverride=directInvocation.receiver;
      hasReceiverOverride=Boolean(receiverOverride);
    } else if(boundInvocation) {
      targets=boundInvocation.targets;
      receiverOverride=boundInvocation.receiver;
      hasReceiverOverride=Boolean(receiverOverride);
    } else if(call.callee.type==='Identifier') {
      const reference=resolved.at(call.callee.start);
      if(reference?.resolution.kind==='local') {
        const target=resolveFunctionNode(reference.resolution.bindingId);
        // A mutable local binding can hold several function values even when
        // it has no single declaration/const initializer. Union the direct
        // target with the value-flow resolver's possible callable targets.
        targets=[...(target?[target]:[]),...callableNodesForValue(call.callee,seen)];
      }
    } else if(call.callee.type==='MemberExpression') {
      const calleeKey=staticPropertyKey(call.callee.property,call.callee.computed);
      if(calleeKey==='bind')return [];
      targets=calleeKey===null?
        callableNodesForValue(call.callee.object,seen):
        callableNodesForMemberValue(call.callee.object,calleeKey,seen);
    } else if(['FunctionExpression','ArrowFunctionExpression'].includes(call.callee.type)) {
      targets=[call.callee];
    }
    // Negative source-position markers share this per-query guard with
    // nonnegative lexical BindingIds. They stop recursive local factory return
    // graphs without suppressing unrelated callable roots.
    const freshTargets=targets.filter(target=>{
      const marker=-target.start-1;
      if(seen.has(marker))return false;
      seen.add(marker);
      return true;
    });
    return [...new Set(freshTargets.flatMap(target=>[...functionReturnExpressions(target),...(target.generator?functionYieldExpressions(target):[])].flatMap(expression=>{
      // Arrows ignore call/apply/bind receivers; their this value comes from
      // the lexical receiver fixed point instead.
      if(target.type==='ArrowFunctionExpression') {
        const lexicalReceivers=receiverExpressionsByFunction.get(target)??[];
        return lexicalReceivers.length?
          lexicalReceivers.flatMap(receiver=>
            memberReturnExpressionsWithReceiver(expression,receiver,seen)):
          [expression];
      }
      if(hasReceiverOverride&&receiverOverride)
        return memberReturnExpressionsWithReceiver(expression,receiverOverride,seen);
      if(call.callee.type==='MemberExpression'&&!directInvocation)
        return memberReturnExpressionsWithReceiver(expression,call.callee.object,seen);
      return [expression];
    })))];
  }

  /** @param {AstNode} value @param {Set<number>} [seen] @returns {AstNode[]} */
  function classNodesForValue(value,seen=new Set()) {
    if(['ClassDeclaration','ClassExpression'].includes(value.type))return [value];
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return [];
      const bindingId=reference.resolution.bindingId;
      if(seen.has(bindingId))return [];
      const next=new Set(seen);
      next.add(bindingId);
      const direct=writtenBindings.has(bindingId)?null:classNodeByBinding.get(bindingId);
      if(direct)return [direct];
      const values=bindingValueExpressions.get(bindingId)??[];
      const initializer=constInitializersByBinding.get(bindingId);
      return [...new Set([
        ...values,
        ...(initializer?[initializer]:[])
      ].flatMap(candidate=>classNodesForValue(candidate,next)))];
    }
    if(value.type==='MemberExpression') {
      const propertyKey=staticPropertyKey(value.property,value.computed);
      return propertyKey===null?[]:
        classNodesForMemberValue(value.object,propertyKey,seen);
    }
    if(value.type==='ConditionalExpression')
      return [...new Set([
        ...classNodesForValue(value.consequent,seen),
        ...classNodesForValue(value.alternate,seen)
      ])];
    if(value.type==='LogicalExpression')
      return [...new Set([
        ...classNodesForValue(value.left,seen),
        ...classNodesForValue(value.right,seen)
      ])];
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return classNodesForValue(value.expressions[value.expressions.length-1],seen);
    if(value.type==='AssignmentExpression')
      return classNodesForValue(value.right,seen);
    if(value.type==='ChainExpression')
      return classNodesForValue(value.expression,seen);
    if(value.type==='AwaitExpression'&&value.argument)
      return classNodesForValue(value.argument,seen);
    if(value.type==='CallExpression')
      return [...new Set(callReturnExpressions(value,seen).flatMap(candidate=>
        classNodesForValue(candidate,seen)))];
    return [];
  }

  /**
   * Resolve a class-valued property through a local object/record value.
   * @param {AstNode} value
   * @param {string} propertyKey
   * @param {Set<number>} [seen]
   * @returns {AstNode[]}
   */
  function classNodesForMemberValue(value,propertyKey,seen=new Set()) {
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return [];
      const bindingId=reference.resolution.bindingId;
      if(seen.has(bindingId))return [];
      const next=new Set(seen);
      next.add(bindingId);
      const localValues=localRecordMemberValues.get(bindingId)?.get(propertyKey);
      if(localValues?.length)
        return [...new Set(localValues.flatMap(candidate=>classNodesForValue(candidate,next)))];
      const assignedValues=bindingValueExpressions.get(bindingId)??[];
      if(assignedValues.length)
        return [...new Set(assignedValues.flatMap(candidate=>
          classNodesForMemberValue(candidate,propertyKey,next)))];
      const initializer=constInitializersByBinding.get(bindingId);
      if(initializer)return classNodesForMemberValue(initializer,propertyKey,next);
      return [];
    }
    if(value.type==='ObjectExpression') {
      const matching=value.properties.filter((/** @type {AstNode} */ property)=>
        property.type==='Property'&&
        staticPropertyKey(property.key,property.computed)===propertyKey);
      if(matching.length)
        return [...new Set(matching.flatMap((/** @type {AstNode} */ property)=>
          property.kind==='init'?classNodesForValue(property.value,seen):
          property.kind==='get'?functionReturnExpressions(property.value)
            .flatMap(expression=>memberReturnExpressionsWithReceiver(expression,value,seen))
            .flatMap(candidate=>classNodesForValue(candidate,seen)):[]))];
      if(value.properties.some((/** @type {AstNode} */ property)=>property.type==='SpreadElement'))
        return [...new Set(value.properties.flatMap((/** @type {AstNode} */ property)=>
          property.type==='SpreadElement'?classNodesForValue(property.argument,seen):
          property.type==='Property'?classNodesForValue(property.value,seen):[]))];
      return [];
    }
    if(value.type==='ArrayExpression') {
      const index=Number(propertyKey);
      if(Number.isInteger(index)&&index>=0&&index<value.elements.length) {
        const element=value.elements[index];
        return element?classNodesForValue(element,seen):[];
      }
      return [];
    }
    if(value.type==='ConditionalExpression')
      return [...new Set([
        ...classNodesForMemberValue(value.consequent,propertyKey,seen),
        ...classNodesForMemberValue(value.alternate,propertyKey,seen)
      ])];
    if(value.type==='LogicalExpression')
      return [...new Set([
        ...classNodesForMemberValue(value.left,propertyKey,seen),
        ...classNodesForMemberValue(value.right,propertyKey,seen)
      ])];
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return classNodesForMemberValue(value.expressions[value.expressions.length-1],propertyKey,seen);
    if(value.type==='AssignmentExpression')
      return classNodesForMemberValue(value.right,propertyKey,seen);
    if(value.type==='ChainExpression')
      return classNodesForMemberValue(value.expression,propertyKey,seen);
    if(value.type==='SpreadElement')
      return classNodesForMemberValue(value.argument,propertyKey,seen);
    if(value.type==='AwaitExpression'&&value.argument)
      return classNodesForMemberValue(value.argument,propertyKey,seen);
    if(value.type==='CallExpression')
      return [...new Set(callReturnExpressions(value,seen).flatMap(candidate=>
        classNodesForMemberValue(candidate,propertyKey,seen)))];
    if(value.type==='MemberExpression') {
      const innerKey=staticPropertyKey(value.property,value.computed);
      if(innerKey===null)return [];
      const intermediate=memberValueExpressionsForProperty(value.object,innerKey,seen);
      return [...new Set(intermediate.flatMap(candidate=>
        classNodesForMemberValue(candidate,propertyKey,seen)))];
    }
    return [];
  }

  /**
   * Resolve the runtime value(s) produced by one statically named property
   * read. Accessors contribute their return expressions, not the getter
   * function itself; this preserves precision for primitive-returning getters.
   * @param {AstNode} classNode
   * @param {string} propertyKey
   * @param {Set<AstNode>} [seen]
   * @param {AstNode|null} [receiver]
   * @returns {AstNode[]}
   */
  /**
   * Recognize a narrow straight-line constructor write to one instance key.
   * Unknown control flow, calls, writes to other keys, or receiver-dependent
   * values remain opaque; callers then retain constructor and prototype
   * candidates rather than treating a possible override as proven.
   * @param {AstNode} classNode
   * @param {string} propertyKey
   * @returns {{opaque:boolean,values:AstNode[]}}
   */
  function classConstructorPropertyWrites(classNode,propertyKey) {
    const constructor=classNode.body.body.find((/** @type {AstNode} */ element)=>
      element.type==='MethodDefinition'&&element.kind==='constructor'&&
      !element.static&&element.value);
    if(!constructor)return {opaque:false,values:[]};
    const body=constructor.value.body;
    if(!body||body.type!=='BlockStatement')return {opaque:true,values:[]};
    /** @type {AstNode[]} */
    const values=[];
    for(const statement of body.body) {
      if(statement.type!=='ExpressionStatement')return {opaque:true,values};
      const expression=statement.expression;
      if(expression.type==='CallExpression'&&expression.callee.type==='Super'&&
         expression.arguments.length===0)continue;
      if(expression.type!=='AssignmentExpression'||expression.operator!=='='||
         expression.left.type!=='MemberExpression'||
         expression.left.object.type!=='ThisExpression')return {opaque:true,values};
      const key=staticPropertyKey(expression.left.property,expression.left.computed);
      if(key!==propertyKey)return {opaque:true,values};
      let receiverDependent=false;
      walkAst(expression.right,(/** @type {AstNode} */ node)=>{
        if(node.type==='ThisExpression'||node.type==='Super')receiverDependent=true;
      });
      if(receiverDependent||
         (!isDefinitelyPrimitive(expression.right)&&
          callableNodesForValue(expression.right).length===0))
        return {opaque:true,values};
      values.push(expression.right);
    }
    return {opaque:false,values};
  }

  /**
   * Resolve one instance property using JavaScript own-property precedence:
   * constructor writes run after fields, fields shadow prototype methods, and
   * only otherwise does lookup continue through the prototype chain.
   * @param {AstNode} classNode
   * @param {string} propertyKey
   * @param {Set<AstNode>} [seen]
   * @param {AstNode|null} [receiver]
   * @returns {AstNode[]}
   */
  function classMemberValueExpressionsForProperty(classNode,propertyKey,seen=newAstSeenSet(),receiver=null) {
    if(!['ClassDeclaration','ClassExpression'].includes(classNode.type)||seen.has(classNode))return [];
    const next=new Set(seen);
    next.add(classNode);
    const constructorWrites=classConstructorPropertyWrites(classNode,propertyKey);
    const matching=classNode.body.body.filter((/** @type {AstNode} */ element)=>
      (element.type==='MethodDefinition'||element.type==='PropertyDefinition')&&
      !element.static&&staticPropertyKey(element.key,element.computed)===propertyKey);
    const fields=matching.filter((/** @type {AstNode} */ element)=>
      element.type==='PropertyDefinition');
    const methods=matching.filter((/** @type {AstNode} */ element)=>
      element.type==='MethodDefinition');
    if(!constructorWrites.opaque&&constructorWrites.values.length)
      return [constructorWrites.values[constructorWrites.values.length-1]];
    if(constructorWrites.opaque) {
      const ownCandidates=matching.flatMap((/** @type {AstNode} */ element)=>{
        if(element.type==='PropertyDefinition')return element.value?[element.value]:[];
        if(element.type==='MethodDefinition'&&element.value) {
          if(element.kind==='method')return [element.value];
          if(element.kind==='get')return functionReturnExpressions(element.value).flatMap(expression=>
            receiver?memberReturnExpressionsWithReceiver(expression,receiver,newNumericSeenSet()):[expression]);
        }
        return [];
      });
      const parents=classNodesForValue(classNode.superClass??{type:'UnknownExpression'},newNumericSeenSet());
      const inherited=parents.flatMap(parent=>
        classMemberValueExpressionsForProperty(parent,propertyKey,next,receiver));
      const constructor=classNode.body.body.find((/** @type {AstNode} */ element)=>
        element.type==='MethodDefinition'&&element.kind==='constructor'&&
        !element.static&&element.value);
      return [...new Set([
        ...ownCandidates,
        ...(constructor?.value?[constructor.value]:[]),
        ...inherited
      ])];
    }
    if(fields.length) {
      const field=fields[fields.length-1];
      return field.value?[field.value]:[];
    }
    if(methods.length)
      return [...new Set(methods.flatMap((/** @type {AstNode} */ element)=>{
        if(!element.value)return [];
        if(element.kind==='method')return [element.value];
        if(element.kind==='get')return functionReturnExpressions(element.value).flatMap(expression=>
          receiver?memberReturnExpressionsWithReceiver(expression,receiver,newNumericSeenSet()):[expression]);
        return [];
      }))];
    const parents=classNodesForValue(classNode.superClass??{type:'UnknownExpression'},newNumericSeenSet());
    return [...new Set(parents.flatMap(parent=>
      classMemberValueExpressionsForProperty(parent,propertyKey,next,receiver)))];
  }

  /**
   * Resolve a statically named property through aliases, object literals,
   * class instances, factory returns, and nested member chains.
   * @param {AstNode} value
   * @param {string} propertyKey
   * @param {Set<number>} [seen]
   * @param {AstNode|null} [receiver]
   * @returns {AstNode[]}
   */
  function memberValueExpressionsForProperty(value,propertyKey,seen=new Set(),receiver=null) {    /** @type {Set<number>} */
    const numericSeen=new Set();
    for(const item of seen)if(typeof item==='number')numericSeen.add(item);

    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return [];
      const bindingId=reference.resolution.bindingId;
      if(numericSeen.has(bindingId))return [];
      const next=new Set(numericSeen);
      next.add(bindingId);
      const localValues=localRecordMemberValues.get(bindingId)?.get(propertyKey);
      if(localValues?.length)return localValues;
      const assignedValues=bindingValueExpressions.get(bindingId)??[];
      if(assignedValues.length)
        return [...new Set(assignedValues.flatMap(candidate=>
          memberValueExpressionsForProperty(candidate,propertyKey,next,receiver??candidate)))];
      const initializer=constInitializersByBinding.get(bindingId);
      if(initializer)return memberValueExpressionsForProperty(initializer,propertyKey,next,receiver??initializer);
      return [];
    }
    if(value.type==='NewExpression') {
      const actualReceiver=receiver??value;
      const classes=classNodesForValue(value.callee,numericSeen);
      if(classes.length)
        return [...new Set(classes.flatMap(classNode=>
          classMemberValueExpressionsForProperty(classNode,propertyKey,newAstSeenSet(),actualReceiver)))];
      // Unknown constructor forms retain the constructor callable itself.
      // This is deliberately conservative until their instance-field writes
      // can be resolved with the same property-specific proof as class fields.
      if(value.callee.type==='Identifier')
        return callableNodesForValue(value.callee,numericSeen);
      if(value.callee.type==='MemberExpression') {
        const calleeKey=staticPropertyKey(value.callee.property,value.callee.computed);
        return calleeKey===null?
          callableNodesForValue(value.callee.object,numericSeen):
          callableNodesForMemberValue(value.callee.object,calleeKey,numericSeen);
      }
      return [];
    }
    if(value.type==='ObjectExpression') {
      const actualReceiver=receiver??value;
      const matching=value.properties.filter((/** @type {AstNode} */ property)=>
        property.type==='Property'&&
        staticPropertyKey(property.key,property.computed)===propertyKey);
      let lastMatchingIndex=-1;
      for(let index=0;index<value.properties.length;index++) {
        const property=value.properties[index];
        if(property?.type==='Property'&&
           staticPropertyKey(property.key,property.computed)===propertyKey)
          lastMatchingIndex=index;
      }
      let dataProperty=null;
      let getterProperty=null;
      for(const property of matching) {
        if(property.kind==='init'||property.method) {
          dataProperty=property;
          getterProperty=null;
        } else if(property.kind==='get') {
          dataProperty=null;
          getterProperty=property;
        } else if(property.kind==='set') {
          dataProperty=null;
        }
      }
      const explicitValues=dataProperty?[dataProperty.value]:
        getterProperty?functionReturnExpressions(getterProperty.value).flatMap(expression=>
          memberReturnExpressionsWithReceiver(expression,actualReceiver,numericSeen)):[ ];
      // A later spread can overwrite an explicit key. An unknown computed key
      // can do the same even without a spread; only later candidates matter.
      const laterSpreadValues=value.properties.slice(lastMatchingIndex+1)
        .filter((/** @type {AstNode} */ property)=>property.type==='SpreadElement')
        .map((/** @type {AstNode} */ property)=>property.argument);
      const laterComputedValues=value.properties.slice(lastMatchingIndex+1)
        .filter((/** @type {AstNode} */ property)=>
          property.type==='Property'&&property.computed&&
          staticPropertyKey(property.key,property.computed)===null)
        .flatMap((/** @type {AstNode} */ property)=>
          property.kind==='init'?[property.value]:
          property.kind==='get'?functionReturnExpressions(property.value).flatMap(expression=>
            memberReturnExpressionsWithReceiver(expression,actualReceiver,numericSeen)):[]);
      const prototypeSetter=value.properties.find((/** @type {AstNode} */ property)=>
        property.type==='Property'&&property.kind==='init'&&!property.method&&
        !property.computed&&staticPropertyKey(property.key,false)==='__proto__');
      const prototypeValues=prototypeSetter?
        memberValueExpressionsForProperty(prototypeSetter.value,propertyKey,numericSeen,actualReceiver):[];
      if(matching.length||laterComputedValues.length)
        return [...new Set([
          ...explicitValues,...laterSpreadValues,...laterComputedValues,
          ...(matching.length?[]:prototypeValues)
        ])];
      if(prototypeValues.length)
        return [...new Set([...laterSpreadValues,...prototypeValues])];
      if(value.properties.some((/** @type {AstNode} */ property)=>property.type==='SpreadElement'))
        return value.properties.flatMap((/** @type {AstNode} */ property)=>
          property.type==='SpreadElement'?[property.argument]:
          property.type==='Property'?[property.value]:[]);
      return [];
    }
    if(value.type==='ArrayExpression') {
      const index=Number(propertyKey);
      if(!Number.isInteger(index)||index<0)return [];
      let position=0;
      for(let elementIndex=0;elementIndex<value.elements.length;elementIndex++) {
        const element=value.elements[elementIndex];
        if(element?.type==='SpreadElement') {
          // A spread before the requested index has unknown length. Any value
          // from that spread or a later element may occupy the runtime slot.
          if(position<=index) {
            /** @type {AstNode[]} */
            const candidates=[];
            for(let candidateIndex=elementIndex;candidateIndex<value.elements.length;candidateIndex++) {
              const candidate=value.elements[candidateIndex];
              if(candidate)candidates.push(candidate);
            }
            return candidates;
          }
          continue;
        }
        if(position===index)return element?[element]:[];
        position++;
      }
      return [];
    }
    if(value.type==='ConditionalExpression')
      return [...new Set([
        ...memberValueExpressionsForProperty(value.consequent,propertyKey,numericSeen),
        ...memberValueExpressionsForProperty(value.alternate,propertyKey,numericSeen)
      ])];
    if(value.type==='LogicalExpression')
      return [...new Set([
        ...memberValueExpressionsForProperty(value.left,propertyKey,numericSeen),
        ...memberValueExpressionsForProperty(value.right,propertyKey,numericSeen)
      ])];
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return memberValueExpressionsForProperty(value.expressions[value.expressions.length-1],propertyKey,numericSeen);
    if(value.type==='AssignmentExpression')
      return memberValueExpressionsForProperty(value.right,propertyKey,numericSeen);
    if(value.type==='ChainExpression')
      return memberValueExpressionsForProperty(value.expression,propertyKey,numericSeen);
    if(value.type==='SpreadElement')
      return memberValueExpressionsForProperty(value.argument,propertyKey,numericSeen);
    if(value.type==='AwaitExpression'&&value.argument)
      return memberValueExpressionsForProperty(value.argument,propertyKey,numericSeen);
    if(value.type==='CallExpression')
      return [...new Set(callReturnExpressions(value,numericSeen).flatMap(candidate=>
        memberValueExpressionsForProperty(candidate,propertyKey,numericSeen)))];
    if(value.type==='MemberExpression') {
      const innerKey=staticPropertyKey(value.property,value.computed);
      if(innerKey===null)return [];
      const intermediate=memberValueExpressionsForProperty(value.object,innerKey,numericSeen);
      return [...new Set(intermediate.flatMap(candidate=>
        memberValueExpressionsForProperty(candidate,propertyKey,numericSeen)))];
    }
    return [];
  }

  /**
   * Resolve callable values stored at one statically named member.
   * @param {AstNode} classNode
   * @param {string} propertyKey
   * @param {Set<AstNode>} [seen]
   * @returns {AstNode[]}
   */
  function classFieldCallablesForProperty(classNode,propertyKey,seen=new Set()) {
    return [...new Set(classMemberValueExpressionsForProperty(classNode,propertyKey,seen)
      .flatMap(value=>callableNodesForValue(value)))];
  }

  /**
   * Resolve a member read against possible object values while retaining a
   * known property key. Dynamic keys deliberately fall back to all callables.
   * @param {AstNode} value
   * @param {string} propertyKey
   * @param {Set<number>} [seen]
   * @returns {AstNode[]}
   */
  function callableNodesForMemberValue(value,propertyKey,seen=new Set()) {
    return [...new Set(memberValueExpressionsForProperty(value,propertyKey,seen)
      .flatMap(candidate=>callableNodesForValue(candidate,seen)))];
  }

  /**
   * Resolve getter functions that may execute for a local property read.
   * @param {AstNode} value
   * @param {string} propertyKey
   * @param {Set<number>} [seen]
   * @returns {AstNode[]}
   */
  function getterNodesForMemberValue(value,propertyKey,seen=new Set()) {    /** @type {Set<number>} */
    const numericSeen=new Set();
    for(const item of seen)if(typeof item==='number')numericSeen.add(item);

    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return [];
      const bindingId=reference.resolution.bindingId;
      if(numericSeen.has(bindingId))return [];
      const next=new Set(numericSeen);
      next.add(bindingId);
      const values=bindingValueExpressions.get(bindingId)??[];
      if(values.length)return [...new Set(values.flatMap(candidate=>
        getterNodesForMemberValue(candidate,propertyKey,next)))];
      const initializer=constInitializersByBinding.get(bindingId);
      return initializer?getterNodesForMemberValue(initializer,propertyKey,next):[];
    }
    if(value.type==='ObjectExpression') {
      const matching=value.properties.filter((/** @type {AstNode} */ property)=>
        property.type==='Property'&&
        staticPropertyKey(property.key,property.computed)===propertyKey);
      let getter=null;
      let data=false;
      for(const property of matching) {
        if(property.kind==='init'||property.method) {
          data=true;
          getter=null;
        } else if(property.kind==='get') {
          data=false;
          getter=property.value;
        } else if(property.kind==='set') {
          data=false;
        }
      }
      if(matching.length)return !data&&getter?[getter]:[];
      const prototypeSetter=value.properties.find((/** @type {AstNode} */ property)=>
        property.type==='Property'&&property.kind==='init'&&!property.method&&
        !property.computed&&staticPropertyKey(property.key,false)==='__proto__');
      return prototypeSetter?
        getterNodesForMemberValue(prototypeSetter.value,propertyKey,numericSeen):[];
    }
    if(value.type==='NewExpression') {
      const classes=classNodesForValue(value.callee,numericSeen);
      return [...new Set(classes.flatMap(classNode=>
        classGetterNodesForProperty(classNode,propertyKey)))];
    }
    if(value.type==='ConditionalExpression')
      return [...new Set([...getterNodesForMemberValue(value.consequent,propertyKey,numericSeen),
        ...getterNodesForMemberValue(value.alternate,propertyKey,numericSeen)])];
    if(value.type==='LogicalExpression')
      return [...new Set([...getterNodesForMemberValue(value.left,propertyKey,numericSeen),
        ...getterNodesForMemberValue(value.right,propertyKey,numericSeen)])];
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return getterNodesForMemberValue(value.expressions[value.expressions.length-1],propertyKey,numericSeen);
    if(value.type==='AssignmentExpression')
      return getterNodesForMemberValue(value.right,propertyKey,numericSeen);
    if(value.type==='ChainExpression')
      return getterNodesForMemberValue(value.expression,propertyKey,numericSeen);
    if(value.type==='AwaitExpression'&&value.argument)
      return getterNodesForMemberValue(value.argument,propertyKey,numericSeen);
    if(value.type==='MemberExpression') {
      const innerKey=staticPropertyKey(value.property,value.computed);
      if(innerKey===null)return [];
      return [...new Set(memberValueExpressionsForProperty(value.object,innerKey,numericSeen).flatMap(candidate=>
        getterNodesForMemberValue(candidate,propertyKey,numericSeen)))];
    }
    if(value.type==='CallExpression')
      return [...new Set(callReturnExpressions(value,numericSeen).flatMap(candidate=>
        getterNodesForMemberValue(candidate,propertyKey,numericSeen)))];
    return [];
  }

  /** @param {AstNode} value @param {Set<number>} [seen] @returns {AstNode[]} */
  function allGetterNodesForMemberValue(value,seen=new Set()) {
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return [];
      const bindingId=reference.resolution.bindingId;
      if(seen.has(bindingId))return [];
      const next=new Set(seen);
      next.add(bindingId);
      const values=bindingValueExpressions.get(bindingId)??[];
      if(values.length)return [...new Set(values.flatMap(candidate=>
        allGetterNodesForMemberValue(candidate,next)))];
      const initializer=constInitializersByBinding.get(bindingId);
      return initializer?allGetterNodesForMemberValue(initializer,next):[];
    }
    if(value.type==='ObjectExpression') {
      const keys=[...new Set(value.properties.flatMap((/** @type {AstNode} */ property)=>
        property.type==='Property'?
          [staticPropertyKey(property.key,property.computed)].filter((/** @type {string|null} */ key)=>key!==null):[]))];
      const ownGetters=keys.flatMap(key=>getterNodesForMemberValue(value,key,seen));
      const prototypeSetter=value.properties.find((/** @type {AstNode} */ property)=>
        property.type==='Property'&&property.kind==='init'&&!property.method&&
        !property.computed&&staticPropertyKey(property.key,false)==='__proto__');
      const inherited=prototypeSetter?
        allGetterNodesForMemberValue(prototypeSetter.value,seen):[];
      return [...new Set([...ownGetters,...inherited])];
    }
    if(value.type==='NewExpression') {
      const classes=classNodesForValue(value.callee,seen);
      return [...new Set(classes.flatMap(classNode=>allClassGetterNodes(classNode)))];
    }
    if(value.type==='ConditionalExpression')
      return [...new Set([...allGetterNodesForMemberValue(value.consequent,seen),
        ...allGetterNodesForMemberValue(value.alternate,seen)])];
    if(value.type==='LogicalExpression')
      return [...new Set([...allGetterNodesForMemberValue(value.left,seen),
        ...allGetterNodesForMemberValue(value.right,seen)])];
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return allGetterNodesForMemberValue(value.expressions[value.expressions.length-1],seen);
    if(value.type==='AssignmentExpression')return allGetterNodesForMemberValue(value.right,seen);
    if(value.type==='ChainExpression')return allGetterNodesForMemberValue(value.expression,seen);
    if(value.type==='AwaitExpression'&&value.argument)
      return allGetterNodesForMemberValue(value.argument,seen);
    if(value.type==='MemberExpression') {
      const key=staticPropertyKey(value.property,value.computed);
      if(key===null)return [];
      return [...new Set(memberValueExpressionsForProperty(value.object,key,seen).flatMap(candidate=>
        allGetterNodesForMemberValue(candidate,seen)))];
    }
    if(value.type==='CallExpression')
      return [...new Set(callReturnExpressions(value,seen).flatMap(candidate=>
        allGetterNodesForMemberValue(candidate,seen)))];
    return [];
  }

  /** @param {AstNode} classNode @param {Set<AstNode>} [seen] @returns {AstNode[]} */
  function allClassGetterNodes(classNode,seen=new Set()) {
    if(seen.has(classNode))return [];
    const next=new Set(seen);
    next.add(classNode);
    const own=classNode.body.body.filter((/** @type {AstNode} */ element)=>
      element.type==='MethodDefinition'&&element.kind==='get'&&!element.static)
      .map((/** @type {AstNode} */ element)=>element.value);
    const parents=classNode.superClass?classNodesForValue(classNode.superClass,newNumericSeenSet()):[];
    return [...new Set([...own,...parents.flatMap(parent=>allClassGetterNodes(parent,next))])];
  }

  /** @param {AstNode} classNode @param {string} propertyKey @param {Set<AstNode>} [seen] @returns {AstNode[]} */
  function classGetterNodesForProperty(classNode,propertyKey,seen=new Set()) {
    if(seen.has(classNode))return [];
    const next=new Set(seen);
    next.add(classNode);
    const matching=classNode.body.body.filter((/** @type {AstNode} */ element)=>
      ['MethodDefinition','PropertyDefinition'].includes(element.type)&&!element.static&&
      staticPropertyKey(element.key,element.computed)===propertyKey);
    if(matching.length)return matching.filter((/** @type {AstNode} */ element)=>
      element.type==='MethodDefinition'&&element.kind==='get').map((/** @type {AstNode} */ element)=>element.value);
    if(!classNode.superClass)return [];
    const parents=classNodesForValue(classNode.superClass,newNumericSeenSet());
    return [...new Set(parents.flatMap(parent=>classGetterNodesForProperty(parent,propertyKey,next)))];
  }

  /** @param {AstNode} value @param {Set<number>} [seen] @returns {AstNode[]} */
  function callableNodesForValue(value,seen=new Set()) {
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(value.type))
      return [value];
    if(['ClassDeclaration','ClassExpression'].includes(value.type))
      return classMethodFunctions(value);
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return [];
      const bindingId=reference.resolution.bindingId;
      const direct=resolveFunctionNode(bindingId);
      if(direct&&!writtenBindings.has(bindingId))return [direct];
      const classNode=writtenBindings.has(bindingId)?null:classNodeByBinding.get(bindingId);
      if(classNode)return classMethodFunctions(classNode);
      if(seen.has(bindingId))return direct?[direct]:[];
      const next=new Set(seen);
      next.add(bindingId);
      const values=bindingValueExpressions.get(bindingId)??[];
      const fields=[...(localRecordMemberValues.get(bindingId)?.values()??[])].flat();
      const stored=fields.flatMap(candidate=>callableNodesForValue(candidate,next));
      const initialized=constInitializersByBinding.get(bindingId);
      return [...new Set([
        ...(direct?[direct]:[]),
        ...stored,
        ...values.flatMap(candidate=>callableNodesForValue(candidate,next)),
        ...(initialized?callableNodesForValue(initialized,next):[])
      ])];
    }
    if(value.type==='SpreadElement')return callableNodesForValue(value.argument,seen);
    if(value.type==='ArrayExpression')
      return [...new Set(value.elements.flatMap((/** @type {AstNode|null} */ element)=>
        element?callableNodesForValue(element,seen):[]))];
    if(value.type==='ObjectExpression') {
      const conservative=value.properties.some((/** @type {AstNode} */ property)=>
        property.type==='SpreadElement'||
        (property.type==='Property'&&property.computed&&
         staticPropertyKey(property.key,property.computed)===null)||
        (property.type==='Property'&&property.kind==='init'&&!property.method&&
         !property.computed&&staticPropertyKey(property.key,false)==='__proto__'));
      if(conservative)
        return [...new Set(value.properties.flatMap((/** @type {AstNode} */ property)=>
          property.type==='SpreadElement'?callableNodesForValue(property.argument,seen):
          property.type==='Property'?callableNodesForValue(property.value,seen):[]))];
      const keys=[...new Set(value.properties.flatMap((/** @type {AstNode} */ property)=>
        property.type==='Property'?
          [staticPropertyKey(property.key,property.computed)].filter((/** @type {string|null} */ key)=>key!==null):[]))];
      const values=keys.flatMap(key=>memberValueExpressionsForProperty(value,key,seen).filter(candidate=>candidate!==value));
      const getters=keys.flatMap(key=>getterNodesForMemberValue(value,key,seen));
      return [...new Set([...values.flatMap(candidate=>callableNodesForValue(candidate,seen)),...getters])];
    }
    if(value.type==='ConditionalExpression')
      return [...new Set([...callableNodesForValue(value.consequent,seen),
        ...callableNodesForValue(value.alternate,seen)])];
    if(value.type==='LogicalExpression')
      return [...new Set([...callableNodesForValue(value.left,seen),
        ...callableNodesForValue(value.right,seen)])];
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return callableNodesForValue(value.expressions[value.expressions.length-1],seen);
    if(value.type==='AssignmentExpression')return callableNodesForValue(value.right,seen);
    if(value.type==='ChainExpression')return callableNodesForValue(value.expression,seen);
    if(value.type==='AwaitExpression'&&value.argument)
      return callableNodesForValue(value.argument,seen);
    if(value.type==='CallExpression') {
      if(value.callee.type==='MemberExpression'&&
         staticPropertyKey(value.callee.property,value.callee.computed)==='bind')
        return callableNodesForValue(value.callee.object,seen);
      const returnedExpressions=callReturnExpressions(value,seen);
      /** @type {AstNode[]} */
      const returnedCallables=[];
      let unresolvedReturn=returnedExpressions.length===0;
      for(const expression of returnedExpressions) {
        const candidates=callableNodesForValue(expression,seen);
        returnedCallables.push(...candidates);
        if(!isDefinitelyPrimitive(expression)&&candidates.length===0)
          unresolvedReturn=true;
      }
      if(value.callee.type==='MemberExpression'&&unresolvedReturn) {
        // Unknown member calls (including built-in array accessors/mutators)
        // can return values held by their receiver. If local return flow does
        // not resolve every non-primitive branch, retain receiver callables.
        returnedCallables.push(...callableNodesForValue(value.callee.object,seen));
      }
      return [...new Set(returnedCallables)];
    }
    if(value.type==='NewExpression') {
      const classes=classNodesForValue(value.callee,seen);
      if(classes.length)
        return [...new Set(classes.flatMap(classNode=>classMethodFunctions(classNode)))];
      if(value.callee.type==='Identifier')
        return callableNodesForValue(value.callee,seen);
      if(value.callee.type==='MemberExpression') {
        const calleeKey=staticPropertyKey(value.callee.property,value.callee.computed);
        return calleeKey===null?
          callableNodesForValue(value.callee.object,seen):
          callableNodesForMemberValue(value.callee.object,calleeKey,seen);
      }
      return [];
    }
    if(value.type==='MemberExpression') {
      const propertyKey=staticPropertyKey(value.property,value.computed);
      if(value.object.type==='Identifier'&&value.object.name==='arguments'&&propertyKey==='callee') {
        const reference=resolved.at(value.object.start);
        if(reference?.resolution.kind==='unknown'&&
           reference.resolution.reason==='unproven-free-name') {
          let current=value;
          while(parentByNode.has(current)) {
            const parent=parentByNode.get(current);
            if(!parent)break;
            if(parent.type==='FunctionDeclaration'||parent.type==='FunctionExpression')return [parent];
            current=parent;
          }
        }
      }
      if(propertyKey!==null)
        return callableNodesForMemberValue(value.object,propertyKey,seen);
      if(value.object.type==='Identifier') {
        const reference=resolved.at(value.object.start);
        if(reference?.resolution.kind==='local') {
          const bindingId=reference.resolution.bindingId;
          if(seen.has(bindingId))return [];
          const next=new Set(seen);
          next.add(bindingId);
          const assignedValues=bindingValueExpressions.get(bindingId)??[];
          const stored=[...(localRecordMemberValues.get(bindingId)?.values()??[])].flat();
          const initializer=constInitializersByBinding.get(bindingId);
          const values=[...assignedValues,...stored,...(initializer?[initializer]:[])];
          if(values.length)
            return [...new Set(values.flatMap(candidate=>callableNodesForValue(candidate,next)))];
        }
      }
      // For a dynamic key on a non-identifier receiver, first resolve the
      // receiver expression itself. This composes the conservative fallback
      // through nested member reads and factory-call results.
      const receiverCallables=value.object.type==='Identifier'?[]:
        callableNodesForValue(value.object,seen);
      /** @type {AstNode[]} */
      const candidates=[];
      walkAst(value,(node,parent)=>{
        if(node.type!=='Identifier'||
           (parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed)||
           (parent?.type==='CallExpression'&&parent.callee===node))return;
        const reference=resolved.at(node.start);
        if(reference?.resolution.kind!=='local')return;
        const bindingId=reference.resolution.bindingId;
        const classNode=classNodeByBinding.get(bindingId);
        if(classNode)candidates.push(...classMethodFunctions(classNode));
        const initializer=initializerForBinding(bindingId);
        if(initializer&&['ObjectExpression','ArrayExpression','NewExpression','ClassExpression'].includes(initializer.type))
          candidates.push(...callableNodesForValue(initializer,seen));
      });
      return [...new Set([...receiverCallables,...candidates])];
    }
    return [];
  }

  /**
   * @param {AstNode} fn
   * @returns {boolean}
   */
  /**
   * Determine whether an expression is proved to denote only local function
   * values. Object records containing methods are not function values.
   * @param {AstNode} value
   * @param {Set<number>} [seen]
   * @returns {boolean}
   */
  function isStaticallyFunctionValue(value,seen=new Set()) {
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(value.type))
      return true;
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return false;
      const bindingId=reference.resolution.bindingId;
      if(seen.has(bindingId)||writtenBindings.has(bindingId))return false;
      const direct=resolveFunctionNode(bindingId);
      if(direct)return true;
      const next=new Set(seen);
      next.add(bindingId);
      const initializer=initializerForBinding(bindingId);
      if(initializer)return isStaticallyFunctionValue(initializer,next);
      const values=bindingValueExpressions.get(bindingId)??[];
      return values.length>0&&values.every(candidate=>
        isStaticallyFunctionValue(candidate,next));
    }
    if(value.type==='MemberExpression') {
      const key=staticPropertyKey(value.property,value.computed);
      if(key===null)return false;
      const values=memberValueExpressionsForProperty(value.object,key,seen);
      return values.length>0&&values.every(candidate=>
        isStaticallyFunctionValue(candidate,seen));
    }
    if(value.type==='ConditionalExpression')
      return isStaticallyFunctionValue(value.consequent,seen)&&
        isStaticallyFunctionValue(value.alternate,seen);
    if(value.type==='LogicalExpression')
      return isStaticallyFunctionValue(value.left,seen)&&
        isStaticallyFunctionValue(value.right,seen);
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return isStaticallyFunctionValue(value.expressions[value.expressions.length-1],seen);
    if(value.type==='AssignmentExpression')
      return isStaticallyFunctionValue(value.right,seen);
    if(value.type==='ChainExpression')
      return isStaticallyFunctionValue(value.expression,seen);
    if(value.type==='AwaitExpression'&&value.argument)
      return isStaticallyFunctionValue(value.argument,seen);
    return false;
  }

  /**
   * Resolve only a literal or immutable local array argument list for apply.
   * Unknown/spread lists remain ordinary fail-closed call arguments.
   * @param {AstNode|null} value
   * @returns {{known:boolean,actuals:AstNode[]}}
   */
  function applyArgumentElements(value) {
    if(!value||(value.type==='Literal'&&value.value===null))
      return {known:true,actuals:[]};
    let candidate=value;
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind==='local')
        candidate=initializerForBinding(reference.resolution.bindingId)??value;
    }
    if(candidate.type!=='ArrayExpression'||
       candidate.elements.some((/** @type {AstNode|null} */ element)=>!element||element.type==='SpreadElement'))
      return {known:false,actuals:[]};
    return {known:true,actuals:candidate.elements};
  }

  /**
   * Recognize local function invocation through standard call/apply/bind
   * intrinsics. This path is disabled when the source mutates those intrinsics,
   * introduces dynamic name interception, or leaves the target's arguments
   * unmodelled.
   * @param {AstNode} call
   * @returns {{kind:'call'|'apply'|'bind'|'reflect-apply',targets:AstNode[],receiver:AstNode|null,receiverArgument:AstNode|null,targetArgument:AstNode|null,argumentList:AstNode|null,actuals:AstNode[],actualsKnown:boolean}|null}
   */
  function localInvocationDetails(call) {
    if(call.type!=='CallExpression'||!callLikeIntrinsicsUnmodified)return null;
    /** @type {'call'|'apply'|'bind'|'reflect-apply'|null} */
    let kind=null;
    /** @type {AstNode|null} */
    let targetValue=null;
    /** @type {AstNode|null} */
    let receiverArgument=null;
    /** @type {AstNode|null} */
    let targetArgument=null;
    /** @type {AstNode|null} */
    let argumentList=null;
    /** @type {AstNode[]} */
    let actuals=[];
    let actualsKnown=true;
    if(call.callee.type==='MemberExpression') {
      const key=staticPropertyKey(call.callee.property,call.callee.computed);
      if(call.callee.object.type==='Identifier'&&
         call.callee.object.name==='Reflect'&&key==='apply') {
        const reference=resolved.at(call.callee.object.start);
        if(reference?.resolution.kind!=='unknown'||
           reference.resolution.reason!=='unproven-free-name')return null;
        kind='reflect-apply';
        targetArgument=call.arguments[0]??null;
        targetValue=targetArgument;
        receiverArgument=call.arguments[1]??null;
        argumentList=call.arguments[2]??null;
      } else if(key==='call'||key==='apply'||key==='bind') {
        kind=key;
        targetValue=call.callee.object;
        receiverArgument=call.arguments[0]??null;
        if(kind==='call'||kind==='bind') {
          actuals=call.arguments.slice(1);
          actualsKnown=actuals.every(argument=>argument.type!=='SpreadElement');
        } else {
          argumentList=call.arguments[1]??null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }
    if(!targetValue||!isStaticallyFunctionValue(targetValue))return null;
    const targets=callableNodesForValue(targetValue);
    if(targets.length!==1||hasUnmodelledArgumentAccess(targets[0]))return null;
    if(receiverArgument?.type==='SpreadElement')return null;
    if(kind==='apply'||kind==='reflect-apply') {
      const resolvedArguments=applyArgumentElements(argumentList);
      actuals=resolvedArguments.actuals;
      actualsKnown=resolvedArguments.known;
    }
    if(kind===null)return null;
    return {
      kind,
      targets,
      receiver:receiverArgument,
      receiverArgument,
      targetArgument,
      argumentList,
      actuals,
      actualsKnown
    };
  }

  /**
   * Resolve a bound-function initializer when it is invoked through a local
   * const identifier or immediately invoked bind expression.
   * @param {AstNode} callee
   * @returns {ReturnType<typeof localInvocationDetails>}
   */
  function boundInvocationForCallee(callee) {
    if(callee.type==='CallExpression') {
      const details=localInvocationDetails(callee);
      return details?.kind==='bind'?details:null;
    }
    if(callee.type==='Identifier') {
      const reference=resolved.at(callee.start);
      if(reference?.resolution.kind!=='local')return null;
      const initializer=initializerForBinding(reference.resolution.bindingId);
      if(initializer?.type==='CallExpression') {
        const details=localInvocationDetails(initializer);
        return details?.kind==='bind'?details:null;
      }
    }
    return null;
  }

  /** @param {AstNode} fn @returns {boolean} */
  function hasUnmodelledArgumentAccess(fn) {
    let found=false;
    walkAst(fn,node=>{
      if(node.type==='WithStatement')found=true;
      if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='eval') {
        const reference=resolved.at(node.callee.start);
        if(reference?.resolution.kind==='unknown'&&reference.resolution.reason==='unproven-free-name')found=true;
      }
      if(node.type==='Identifier'&&node.name==='arguments') {
        const reference=resolved.at(node.start);
        if(reference?.resolution.kind!=='unknown'||reference.resolution.reason!=='unproven-free-name')return;
        let current=node;
        while(parentByNode.has(current)) {
          const parent=parentByNode.get(current);
          if(!parent)break;
          if(parent.type==='FunctionDeclaration'||parent.type==='FunctionExpression') {
            if(parent===fn)found=true;
            break;
          }
          current=parent;
        }
      }
    });
    return found;
  }

  /** @type {WeakSet<AstNode>} */
  const locallyMappedCallArguments=new WeakSet();
  walkAst(ast,node=>{
    if(node.type!=='CallExpression')return;
    let target=null;
    /** @type {AstNode[]} */
    let actuals=node.arguments;
    let actualsKnown=true;
    /** @type {AstNode[]} */
    const skippedArguments=[];
    if(node.callee.type==='Identifier') {
      const reference=resolved.at(node.callee.start);
      if(reference?.resolution.kind==='local')
        target=resolveFunctionNode(reference.resolution.bindingId);
    } else {
      const invocation=localInvocationDetails(node);
      if(invocation) {
        target=invocation.targets[0]??null;
        actuals=invocation.actuals;
        actualsKnown=invocation.actualsKnown;
        if(invocation.receiverArgument)skippedArguments.push(invocation.receiverArgument);
        if(invocation.targetArgument)skippedArguments.push(invocation.targetArgument);
        if(invocation.argumentList&&invocation.actualsKnown)
          skippedArguments.push(invocation.argumentList);
      }
    }
    if(!target||hasUnmodelledArgumentAccess(target))return;
    for(const argument of skippedArguments)
      locallyMappedCallArguments.add(argument);
    if(!actualsKnown)return;
    const params=target.params??[];
    const restIndex=params.findIndex((/** @type {AstNode} */ param)=>param.type==='RestElement');
    for(let i=0;i<actuals.length;i++) {
      const argument=actuals[i];
      if(argument.type==='SpreadElement')continue;
      // Rest-element arrays are not decomposed into element-level value flows;
      // leave those actuals unmapped so the call-site sink fails closed.
      if(restIndex>=0&&i>=restIndex)continue;
      const param=params[i]??null;
      if(!param) {
        // Extra arguments are not observable without an implicit arguments object.
        locallyMappedCallArguments.add(argument);
        continue;
      }
      let bindingNode=param;
      if(param.type==='AssignmentPattern')bindingNode=param.left;
      if(param.type==='RestElement')continue;
      if(bindingNode.type!=='Identifier')continue;
      const bindingId=declarationByNode.get(bindingNode)?.bindingId??null;
      if(bindingId!==null) {
        addBindingValueExpression(bindingId,argument);
        locallyMappedCallArguments.add(argument);
      }
    }
  });

  /** @param {AstNode} value @param {Set<number>} [seen] @returns {boolean} */
  function isDefinitelyObjectExpression(value,seen=new Set()) {
    if(['ObjectExpression','ArrayExpression','FunctionDeclaration','FunctionExpression',
        'ArrowFunctionExpression','ClassDeclaration','ClassExpression','NewExpression'].includes(value.type))
      return true;
    if(value.type==='Literal')return Boolean(value.regex);
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind!=='local')return false;
      const bindingId=reference.resolution.bindingId;
      if(seen.has(bindingId))return false;
      const values=bindingValueExpressions.get(bindingId)??[];
      if(!values.length)return false;
      const next=new Set(seen);
      next.add(bindingId);
      return values.every(candidate=>isDefinitelyObjectExpression(candidate,next));
    }
    return false;
  }

  /** @type {Map<AstNode,Set<number>>} */
  const nodeBindingIds=new Map();
  for(const fn of allFunctionNodes)nodeBindingIds.set(fn,new Set());
  for(const [bindingId,fn] of functionNodeByBinding) {
    const ids=nodeBindingIds.get(fn)??new Set();
    ids.add(bindingId);
    nodeBindingIds.set(fn,ids);
  }
  for(const bindingId of aliasTargets.keys()) {
    const fn=resolveFunctionNode(bindingId);
    if(fn) {
      const ids=nodeBindingIds.get(fn)??new Set();
      ids.add(bindingId);
      nodeBindingIds.set(fn,ids);
      if(topLevelScriptBindings.has(bindingId))externallyReachableFunctions.add(fn);
    }
  }
  if(sourceType==='script') {
    walkAst(ast,(node,parent)=>{
      if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'&&
         !isWithinFunctionOrClass(node)) {
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null)nodeBindingIds.get(node)?.add(id);
      }
      const globalScriptVariable=node.type==='VariableDeclarator'&&
        parent?.type==='VariableDeclaration'&&node.id.type==='Identifier'&&node.init&&
        (parentByNode.get(parent)===ast||(parent.kind==='var'&&!isWithinFunctionOrClass(node)));
      if(globalScriptVariable) {
        const id=declarationByNode.get(node.id)?.bindingId??null;
        if(id!==null)nodeBindingIds.get(node.init)?.add(id);
      }
    });
  }

  /** @type {Map<AstNode,Array<{target:AstNode,start:number,end:number}>>} */
  const callEdges=new Map();
  /** @type {Set<AstNode>} */
  const dynamicFrameFunctions=new Set();
  /** @type {Set<AstNode>} */
  const hostHeldFunctions=new Set();
  /** @type {Map<AstNode,Map<string,AmbientCallReason>>} */
  const reasonsByFunction=new Map();
  /**
   * @param {AstNode} fn
   * @param {AmbientCallReason} reason
   * @param {'DynamicFrame'|'HostHeldCallable'|'ExternalReachability'} [effect]
   * @returns {void}
   */
  function addReason(fn,reason,effect='DynamicFrame') {
    const reasons=reasonsByFunction.get(fn)??new Map();
    const row={...reason,effect};
    const key=[effect,row.kind,row.start,row.end,row.targetStart??''].join(':');
    reasons.set(key,row);
    reasonsByFunction.set(fn,reasons);
    if(effect==='DynamicFrame')dynamicFrameFunctions.add(fn);
    else if(effect==='HostHeldCallable')hostHeldFunctions.add(fn);
  }

  /** @type {Map<AstNode,AstNode[]>} */
  const receiverExpressionsByFunction=new Map();
  /** @param {AstNode} fn @param {AstNode} receiver @returns {boolean} */
  function addReceiverExpression(fn,receiver) {
    const receivers=receiverExpressionsByFunction.get(fn)??[];
    if(receivers.includes(receiver))return false;
    receivers.push(receiver);
    receiverExpressionsByFunction.set(fn,receivers);
    return true;
  }
  /** @param {AstNode|null|undefined} value @param {AstNode|null} fn @returns {AstNode[]} */
  /**
   * Resolve callable values in the lexical receiver environment of a known
   * function. This follows local aliases and value containers so an arrow's
   * captured this is not lost merely because its result was assigned or wrapped.
   * @param {AstNode|null|undefined} value
   * @param {AstNode|null} fn
   * @param {Set<unknown>} [seen]
   * @returns {AstNode[]}
   */
  function callableNodesForValueWithReceiver(value,fn,seen=new Set()) {
    if(!value)return [];
    const invocation=localInvocationDetails(value);
    if(invocation?.kind==='bind') {
      const boundCallables=invocation.targets.flatMap(target=>{
        const returned=functionReturnExpressions(target).flatMap(expression=>{
          if(target.type==='ArrowFunctionExpression') {
            const lexicalReceivers=receiverExpressionsByFunction.get(target)??[];
            return lexicalReceivers.flatMap(receiver=>
              memberReturnExpressionsWithReceiver(expression,receiver,newNumericSeenSet())
                .flatMap(candidate=>callableNodesForValueWithReceiver(candidate,target,new Set(seen))));
          }
          if(!invocation.receiver)return [];
          return memberReturnExpressionsWithReceiver(expression,invocation.receiver,newNumericSeenSet())
            .flatMap(candidate=>callableNodesForValueWithReceiver(candidate,target,new Set(seen)));
        });
        return [target,...returned];
      });
      return [...new Set(boundCallables)];
    }
    // Ordinary functions have dynamic this. Never borrow the receiver of the
    // function that merely contains or returns this function value.
    if(value.type==='FunctionDeclaration'||value.type==='FunctionExpression')
      return callableNodesForValue(value);
    // Arrows capture this from their lexical parent. Resolve that capture from
    // the arrow's own receiver set, not from an arbitrary enclosing caller.
    if(value.type==='ArrowFunctionExpression') {
      if(seen.has(value))return callableNodesForValue(value);
      const receivers=receiverExpressionsByFunction.get(value)??[];
      if(!receivers.length)return callableNodesForValue(value);
      const next=new Set(seen);
      next.add(value);
      const contextual=functionReturnExpressions(value).flatMap(expression=>
        callableNodesForValueWithReceiver(expression,value,next));
      return [...new Set([...contextual,...callableNodesForValue(value)])];
    }
    if(value.type==='Identifier') {
      const reference=resolved.at(value.start);
      if(reference?.resolution.kind==='local') {
        const bindingId=reference.resolution.bindingId;
        if(!seen.has(bindingId)) {
          const next=new Set(seen);
          next.add(bindingId);
          const initializer=constInitializersByBinding.get(bindingId);
          const stored=[...(localRecordMemberValues.get(bindingId)?.values()??[])].flat();
          const candidates=[
            ...(bindingValueExpressions.get(bindingId)??[]),
            ...stored,
            ...(initializer?[initializer]:[])
          ];
          const contextual=candidates.flatMap(candidate=>
            callableNodesForValueWithReceiver(candidate,fn,next));
          if(contextual.length)
            return [...new Set([...contextual,...callableNodesForValue(value)])];
        }
      }
    }
    if(value.type==='CallExpression') {
      const invocation=localInvocationDetails(value);
      const targets=invocation&&invocation.kind!=='bind'?invocation.targets:callableNodesForValue(value.callee);
      let hasReceiverBoundTarget=false;
      const receiverBoundCallables=targets.flatMap(target=>{
        if(target.type!=='ArrowFunctionExpression'||seen.has(target))return [];
        const receivers=receiverExpressionsByFunction.get(target)??[];
        if(!receivers.length)return [];
        hasReceiverBoundTarget=true;
        const next=new Set(seen);
        next.add(target);
        return receivers.flatMap(receiver=>
          functionReturnExpressions(target).flatMap(expression=>
            memberReturnExpressionsWithReceiver(expression,receiver,newNumericSeenSet()).flatMap(candidate=>
              callableNodesForValueWithReceiver(candidate,target,next))));
      });
      if(hasReceiverBoundTarget) {
        return [...new Set([
          ...receiverBoundCallables,
          ...callableNodesForValue(value)
        ])];
      }
    }
    if(value.type==='ObjectExpression') {
      const conservative=value.properties.some((/** @type {AstNode} */ property)=>
        property.type==='SpreadElement'||
        (property.type==='Property'&&property.computed&&
         staticPropertyKey(property.key,property.computed)===null)||
        (property.type==='Property'&&property.kind==='init'&&!property.method&&
         !property.computed&&staticPropertyKey(property.key,false)==='__proto__'));
      if(conservative) {
        const nested=value.properties.flatMap((/** @type {AstNode} */ property)=>
          property.type==='SpreadElement'?
            callableNodesForValueWithReceiver(property.argument,fn,seen):
            property.type==='Property'?
              callableNodesForValueWithReceiver(property.value,fn,seen):[]);
        return [...new Set([...nested,...callableNodesForValue(value)])];
      }
      const keys=[...new Set(value.properties.flatMap((/** @type {AstNode} */ property)=>
        property.type==='Property'?
          [staticPropertyKey(property.key,property.computed)].filter((/** @type {string|null} */ key)=>key!==null):[]))];
      /** @type {Set<number>} */
      /** @type {Set<number>} */
          const propertySeen=new Set();
      for(const item of seen)if(typeof item==='number')propertySeen.add(item);
      const candidates=keys.flatMap(key=>memberValueExpressionsForProperty(value,key,propertySeen).filter(candidate=>candidate!==value));
      const nested=candidates.flatMap(candidate=>
        callableNodesForValueWithReceiver(candidate,fn,seen));
      const getters=keys.flatMap(key=>getterNodesForMemberValue(value,key,propertySeen));
      return [...new Set([...nested,...getters])];
    }
    if(value.type==='ArrayExpression') {
      const nested=value.elements.flatMap((/** @type {AstNode|null} */ element)=>
        element?callableNodesForValueWithReceiver(element,fn,seen):[]);
      return [...new Set([...nested,...callableNodesForValue(value)])];
    }
    if(value.type==='ConditionalExpression')
      return [...new Set([
        ...callableNodesForValueWithReceiver(value.consequent,fn,seen),
        ...callableNodesForValueWithReceiver(value.alternate,fn,seen),
        ...callableNodesForValue(value)
      ])];
    if(value.type==='LogicalExpression')
      return [...new Set([
        ...callableNodesForValueWithReceiver(value.left,fn,seen),
        ...callableNodesForValueWithReceiver(value.right,fn,seen),
        ...callableNodesForValue(value)
      ])];
    if(value.type==='SequenceExpression'&&value.expressions.length)
      return callableNodesForValueWithReceiver(value.expressions[value.expressions.length-1],fn,seen);
    if(value.type==='AssignmentExpression')
      return callableNodesForValueWithReceiver(value.right,fn,seen);
    if(value.type==='ChainExpression')
      return callableNodesForValueWithReceiver(value.expression,fn,seen);
    if(value.type==='SpreadElement')
      return callableNodesForValueWithReceiver(value.argument,fn,seen);
    if(value.type==='AwaitExpression'&&value.argument)
      return callableNodesForValueWithReceiver(value.argument,fn,seen);
    let usesThis=false;
    walkAst(value,node=>{if(node.type==='ThisExpression'||node.type==='Super')usesThis=true;});
    if(!usesThis)return callableNodesForValue(value);
    const receivers=fn?receiverExpressionsByFunction.get(fn)??[]:[];
    if(!receivers.length)return callableNodesForValue(value);
    return [...new Set(receivers.flatMap(receiver=>
      memberReturnExpressionsWithReceiver(value,receiver,newNumericSeenSet()).flatMap(candidate=>
        callableNodesForValue(candidate))))];
  }
  /** @param {AstNode|null|undefined} value @param {AmbientCallReason['kind']} kind @param {number} start @param {number} end @returns {void} */
  function markCallableValuesHeld(value,kind,start,end) {
    if(!value)return;
    for(const target of callableNodesForValueWithReceiver(value,enclosingFunction(value)))
      addReason(target,{kind,start,end},'HostHeldCallable');
  }

  /**
   * Find a same-function catch target for a throw. Throws from nested callable
   * bodies are not caught lexically by an enclosing try, so function/class
   * boundaries stop this lookup.
   * @param {AstNode} thrown
   * @returns {{caught:boolean,bindingId:number|null}|null}
   */
  function localCatchForThrow(thrown) {
    let child=thrown;
    let current=thrown;
    while(parentByNode.has(current)) {
      const parent=parentByNode.get(current);
      if(!parent)break;
      if(parent.type==='TryStatement'&&parent.block===child&&parent.handler) {
        if(!parent.handler.param)return {caught:true,bindingId:null};
        if(parent.handler.param.type==='Identifier') {
          const declaration=declarationByNode.get(parent.handler.param);
          if(declaration?.bindingId!==null&&declaration?.bindingId!==undefined)
            return {caught:true,bindingId:declaration.bindingId};
        }
        return null;
      }
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
          'ClassDeclaration','ClassExpression','MethodDefinition','PropertyDefinition',
          'StaticBlock'].includes(parent.type))return null;
      child=parent;
      current=parent;
    }
    return null;
  }

  /**
   * @param {AstNode} node
   * @param {AstNode} ancestor
   * @returns {boolean}
   */
  function isWithinNode(node,ancestor) {
    /** @type {AstNode|undefined} */
    let current=node;
    while(current) {
      if(current===ancestor)return true;
      current=parentByNode.get(current);
    }
    return false;
  }

  const HOST_GLOBAL_ROOT_NAMES=new Set(['globalThis','window','self','global']);

  /** @param {AstNode} left @returns {boolean} */
  function hasThisMemberRoot(left) {
    if(left.type!=='MemberExpression')return false;
    let root=left;
    while(root.type==='MemberExpression')root=root.object;
    return root.type==='ThisExpression';
  }

  /** @param {AstNode} left @returns {boolean} */
  function isHostGlobalExportTarget(left) {
    if(left.type!=='MemberExpression')return false;
    let root=left;
    while(root.type==='MemberExpression')root=root.object;
    if(root.type==='ThisExpression') {
      if(sourceType!=='script'&&sourceType!=='commonjs')return false;
      let ancestor=root;
      while(parentByNode.has(ancestor)) {
        const parent=parentByNode.get(ancestor);
        if(!parent)break;
        ancestor=parent;
        if(['FunctionDeclaration','FunctionExpression','ClassDeclaration','ClassExpression',
            'MethodDefinition','PropertyDefinition','StaticBlock'].includes(ancestor.type))return false;
      }
      return true;
    }
    if(root.type!=='Identifier')return false;
    const reference=resolved.at(root.start);
    if(reference?.resolution.kind==='local') {
      const initializer=initializerForBinding(reference.resolution.bindingId);
      if(initializer?.type!=='Identifier'||!HOST_GLOBAL_ROOT_NAMES.has(initializer.name))return false;
      const initializerReference=resolved.at(initializer.start);
      return initializerReference?.resolution.kind!=='local';
    }
    return HOST_GLOBAL_ROOT_NAMES.has(root.name);
  }

  /** @param {AstNode} left @returns {boolean} */
  function isCommonJsExportTarget(left) {
    if(left.type==='Identifier'&&left.name==='exports') {
      const reference=resolved.at(left.start);
      return reference?.resolution.kind!=='local';
    }
    if(left.type!=='MemberExpression')return false;
    /** @type {(string|null)[]} */
    const keys=[];
    let root=left;
    while(root.type==='MemberExpression') {
      keys.unshift(staticPropertyKey(root.property,root.computed));
      root=root.object;
    }
    if(root.type!=='Identifier')return false;
    const reference=resolved.at(root.start);
    if(reference?.resolution.kind==='local')return false;
    if(root.name==='exports')return true;
    return root.name==='module'&&(keys.length===0||keys[0]==='exports'||keys[0]===null);
  }

  // Bind method/getter function nodes to every statically known receiver at their
  // call/read sites. Iterate to a fixed point so this.method() and this.getter
  // chains inside a known method inherit the outer method's receiver.
  let receiverMapChanged=true;
  while(receiverMapChanged) {
    receiverMapChanged=false;
    walkAst(ast,node=>{
      if(node.type==='ArrowFunctionExpression') {
        const outer=enclosingFunction(node);
        for(const receiver of outer?receiverExpressionsByFunction.get(outer)??[]:[])
          if(addReceiverExpression(node,receiver))receiverMapChanged=true;
      }
      if(node.type==='CallExpression') {
        const invocation=localInvocationDetails(node);
        if(invocation) {
          for(const target of invocation.targets) {
            if(target.type!=='ArrowFunctionExpression'&&invocation.receiver&&
               addReceiverExpression(target,invocation.receiver))
              receiverMapChanged=true;
          }
        } else if(node.callee.type==='MemberExpression') {
          const ownerFunction=enclosingFunction(node);
          const receiverCandidates=node.callee.object.type==='ThisExpression'||
            node.callee.object.type==='Super'?
            ownerFunction?receiverExpressionsByFunction.get(ownerFunction)??[]:[]:
            [node.callee.object];
          const key=staticPropertyKey(node.callee.property,node.callee.computed);
          for(const receiver of receiverCandidates) {
            const targets=key===null?callableNodesForValue(receiver):
              callableNodesForMemberValue(receiver,key);
            for(const target of targets) {
              if(target.type==='ArrowFunctionExpression')continue;
              if(addReceiverExpression(target,receiver))receiverMapChanged=true;
            }
          }
        }
      }
      if(node.type==='NewExpression') {
        const classes=classNodesForValue(node.callee);
        if(classes.length) {
          for(const classNode of classes) {
            const constructors=classNode.body.body.filter((/** @type {AstNode} */ element)=>
              element.type==='MethodDefinition'&&element.kind==='constructor');
            for(const constructor of constructors)
              if(addReceiverExpression(constructor.value,node))receiverMapChanged=true;
          }
        } else {
          for(const target of callableNodesForValue(node.callee))
            if(target.type!=='ArrowFunctionExpression'&&addReceiverExpression(target,node))receiverMapChanged=true;
        }
      }
      if(node.type==='MemberExpression') {
        const ownerFunction=enclosingFunction(node);
        const receiverCandidates=node.object.type==='ThisExpression'||node.object.type==='Super'?
          ownerFunction?receiverExpressionsByFunction.get(ownerFunction)??[]:[]:[node.object];
        const key=staticPropertyKey(node.property,node.computed);
        for(const receiver of receiverCandidates) {
          const getters=key===null?allGetterNodesForMemberValue(receiver):
            getterNodesForMemberValue(receiver,key);
          for(const getter of getters)
            if(addReceiverExpression(getter,receiver))receiverMapChanged=true;
        }
      }
    });
  }
  /** @param {AstNode} value @param {number} start @param {number} end @returns {void} */
  function markExternalCallableValue(value,start,end) {
    for(const target of callableNodesForValue(value)) {
      externallyReachableFunctions.add(target);
      addReason(target,{kind:'module-exported-callable',start,end},'ExternalReachability');
    }
  }

  // Module exports and CommonJS wrapper exports are callable escape roots.
  for(const reference of resolved.references) {
    if(reference.role==='export-local')
      markExternalCallableValue(reference.node,reference.start,reference.end);
  }
  walkAst(ast,node=>{
    if(node.type==='ExportNamedDeclaration'&&node.declaration) {
      if(node.declaration.type==='VariableDeclaration') {
        for(const declarator of node.declaration.declarations)
          if(declarator.init)markExternalCallableValue(declarator.init,node.start,node.end);
      } else {
        markExternalCallableValue(node.declaration,node.start,node.end);
      }
    } else if(node.type==='ExportDefaultDeclaration'&&node.declaration) {
      markExternalCallableValue(node.declaration,node.start,node.end);
    } else if(node.type==='AssignmentExpression'&&isCommonJsExportTarget(node.left)) {
      markExternalCallableValue(node.right,node.start,node.end);
    } else if(node.type==='AssignmentExpression'&&isHostGlobalExportTarget(node.left)) {
      for(const target of callableNodesForValue(node.right)) {
        externallyReachableFunctions.add(target);
        addReason(target,{kind:'host-global-exported-callable',start:node.start,end:node.end},'ExternalReachability');
      }
    } else if(node.type==='AssignmentExpression'&&hasThisMemberRoot(node.left)) {
      for(const target of callableNodesForValue(node.right))
        addReason(target,{kind:'unknown-this-callable-escape',start:node.start,end:node.end},'HostHeldCallable');
    } else if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression') {
      // Unknown object-field writes may publish a callable into host-owned
      // or aliased storage. A same-function, own-data local record write is
      // tracked as a private field value and is held only if that value escapes.
      if(!isLocalRecordMemberAccess(node.left)&&!isProvenShadowedLocalPrototypeWrite(node))
        markCallableValuesHeld(node.right,'host-held-callable',node.start,node.end);
    }
  });

  for(const fn of externallyReachableFunctions)
    addReason(fn,{kind:'classic-script-global-lexical',start:fn.start,end:fn.end},'ExternalReachability');

  // An externally reachable function may expose additional callable values
  // by returning them. Follow that return closure from exports and global
  // roots; concise arrow bodies have no ReturnStatement sink of their own.
  /** @type {Array<{target:AstNode,source:AstNode}>} */
  const externalReturnQueue=[];
  for(const source of externallyReachableFunctions) {
    for(const returned of functionReturnExpressions(source)) {
      for(const target of callableNodesForValueWithReceiver(returned,source))
        externalReturnQueue.push({target,source});
    }
    for(const yielded of functionYieldExpressions(source)) {
      for(const target of callableNodesForValueWithReceiver(yielded,source))
        externalReturnQueue.push({target,source});
    }
  }
  /** @type {Set<AstNode>} */
  const externalReturnSeen=new Set();
  for(let cursor=0;cursor<externalReturnQueue.length;cursor++) {
    const item=externalReturnQueue[cursor];
    if(!item||externalReturnSeen.has(item.target))continue;
    externalReturnSeen.add(item.target);
    addReason(item.target,{
      kind:'returned-callable-value',start:item.source.start,end:item.source.end,
      targetStart:item.source.start
    },'HostHeldCallable');
    for(const returned of functionReturnExpressions(item.target)) {
      for(const target of callableNodesForValueWithReceiver(returned,item.target))
        externalReturnQueue.push({target,source:item.target});
    }
    for(const yielded of functionYieldExpressions(item.target)) {
      for(const target of callableNodesForValueWithReceiver(yielded,item.target))
        externalReturnQueue.push({target,source:item.target});
    }
  }

  // Callable values may escape through host calls, return values, wrappers,
  // coercion hooks, thenable assimilation, and reflection. Keep these value
  // edges separate from DynamicFrame propagation.
  const COERCIVE_BINARY_OPERATORS=new Set([
    '+','-','*','/','%','**','==','!=','<','>','<=','>=','|','&','^','<<','>>','>>>'
  ]);
  const COERCIVE_ASSIGNMENT_OPERATORS=new Set([
    '+=','-=','*=','/=','%=','**=','<<=','>>=','>>>=','&=','|=','^='
  ]);
  /** @param {AstNode} node @returns {boolean} */
  function binaryMayCoerce(node) {
    return !(['==','!='].includes(node.operator)&&
      isDefinitelyObjectExpression(node.left)&&isDefinitelyObjectExpression(node.right));
  }
  walkAst(ast,node=>{
    if(node.type==='CallExpression'||node.type==='NewExpression') {
      let knownLocalTarget=null;
      if(node.type==='CallExpression'&&!node.optional) {
        if(node.callee.type==='Identifier') {
          const reference=resolved.at(node.callee.start);
          if(reference?.resolution.kind==='local')
            knownLocalTarget=resolveFunctionNode(reference.resolution.bindingId);
          else if(node.callee.name==='eval') {
            for(const target of allFunctionNodes)
              addReason(target,{kind:'direct-eval-local-scope',start:node.start,end:node.end},'HostHeldCallable');
          }
        } else {
          const invocation=localInvocationDetails(node);
          if(invocation)knownLocalTarget=invocation.targets[0]??null;
        }
      }
      for(const argument of node.arguments) {
        if(node.type==='CallExpression'&&knownLocalTarget&&locallyMappedCallArguments.has(argument))continue;
        for(const target of callableNodesForValueWithReceiver(argument,enclosingFunction(node)))
          addReason(target,{
            kind:knownLocalTarget?'unresolved-callable-argument-flow':'host-held-callable',
            start:node.start,end:node.end
          },'HostHeldCallable');
      }
    } else if(node.type==='TaggedTemplateExpression') {
      for(const expression of node.quasi.expressions)
        markCallableValuesHeld(expression,'host-held-callable',node.start,node.end);
    } else if(node.type==='MemberExpression') {
      const propertyKey=staticPropertyKey(node.property,node.computed);
      if(propertyKey&&CALLABLE_OBSERVER_PROPERTIES.has(propertyKey))
        markCallableValuesHeld(node.object,'callable-metadata-observer',node.start,node.end);
      if(node.computed&&!isDefinitelyPrimitive(node.property))
        markCallableValuesHeld(node.property,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='PropertyDefinition') {
      // Most class fields remain fail-closed. Defer only public own-data
      // instance fields on an immutable, method-free class with no superclass;
      // class/instance escape sinks recover their callable initializers.
      if(node.value&&!isDeferredClassField(node))
        markCallableValuesHeld(node.value,'host-held-callable',node.start,node.end);
      if(node.computed&&!isDefinitelyPrimitive(node.key))
        markCallableValuesHeld(node.key,'callable-coercion-observer',node.start,node.end);
    } else if((node.type==='Property'||node.type==='MethodDefinition')&&
              node.computed&&!isDefinitelyPrimitive(node.key)) {
      markCallableValuesHeld(node.key,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='BinaryExpression'&&node.operator==='in') {
      if(!isDefinitelyPrimitive(node.left))
        markCallableValuesHeld(node.left,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='BinaryExpression'&&node.operator==='instanceof') {
      markCallableValuesHeld(node.right,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='BinaryExpression'&&COERCIVE_BINARY_OPERATORS.has(node.operator)&&binaryMayCoerce(node)) {
      if(!isDefinitelyPrimitive(node.left))
        markCallableValuesHeld(node.left,'callable-coercion-observer',node.start,node.end);
      if(!isDefinitelyPrimitive(node.right))
        markCallableValuesHeld(node.right,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='TemplateLiteral') {
      for(const expression of node.expressions)
        if(!isDefinitelyPrimitive(expression))
          markCallableValuesHeld(expression,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='UnaryExpression'&&['+','-','~'].includes(node.operator)&&
              !isDefinitelyPrimitive(node.argument)) {
      markCallableValuesHeld(node.argument,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='UpdateExpression'&&!isDefinitelyPrimitive(node.argument)) {
      markCallableValuesHeld(node.argument,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='AssignmentExpression'&&COERCIVE_ASSIGNMENT_OPERATORS.has(node.operator)) {
      if(!isDefinitelyPrimitive(node.left))
        markCallableValuesHeld(node.left,'callable-coercion-observer',node.start,node.end);
      if(!isDefinitelyPrimitive(node.right))
        markCallableValuesHeld(node.right,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='AwaitExpression'&&node.argument&&!isDefinitelyPrimitive(node.argument)) {
      markCallableValuesHeld(node.argument,'callable-coercion-observer',node.start,node.end);
    } else if(node.type==='ThrowStatement'&&node.argument) {
      // Keep a same-function catch local when its binding is explicit; if the
      // catch later returns/passes/observes the value, normal value-flow sinks
      // will mark the underlying callable as held. Unmatched or untracked
      // exception boundaries remain fail-closed.
      const localCatch=localCatchForThrow(node);
      if(localCatch?.caught) {
        if(localCatch.bindingId!==null)
          addBindingValueExpression(localCatch.bindingId,node.argument);
      } else {
        markCallableValuesHeld(node.argument,'thrown-callable-value',node.start,node.end);
      }
    } else if(node.type==='ForOfStatement') {
      markCallableValuesHeld(node.right,'host-held-callable',node.start,node.end);
    } else if(node.type==='WithStatement') {
      markCallableValuesHeld(node.object,'host-held-callable',node.start,node.end);
      // A with-object Proxy can intercept lexical names in the body. The
      // current resolver does not provide a sound binding map for every
      // intercepted reference, so retain callable sources in the lexical
      // function scopes visible to this WithStatement. Do not taint function-
      // local bindings confined to an unrelated sibling function.
      const accessibleScopes=new Set();
      let scope=enclosingFunction(node);
      while(scope) {
        accessibleScopes.add(scope);
        scope=enclosingFunction(scope);
      }
      accessibleScopes.add(null);
      for(const target of allFunctionNodes) {
        if(accessibleScopes.has(enclosingFunction(target)))
          addReason(target,{kind:'with-binding-lookup',start:node.start,end:node.end},'HostHeldCallable');
      }
    } else if(node.type==='ObjectPattern'||node.type==='ArrayPattern') {
      const parent=parentByNode.get(node);
      if(parent?.type==='VariableDeclarator'&&parent.init)
        markCallableValuesHeld(parent.init,'host-held-callable',node.start,node.end);
      else if(parent?.type==='AssignmentExpression')
        markCallableValuesHeld(parent.right,'host-held-callable',node.start,node.end);
    } else if(node.type==='AssignmentPattern'&&node.left.type!=='Identifier'&&node.right) {
      // Complex parameter defaults are not yet decomposed into per-binding
      // flows; fail closed on callable values in the default expression.
      markCallableValuesHeld(node.right,'host-held-callable',node.start,node.end);
    } else if(node.type==='DebuggerStatement') {
      for(const target of allFunctionNodes)
        addReason(target,{kind:'debugger-local-scope',start:node.start,end:node.end},'HostHeldCallable');
    }
  });

  // A host-held closure can expose callable values captured from its lexical
  // environment. Propagate that capability to a fixed point across nested
  // escaping closures; non-escaping closures do not seed this queue.
  const heldClosureQueue=[...hostHeldFunctions];
  const processedHeldClosures=new Set();
  while(heldClosureQueue.length) {
    const fn=heldClosureQueue.shift();
    if(!fn||processedHeldClosures.has(fn))continue;
    processedHeldClosures.add(fn);
    walkExecutableFunctionBody(fn,node=>{
      if(node.type!=='Identifier')return;
      const reference=resolved.at(node.start);
      if(reference?.resolution.kind!=='local')return;
      const bindingId=reference.resolution.bindingId;
      const declarations=declarationsByBinding.get(bindingId)??[];
      if(declarations.some(declaration=>isWithinNode(declaration.node,fn)))return;
      for(const target of callableNodesForValue(node)) {
        const wasHeld=hostHeldFunctions.has(target);
        addReason(target,{
          kind:'closure-captured-callable-value',
          start:node.start,end:node.end,targetStart:fn.start
        },'HostHeldCallable');
        if(!wasHeld)heldClosureQueue.push(target);
      }
    });
    // Returned callables escape only when their containing function is
    // itself host-held. Local returns remain local until a caller or an
    // export/host boundary proves that the value escapes.
    for(const returned of functionReturnExpressions(fn)) {
      for(const target of callableNodesForValueWithReceiver(returned,fn)) {
        const wasHeld=hostHeldFunctions.has(target);
        addReason(target,{
          kind:'returned-callable-value',start:returned.start,end:returned.end,
          targetStart:fn.start
        },'HostHeldCallable');
        if(!wasHeld)heldClosureQueue.push(target);
      }
    }
    for(const yielded of functionYieldExpressions(fn)) {
      for(const target of callableNodesForValueWithReceiver(yielded,fn)) {
        const wasHeld=hostHeldFunctions.has(target);
        addReason(target,{
          kind:'yielded-callable-value',start:yielded.start,end:yielded.end,
          targetStart:fn.start
        },'HostHeldCallable');
        if(!wasHeld)heldClosureQueue.push(target);
      }
    }
  }

  for(const fn of nodeBindingIds.keys()) {
    /** @type {Array<{target:AstNode,start:number,end:number}>} */
    const edges=[];
    walkExecutableFunctionBody(fn,node=>{
      if(node.type==='DebuggerStatement')
        addReason(fn,{kind:'debugger-inspection',start:node.start,end:node.end});
      if(node.type==='CallExpression') {
        if(!node.optional&&node.callee.type==='Identifier') {
          const reference=resolved.at(node.callee.start);
          if(reference?.resolution.kind==='local') {
            const target=resolveFunctionNode(reference.resolution.bindingId);
            if(target)edges.push({target,start:node.start,end:node.end});
            else addReason(fn,{kind:'unresolved-local-call',start:node.start,end:node.end});
          } else {
            addReason(fn,{kind:'unknown-call',start:node.start,end:node.end});
          }
        } else {
          addReason(fn,{kind:'unknown-call',start:node.start,end:node.end});
        }
      } else if(node.type==='NewExpression') {
        addReason(fn,{kind:'new-expression',start:node.start,end:node.end});
      } else if(node.type==='TaggedTemplateExpression') {
        addReason(fn,{kind:'tagged-template',start:node.start,end:node.end});
      } else if(node.type==='AwaitExpression'&&
                !isDefinitelyPrimitive(node.argument)) {
        addReason(fn,{kind:'await',start:node.start,end:node.end});
      } else if(node.type==='YieldExpression') {
        addReason(fn,{kind:'yield',start:node.start,end:node.end});
      } else if(node.type==='ImportExpression') {
        addReason(fn,{kind:'dynamic-import',start:node.start,end:node.end});
      } else if(node.type==='WithStatement') {
        addReason(fn,{kind:'with-binding-lookup',start:node.start,end:node.end});
      } else if(node.type==='ForOfStatement') {
        addReason(fn,{kind:'implicit-iterator',start:node.start,end:node.end});
      } else if(node.type==='ForInStatement') {
        addReason(fn,{kind:'implicit-object-enumeration',start:node.start,end:node.end});
      } else if(node.type==='ObjectPattern'||node.type==='ArrayPattern') {
        addReason(fn,{kind:'implicit-destructuring',start:node.start,end:node.end});
      } else if(node.type==='SpreadElement') {
        addReason(fn,{kind:'implicit-spread',start:node.start,end:node.end});
      } else if(node.type==='BinaryExpression'&&node.operator==='in') {
        addReason(fn,{kind:'implicit-proxy-has',start:node.start,end:node.end});
      } else if(node.type==='BinaryExpression'&&node.operator==='instanceof') {
        addReason(fn,{kind:'implicit-instanceof',start:node.start,end:node.end});
      } else if(node.type==='UnaryExpression'&&node.operator==='delete'&&
                node.argument.type==='MemberExpression') {
        addReason(fn,{kind:'implicit-delete',start:node.start,end:node.end});
      } else if(node.type==='MemberExpression') {
        if(node.computed&&!isDefinitelyPrimitive(node.property))
          addReason(fn,{kind:'to-property-key',start:node.start,end:node.end});
        if(!isPlainRecordMemberRead(node)&&!isLocalRecordMemberAccess(node))
          addReason(fn,{kind:'unknown-member-access',start:node.start,end:node.end});
        const propertyKey=staticPropertyKey(node.property,node.computed);
        if(propertyKey&&CALLABLE_OBSERVER_PROPERTIES.has(propertyKey)) {
          for(const target of callableNodesForValue(node.object))
            addReason(target,{kind:'callable-metadata-observer',start:node.start,end:node.end},'HostHeldCallable');
        }
      } else if(node.type==='Property'&&node.computed&&
                !isDefinitelyPrimitive(node.key)) {
        addReason(fn,{kind:'to-property-key',start:node.start,end:node.end});
      } else if(node.type==='TemplateLiteral'&&
                node.expressions.some((/** @type {AstNode} */ expression)=>
                  !isDefinitelyPrimitive(expression))) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='BinaryExpression'&&
                ['+','-','*','/','%','**','==','!=','<','>','<=','>=','|','&','^','<<','>>','>>>'].includes(node.operator)&&
                binaryMayCoerce(node)&&(!isDefinitelyPrimitive(node.left)||
                 !isDefinitelyPrimitive(node.right))) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='UnaryExpression'&&['+','-','~'].includes(node.operator)&&
                !isDefinitelyPrimitive(node.argument)) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='UpdateExpression'&&!isDefinitelyPrimitive(node.argument)) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='AssignmentExpression'&&COERCIVE_ASSIGNMENT_OPERATORS.has(node.operator)&&
                !isDefinitelyPrimitive(node.left)) {
        addReason(fn,{kind:'to-primitive',start:node.start,end:node.end});
      } else if(node.type==='ReturnStatement'&&fn.async&&node.argument&&
                !isDefinitelyPrimitive(node.argument)) {
        addReason(fn,{kind:'promise-thenable-assimilation',start:node.start,end:node.end});
      }
    });
    callEdges.set(fn,edges);
  }

  let changed=true;
  while(changed) {
    changed=false;
    for(const [caller,edges] of callEdges) {
      if(dynamicFrameFunctions.has(caller))continue;
      const edge=edges.find(candidate=>dynamicFrameFunctions.has(candidate.target));
      if(edge) {
        addReason(caller,{
          kind:'transitive-local-call',start:edge.start,end:edge.end,
          targetStart:edge.target.start
        });
        changed=true;
      }
    }
  }

  const summaries=[...nodeBindingIds.keys()].sort((a,b)=>a.start-b.start).map(fn=>{
    const bindingIds=[...(nodeBindingIds.get(fn)??[])].sort((a,b)=>a-b);
    const bindingNames=[...new Set(bindingIds.flatMap(id=>
      (declarationsByBinding.get(id)??[]).map(declaration=>declaration.name)))].sort();
    const dynamicFrame=dynamicFrameFunctions.has(fn);
    const hostHeldCallable=hostHeldFunctions.has(fn);
    const externallyReachable=externallyReachableFunctions.has(fn);
    return {
      node:fn,start:fn.start,end:fn.end,bindingIds,bindingNames,
      ambient:dynamicFrame,dynamicFrame,hostHeldCallable,externallyReachable,
      safe:!dynamicFrame&&!hostHeldCallable&&!externallyReachable,
      reasons:[...(reasonsByFunction.get(fn)?.values()??[])].sort((a,b)=>
        a.start-b.start||a.kind.localeCompare(b.kind))
    };
  });
  const ambientBindingIds=summaries.filter(summary=>summary.dynamicFrame)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const hostHeldCallableBindingIds=summaries.filter(summary=>summary.hostHeldCallable)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const externallyReachableBindingIds=summaries.filter(summary=>summary.externallyReachable)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const unsafeBindingIds=summaries.filter(summary=>!summary.safe)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  const safeBindingIds=summaries.filter(summary=>summary.safe)
    .flatMap(summary=>summary.bindingIds).sort((a,b)=>a-b);
  return {summaries,ambientBindingIds,hostHeldCallableBindingIds,
    externallyReachableBindingIds,unsafeBindingIds,safeBindingIds};
}

module.exports={summarizeAmbientCallEffects};
