'use strict';

const {createHash} = require('node:crypto');
const {parse, walk, applyEdits, observesFunctionSource, staticString, sourceSpelledErrorOperand} = require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * Collect every declared name, including names shadowed in inner scopes.
 * Requiring exactly one declaration of a tracked name is a deliberately strict
 * safety gate that avoids inventing a partial lexical resolver.
 * @param {AstNode} ast
 * @returns {Map<string,number>}
 */
function collectBindings(ast) {
  const counts = new Map();
  /** @param {AstNode|null|undefined} node */
  function pattern(node) {
    if (!node) return;
    if (node.type === 'Identifier') counts.set(node.name, (counts.get(node.name) || 0) + 1);
    else if (node.type === 'RestElement' || node.type === 'AssignmentPattern') pattern(node.argument || node.left);
    else if (node.type === 'ArrayPattern') for (const element of node.elements) pattern(element);
    else if (node.type === 'ObjectPattern') for (const property of node.properties) pattern(property.type === 'RestElement' ? property.argument : property.value);
  }
  walk(ast, node => {
    switch (node.type) {
      case 'VariableDeclarator': pattern(node.id); break;
      case 'FunctionDeclaration': case 'FunctionExpression':
        pattern(node.id);
        for (const param of node.params) pattern(param);
        break;
      case 'ArrowFunctionExpression': for (const param of node.params) pattern(param); break;
      case 'ClassDeclaration': case 'ClassExpression': pattern(node.id); break;
      case 'CatchClause': pattern(node.param); break;
      case 'ImportSpecifier': case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': pattern(node.local); break;
      default: break;
    }
  });
  return counts;
}

/**
 * Return a static, non-magic property name, or null if unknown.
 * @param {AstNode} node
 * @returns {string|null}
 */
function staticName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

/**
 * A literal object key is safe to rewrite only when its computed expression
 * is a side-effect-free constant string. The surrounding computed brackets
 * stay intact when the interior expression is replaced with a quoted name.
 * @param {AstNode} property
 * @returns {string|null}
 */
function ownPropertyName(property) {
  return property.computed ? staticString(property.key) : staticName(property.key);
}

/**
 * A direct pattern binding can retain its default expression unchanged:
 * lookup occurs against the same proven own property before and after the
 * name rewrite, so the default runs under identical value conditions.
 * The owner-usage scan separately rejects unproved references in defaults.
 * @param {AstNode} value
 * @returns {boolean}
 */
function isSimplePatternBinding(value) {
  return value.type === 'Identifier' ||
    value.type === 'AssignmentPattern' && value.left.type === 'Identifier';
}

/**
 * Primitive-only expression grammar. No identifier, call, member, spread,
 * update, await, tagged template, or receiver-dependent operation can enter.
 * JavaScript can evaluate these expressions without invoking user-defined
 * coercion or observing the private object's names. We preserve their source
 * without folding values, operator order, short-circuiting, or exceptions.
 * @param {AstNode} node
 * @param {boolean} [directBigInt] Whether the expression is standalone
 * @returns {boolean}
 */
function isPrimitiveConstantExpression(node,directBigInt=true) {
  // Preserve a primitive-only, side-effect-free expression grammar. Any
  // potentially throwing BigInt arithmetic must remain outside this proof.
  if(node.type==='Literal')return node.value===null||
    ['string','number','boolean'].includes(typeof node.value);
  if(node.type==='UnaryExpression') {
    // These five operators are defined on directly spelled BigInt literals.
    // Never pass such a value into another operator, even unary plus.
    if(node.argument.type==='Literal' && typeof node.argument.value==='bigint')
      return directBigInt && ['-','~','!','void','typeof'].includes(node.operator);
    return ['+','-','!','~','void','typeof'].includes(node.operator)&&
      isPrimitiveConstantExpression(node.argument,false);
  }
  if(node.type==='BinaryExpression')return     ['+','-','*','/','%','**','<<','>>','>>>','&','|','^',
      '==','!=','===','!==','<','<=','>','>='].includes(node.operator)&&
    isPrimitiveConstantExpression(node.left,false)&&
    isPrimitiveConstantExpression(node.right,false);
  if(node.type==='LogicalExpression')return     ['&&','||','??'].includes(node.operator)&&
    isPrimitiveConstantExpression(node.left,false)&&
    isPrimitiveConstantExpression(node.right,false);
  if(node.type==='ConditionalExpression')return     isPrimitiveConstantExpression(node.test,false)&&
    isPrimitiveConstantExpression(node.consequent,false)&&
    isPrimitiveConstantExpression(node.alternate,false);
  if(node.type==='SequenceExpression')return node.expressions.length>0&&
    node.expressions.every((/** @type {AstNode} */ value)=>
      isPrimitiveConstantExpression(value,false));
  if(node.type==='TemplateLiteral')return     node.expressions.every((/** @type {AstNode} */ value)=>
      isPrimitiveConstantExpression(value,false));
  return false;
}

/**
 * Recursively inert object/array initializers can safely carry pure primitive
 * expressions without exposing a receiver or changing initialization order.
 * RegExp literals retain the legacy literal-only admission behavior.
 * @param {AstNode} node
 * @returns {boolean}
 */
function isLiteralValue(node) {
  if(node.type==='Literal'||isPrimitiveConstantExpression(node))return true;
  if(node.type==='ArrayExpression') {
    return node.elements.every((/** @type {AstNode|null} */ element)=>element && isLiteralValue(element));
  }
  if(node.type==='ObjectExpression') {
    return node.properties.every((/** @type {AstNode} */ property)=>
      property.type==='Property' && property.kind==='init' &&
      !property.method && !property.shorthand &&
      ownPropertyName(property)!==null && isLiteralValue(property.value));
  }
  return false;
}

/**
 * A direct lexical parameter read does not infer a function name from its
 * enclosing object key. Restrict this local-owner extension to a unique
 * simple formal in the nearest function, avoiding unresolved names and
 * closure-scoped guesses. The separate owner-use proof still rejects escapes,
 * reflection, and source observers.
 * @param {AstNode} value
 * @param {AstNode[]} ancestors
 * @param {Map<string,number>} bindings
 * @returns {boolean}
 */
function isDirectParameterValue(value,ancestors,bindings) {
  if(value.type!=='Identifier'||bindings.get(value.name)!==1)return false;
  const fn=[...ancestors].reverse().find(node=>
    node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||
    node.type==='ArrowFunctionExpression');
  return Boolean(fn && fn.params.some((/** @type {AstNode} */ param)=>
    param.type==='Identifier'&&param.name===value.name));
}

/** @type {WeakMap<AstNode,Map<string,AstNode>>} */
const bindingScopeCache=new WeakMap();
/** @type {WeakMap<AstNode,AstNode[]>} */
const constantDeclaratorsCache=new WeakMap();

/**
 * Reuse root-independent proof facts across candidate owners in one immutable
 * parsed AST. The per-owner fixed point, lexical gates, and edit decisions
 * remain independently checked for every candidate.
 * @type {WeakMap<AstNode,ReturnType<typeof collectProofInventory>>}
 */
const proofInventoryCache=new WeakMap();

/**
 * @param {AstNode} ast
 * @returns {{
 *   calls:Map<string,AstNode[]>, declarations:AstNode[], declarationSet:Set<AstNode>,
 *   identifiers:{node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[],order:number}[],
 *   identifierUses:Map<string,{node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[],order:number}[]>,
 *   parents:WeakMap<AstNode,AstNode>, dynamicScope:boolean,
 *   functionDeclarations:AstNode[], callableDeclarators:AstNode[],
 *   directInvokedArrows:AstNode[],
 *   directAliasDeclarations:Map<string,AstNode[]>, complexAliasDeclarations:AstNode[],
 *   tupleDeclarations:Map<string,AstNode[]>,
 *   recordDeclarations:Map<string,AstNode[]>
 * }}
 */
