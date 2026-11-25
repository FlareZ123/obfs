'use strict';

const {resolveLexicalReferences}=require('./agent1-lexical-reference-resolver');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {'module'|'script'|'commonjs'} SourceType */
/** @typedef {{kind:'unknown-call'|'unresolved-local-call'|'new-expression'|'tagged-template'|'await'|'yield'|'dynamic-import'|'transitive-local-call'|'with-binding-lookup'|'implicit-iterator'|'implicit-object-enumeration'|'implicit-proxy-has'|'implicit-instanceof'|'implicit-delete'|'implicit-destructuring'|'implicit-spread'|'to-primitive'|'to-property-key'|'promise-thenable-assimilation'|'host-held-callable'|'thrown-callable-value'|'closure-captured-callable-value'|'unresolved-callable-argument-flow'|'returned-callable-value'|'callable-metadata-observer'|'callable-coercion-observer'|'direct-eval-local-scope'|'debugger-local-scope'|'debugger-inspection'|'classic-script-global-lexical'|'module-exported-callable'|'host-global-exported-callable'|'unknown-this-callable-escape'|'unknown-member-access',start:number,end:number,targetStart?:number,effect?:'DynamicFrame'|'HostHeldCallable'|'ExternalReachability'}} AmbientCallReason */
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
 * @returns {{summaries:AmbientCallSummary[],ambientBindingIds:number[],hostHeldCallableBindingIds:number[],externallyReachableBindingIds:number[],unsafeBindingIds:number[],safeBindingIds:number[]}}
 */