function collectProofInventory(ast) {
  const cached=proofInventoryCache.get(ast);
  if(cached)return cached;
  /** @type {Map<string,AstNode[]>} */
  const calls=new Map();
  /** @type {AstNode[]} */
  const declarations=[];
  /** @type {{node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[],order:number}[]} */
  const identifiers=[];
  /** @type {Map<string,typeof identifiers>} */
  const identifierUses=new Map();
  /** @type {WeakMap<AstNode,AstNode>} */
  const parents=new WeakMap();
  /** @type {AstNode[]} */
  const functionDeclarations=[];
  /** @type {AstNode[]} */
  const callableDeclarators=[];
  /** @type {AstNode[]} */
  const directInvokedArrows=[];
  let dynamicScope=false;
  walk(ast,(node,parent,key,ancestors)=>{
    if(parent)parents.set(node,parent);
    if(node.type==='WithStatement' ||
       node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='eval')
      dynamicScope=true;
    if(node.type==='Identifier'){
      const entry={node,parent,key,ancestors,order:identifiers.length};
      identifiers.push(entry);
      const uses=identifierUses.get(node.name)??[];
      uses.push(entry);
      identifierUses.set(node.name,uses);
    }
    if(node.type==='VariableDeclaration'&&['const','let'].includes(node.kind))
      declarations.push(...node.declarations);
    if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier')
      functionDeclarations.push(node);
    // A directly invoked arrow never exposes its own callable value;
    // an enclosing exported callable remains separately source-observable.
    if(node.type==='ArrowFunctionExpression'&&
       parent?.type==='CallExpression'&&parent.callee===node&&
       !parent.optional)directInvokedArrows.push(node);
    if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&
       parent?.type==='VariableDeclaration'&&parent.kind==='const'&&node.init&&
       ['FunctionExpression','ArrowFunctionExpression'].includes(node.init.type))
      callableDeclarators.push(node);
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'){
      const sites=calls.get(node.callee.name)??[];
      sites.push(node);
      calls.set(node.callee.name,sites);
    }
  });
  const aliasDeclarations=declarations.filter(node=>node.init&&
    ['Identifier','MemberExpression','CallExpression'].includes(node.init.type));
  const complexAliasDeclarations=aliasDeclarations.filter(node=>node.init?.type!=='Identifier');
  // An immutable reverse index lets ordinary direct aliases use a queue per
  // candidate owner, avoiding a full scan of all declarations on each pass.
  /** @type {Map<string,AstNode[]>} */
  const directAliasDeclarations=new Map();
  for(const decl of aliasDeclarations){
    if(decl.id.type!=='Identifier'||decl.init?.type!=='Identifier')continue;
    const receivers=directAliasDeclarations.get(decl.init.name)??[];
    receivers.push(decl);
    directAliasDeclarations.set(decl.init.name,receivers);
  }
  /** @type {Map<string,AstNode[]>} */
  const tupleDeclarations=new Map();
  /** @type {Map<string,AstNode[]>} */
  const recordDeclarations=new Map();
  for(const node of declarations){
    const init=node.init;
    if(!init)continue;
    /** @type {Map<string,AstNode[]>|null} */
    const target=init.type==='ArrayExpression'?tupleDeclarations:
      init.type==='ObjectExpression'?recordDeclarations:null;
    if(!target)continue;
    const values=init.type==='ArrayExpression'?init.elements:
      init.properties.map((/** @type {AstNode} */ property)=>property.value);
    const names=new Set(values.filter((/** @type {AstNode|null} */ value)=>
      value?.type==='Identifier').map((/** @type {AstNode} */ value)=>value.name));
    for(const name of names){
      const list=target.get(name)??[];
      list.push(node);
      target.set(name,list);
    }
  }
  const inventory={calls,declarations,declarationSet:new Set(declarations),identifiers,identifierUses,parents,dynamicScope,
    functionDeclarations,callableDeclarators,directInvokedArrows,
    directAliasDeclarations,complexAliasDeclarations,tupleDeclarations,recordDeclarations};
  proofInventoryCache.set(ast,inventory);
  return inventory;
}

/**
 * Each simple binding's visible lexical region. A unique name alone cannot
 * prove that a same-spelled free reference outside the region is the binding.
 * Derived from Agent 2's lexical-containment counterexample and implementation.
 * @param {AstNode} ast
 * @returns {Map<string,AstNode>}
 */
function collectBindingScopes(ast) {
  const cached=bindingScopeCache.get(ast);
  if(cached)return cached;
  /** @type {Map<string,AstNode>} */
  const scopes=new Map();
  const lexical=new Set(['Program','BlockStatement','StaticBlock','SwitchStatement',
    'ForStatement','ForInStatement','ForOfStatement','CatchClause']);
  /** @param {AstNode[]} ancestors @returns {AstNode} */
  function enclosing(ancestors) {
    return [...ancestors].reverse().find(node=>lexical.has(node.type)) || ast;
  }
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='VariableDeclarator' && node.id.type==='Identifier') {
      scopes.set(node.id.name,enclosing(ancestors));
    } else if(node.type==='FunctionDeclaration') {
      if(node.id?.type==='Identifier') scopes.set(node.id.name,enclosing(ancestors));
      for(const param of node.params) if(param.type==='Identifier')scopes.set(param.name,node);
    } else if(node.type==='FunctionExpression'||node.type==='ArrowFunctionExpression') {
      for(const param of node.params) if(param.type==='Identifier')scopes.set(param.name,node);
    } else if(/^Import(?:Default|Namespace)?Specifier$/.test(node.type) && node.local?.type==='Identifier') {
      scopes.set(node.local.name,ast);
    }
  });
  // Proofs share this immutable parsed AST during one transformation pass.
  bindingScopeCache.set(ast,scopes);
  return scopes;
}

/**
 * Resolve bounded compile-time computed own keys only when a same-scope
 * immutable key initializer executes before the private owner is created.
 * The scope must be a sequential Program or BlockStatement: a SwitchStatement
 * can jump past earlier lexical declarations into later cases.
 *
 * Imported root aliases have no local owner creation proof, so retain their
 * conservative dynamic-key refusal (including ESM cycle/TDZ cases).
 * @param {AstNode} ast
 * @param {string} rootName
 * @param {Map<string,number>} bindings
 * @param {Map<string,AstNode>} scopes
 * @returns {Map<string,string>}
 */
function collectOwnedConstantKeys(ast,rootName,bindings,scopes) {
  const ownerScope=scopes.get(rootName);
  /** @type {Map<string,string>} */
  const keys=new Map();
  if(!ownerScope||!['Program','BlockStatement'].includes(ownerScope.type))return keys;
  let declarations=constantDeclaratorsCache.get(ast);
  if(!declarations){
    declarations=[];
    walk(ast,(node,parent)=>{
      if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
          parent?.type==='VariableDeclaration' && parent.kind==='const'){
        /** @type {AstNode[]} */ (declarations).push(node);
      }
    });
    constantDeclaratorsCache.set(ast,declarations);
  }
  // The unique-binding guard makes this lookup equivalent to the original
  // complete AST scan, including nested declarations and shadowing cases.
  /** @type {AstNode|null} */
  let owner=null;
  if(bindings.get(rootName)===1){
    for(const node of declarations){
      if(node.id.name===rootName)owner=node;
    }
  }
  if(!owner)return keys;
  for(const node of declarations){
    if(bindings.get(node.id.name)!==1||scopes.get(node.id.name)!==ownerScope||
       node.start>=owner.start||!node.init)continue;
    const value=staticString(node.init);
    if(value!==null)keys.set(node.id.name,value);
  }
  return keys;
}


/** @type {WeakMap<AstNode,Set<AstNode>>} */
const localPrivateClassMethodCache=new WeakMap();

/**
 * Prove source privacy for a pure method on a nonescaping local class or const-bound anonymous class.
 * Each instance is an immutable local value constructed with no arguments,
 * used only as the receiver of direct calls to that method. The method does
 * nothing except return a fixed member of a lexical owner; its owner is still
 * checked separately by the ordinary closed-world proof.
 *
 * @param {AstNode} ast
 * @param {Map<string,number>} bindings
 * @param {Map<string,AstNode>} scopes
 * @param {ReturnType<typeof collectProofInventory>} inventory
 * @returns {Set<AstNode>}
 */
function locallyPrivateClassMethods(ast,bindings,scopes,inventory){
  const cached=localPrivateClassMethodCache.get(ast);
  if(cached)return cached;
  /** @type {Set<AstNode>} */
  const admitted=new Set();
  walk(ast,(cls,parent,_key,ancestors)=>{
    const declaration=cls.type==='ClassDeclaration'&&cls.id?.type==='Identifier';
    // An anonymous class assigned directly to a unique immutable const
    // has the same local class-value ownership proof as a declaration.
    const expression=cls.type==='ClassExpression'&&!cls.id&&
      parent?.type==='VariableDeclarator'&&parent.init===cls&&
      parent.id.type==='Identifier'&&
      inventory.parents.get(parent)?.type==='VariableDeclaration'&&
      inventory.parents.get(parent)?.kind==='const';
    if((!declaration&&!expression)||cls.superClass||cls.body.body.length!==1||
       ancestors.some(a=>/^Export/.test(a.type)))return;
    const classId=declaration?cls.id:parent?.id;
    if(classId?.type!=='Identifier')return;
    const className=classId.name;
    // Class declarations are absent from the existing binding-scope cache.
    // Recover the exact nearest lexical region from this walk's ancestry.
    const classScope=[...ancestors].reverse().find(a=>
      ['Program','BlockStatement','StaticBlock','SwitchStatement',
       'ForStatement','ForInStatement','ForOfStatement','CatchClause'].includes(a.type))??ast;
    if(!classScope||bindings.get(className)!==1)return;
    const method=cls.body.body[0];
    // Computed string literals (and constant-string concatenation) are inert
    // at class definition time. Dynamic expressions can invoke an ambient
    // callback while the class body is evaluated, so decline those.
    const methodName=method.type==='MethodDefinition' ?
      method.computed?staticString(method.key):
        method.key.type==='Identifier'?method.key.name:null : null;
    if(method.type!=='MethodDefinition'||method.static||
       methodName===null||['constructor','__proto__','prototype'].includes(methodName)||
       method.kind!=='method'||method.value.type!=='FunctionExpression'||
       method.value.async||method.value.generator||method.value.params.length||
       method.value.body.body.length!==1)return;
    const statement=method.value.body.body[0];
    const member=statement.type==='ReturnStatement'?statement.argument:null;
    if(member?.type!=='MemberExpression'||member.optional||
       member.object.type!=='Identifier'||
       (member.computed?staticString(member.property):staticName(member.property))===null)return;

    // Multiple independent instances are safe if every constructor use
    // still creates an immutable local receiver and none of them escape.
    /** @type {AstNode[]} */
    const instances=[];
    for(const use of inventory.identifierUses.get(className)??[]){
      if(use.node===classId)continue;
      if(!use.ancestors.includes(classScope)||use.parent?.type!=='NewExpression'||
         use.parent.callee!==use.node||use.parent.arguments.length!==0)return;
      const candidate=inventory.parents.get(use.parent);
      if(candidate?.type!=='VariableDeclarator'||
         candidate.init!==use.parent||candidate.id.type!=='Identifier'||
         bindings.get(candidate.id.name)!==1||
         inventory.parents.get(candidate)?.type!=='VariableDeclaration'||
         inventory.parents.get(candidate)?.kind!=='const'||
         scopes.get(candidate.id.name)!==classScope)return;
      instances.push(candidate);
    }
    if(!instances.length)return;
    for(const instance of instances){
      for(const use of inventory.identifierUses.get(instance.id.name)??[]){
        if(use.node===instance.id)continue;
        const access=use.parent;
        const invocation=access?inventory.parents.get(access):null;
        if(!use.ancestors.includes(classScope)||
           access?.type!=='MemberExpression'||access.object!==use.node||
           access.optional||access.computed||
           access.property.type!=='Identifier'||
           access.property.name!==methodName||
           invocation?.type!=='CallExpression'||
           invocation.callee!==access||invocation.optional||
           invocation.arguments.length!==0)return;
      }
    }
    admitted.add(method.value);
  });
  localPrivateClassMethodCache.set(ast,admitted);
  return admitted;
}

/**
 * Closed-world proof of safe uses of a candidate object and its aliases.
 * Recognizes const aliases, direct function parameters, and identity forwarding.
 * Rejects reflection, computed keys, escapes, ambiguous calls, and shadowing.
 * @param {AstNode} ast
 * @param {string} rootName
 * @param {Map<string,number>} bindings
 * @param {Map<string,number>} [importedIdentityFunctions] Verified direct ESM imports of immutable, pure identity functions.
 * @param {Map<string,number>} [importedConsumers] Verified imported functions that consume an object without returning an alias.
 * @param {Map<string,string>} [importedConstantKeys] Proven, unique named-import string values initialized before their exported owner.
 * @param {Map<string,string>} [importedSourceKeys] Verified string imports used only to detect source observation; this may include keys unrelated to the owner's fields.
 * @param {Set<string>} [importedPrimitives] Verified immutable primitive results from the exact ESM graph.
 * @param {boolean} [allowDirectReflection] Allow a closed-world caller to rewrite a narrowly proved direct reflective key.
 * @returns {{aliases:Set<string>,members:AstNode[],memberNames:Map<AstNode,string>,patterns:AstNode[],patternNames:Map<AstNode,string>,inChecks:AstNode[],reflections:{call:AstNode,key:AstNode,property:string}[],forwardedCalls:Set<AstNode>}|null}
 */