function summarizeAmbientCallEffects(ast,sourceType) {
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

  /** @param {AstNode} classNode @returns {boolean} */
  function classHasOnlyPublicInstanceFields(classNode) {
    if(classNode.superClass||classNode.body.body.length===0)return false;
    return classNode.body.body.every(element=>
      element.type==='PropertyDefinition'&&!element.static&&!element.computed&&
      element.key.type!=='PrivateIdentifier');
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
    if(!classNode||!classHasOnlyPublicInstanceFields(classNode))return false;
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
      if(direct)return [direct];
      const classNode=writtenBindings.has(bindingId)?null:classNodeByBinding.get(bindingId);
      if(classNode)return classMethodFunctions(classNode);
      if(seen.has(bindingId))return [];
      const next=new Set(seen);
      next.add(bindingId);
      const values=bindingValueExpressions.get(bindingId)??[];
      const fields=[...(localRecordMemberValues.get(bindingId)?.values()??[])].flat();
      const stored=fields.flatMap(candidate=>callableNodesForValue(candidate,next));
      if(values.length)
        return [...new Set([...stored,...values.flatMap(candidate=>callableNodesForValue(candidate,next))])];
      const initializer=constInitializersByBinding.get(bindingId);
      return [...new Set([...stored,...(initializer?callableNodesForValue(initializer,next):[])])];
    }
    if(value.type==='SpreadElement')return callableNodesForValue(value.argument,seen);
    if(value.type==='ArrayExpression')
      return [...new Set(value.elements.flatMap((/** @type {AstNode|null} */ element)=>
        element?callableNodesForValue(element,seen):[]))];
    if(value.type==='ObjectExpression')
      return [...new Set(value.properties.flatMap((/** @type {AstNode} */ property)=>
        property.type==='SpreadElement'?callableNodesForValue(property.argument,seen):
        property.type==='Property'?callableNodesForValue(property.value,seen):[]))];
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
    if(value.type==='CallExpression'&&value.callee.type==='MemberExpression'&&
       staticPropertyKey(value.callee.property,value.callee.computed)==='bind')
      return callableNodesForValue(value.callee.object,seen);
    if(value.type==='NewExpression') {
      if(value.callee.type==='Identifier') {
        const reference=resolved.at(value.callee.start);
        if(reference?.resolution.kind==='local') {
          const bindingId=reference.resolution.bindingId;
          const classNode=writtenBindings.has(bindingId)?null:classNodeByBinding.get(bindingId);
          if(classNode)return classMethodFunctions(classNode);
          const values=bindingValueExpressions.get(bindingId)??[];
          return [...new Set(values.flatMap(candidate=>callableNodesForValue(candidate,seen)))];
        }
      }
      return [];
    }
    if(value.type==='MemberExpression') {
      const propertyKey=staticPropertyKey(value.property,value.computed);
      if(value.object.type==='Identifier'&&propertyKey!==null) {
        const reference=resolved.at(value.object.start);
        if(reference?.resolution.kind==='local') {
          const bindingId=reference.resolution.bindingId;
          const values=localRecordMemberValues.get(bindingId)?.get(propertyKey);
          if(values?.length) {
            if(seen.has(bindingId))return [];
            const next=new Set(seen);
            next.add(bindingId);
            return [...new Set(values.flatMap(candidate=>callableNodesForValue(candidate,next)))];
          }
        }
      }
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
      return [...new Set(candidates)];
    }
    return [];
  }

  /**
   * @param {AstNode} fn
   * @returns {boolean}
   */
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
    if(node.type!=='CallExpression'||node.callee.type!=='Identifier')return;
    const reference=resolved.at(node.callee.start);
    if(reference?.resolution.kind!=='local')return;
    const target=resolveFunctionNode(reference.resolution.bindingId);
    if(!target||hasUnmodelledArgumentAccess(target))return;
    const params=target.params??[];
    const restIndex=params.findIndex((/** @type {AstNode} */ param)=>param.type==='RestElement');
    for(let i=0;i<node.arguments.length;i++) {
      const argument=node.arguments[i];
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

  /** @param {AstNode|null|undefined} value @param {AmbientCallReason['kind']} kind @param {number} start @param {number} end @returns {void} */
  function markCallableValuesHeld(value,kind,start,end) {
    if(!value)return;
    for(const target of callableNodesForValue(value))
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
      if(!isLocalRecordMemberAccess(node.left))
        markCallableValuesHeld(node.right,'host-held-callable',node.start,node.end);
    }
  });

  for(const fn of externallyReachableFunctions)
    addReason(fn,{kind:'classic-script-global-lexical',start:fn.start,end:fn.end},'ExternalReachability');

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
      if(node.type==='CallExpression'&&!node.optional&&node.callee.type==='Identifier') {
        const reference=resolved.at(node.callee.start);
        if(reference?.resolution.kind==='local')
          knownLocalTarget=resolveFunctionNode(reference.resolution.bindingId);
        else if(node.callee.name==='eval') {
          for(const target of allFunctionNodes)
            addReason(target,{kind:'direct-eval-local-scope',start:node.start,end:node.end},'HostHeldCallable');
        }
      }
      for(const argument of node.arguments) {
        if(node.type==='CallExpression'&&knownLocalTarget&&locallyMappedCallArguments.has(argument))continue;
        for(const target of callableNodesForValue(argument))
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
    } else if(node.type==='YieldExpression'&&node.argument) {
      markCallableValuesHeld(node.argument,'returned-callable-value',node.start,node.end);
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
    } else if(node.type==='ReturnStatement'&&node.argument) {
      markCallableValuesHeld(node.argument,'returned-callable-value',node.start,node.end);
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
  }

  for(const fn of nodeBindingIds.keys()) {
    /** @type {Array<{target:AstNode,start:number,end:number}>} */
    const edges=[];
    walkExecutableFunctionBody(fn,node=>{
      if(node.type==='DebuggerStatement')
        addReason(fn,{kind:'debugger-inspection',start:node.start,end:node.end});
      if(node.type==='ReturnStatement'&&node.argument) {
        for(const target of callableNodesForValue(node.argument))
          addReason(target,{kind:'returned-callable-value',start:node.start,end:node.end},'HostHeldCallable');
      }
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