function proveLocalObject(ast, rootName, bindings, importedIdentityFunctions=new Map(), importedConsumers=new Map(), importedConstantKeys=new Map(), importedSourceKeys=importedConstantKeys, importedPrimitives=new Set(), allowDirectReflection=false) {
  if(observesFunctionSource(ast,importedSourceKeys,new Set(),new Set(),importedPrimitives)) return null;
  /** @type {Map<string,{node:AstNode,params:AstNode[],forwardIndex:number,returnsRoot?:boolean,external?:boolean,consumerIndex?:number}>} */
  const functions = new Map();
  const {calls,declarationSet,identifiers,identifierUses,parents,dynamicScope,
    functionDeclarations,callableDeclarators,directInvokedArrows,
    directAliasDeclarations,complexAliasDeclarations,
    tupleDeclarations,recordDeclarations}=collectProofInventory(ast);
  for(const node of functionDeclarations){
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier' &&
        bindings.get(node.id.name) === 1) {
      let forwardIndex = -1;
      let returnsRoot = false;
      if (!node.async && !node.generator && node.body.body.length === 1 && node.body.body[0].type === 'ReturnStatement' &&
          node.body.body[0].argument?.type === 'Identifier') {
        /** @type {AstNode[]} */
        const params = node.params;
        const returned=node.body.body[0].argument.name;
        forwardIndex = params.findIndex(p => p.type === 'Identifier' && p.name === returned);
        returnsRoot = !params.length && returned === rootName;
      }
      functions.set(node.id.name,{node,params:node.params,forwardIndex,returnsRoot});
    }
  }
  for(const node of callableDeclarators){
    const parent=parents.get(node);
    // Immutable local forwarding expressions return one plain parameter,
    // or a captured immutable root through a zero-argument getter.
    // The use proof rejects exported getters, callback escape, reflection,
    // and unproved consumption of returned objects.
    if (node.type === 'VariableDeclarator' && parent?.type === 'VariableDeclaration' &&
        parent.kind === 'const' && node.id.type === 'Identifier' &&
        bindings.get(node.id.name) === 1) {
      const value=node.init;
      if (value && (value.type === 'ArrowFunctionExpression' ||
                    value.type === 'FunctionExpression') &&
          !value.async && !value.generator &&
          value.params.every((/** @type {AstNode} */ p)=>p.type === 'Identifier')) {
        /** @type {AstNode|null|undefined} */
        let body=value.body;
        if(value.body.type==='BlockStatement'){
          const statements=value.body.body;
          body=statements.length===1 && statements[0].type==='ReturnStatement' ?
            statements[0].argument : null;
          // A straight-line, immutable primitive read followed by return of
          // the same local binding has the same owner-consumption contract as
          // a concise arrow returning owner.key. The existing alias, member
          // and function-escape proofs validate all callers and field names.
          if(statements.length===2 &&
             statements[0].type==='VariableDeclaration' &&
             statements[0].kind==='const' &&
             statements[0].declarations.length===1 &&
             statements[0].declarations[0].id.type==='Identifier' &&
             statements[0].declarations[0].init?.type==='MemberExpression' &&
             statements[1].type==='ReturnStatement' &&
             statements[1].argument?.type==='Identifier' &&
             statements[1].argument.name===statements[0].declarations[0].id.name){
            body=statements[0].declarations[0].init;
          }
        }
        if (body?.type === 'Identifier') {
          const index=value.params.findIndex((/** @type {AstNode} */ p)=>p.name===body.name);
          const returnsRoot=!value.params.length && body.name===rootName;
          if (index>=0 || returnsRoot) functions.set(node.id.name,{
            node:value,params:value.params,forwardIndex:index,returnsRoot
          });
        } else if (body?.type === 'MemberExpression' &&
                   body.object.type === 'Identifier' &&
                   (body.computed ? staticString(body.property) :
                     staticName(body.property)) !== null &&
                   value.params.some((/** @type {AstNode} */ p)=>p.name===body.object.name)) {
          // A local, immutable reader consumes the tracked owner but returns
          // the field value, never an alias to the owner. The existing proof
          // requires every call to receive that same owner, checks the field
          // against its own keys, and rejects escaping function references.
          functions.set(node.id.name,{
            node:value,params:value.params,forwardIndex:-1,returnsRoot:false
          });
        }
      }
    }
  }
  if (dynamicScope) return null;
  // A cross-module signature is admitted only after the module graph has
  // proved the imported function is a stable, pure one-parameter identity.
  // It has no locally tracked parameters, but its return aliases argument 0.
  for (const [name,index] of importedIdentityFunctions) {
    if (index===0 && bindings.get(name)===1 && !functions.has(name)) {
      functions.set(name,{node:ast,params:[],forwardIndex:0,external:true});
    }
  }
  // A read-only helper returns a field value, not the object's identity.
  // Its direct calls may consume the owner without allowing alias forwarding.
  for (const [name,index] of importedConsumers) {
    if (Number.isSafeInteger(index) && index>=0 && bindings.get(name)===1 && !functions.has(name)) {
      functions.set(name,{node:ast,params:[],forwardIndex:-1,consumerIndex:index,external:true});
    }
  }

  // A uniquely bound, top-level const alias may forward a previously
  // proved imported pure identity or another earlier proven immutable alias.
  // Walking declaration order rules out TDZ/forward references and cycles.
  // Each identifier initializer is an inert reference to a stable function;
  // all uses are independently checked for direct-call-only ownership.
  /** @type {Map<string,string>} */
  const immutableIdentityAliases=new Map();
  for(const statement of ast.body) {
    if(statement.type!=='VariableDeclaration'||statement.kind!=='const')continue;
    for(const decl of statement.declarations) {
      if(decl.id.type!=='Identifier'||decl.init?.type!=='Identifier'||
         bindings.get(decl.id.name)!==1||
         importedIdentityFunctions.get(decl.init.name)!==0&&
           !immutableIdentityAliases.has(decl.init.name)||
         functions.has(decl.id.name))continue;
      immutableIdentityAliases.set(decl.id.name,decl.init.name);
      functions.set(decl.id.name,{
        node:decl.init,params:[],forwardIndex:0,external:true
      });
    }
  }

  const scopes=collectBindingScopes(ast);
  // Most owners use direct known member names and need no constant-key scan.
  // Build the same per-owner key facts only when a computed identifier read
  // actually requests them, retaining all original lexical/order gates.
  /** @type {Map<string,string>|null} */
  let constantKeys=null;
  /** @param {string} name @returns {string|null} */
  function getConstantKey(name) {
    if(constantKeys===null){
      constantKeys=collectOwnedConstantKeys(ast,rootName,bindings,scopes);
      // Imported keys have the same verified export and unique-binding gates.
      for(const [key,value] of importedConstantKeys) {
        if(bindings.get(key)===1)constantKeys.set(key,value);
      }
    }
    return constantKeys.get(name)??null;
  }
  // An unescaped, fixed-size private tuple can carry the owner through a
  // known slot. Other slots must contain inert primitive literals, so
  // constructing the tuple cannot invoke code that observes the owner.
  // Every holder use must read that same slot into a local binding. Unknown
  // indexes, mutation, reflection and all holder escapes retain original keys.
  const holderIdentifierUses=identifierUses;
  /** @type {Map<string,{index:number}>} */
  const privateOwnerTuples=new Map();
  /** @type {Set<AstNode>} */
  const privateArrayLiteralElements=new Set();
  for(const decl of tupleDeclarations.get(rootName)??[]){
    if(decl.id.type!=='Identifier'||decl.id.name===rootName||
       parents.get(decl)?.type!=='VariableDeclaration'||
       parents.get(decl)?.kind!=='const'||
       parents.get(/** @type {AstNode} */(parents.get(decl)))?.type==='ExportNamedDeclaration'||
       bindings.get(decl.id.name)!==1||
       decl.init?.type!=='ArrayExpression'||decl.init.elements.length<1||
       decl.init.elements.length>8)continue;
    const elements=/** @type {(AstNode|null)[]} */(decl.init.elements);
    const index=elements.findIndex(element=>
      element?.type==='Identifier'&&element.name===rootName);
    if(index<0||elements.some((element,slot)=>slot===index?false:
      !element||element.type!=='Literal'||
      !(element.value===null||['string','number','boolean','bigint'].includes(typeof element.value))))continue;
    const holder=decl.id.name;
    const scope=scopes.get(holder);
    if(!scope||scope!==scopes.get(rootName))continue;
    let valid=true;
    for(const entry of holderIdentifierUses.get(holder)??[]){
      if(entry.node===decl.id)continue;
      const {parent,key,ancestors}=entry;
      if(parent?.type==='Property'&&key==='key'&&!parent.computed||
         parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||
         (parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition')&&
           key==='key'&&!parent.computed)continue;
      const read=parent?.type==='MemberExpression'&&key==='object'&&!parent.optional&&
        parent.computed&&parent.property.type==='Literal'&&parent.property.value===index;
      const receiver=read?parents.get(parent):null;
      if(!ancestors.includes(scope)||!read||
         receiver?.type!=='VariableDeclarator'||receiver.init!==parent||
         receiver.id.type!=='Identifier'||bindings.get(receiver.id.name)!==1||
         !declarationSet.has(receiver)){
        valid=false;
        break;
      }
    }
    if(valid){
      privateOwnerTuples.set(holder,{index});
      privateArrayLiteralElements.add(/** @type {AstNode} */(elements[index]));
    }
  }
  // A private record with one owner-valued field can forward that owner
  // through static property reads. Inert companion fields cannot observe the
  // owner during record creation. The record and its selected member must
  // remain private; any escape, mutation or reflection suspends the proof.
  /** @type {Map<string,string>} */
  const privateOwnerRecords=new Map();
  /** @type {Set<AstNode>} */
  const privateRecordLiteralValues=new Set();
  for(const decl of recordDeclarations.get(rootName)??[]){
    if(decl.id.type!=='Identifier'||decl.id.name===rootName||
       parents.get(decl)?.type!=='VariableDeclaration'||
       parents.get(decl)?.kind!=='const'||
       parents.get(/** @type {AstNode} */(parents.get(decl)))?.type==='ExportNamedDeclaration'||
       bindings.get(decl.id.name)!==1||
       decl.init?.type!=='ObjectExpression'||
       decl.init.properties.length<1||decl.init.properties.length>8)continue;
    const fields=/** @type {AstNode[]} */ (decl.init.properties);
    const names=new Set();
    /** @type {AstNode|null} */
    let ownedValue=null;
    /** @type {string|null} */
    let ownedKey=null;
    let safe=true;
    for(const field of fields){
      if(field.type!=='Property'||field.kind!=='init'||field.computed||
         field.method||field.shorthand){
        safe=false;
        break;
      }
      const name=staticName(field.key);
      if(name===null||['__proto__','constructor','prototype'].includes(name)||
         names.has(name)){
        safe=false;
        break;
      }
      names.add(name);
      if(field.value.type==='Identifier'&&field.value.name===rootName){
        if(ownedValue!==null){safe=false;break;}
        ownedValue=field.value;
        ownedKey=name;
      }else if(field.value.type!=='Literal'||
          !(field.value.value===null||
            ['string','number','boolean','bigint'].includes(typeof field.value.value))){
        safe=false;
        break;
      }
    }
    if(!safe||!ownedValue||ownedKey===null)continue;
    const holder=decl.id.name;
    const scope=scopes.get(holder);
    if(!scope||scope!==scopes.get(rootName))continue;
    for(const entry of holderIdentifierUses.get(holder)??[]){
      if(entry.node===decl.id)continue;
      const {parent,key,ancestors}=entry;
      if(parent?.type==='Property'&&key==='key'&&!parent.computed||
         parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||
         (parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition')&&
           key==='key'&&!parent.computed)continue;
      const read=parent?.type==='MemberExpression'&&key==='object'&&!parent.optional&&
        (parent.computed?staticString(parent.property):staticName(parent.property))===ownedKey;
      const receiver=read?parents.get(parent):null;
      if(!ancestors.includes(scope)||!read||
         receiver?.type!=='VariableDeclarator'||receiver.init!==parent||
         receiver.id.type!=='Identifier'||bindings.get(receiver.id.name)!==1||
         !declarationSet.has(receiver)){
        safe=false;
        break;
      }
    }
    if(safe){
      privateOwnerRecords.set(holder,ownedKey);
      privateRecordLiteralValues.add(ownedValue);
    }
  }
  /** @type {Set<string>} */
  const unusableFunctions = new Set();
  for (const name of functions.keys()) for (const {node,parent,key,ancestors} of identifierUses.get(name)??[]) {
    const scope=scopes.get(node.name);
    if (!scope || !ancestors.includes(scope)) {
      unusableFunctions.add(node.name);
      continue;
    }
    if (parent?.type === 'FunctionDeclaration' && key === 'id') {
      if (ancestors.some(a => /^Export/.test(a.type))) unusableFunctions.add(node.name);
      continue;
    }
    if (parent?.type === 'VariableDeclarator' && key === 'id' &&
        parent.init===functions.get(node.name)?.node) {
      // Any directly exported callable can be invoked by an undeclared host
      // with a foreign record, or inspected through Function#toString.
      // A local owner proof cannot establish its external call contract.
      if(ancestors.some(a=>/^Export/.test(a.type)))unusableFunctions.add(node.name);
      continue;
    }
    if (functions.get(node.name)?.external && /^Import(?:Default|Namespace)?Specifier$/.test(parent?.type??'')) continue;
    // The imported helper is read exactly once to initialize an immutable
    // top-level alias whose own references are still checked below. An
    // arbitrary value escape, mutation or reflective use stays inadmissible.
    if (functions.get(node.name)?.external &&
        parent?.type==='VariableDeclarator' && key==='init' &&
        parent.init===node && parent.id.type==='Identifier' &&
        immutableIdentityAliases.get(parent.id.name)===node.name)continue;
    if (!(parent?.type === 'CallExpression' && key === 'callee')) unusableFunctions.add(node.name);
  }
  for (const name of unusableFunctions) functions.delete(name);
  // Invalid summaries propagate along source-ordered, acyclic const
  // aliases. Each source precedes its descendants in insertion order, so a
  // single linear pass handles every reachable descendant.
  for(const [alias,source] of immutableIdentityAliases) {
    if(!functions.has(source))functions.delete(alias);
  }

  // Source privacy is broader than the identity/consumer summaries above:
  // any uniquely bound function value used only as a direct call is private
  // even when its body does not return an identity or a simple parameter read.
  // Conversely, a value stored, returned, exported, or passed elsewhere can
  // expose its original body through Function#toString.
  const privateFunctionNodes=new Set([...directInvokedArrows,
    ...locallyPrivateClassMethods(ast,bindings,scopes,collectProofInventory(ast))]);
  /** @type {{name:string,node:AstNode,decl:AstNode}[]} */
  const callableBindings=[];
  for(const node of functionDeclarations) {
    if(node.id?.type==='Identifier'&&bindings.get(node.id.name)===1)
      callableBindings.push({name:node.id.name,node,decl:node.id});
  }
  for(const declarator of callableDeclarators) {
    const declaration=parents.get(declarator);
    const value=declarator.init;
    if(declaration?.type==='VariableDeclaration'&&declaration.kind==='const'&&
       declarator.id.type==='Identifier'&&bindings.get(declarator.id.name)===1&&
       (value?.type==='FunctionExpression'||value?.type==='ArrowFunctionExpression'))
      callableBindings.push({name:declarator.id.name,node:value,decl:declarator.id});
  }
  for(const binding of callableBindings) {
    const scope=scopes.get(binding.name);
    if(!scope)continue;
    // A named FunctionExpression has an extra lexical self-binding that the
    // outer const's direct-call-only use count does not cover. Referencing
    // that self-name, even through a nested closure, can leak the function
    // object to an exported host and reveal its exact native source.
    // Defer finer recursion-only proofs: every non-token self-use is unsafe.
    if(binding.node.type==='FunctionExpression' &&
       binding.node.id?.type==='Identifier' &&
       (identifierUses.get(binding.node.id.name)??[]).some(use=>
         use.node!==binding.node.id &&
         use.ancestors.includes(binding.node) &&
         !(use.parent?.type==='Property' && use.key==='key' && !use.parent.computed) &&
         !(use.parent?.type==='MemberExpression' && use.key==='property' &&
           !use.parent.computed)))continue;
    let privateValue=true;
    for(const use of identifierUses.get(binding.name)??[]) {
      if(use.node===binding.decl) {
        if(use.ancestors.some(ancestor=>/^Export/.test(ancestor.type)))
          privateValue=false;
        if(!privateValue)break;
        continue;
      }
      if(!use.ancestors.includes(scope)||
         use.parent?.type!=='CallExpression'||
         use.parent.callee!==use.node||
         use.parent.optional) {
        privateValue=false;
        break;
      }
    }
    if(privateValue)privateFunctionNodes.add(binding.node);
  }

  const aliases = new Set([rootName]);
  /**
   * Return the only alias fact needed to resolve an expression. A null result
   * is already proved from this root through a private carrier or captured
   * root return; false means the expression is outside this proof grammar.
   * @param {AstNode|undefined|null} expression
   * @returns {string|null|false}
   */
  function resolvingDependency(expression) {
    if(!expression)return false;
    if(expression.type==='Identifier')return expression.name;
    if(expression.type==='MemberExpression'&&!expression.optional&&
       expression.computed&&expression.object.type==='Identifier'&&
       expression.property.type==='Literal'&&
       expression.property.value===privateOwnerTuples.get(expression.object.name)?.index)return null;
    if(expression.type==='MemberExpression'&&!expression.optional&&
       expression.object.type==='Identifier'&&
       (expression.computed?staticString(expression.property):staticName(expression.property))===
         privateOwnerRecords.get(expression.object.name))return null;
    if(expression.type==='CallExpression'&&expression.callee.type==='Identifier'){
      const fn=functions.get(expression.callee.name);
      if(!fn)return false;
      if(fn.returnsRoot)return null;
      if(fn.forwardIndex>=0)return resolvingDependency(expression.arguments[fn.forwardIndex]);
    }
    return false;
  }
  /** @param {AstNode|undefined|null} expression @returns {boolean} */
  function resolves(expression) {
    const dependency=resolvingDependency(expression);
    return dependency===null||
      typeof dependency==='string'&&aliases.has(dependency);
  }

  // Every accepted complex alias depends on at most one discovered alias.
  // A formal parameter is proved only after every call site's dependency is
  // known. Reverse dependency watchers therefore compute the same least fixed
  // point without rescanning every complex declaration and formal after each
  // newly discovered alias.
  /** @type {Map<string,{target:string,remaining:Set<string>}[]>} */
  const aliasWatchers=new Map();
  /** @type {string[]} */
  const pending=[rootName];
  /** @param {string} name @returns {boolean} */
  function addAlias(name) {
    if(aliases.has(name))return false;
    aliases.add(name);
    pending.push(name);
    return true;
  }
  /** @param {string} target @param {Set<string>} dependencies @returns {void} */
  function watchAlias(target,dependencies) {
    if(!dependencies.size){
      addAlias(target);
      return;
    }
    const state={target,remaining:dependencies};
    for(const dependency of dependencies){
      const watchers=aliasWatchers.get(dependency)??[];
      watchers.push(state);
      aliasWatchers.set(dependency,watchers);
    }
  }

  for(const decl of complexAliasDeclarations){
    if(decl.id.type!=='Identifier'||bindings.get(decl.id.name)!==1||
       aliases.has(decl.id.name))continue;
    const dependency=resolvingDependency(decl.init);
    if(dependency===false)continue;
    watchAlias(decl.id.name,
      dependency===null?new Set():new Set([dependency]));
  }
  for(const [name,fn] of functions){
    const sites=calls.get(name)??[];
    if(!sites.length)continue;
    for(let index=0;index<fn.params.length;index++){
      const param=fn.params[index];
      if(param.type!=='Identifier'||bindings.get(param.name)!==1||
         aliases.has(param.name))continue;
      /** @type {Set<string>} */
      const dependencies=new Set();
      let valid=true;
      for(const call of sites){
        const dependency=resolvingDependency(call.arguments[index]);
        if(dependency===false){
          valid=false;
          break;
        }
        if(typeof dependency==='string')dependencies.add(dependency);
      }
      if(valid)watchAlias(param.name,dependencies);
    }
  }

  while(pending.length){
    const origin=/** @type {string} */ (pending.pop());
    for(const decl of directAliasDeclarations.get(origin)??[]){
      if(decl.id.type!=='Identifier'||bindings.get(decl.id.name)!==1)continue;
      addAlias(decl.id.name);
    }
    for(const state of aliasWatchers.get(origin)??[]){
      if(aliases.has(state.target))continue;
      state.remaining.delete(origin);
      if(!state.remaining.size)addAlias(state.target);
    }
  }

  // A const alias can be exported without any reference appearing in an
  // ExportSpecifier. Such exports reveal the object shape to untracked callers.
  // Only the original root binding may be intentionally exported by the
  // opt-in cross-module proof; its imported consumers are verified separately.
  for (const declaration of ast.body) {
    if (declaration.type !== 'ExportNamedDeclaration' ||
        declaration.declaration?.type !== 'VariableDeclaration') continue;
    for (const decl of declaration.declaration.declarations) {
      if (decl.id.type === 'Identifier' && decl.id.name !== rootName && aliases.has(decl.id.name)) {
        return null;
      }
    }
  }

  /** @type {AstNode[]} */
  const members = [];
  /** @type {Map<AstNode,string>} */
  const memberNames=new Map();
  /** @type {AstNode[]} */
  const patterns = [];
  /** @type {Map<AstNode,string>} */
  const patternNames=new Map();
  /** @type {Map<string,{value:string,initializedAt:number}>|null} */
  let laterTopLevelKeys=null;
  /**
   * A computed key read by an immediately evaluated top-level pattern may
   * refer to an inert immutable string initialized *after* the object owner.
   * A source-ordered top-level declaration cannot be called through a
   * reentrant function before that string's initializer has run. Nested
   * readers retain the stricter earlier-owner or verified-import proof.
   *
   * @param {AstNode} property
   * @returns {string|null}
   */
  function initializedTopLevelPatternKey(property) {
    if(!property.computed||property.key.type!=='Identifier')return null;
    const pattern=parents.get(property);
    if(pattern?.type!=='ObjectPattern')return null;
    const consumer=parents.get(pattern);
    let immediate=false;
    if(consumer?.type==='VariableDeclarator'&&consumer.id===pattern){
      const declaration=parents.get(consumer);
      const outer=declaration?parents.get(declaration):null;
      immediate=declaration?.type==='VariableDeclaration'&&
        (outer===ast || outer?.type==='ExportNamedDeclaration'&&
          parents.get(outer)===ast);
    }else if(consumer?.type==='AssignmentExpression'&&consumer.left===pattern){
      const statement=parents.get(consumer);
      immediate=statement?.type==='ExpressionStatement'&&
        parents.get(statement)===ast;
    }
    if(!immediate)return null;
    if(laterTopLevelKeys===null) {
      laterTopLevelKeys=new Map();
      for(const statement of ast.body) {
        const declaration=statement.type==='ExportNamedDeclaration' ?
          statement.declaration : statement;
        if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const')
          continue;
        for(const decl of declaration.declarations) {
          if(decl.id.type!=='Identifier'||!decl.init||
             bindings.get(decl.id.name)!==1)continue;
          const value=staticString(decl.init);
          if(value!==null)laterTopLevelKeys.set(decl.id.name,{
            value,initializedAt:decl.end
          });
        }
      }
    }
    const fact=laterTopLevelKeys.get(property.key.name);
    return fact&&fact.initializedAt<property.start ? fact.value : null;
  }
  /**
   * Resolve a proven immutable computed-key binding in the same owner proof
   * used for member reads. Ordinary literal keys need no imported proof.
   * @param {AstNode} property
   * @returns {string|null}
   */
  function provenPatternName(property) {
    const known=ownPropertyName(property);
    if(known!==null)return known;
    if(!property.computed||property.key.type!=='Identifier')return null;
    return getConstantKey(property.key.name) ??
      initializedTopLevelPatternKey(property);
  }
  /** @type {AstNode[]} */
  const inChecks = [];
  /** @type {{call:AstNode,key:AstNode,property:string}[]} */
  const reflections = [];
  const aliasUses=[...aliases].flatMap(name=>identifierUses.get(name)??[]);
  aliasUses.sort((a,b)=>a.order-b.order);
  for (const {node,parent,key,ancestors} of aliasUses) {
    // An ESTree Identifier used as a noncomputed property name is a grammar
    // token rather than a reference to the same-spelled lexical binding.
    // A forwarded parameter called "value" must not be confused with
    // unrelated literal keys such as {value: 7} or nested .value reads.
    if (parent?.type==='Property' && key==='key' && !parent.computed ||
        parent?.type==='MemberExpression' && key==='property' && !parent.computed ||
        (parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition') &&
          key==='key' && !parent.computed) continue;
    // A property spelling inside an unproven callable body is part of that
    // callable's externally observable source. Private direct-call-only
    // functions survive the escape analysis above and remain eligible.
    if(ancestors.some(ancestor=>
      ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(ancestor.type)&&
      !privateFunctionNodes.has(ancestor)))return null;
    const scope=scopes.get(node.name);
    if (!scope || !ancestors.includes(scope)) return null;
    if (!parent) return null;
    if (key === 'id' && /^(VariableDeclarator|FunctionDeclaration|FunctionExpression|ClassDeclaration|ClassExpression)$/.test(parent.type)) continue;
    if (key === 'params' && /^Function/.test(parent.type)) continue;
    if (key === 'params' && parent.type === 'ArrowFunctionExpression') continue;
    if (/^Import(?:Default|Namespace)?Specifier$/.test(parent.type)) continue;
    // Membership in a proven initial own field preserves the boolean result.
    // Keep both operands evaluated in their original order.
    if(parent.type==='BinaryExpression' && parent.operator==='in' &&
       key==='right' && parent.left.type==='Literal' &&
       typeof parent.left.value==='string') {
      inChecks.push(parent);
      continue;
    }
    if (parent.type === 'MemberExpression' && key === 'object') {
      const property = parent.computed ?
        staticString(parent.property) ??
          (parent.property.type==='Identifier' ? getConstantKey(parent.property.name) : null) :
        staticName(parent.property);
      if (property === null) return null;
      memberNames.set(parent,property);
      members.push(parent);
      continue;
    }
    if(parent.type==='ArrayExpression'&&privateArrayLiteralElements.has(node))continue;
    if(parent.type==='Property'&&key==='value'&&privateRecordLiteralValues.has(node))continue;
    if (parent.type === 'VariableDeclarator' && key === 'init' &&
        parent.id.type === 'Identifier' && aliases.has(parent.id.name)) continue;
    if (parent.type === 'VariableDeclarator' && key === 'init' && parent.id.type === 'ObjectPattern') {
      // A direct, statically-keyed pattern reads own fields without escaping
      // the object. Keep targets as plain identifiers, with optional defaults;
      // reject dynamic keys, rest bindings, and nested assignment targets.
      /** @type {AstNode[]} */
      const fields = parent.id.properties;
      if (fields.some(p => p.type !== 'Property' || p.kind !== 'init' ||
          provenPatternName(p) === null || !isSimplePatternBinding(p.value))) return null;
      for(const field of fields)patternNames.set(field,/** @type {string} */ (provenPatternName(field)));
      patterns.push(...fields);
      continue;
    }
    // A standalone destructuring assignment is another direct read of the
    // same proven own fields. Require the entire assignment to be a discarded
    // expression statement: its result is the original owner object, which
    // would otherwise escape through a surrounding expression.
    if (parent.type === 'AssignmentExpression' && key === 'right' &&
        parent.operator === '=' && parent.left.type === 'ObjectPattern' &&
        parents.get(parent)?.type === 'ExpressionStatement') {
      /** @type {AstNode[]} */
      const fields = parent.left.properties;
      if (fields.some(p => p.type !== 'Property' || p.kind !== 'init' ||
          provenPatternName(p) === null || !isSimplePatternBinding(p.value))) return null;
      for(const field of fields)patternNames.set(field,/** @type {string} */ (provenPatternName(field)));
      patterns.push(...fields);
      continue;
    }
    if (allowDirectReflection && parent.type==='CallExpression' && key==='arguments' &&
        parent.arguments[0]===node && parent.arguments.length===2 &&
        parent.arguments[1]?.type==='Literal' &&
        typeof parent.arguments[1].value==='string' &&
        parent.callee.type==='MemberExpression' && !parent.callee.computed &&
        parent.callee.object.type==='Identifier') {
      const host=parent.callee.object.name;
      const method=staticName(parent.callee.property);
      if(host==='Reflect' && method==='get' ||
         host==='Object' && method==='hasOwn') {
        reflections.push({call:parent,key:parent.arguments[1],property:parent.arguments[1].value});
        continue;
      }
    }
    if (parent.type === 'CallExpression' && key === 'arguments' && parent.callee.type === 'Identifier') {
      const fn = functions.get(parent.callee.name);
      const index = parent.arguments.indexOf(node);
      if (fn?.external && (index===fn.forwardIndex || index===fn.consumerIndex)) continue;
      if (fn && index >= 0 && fn.params[index]?.type === 'Identifier' && aliases.has(fn.params[index].name)) continue;
      return null;
    }
    if (parent.type === 'ReturnStatement' && key === 'argument') {
      const enclosing = [...ancestors].reverse().find(a => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(a.type));
      if (enclosing && [...functions.values()].some(fn=>
        fn.node===enclosing && (fn.forwardIndex>=0 || fn.returnsRoot))) continue;
      return null;
    }
    if (parent.type === 'ArrowFunctionExpression' && key === 'body' &&
        [...functions.values()].some(fn=>
          fn.node===parent && (fn.forwardIndex>=0 || fn.returnsRoot))) continue;
    return null;
  }
  // `arguments[0]` aliases parameters invisibly to name-based reference analysis.
  if (identifierUses.has('arguments') &&
      [...functions.values()].some(fn => fn.params.some((/** @type {AstNode} */ p) => p.type === 'Identifier' && aliases.has(p.name)))) return null;
  // A forwarded object must be consumed by a tracked const alias or discarded.
  for (const [name] of functions) for (const parent of calls.get(name)??[]) {
    const node=parent.callee;
    const fn = functions.get(name);
    if(!fn) continue;
    if (!fn.returnsRoot &&
        (fn.forwardIndex < 0 || !resolves(parent.arguments[fn.forwardIndex]))) continue;
    // Other returned values (including members of the call) are opaque.
    const callParent = parents.get(parent);
    if (callParent?.type === 'VariableDeclarator' && callParent.init === parent &&
        callParent.id.type === 'Identifier' && aliases.has(callParent.id.name)) continue;
    if (callParent?.type === 'ExpressionStatement') continue;
    // A forwarded owner can be destructured immediately without binding the
    // complete object. Require plain known keys and simple binding targets,
    // and forbid assignment-expression result exposure to another consumer.
    const objectPattern=callParent?.type==='VariableDeclarator' &&
      callParent.init===parent ? callParent.id :
      callParent?.type==='AssignmentExpression' && callParent.operator==='=' &&
      callParent.right===parent &&
      parents.get(callParent)?.type==='ExpressionStatement' ?
        callParent.left : null;
    if(objectPattern?.type==='ObjectPattern') {
      /** @type {AstNode[]} */
      const fields=objectPattern.properties;
      if(fields.some(field=>field.type!=='Property' || field.kind!=='init' ||
          provenPatternName(field)===null ||
          !isSimplePatternBinding(field.value))) return null;
      for(const field of fields)patternNames.set(field,/** @type {string} */ (provenPatternName(field)));
      patterns.push(...fields);
      continue;
    }
    // A verified return of the owner may feed one immediate, statically
    // keyed member read without first creating an alias variable.  Record
    // that member in the same edit/TypeError checks used for direct aliases.
    // Optional calls and unknown computed keys retain the original shape.
    if (callParent?.type === 'MemberExpression' &&
        callParent.object === parent && !callParent.optional && !parent.optional) {
      const property = callParent.computed ?
        staticString(callParent.property) ??
          (callParent.property.type === 'Identifier' ?
            getConstantKey(callParent.property.name) : null) :
        staticName(callParent.property);
      if (property === null) return null;
      memberNames.set(callParent,property);
      members.push(callParent);
      continue;
    }
    // A forwarding call can feed another already-proven direct consumer.
    // Both functions must be admitted by the no-escape proof, and the
    // receiving formal must be a tracked alias. This preserves ownership
    // through reader(identity(root)) without treating reader results as aliases.
    if (callParent?.type === 'CallExpression' &&
        callParent.callee.type === 'Identifier') {
      const receiver=functions.get(callParent.callee.name);
      const index=callParent.arguments.indexOf(parent);
      if(index>=0 && receiver &&
         (receiver.external && (index===receiver.forwardIndex ||
           index===receiver.consumerIndex) ||
          receiver.params[index]?.type==='Identifier' &&
            aliases.has(receiver.params[index].name))) continue;
    }
    return null;
  }
  // Validate all members after forwarding has added its immediate reads.
  // Member assignment can install a function whose `this` observes the
  // owner's property names, even if the assigned field itself is unrenamed.
  // Preserve hot arithmetic updates while refusing unproven function/object
  // assignments and method-call receivers.
  for (const member of members) {
    const consumer=parents.get(member);
    // Pattern and iteration targets can install opaque values without an
    // ordinary assignment node, allowing reflective methods on the object.
    if (consumer?.type==='ForOfStatement' && consumer.left===member ||
        consumer?.type==='ForInStatement' && consumer.left===member ||
        consumer?.type==='ObjectPattern' || consumer?.type==='ArrayPattern' ||
        consumer?.type==='Property' && parents.get(consumer)?.type==='ObjectPattern') return null;
    // V8 can print the source spelling of a failed callee or iterable
    // operand, e.g. "owner.secretField is not iterable", or
    // "target[owner.secretField] is not a function". Renaming a member
    // anywhere inside that expression would alter an observable TypeError
    // even without Function#toString or a stack observation. Reject such
    // contexts through the enclosing AST expression chain. A nested
    // function body is a separately executed expression and does not become
    // part of its enclosing function object's operand spelling.
    let expression=member;
    let ancestor=consumer;
    while(ancestor) {
      if(sourceSpelledErrorOperand(ancestor)===expression)return null;
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(ancestor.type))break;
      expression=ancestor;
      ancestor=parents.get(expression);
    }
    // Deletion can expose an inherited getter/value under the original key.
    // The property shape of Object.prototype is outside the local proof.
    const finalConsumer=consumer?.type==='ChainExpression' ? parents.get(consumer) : consumer;
    if (finalConsumer?.type==='UnaryExpression' && finalConsumer.operator==='delete') return null;
    if (consumer?.type==='AssignmentExpression' && consumer.left===member) {
      if (consumer.operator==='=') {
        const rhs=consumer.right;
        if (rhs.type!=='Literal' ||
            !['string','number','boolean','bigint'].includes(typeof rhs.value) && rhs.value!==null) return null;
      } else if (['&&=','||=','??='].includes(consumer.operator)) return null;
    }

  }
  for(const reflection of reflections) {
    let expression=reflection.call;
    let ancestor=parents.get(expression);
    while(ancestor) {
      if(sourceSpelledErrorOperand(ancestor)===expression)return null;
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(ancestor.type))break;
      expression=ancestor;
      ancestor=parents.get(expression);
    }
  }
  /** @type {Set<AstNode>} */
  const forwardedCalls=new Set();
  // Expose already-proven direct identity-return expressions to the
  // cross-file reader verifier. The receiving call is separately checked
  // against an imported read-only function and its parameter ownership.
  // resolves() only accepts direct named calls. Use the immutable
  // call-site inventory rather than walking the full AST for every owner.
  for(const [name] of functions) {
    for(const call of calls.get(name)??[]) {
      if(resolves(call))forwardedCalls.add(call);
    }
  }
  return {aliases,members,memberNames,patterns,patternNames,inChecks,reflections,forwardedCalls};
}

/**
 * Construct edits for a statically known object destructuring read. Shorthand
 * must be expanded to preserve its local binding name after the key changes.
 * @param {string} source
 * @param {AstNode[]} patterns
 * @param {Map<string,string>} mapping
 * @param {Map<AstNode,string>} [patternNames] Proven computed-key names from the owner proof.
 * @returns {import('./ast').Edit[]}
 */
function patternPropertyEdits(source,patterns,mapping,patternNames=new Map()) {
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  for (const property of patterns) {
    const old=patternNames.get(property)??ownPropertyName(property);
    if (old === null) continue;
    const replacement=mapping.get(old);
    if (!replacement) continue;
    if (property.shorthand) {
      edits.push({start:property.start,end:property.end,
        text:`${JSON.stringify(replacement)}:${source.slice(property.value.start,property.value.end)}`});
    } else {
      edits.push({start:property.key.start,end:property.key.end,text:JSON.stringify(replacement)});
    }
  }
  return edits;
}

/**
 * Construct edits for original own-key membership checks, whose referenced
 * keys have been checked against the original fields by the caller.
 * @param {AstNode[]} inChecks
 * @param {Map<string,string>} mapping
 * @returns {import('./ast').Edit[]}
 */
function inOperatorPropertyEdits(inChecks,mapping) {
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  for(const check of inChecks){
    const next=mapping.get(check.left.value);
    if(next!==undefined)edits.push({start:check.left.start,end:check.left.end,text:JSON.stringify(next)});
  }
  return edits;
}

/**
 * Prove a private zero-argument factory has exactly one direct invocation,
 * creating an inert object literal in the specified binding initializer.
 * Exported, aliased, mutable, dynamically invoked or observable factories
 * are excluded by explicit bindings and AST-reference checks. Intended for
 * both local-owner and opt-in closed-world ESM ownership proofs.
 *
 * @param {AstNode} ast
 * @param {Map<string,number>} bindings
 * @param {AstNode} expression
 * @returns {AstNode|null}
 */
function singleUseFactoryObject(ast,bindings,expression) {
  if(expression.type!=='CallExpression'||expression.optional||expression.arguments.length)return null;
  /**
   * The IIFE function value never escapes; it can create a private owner
   * directly without a named binding or a separate use-count proof.
   * @param {AstNode} factory
   * @returns {AstNode|null}
   */
  function returnedLiteral(factory) {
    if(factory.async||factory.generator||factory.params.length)return null;
    const body=factory.body.type==='BlockStatement' ?
      factory.body.body.length===1&&factory.body.body[0].type==='ReturnStatement' ?
        factory.body.body[0].argument : null :
      factory.body;
    return body?.type==='ObjectExpression'?body:null;
  }
  if(['ArrowFunctionExpression','FunctionExpression'].includes(expression.callee.type)) {
    return returnedLiteral(expression.callee);
  }
  if(expression.callee.type!=='Identifier')return null;
  const name=expression.callee.name;
  if(bindings.get(name)!==1)return null;
  /** @type {AstNode|null} */
  let fn=null;
  /** @type {AstNode|null} */
  let definition=null;
  for(const statement of ast.body) {
    if(statement.type==='FunctionDeclaration'&&statement.id?.type==='Identifier'&&
       statement.id.name===name) {
      fn=statement;
      definition=statement.id;
      break;
    }
    if(statement.type==='VariableDeclaration'&&statement.kind==='const'&&
       statement.declarations.length===1) {
      const dec=statement.declarations[0];
      if(dec.id.type==='Identifier'&&dec.id.name===name&&dec.init&&
         ['ArrowFunctionExpression','FunctionExpression'].includes(dec.init.type)) {
        fn=dec.init;
        definition=dec.id;
        break;
      }
    }
  }
  if(!fn||!definition)return null;
  const body=returnedLiteral(fn);
  if(!body)return null;
  let references=0;
  walk(ast,(node,parent,key)=>{
    if(node.type!=='Identifier'||node.name!==name||node===definition)return;
    if(parent===expression&&key==='callee')references++;
    else references=2;
  });
  return references===1?body:null;
}

/**
 * Rename selected object-literal own keys only when a closed-world use proof succeeds.
 * A conservative proof failure leaves the complete file unchanged for that object.
 * @param {string} source
 * @param {AstNode} ast
 * @param {{seed:string}} options
 * @returns {{code:string,objects:number,properties:number}}
 */
function renameLocalProperties(source, ast, options) {
  const bindings = collectBindings(ast);
  /** @type {{node:AstNode,name:string,properties:AstNode[]}[]} */
  const candidates = [];
  walk(ast,(node,parent,key,ancestors) => {
    if (parent?.type !== 'VariableDeclarator' || key !== 'init' ||
        parent.id.type !== 'Identifier' || bindings.get(parent.id.name) !== 1) return;
    const declaration = ancestors[ancestors.length - 2];
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const' ||
        ancestors.some(a => a.type === 'ExportNamedDeclaration' || a.type === 'ExportDefaultDeclaration')) return;
    const literal=node.type==='ObjectExpression' ? node : singleUseFactoryObject(ast,bindings,node);
    if(!literal)return;
    /** @type {AstNode[]} */
    const properties = literal.properties;
    if (!properties.length || properties.some(p => p.type !== 'Property' || p.method || p.kind !== 'init' ||
          ownPropertyName(p) === null || ['__proto__','prototype','constructor'].includes(String(ownPropertyName(p))) ||
          !(isLiteralValue(p.value) || literal===node &&
            isDirectParameterValue(p.value,ancestors,bindings)))) return;
    const names = properties.map(ownPropertyName);
    if (new Set(names).size !== names.length) return;
    candidates.push({node:literal,name:parent.id.name,properties});
  });

  /** @type {import('./ast').Edit[]} */
  const edits = [];
  let objects = 0;
  let properties = 0;
  for (const candidate of candidates) {
    const proof = proveLocalObject(ast, candidate.name, bindings);
    if (!proof || (!proof.members.length && !proof.patterns.length && !proof.inChecks.length)) continue;
    // An unowned field may invoke an inherited getter with this=object. That
    // getter can enumerate own keys, making otherwise private renaming visible.
    const ownNames=new Set(candidate.properties.map(ownPropertyName));
    if (proof.members.some(member=>{const field=proof.memberNames.get(member);return typeof field!=='string'||!ownNames.has(field);}) ||
        proof.patterns.some(property=>
          !ownNames.has(proof.patternNames.get(property)??ownPropertyName(property))) ||
        proof.inChecks.some(check=>!ownNames.has(check.left.value))) continue;
    const mapping = new Map();
    for (const prop of candidate.properties) {
      const old = ownPropertyName(prop);
      const hash = createHash('sha256').update(`${options.seed}/${candidate.name}/${candidate.node.start}/${old}`).digest('hex').slice(0,10);
      mapping.set(old,`_p${hash}`);
    }
    // Truncated digests can collide. Duplicating literal keys silently changes
    // both object contents and all subsequent reads, so decline this object.
    if (new Set(mapping.values()).size !== mapping.size) continue;
    for (const prop of candidate.properties) {
      const renamed=JSON.stringify(mapping.get(ownPropertyName(prop)));
      // Shorthand has one token for its key and value. Keep the original
      // lexical value and function-name inference when expanding the field.
      const text=prop.shorthand ?
        renamed+':'+source.slice(prop.value.start,prop.value.end) : renamed;
      edits.push({start:prop.key.start,end:prop.key.end,text});
    }
    for (const member of proof.members) {
      const name=proof.memberNames.get(member);
      if (name!==undefined && mapping.has(name)) edits.push({start:member.property.start,end:member.property.end,
        text:member.computed ? JSON.stringify(mapping.get(name)) : mapping.get(name)});
    }
    edits.push(...patternPropertyEdits(source,proof.patterns,mapping,proof.patternNames));
    edits.push(...inOperatorPropertyEdits(proof.inChecks,mapping));
    objects++;
    properties += mapping.size;
  }
  return {code:applyEdits(source,edits),objects,properties};
}

module.exports = {renameLocalProperties,collectBindings,proveLocalObject,staticName,patternPropertyEdits,inOperatorPropertyEdits,isLiteralValue,isPrimitiveConstantExpression,ownPropertyName,singleUseFactoryObject};
