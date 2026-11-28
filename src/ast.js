'use strict';

const acorn = require('acorn');

/** @type {WeakMap<object,boolean>} */
const sourceObservationCache=new WeakMap();

/**
 * @typedef {{[key:string]:any,type: string, start: number, end: number}} AstNode
 * @typedef {{ start: number, end: number, text: string }} Edit
 */

/**
 * Parse JavaScript without implicit grammar downgrades or error recovery.
 * @param {string} source
 * @param {'script'|'module'|'commonjs'} sourceType
 * @returns {AstNode}
 */
function parse(source, sourceType) {
  return /** @type {AstNode} */ (acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: sourceType === 'commonjs' ? 'script' : sourceType,
    allowReturnOutsideFunction: sourceType === 'commonjs',
    allowHashBang: true,
    preserveParens: false
  }));
}

/**
 * Walk all ESTree children; parent and key describe each node's actual AST position.
 * @param {AstNode} root
 * @param {(node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[])=>void} visit
 * @returns {void}
 */
function walk(root, visit) {
  /** @param {AstNode} node @param {AstNode|null} parent @param {string|null} key @param {AstNode[]} ancestors */
  function go(node, parent, key, ancestors) {
    visit(node, parent, key, ancestors);
    const next = [...ancestors, node];
    for (const [childKey, value] of Object.entries(node)) {
      if (childKey === 'parent' || childKey === 'comments') continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && typeof item.type === 'string') {
            go(/** @type {AstNode} */ (item), node, childKey, next);
          }
        }
      } else if (value && typeof value === 'object' && typeof value.type === 'string') {
        go(/** @type {AstNode} */ (value), node, childKey, next);
      }
    }
  }
  go(root, null, null, []);
}

/**
 * Detect source-visible exposure of the shared WeakMap prototype.
 *
 * A supplied ESM module can mutate WeakMap.prototype before another supplied
 * module evaluates. This fact must be shared across the compilation group:
 * checking each file in isolation can incorrectly admit a reference-only
 * Storage override in a sibling file. Reads of unrelated object prototypes
 * and data properties named "getPrototypeOf" are not evidence of this hazard.
 *
 * This is intentionally a conservative, bounded syntactic exposure check.
 * @param {AstNode} ast
 * @returns {boolean}
 */
function hasWeakMapPrototypeExposure(ast) {
  const globalNames=new Set(['globalThis','window','self','global']);
  /** @type {Map<string,string|null>} */
  const staticStringAliases=new Map();
  walk(ast,(node,parent)=>{
    if(node.type!=='VariableDeclarator'||node.id?.type!=='Identifier'||
       parent?.type!=='VariableDeclaration'||parent.kind!=='const')return;
    const value=staticString(node.init);
    if(value===null)return;
    if(!staticStringAliases.has(node.id.name))staticStringAliases.set(node.id.name,value);
    else if(staticStringAliases.get(node.id.name)!==value)staticStringAliases.set(node.id.name,null);
  });
  // A top-level class declaration shadows the ambient WeakMap binding
  // throughout this module. Its instance prototype is not the shared native
  // WeakMap.prototype, unless the source explicitly uses globalThis.WeakMap.
  const hasTopLevelWeakMapClass=ast.body.some((/** @type {AstNode} */ statement)=>{
    const declaration=statement.type==='ExportNamedDeclaration'||
      statement.type==='ExportDefaultDeclaration'?statement.declaration:statement;
    return declaration?.type==='ClassDeclaration'&&declaration.id?.name==='WeakMap';
  });
  const weakMapConstructors=new Set(hasTopLevelWeakMapClass?[]:['WeakMap']);
  /** @type {Map<string,number>} */
  const weakMapDerivedConstructors=new Map();
  /**
   * Duplicate class names in nested scopes are ambiguous in this bounded
   * name-indexed analysis. Retain the shallowest possible depth so a nested
   * declaration cannot hide an outer path to native WeakMap.prototype.
   * @param {string} name
   * @param {number} depth
   * @returns {boolean}
   */
  function recordWeakMapDerivedConstructor(name,depth) {
    const prior=weakMapDerivedConstructors.get(name);
    if(prior!==undefined&&prior<=depth)return false;
    weakMapDerivedConstructors.set(name,depth);
    return true;
  }
  /** @type {Map<string,number>} */
  const weakMapPrototypeChainDepths=new Map();
  const weakMapInstances=new Set();
  const weakMapFactories=new Set();
  const objectNamespaces=new Set(['Object']);
  const reflectNamespaces=new Set(['Reflect']);
  const prototypeGetters=new Set();
  const reflectGetMethods=new Set();
  const prototypeAliases=new Set();
  const exportedLocalNames=new Set();
  const importedLocalNames=new Set();
  const weakMapContainerOwners=new Set();
  const weakMapContainerInstances=new Set();
  const objectAliases=new Map();
  const exportedValueNodes=new Map();
  /** @type {Array<{root:string|null,ownerName:string|null,global:boolean,imported:boolean,exportedFunction:boolean,value:AstNode}>} */
  const memberWrites=[];
  const functionTypes=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
  /** @type {Map<AstNode,{name:string|null,ownerName:string|null,exported:boolean,returnedFactories:Set<string>,returnsWeakMap:boolean,returnValues:AstNode[]}>} */
  const functionInfoByNode=new Map();

  /** @param {AstNode|null|undefined} node @returns {string|null} */
  function memberKey(node) {
    if(node?.type!=='MemberExpression')return null;
    if(node.computed) {
      const direct=staticString(node.property);
      if(direct!==null)return direct;
      return node.property.type==='Identifier'?
        staticStringAliases.get(node.property.name)??null:null;
    }
    return node.property.type==='Identifier'?node.property.name:null;
  }
  /** @type {Set<string>} */
  const knownGlobalConstructorNames=new Set([
    'WeakMap','Map','Set','Object','Reflect','Array','Function','String',
    'Number','Boolean','Symbol','BigInt','Date','RegExp','Error','Promise',
    'JSON','Math','Intl','Proxy','WeakRef','FinalizationRegistry','URL',
    'URLSearchParams','ArrayBuffer','SharedArrayBuffer','DataView',
    'Uint8Array','Uint8ClampedArray','Int8Array','Uint16Array','Int16Array',
    'Uint32Array','Int32Array','Float32Array','Float64Array','BigInt64Array',
    'BigUint64Array','WebAssembly','Atomics'
  ]);
  /**
   * Return the first property below a global root, or "*" when any key is
   * dynamic. This is used only for prototype-chain/heritage decisions.
   * @param {AstNode|null|undefined} node
   * @returns {string|null}
   */
  function globalRootProperty(node) {
    let current=node;
    let firstKey=null;
    let hasMember=false;
    let hasDynamicKey=false;
    while(current?.type==='MemberExpression') {
      hasMember=true;
      const key=memberKey(current);
      if(key===null)hasDynamicKey=true;
      else firstKey=key;
      current=current.object;
    }
    if(!hasMember||current?.type!=='Identifier'||!globalNames.has(current.name))
      return null;
    return hasDynamicKey?'*':firstKey;
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isRequireCall(node) {
    return Boolean(node?.type==='CallExpression'&&
      node.callee.type==='Identifier'&&node.callee.name==='require');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isGlobalRoot(node) {
    return node?.type==='Identifier'&&globalNames.has(node.name);
  }
  /** @param {AstNode|null|undefined} node @param {Set<string>} names @returns {boolean} */
  function isNamespace(node,names) {
    return Boolean(node&&(
      node.type==='Identifier'&&names.has(node.name)||
      node.type==='MemberExpression'&&isGlobalRoot(node.object)&&
        names.has(memberKey(node)??'')
    ));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isWeakMapConstructor(node) {
    return Boolean(node&&(
      node.type==='Identifier'&&weakMapConstructors.has(node.name)||
      node.type==='MemberExpression'&&isGlobalRoot(node.object)&&
        memberKey(node)==='WeakMap'
    ));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isWeakMapInstance(node) {
    return Boolean(node&&(
      node.type==='NewExpression'&&isWeakMapConstructor(node.callee)||
      node.type==='Identifier'&&weakMapInstances.has(node.name)
    ));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isGlobalObjectPath(node) {
    return Boolean(isGlobalRoot(node)||
      node?.type==='MemberExpression'&&isGlobalObjectPath(node.object));
  }
  /** @param {AstNode|null|undefined} node @returns {string|null} */
  function rootIdentifier(node) {
    let current=node;
    while(current?.type==='MemberExpression')current=current.object;
    return current?.type==='Identifier'?current.name:null;
  }
  /**
   * Find WeakMap instances in a value expression without treating a nested
   * function body as an immediate escape. Function return/yield summaries
   * are handled separately below.
   * @param {AstNode|null|undefined} root
   * @returns {boolean}
   */
  function containsWeakMapInstanceValue(root) {
    if(!root)return false;
    if(isWeakMapInstance(root))return true;
    if(root.type==='Identifier'&&
       (weakMapContainerInstances.has(root.name)||weakMapContainerOwners.has(root.name)))
      return true;
    if(root.type==='CallExpression'&&root.callee.type==='Identifier'&&
       weakMapFactories.has(root.callee.name))return true;
    // Only follow expression positions that contribute to the returned or
    // exported value. Do not mistake a WeakMap used as the receiver of
    // WeakMap.prototype.get() for a WeakMap returned by that call.
    if(functionTypes.has(root.type))return false;
    if(root.type==='ObjectExpression') {
      return root.properties.some((/** @type {AstNode} */ property)=>
        property.type==='SpreadElement'?
          containsWeakMapInstanceValue(property.argument):
        property.type==='Property'?
          containsWeakMapInstanceValue(property.value):false);
    }
    if(root.type==='ArrayExpression')
      return root.elements.some((/** @type {AstNode|null} */ element)=>
        containsWeakMapInstanceValue(element));
    if(root.type==='Property'||root.type==='SpreadElement')
      return containsWeakMapInstanceValue(root.value??root.argument);
    if(root.type==='ConditionalExpression')
      return containsWeakMapInstanceValue(root.consequent)||
        containsWeakMapInstanceValue(root.alternate);
    if(root.type==='LogicalExpression')
      return containsWeakMapInstanceValue(root.left)||
        containsWeakMapInstanceValue(root.right);
    if(root.type==='SequenceExpression')
      return containsWeakMapInstanceValue(root.expressions.at(-1));
    if(root.type==='AssignmentExpression')
      return containsWeakMapInstanceValue(root.right);
    if(root.type==='AwaitExpression'||root.type==='YieldExpression')
      return containsWeakMapInstanceValue(root.argument);
    if(root.type==='ChainExpression')
      return containsWeakMapInstanceValue(root.expression);
    if(root.type==='ClassDeclaration'||root.type==='ClassExpression') {
      return root.body.body.some((/** @type {AstNode} */ element)=>
        element.type==='PropertyDefinition'&&
          containsWeakMapInstanceValue(element.value));
    }
    return false;
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isObjectPrototypeValue(node) {
    return Boolean(node?.type==='MemberExpression'&&
      isNamespace(node.object,objectNamespaces)&&memberKey(node)==='prototype');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isLegacyPrototypeParentGetterValue(node) {
    if(node?.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       memberKey(node.callee)==='__lookupGetter__'&&
       isObjectPrototypeValue(node.callee.object)&&
       staticString(node.arguments[0])==='__proto__')return true;
    return Boolean(node?.type==='MemberExpression'&&memberKey(node)==='get'&&
      node.object?.type==='CallExpression'&&
      node.object.callee.type==='MemberExpression'&&
      isNamespace(node.object.callee.object,objectNamespaces)&&
      memberKey(node.object.callee)==='getOwnPropertyDescriptor'&&
      isObjectPrototypeValue(node.object.arguments[0])&&
      staticString(node.object.arguments[1])==='__proto__');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isPrototypeGetterMember(node) {
    return Boolean(node?.type==='MemberExpression'&&
      memberKey(node)==='getPrototypeOf'&&
      (isNamespace(node.object,objectNamespaces)||
       isNamespace(node.object,reflectNamespaces)))||
      isLegacyPrototypeParentGetterValue(node);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isReflectGetCall(node) {
    return Boolean(node?.type==='CallExpression'&&(
      node.callee.type==='MemberExpression'&&
        isNamespace(node.callee.object,reflectNamespaces)&&memberKey(node.callee)==='get'||
      node.callee.type==='Identifier'&&reflectGetMethods.has(node.callee.name)
    ));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isPrototypeGetterCall(node) {
    if(node?.type!=='CallExpression')return false;
    if(node.callee.type==='Identifier'&&prototypeGetters.has(node.callee.name))return true;
    if(node.callee.type==='MemberExpression'&&
       ['call','apply'].includes(memberKey(node.callee)??'')) {
      if(node.callee.object.type==='Identifier'&&
         prototypeGetters.has(node.callee.object.name))return true;
      if(isPrototypeGetterMember(node.callee.object))return true;
    }
    return isPrototypeGetterMember(node.callee);
  }
  /**
   * Return the prototype-chain distance from a WeakMap-derived constructor's
   * own prototype to native WeakMap.prototype. Native WeakMap has depth zero.
   * @param {AstNode|null|undefined} node
   * @returns {number|undefined}
   */
  function weakMapDerivedDepth(node) {
    if(!node)return undefined;
    if(node.type==='Identifier') {
      const depth=weakMapDerivedConstructors.get(node.name);
      if(depth!==undefined)return depth;
    }
    // Global properties outside the known intrinsic constructor set are
    // external/ambiguous. Treat them as possible WeakMap-derived constructors
    // rather than assuming a cross-file or host-provided value is harmless.
    const globalProperty=globalRootProperty(node);
    if(globalProperty==='*'||
       (globalProperty!==null&&!knownGlobalConstructorNames.has(globalProperty)))return 0;
    // Explicit global constructors remain identifiable even when the local
    // class deliberately shadows the bare WeakMap binding.
    if(node.type==='MemberExpression'&&node.object?.type==='Identifier'&&
       ['globalThis','window','self','global'].includes(node.object.name)&&
       memberKey(node)==='WeakMap')return 0;
    if(isWeakMapConstructor(node))return 0;
    if(node.type==='ClassExpression'||node.type==='ClassDeclaration') {
      const parentDepth=weakMapDerivedDepth(node.superClass);
      return parentDepth===undefined?undefined:parentDepth+1;
    }
    if(node.type==='ConditionalExpression'||node.type==='LogicalExpression') {
      const left=weakMapDerivedDepth(node.type==='ConditionalExpression'?
        node.consequent:node.left);
      const right=weakMapDerivedDepth(node.type==='ConditionalExpression'?
        node.alternate:node.right);
      if(left===undefined)return right;
      if(right===undefined)return left;
      return Math.min(left,right);
    }
    if(node.type==='SequenceExpression')
      return weakMapDerivedDepth(node.expressions.at(-1));
    if(node.type==='AssignmentExpression')
      return weakMapDerivedDepth(node.right);
    if(node.type==='AwaitExpression'||node.type==='YieldExpression')
      return weakMapDerivedDepth(node.argument);
    if(node.type==='ChainExpression')
      return weakMapDerivedDepth(node.expression);
    return undefined;
  }
  /**
   * Return the remaining prototype-chain distance for a WeakMap instance,
   * derived-class prototype, or an alias of either. Zero is the shared native
   * WeakMap.prototype; positive values are intermediate prototypes.
   * @param {AstNode|null|undefined} node
   * @returns {number|undefined}
   */
  function weakMapPrototypeChainDepth(node) {
    if(!node)return undefined;
    if(node.type==='Identifier') {
      if(prototypeAliases.has(node.name))return 0;
      const aliasDepth=weakMapPrototypeChainDepths.get(node.name);
      if(aliasDepth!==undefined)return aliasDepth;
    }
    if(node.type==='NewExpression') {
      const derivedDepth=weakMapDerivedDepth(node.callee);
      if(derivedDepth!==undefined)return derivedDepth+1;
    }
    if(node.type==='CallExpression'&&isReflectGetCall(node)) {
      const key=staticString(node.arguments[1]) ??
        (node.arguments[1]?.type==='Identifier'?
          staticStringAliases.get(node.arguments[1].name)??null:null);
      if(key==='prototype') {
        const derivedDepth=weakMapDerivedDepth(node.arguments[0]);
        if(derivedDepth!==undefined&&derivedDepth>0)return derivedDepth;
        if(isWeakMapConstructor(node.arguments[0]))return 0;
      }
      if(key==='__proto__') {
        const parentDepth=weakMapPrototypeChainDepth(node.arguments[0]);
        if(parentDepth===1)return 0;
        if(parentDepth!==undefined&&parentDepth>1)return parentDepth-1;
        if(isWeakMapInstance(node.arguments[0]))return 0;
      }
    }
    if(node.type==='MemberExpression') {
      const globalProperty=globalRootProperty(node);
      if(globalProperty==='*'||
         (globalProperty!==null&&!knownGlobalConstructorNames.has(globalProperty)))return 0;
      const key=memberKey(node);
      if(key==='prototype') {
        const derivedDepth=weakMapDerivedDepth(node.object);
        if(derivedDepth!==undefined&&derivedDepth>0)return derivedDepth;
        if(isWeakMapConstructor(node.object))return 0;
      }
      if(key==='__proto__') {
        const parentDepth=weakMapPrototypeChainDepth(node.object);
        if(parentDepth===1)return 0;
        if(parentDepth!==undefined&&parentDepth>1)return parentDepth-1;
        if(isWeakMapInstance(node.object))return 0;
      }
    }
    if(node.type==='CallExpression'&&isPrototypeGetterCall(node)) {
      const parentDepth=weakMapPrototypeChainDepth(node.arguments[0]);
      if(parentDepth===1)return 0;
      if(parentDepth!==undefined&&parentDepth>1)return parentDepth-1;
      if(isWeakMapInstance(node.arguments[0]))return 0;
    }
    return undefined;
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isWeakMapPrototypeExpression(node) {
    return weakMapPrototypeChainDepth(node)===0;
  }
  /**
   * @param {AstNode} pattern
   * @param {AstNode|null|undefined} init
   */
  function collectDestructuredAliases(pattern,init) {
    if(pattern.type!=='ObjectPattern')return;
    for(const property of pattern.properties) {
      if(property.type!=='Property'||property.value.type!=='Identifier')continue;
      const key=property.computed?staticString(property.key):
        property.key.type==='Identifier'?property.key.name:staticString(property.key);
      if(key==='getPrototypeOf'&&
         (isNamespace(init,objectNamespaces)||isNamespace(init,reflectNamespaces))) {
        prototypeGetters.add(property.value.name);
      }
      if(isGlobalRoot(init)) {
        if(key==='WeakMap')weakMapConstructors.add(property.value.name);
        if(key==='Object')objectNamespaces.add(property.value.name);
        if(key==='Reflect')reflectNamespaces.add(property.value.name);
      }
      if(key==='prototype') {
        const depth=weakMapDerivedDepth(init);
        if(depth===0)prototypeAliases.add(property.value.name);
        else if(depth!==undefined)weakMapPrototypeChainDepths.set(property.value.name,depth);
      }
      if(key==='__proto__') {
        const depth=weakMapPrototypeChainDepth(init);
        if(depth===1)exposed=true;
        else if(depth!==undefined&&depth>1)
          weakMapPrototypeChainDepths.set(property.value.name,depth-1);
      }
    }
  }
  /**
   * @param {AstNode[]} ancestors
   * @returns {{name:string|null,ownerName:string|null,exported:boolean,returnedFactories:Set<string>,returnsWeakMap:boolean,returnValues:AstNode[]}|undefined}
   */
  function nearestFunctionInfo(ancestors) {
    for(let index=ancestors.length-1;index>=0;index--) {
      const info=functionInfoByNode.get(ancestors[index]);
      if(info)return info;
    }
    return undefined;
  }
  /** @param {string} name @returns {boolean} */
  function resolvesToEscapedContainer(name) {
    const seen=new Set();
    let current=name;
    while(current&&!seen.has(current)) {
      if(exportedLocalNames.has(current)||importedLocalNames.has(current))return true;
      seen.add(current);
      current=objectAliases.get(current);
    }
    return false;
  }

  // A direct call to a unique, private local reader does not publish its
  // WeakMap argument. Keep this proof deliberately narrow: only functions
  // with unique, unreassigned bindings and parameters used solely as receivers
  // of native get/has/delete calls qualify. Returned get() values remain
  // maybe-carriers if a caller later exposes them.
  /** @type {Map<string,AstNode>} */
  const localFunctionNodes=new Map();
  /** @type {Set<string>} */
  const exportedFunctionNames=new Set();
  for(const statement of ast.body??[]) {
    if(statement.type==='ExportNamedDeclaration') {
      for(const specifier of statement.specifiers??[]) {
        if(specifier.local?.type==='Identifier')exportedFunctionNames.add(specifier.local.name);
      }
      const declaration=statement.declaration;
      if(declaration?.type==='FunctionDeclaration'&&declaration.id?.type==='Identifier')
        exportedFunctionNames.add(declaration.id.name);
      if(declaration?.type==='VariableDeclaration') {
        for(const item of declaration.declarations??[])
          if(item.id?.type==='Identifier')exportedFunctionNames.add(item.id.name);
      }
    } else if(statement.type==='ExportDefaultDeclaration') {
      if(statement.declaration?.type==='Identifier')
        exportedFunctionNames.add(statement.declaration.name);
      if(statement.declaration?.type==='FunctionDeclaration'&&statement.declaration.id?.type==='Identifier')
        exportedFunctionNames.add(statement.declaration.id.name);
    }
    const declaration=statement.type==='ExportNamedDeclaration'?
      statement.declaration:statement.type==='ExportDefaultDeclaration'?
        statement.declaration:statement;
    if(declaration?.type==='FunctionDeclaration'&&declaration.id?.type==='Identifier')
      localFunctionNodes.set(declaration.id.name,declaration);
    if(declaration?.type==='VariableDeclaration') {
      for(const item of declaration.declarations??[]) {
        if(item.id?.type==='Identifier'&&item.init&&functionTypes.has(item.init.type))
          localFunctionNodes.set(item.id.name,item.init);
      }
    }
  }
  /**
   * @param {AstNode|null|undefined} pattern
   * @param {Map<string,number>} counts
   */
  function addPatternBindings(pattern,counts) {
    if(!pattern)return;
    if(pattern.type==='Identifier')counts.set(pattern.name,(counts.get(pattern.name)??0)+1);
    else if(pattern.type==='AssignmentPattern')addPatternBindings(pattern.left,counts);
    else if(pattern.type==='RestElement')addPatternBindings(pattern.argument,counts);
    else if(pattern.type==='ArrayPattern') {
      for(const element of pattern.elements??[])addPatternBindings(element,counts);
    } else if(pattern.type==='ObjectPattern') {
      for(const property of pattern.properties??[]) {
        if(property.type==='RestElement')addPatternBindings(property.argument,counts);
        else if(property.type==='Property')addPatternBindings(property.value,counts);
      }
    }
  }
  /** @type {Map<string,number>} */
  const localBindingCounts=new Map();
  walk(ast,node=>{
    if(node.type==='VariableDeclarator')addPatternBindings(node.id,localBindingCounts);
    if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression') {
      if(node.id?.type==='Identifier')
        localBindingCounts.set(node.id.name,(localBindingCounts.get(node.id.name)??0)+1);
      for(const parameter of node.params??[])addPatternBindings(parameter,localBindingCounts);
    }
    if(node.type==='ArrowFunctionExpression') {
      for(const parameter of node.params??[])addPatternBindings(parameter,localBindingCounts);
    }
    if(node.type==='ClassDeclaration'||node.type==='ClassExpression') {
      if(node.id?.type==='Identifier')
        localBindingCounts.set(node.id.name,(localBindingCounts.get(node.id.name)??0)+1);
    }
    if(node.type==='ImportDeclaration') {
      for(const specifier of node.specifiers??[]) {
        if(specifier.local?.type==='Identifier')
          localBindingCounts.set(specifier.local.name,(localBindingCounts.get(specifier.local.name)??0)+1);
      }
    }
    if(node.type==='CatchClause')addPatternBindings(node.param,localBindingCounts);
  });
  /** @type {Set<string>} */
  const reassignedLocalFunctions=new Set();
  walk(ast,node=>{
    if(node.type==='AssignmentExpression'&&node.left?.type==='Identifier')
      reassignedLocalFunctions.add(node.left.name);
    if(node.type==='UpdateExpression'&&node.argument?.type==='Identifier')
      reassignedLocalFunctions.add(node.argument.name);
  });
  /**
   * @param {AstNode|null|undefined} root
   * @param {string} name
   * @returns {boolean}
   */
  function containsIdentifier(root,name) {
    let found=false;
    if(root)walk(root,node=>{if(node.type==='Identifier'&&node.name===name)found=true;});
    return found;
  }
  /**
   * @param {AstNode} fn
   * @param {string} paramName
   * @returns {{safe:boolean,returnMaybe:boolean,returnsParameter:boolean,returnsPrototype:boolean}}
   */
  function localReaderParameter(fn,paramName) {
    let safe=true;
    let returnMaybe=false;
    /**
     * @param {AstNode|null|undefined} node
     * @param {AstNode|null|undefined} parent
     * @param {AstNode|null|undefined} grand
     */
    function inspect(node,parent,grand) {
      if(!node||typeof node!=='object'||typeof node.type!=='string')return;
      if(functionTypes.has(node.type)) {
        safe=false;
        return;
      }
      if(node.type==='WithStatement')safe=false;
      if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&
         (node.callee.name==='eval'||node.callee.name==='Function'))safe=false;
      if(node.type==='VariableDeclarator'&&node.id&&containsIdentifier(node.id,paramName))
        safe=false;
      if(node.type==='CatchClause'&&node.param&&containsIdentifier(node.param,paramName))
        safe=false;
      if(node.type==='ClassDeclaration'&&node.id?.name===paramName)safe=false;
      if(node.type==='Identifier'&&node.name===paramName) {
        const allowed=parent?.type==='MemberExpression'&&parent.object===node&&
          ['get','has','delete'].includes(memberKey(parent)??'')&&
          grand?.type==='CallExpression'&&grand.callee===parent&&
          !parent.optional&&!grand.optional;
        if(!allowed)safe=false;
      }
      if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&
         node.callee.object?.type==='Identifier'&&node.callee.object.name===paramName&&
         memberKey(node.callee)==='get'&&
         !['ReturnStatement','ExpressionStatement'].includes(parent?.type??''))safe=false;
      if(node.type==='ReturnStatement'&&node.argument&&containsIdentifier(node.argument,paramName))
        returnMaybe=true;
      for(const value of Object.values(node)) {
        if(Array.isArray(value)) {
          for(const child of value) {
            if(child&&typeof child==='object'&&typeof child.type==='string')
              inspect(child,node,parent);
          }
        } else if(value&&typeof value==='object'&&typeof value.type==='string') {
          inspect(value,node,parent);
        }
      }
    }
    if(fn.async||fn.generator)
      return {safe:false,returnMaybe:false,returnsParameter:false,returnsPrototype:false};
    const returnExpression=fn.body?.type==='BlockStatement'&&fn.body.body?.length===1&&
      fn.body.body[0]?.type==='ReturnStatement'?
        fn.body.body[0].argument:fn.body?.type==='BlockStatement'?null:fn.body;
    const directIdentityReturn=returnExpression?.type==='Identifier'&&
      returnExpression.name===paramName;
    if(directIdentityReturn)
      return {safe:true,returnMaybe:false,returnsParameter:true,returnsPrototype:false};
    const directPrototypeReturn=returnExpression?.type==='MemberExpression'&&
      memberKey(returnExpression)==='prototype'&&
      returnExpression.object?.type==='MemberExpression'&&
      memberKey(returnExpression.object)==='constructor'&&
      returnExpression.object.object?.type==='Identifier'&&
      returnExpression.object.object.name===paramName&&
      !returnExpression.computed&&!returnExpression.object.computed&&
      !returnExpression.optional&&!returnExpression.object.optional;
    if(directPrototypeReturn)
      return {safe:true,returnMaybe:true,returnsParameter:false,returnsPrototype:true};
    if(fn.body?.type==='BlockStatement')inspect(fn.body,null,null);
    else {
      inspect(fn.body,null,null);
      if(containsIdentifier(fn.body,paramName))returnMaybe=true;
    }
    return {safe,returnMaybe:safe&&returnMaybe,returnsParameter:false,returnsPrototype:false};
  }
  /** @type {Map<string,{safeParameters:Set<number>,returnMaybeParameters:Set<number>,returnParameterIndices:Set<number>,prototypeReturnParameters:Set<number>}>} */
  const localFunctionSummaries=new Map();
  for(const [name,fn] of localFunctionNodes) {
    if(exportedFunctionNames.has(name)||localBindingCounts.get(name)!==1||
       reassignedLocalFunctions.has(name))continue;
    const summary={
      safeParameters:new Set(),
      returnMaybeParameters:new Set(),
      returnParameterIndices:new Set(),
      prototypeReturnParameters:new Set()
    };
    for(let index=0;index<(fn.params??[]).length;index++) {
      const parameter=fn.params[index];
      if(parameter?.type!=='Identifier')continue;
      const result=localReaderParameter(fn,parameter.name);
      if(result.safe)summary.safeParameters.add(index);
      if(result.safe&&result.returnMaybe)summary.returnMaybeParameters.add(index);
      if(result.safe&&result.returnsParameter)summary.returnParameterIndices.add(index);
      if(result.safe&&result.returnsPrototype)summary.prototypeReturnParameters.add(index);
    }
    localFunctionSummaries.set(name,summary);
  }

  // Resolve constructor aliases and derived classes before the exposure walk.
  // This fixed point is intentionally conservative: if any feasible branch
  // reaches WeakMap, the binding remains a possible native constructor.
  let derivedBindingsChanged=true;
  while(derivedBindingsChanged) {
    derivedBindingsChanged=false;
    walk(ast,(node,parent)=>{
      if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier') {
        const depth=weakMapDerivedDepth(node.init);
        if(depth===0&&!weakMapConstructors.has(node.id.name)) {
          weakMapConstructors.add(node.id.name);
          derivedBindingsChanged=true;
        } else if(depth!==undefined&&depth>0) {
          derivedBindingsChanged=
            recordWeakMapDerivedConstructor(node.id.name,depth)||derivedBindingsChanged;
        }
      }
      if(node.type==='AssignmentExpression'&&node.left?.type==='Identifier') {
        const depth=weakMapDerivedDepth(node.right);
        if(depth===0&&!weakMapConstructors.has(node.left.name)) {
          weakMapConstructors.add(node.left.name);
          derivedBindingsChanged=true;
        } else if(depth!==undefined&&depth>0) {
          derivedBindingsChanged=
            recordWeakMapDerivedConstructor(node.left.name,depth)||derivedBindingsChanged;
        }
      }
      if(node.type==='ClassDeclaration'||node.type==='ClassExpression') {
        const parentDepth=weakMapDerivedDepth(node.superClass);
        if(parentDepth===undefined)return;
        const derivedDepth=parentDepth+1;
        if(node.id?.type==='Identifier')
          derivedBindingsChanged=
            recordWeakMapDerivedConstructor(node.id.name,derivedDepth)||derivedBindingsChanged;
        if(parent?.type==='VariableDeclarator'&&parent.id?.type==='Identifier')
          derivedBindingsChanged=
            recordWeakMapDerivedConstructor(parent.id.name,derivedDepth)||derivedBindingsChanged;
        if(parent?.type==='AssignmentExpression'&&parent.left?.type==='Identifier')
          derivedBindingsChanged=
            recordWeakMapDerivedConstructor(parent.left.name,derivedDepth)||derivedBindingsChanged;
      }
    });
  }
  let exposed=false;
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='ExportNamedDeclaration') {
      for(const specifier of node.specifiers??[]) {
        if(specifier.type==='ExportSpecifier'&&specifier.local?.type==='Identifier')
          exportedLocalNames.add(specifier.local.name);
      }
      const declaration=node.declaration;
      if(declaration?.type==='VariableDeclaration') {
        for(const item of declaration.declarations??[]) {
          if(item.id?.type==='Identifier')exportedLocalNames.add(item.id.name);
        }
      } else if((declaration?.type==='FunctionDeclaration'||
                 declaration?.type==='ClassDeclaration')&&declaration.id?.type==='Identifier') {
        exportedLocalNames.add(declaration.id.name);
      }
    }
    if(node.type==='ExportDefaultDeclaration') {
      if(node.declaration?.type==='Identifier')exportedLocalNames.add(node.declaration.name);
      else if((node.declaration?.type==='ClassDeclaration'||
               node.declaration?.type==='ClassExpression')&&
              weakMapDerivedDepth(node.declaration)!==undefined)exposed=true;
      else if(containsWeakMapInstanceValue(node.declaration))exposed=true;
    }
    if(node.type==='ImportDeclaration') {
      for(const specifier of node.specifiers??[]) {
        if(specifier.local?.type==='Identifier')importedLocalNames.add(specifier.local.name);
      }
    }
    if(node.type==='ClassDeclaration'&&node.id?.type==='Identifier')
      exportedValueNodes.set(node.id.name,node);
    if(functionTypes.has(node.type)) {
      const name=node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'?
        node.id.name:
        parent?.type==='VariableDeclarator'&&parent.id?.type==='Identifier'?
          parent.id.name:
        parent?.type==='AssignmentExpression'&&parent.left?.type==='Identifier'?
          parent.left.name:null;
      const classOwner=[...ancestors].reverse().find(ancestor=>
        ancestor.type==='ClassDeclaration'&&ancestor.id?.type==='Identifier');
      const variableOwner=[...ancestors].reverse().find(ancestor=>
        ancestor.type==='VariableDeclarator'&&ancestor.id?.type==='Identifier');
      const ownerName=name??classOwner?.id?.name??variableOwner?.id?.name??null;
      const info={
        name,
        ownerName,
        exported:ancestors.some(ancestor=>
          ancestor.type==='ExportNamedDeclaration'||ancestor.type==='ExportDefaultDeclaration'),
        returnedFactories:new Set(),
        returnsWeakMap:false,
        returnValues:node.type==='ArrowFunctionExpression'&&node.body.type!=='BlockStatement'?
          [node.body]:[]
      };
      functionInfoByNode.set(node,info);
    }
    if(node.type==='ForOfStatement'&&node.left?.type==='VariableDeclaration'&&
       containsWeakMapInstanceValue(node.right)) {
      for(const declaration of node.left.declarations??[])
        if(declaration.id.type==='Identifier')weakMapInstances.add(declaration.id.name);
    }
    if(node.type==='VariableDeclarator') {
      if(node.id.type==='Identifier') {
        const name=node.id.name,init=node.init;
        if(init)exportedValueNodes.set(name,init);
        if(init?.type==='Identifier')objectAliases.set(name,init.name);
        if(isGlobalRoot(init)||
           init?.type==='Identifier'&&globalNames.has(init.name))globalNames.add(name);
        if(isWeakMapConstructor(init))weakMapConstructors.add(name);
        const derivedDepth=weakMapDerivedDepth(init);
        if(derivedDepth===0)weakMapConstructors.add(name);
        else if(derivedDepth!==undefined)
          recordWeakMapDerivedConstructor(name,derivedDepth);
        const prototypeDepth=weakMapPrototypeChainDepth(init);
        if(prototypeDepth===0)exposed=true;
        else if(prototypeDepth!==undefined)weakMapPrototypeChainDepths.set(name,prototypeDepth);
        if(isWeakMapInstance(init))weakMapInstances.add(name);
        if(init&&containsWeakMapInstanceValue(init))weakMapContainerInstances.add(name);
        if(isNamespace(init,objectNamespaces))objectNamespaces.add(name);
        if(isNamespace(init,reflectNamespaces))reflectNamespaces.add(name);
        if(init?.type==='MemberExpression'&&isNamespace(init.object,reflectNamespaces)&&
           memberKey(init)==='get')reflectGetMethods.add(name);
        if(init?.type==='Identifier'&&reflectGetMethods.has(init.name))
          reflectGetMethods.add(name);
        if(isPrototypeGetterMember(init)||
           init?.type==='Identifier'&&prototypeGetters.has(init.name))
          prototypeGetters.add(name);
        if(isWeakMapPrototypeExpression(init))prototypeAliases.add(name);
        if(ancestors.some(ancestor=>ancestor.type==='ExportNamedDeclaration')&&
           containsWeakMapInstanceValue(init))exposed=true;
      } else if(node.id.type==='ObjectPattern') {
        collectDestructuredAliases(node.id,node.init);
      }
    }
    if(node.type==='AssignmentExpression') {
      if(node.left.type==='Identifier') {
        const name=node.left.name,value=node.right;
        if(value.type==='Identifier')objectAliases.set(name,value.name);
        if(isGlobalRoot(value)||
           value.type==='Identifier'&&globalNames.has(value.name))globalNames.add(name);
        if(isWeakMapConstructor(value))weakMapConstructors.add(name);
        const derivedDepth=weakMapDerivedDepth(value);
        if(derivedDepth===0)weakMapConstructors.add(name);
        else if(derivedDepth!==undefined)
          recordWeakMapDerivedConstructor(name,derivedDepth);
        const prototypeDepth=weakMapPrototypeChainDepth(value);
        if(prototypeDepth===0)exposed=true;
        else if(prototypeDepth!==undefined)weakMapPrototypeChainDepths.set(name,prototypeDepth);
        if(isWeakMapInstance(value))weakMapInstances.add(name);
        if(containsWeakMapInstanceValue(value))weakMapContainerInstances.add(name);
        if(isNamespace(value,objectNamespaces))objectNamespaces.add(name);
        if(isNamespace(value,reflectNamespaces))reflectNamespaces.add(name);
        if(isPrototypeGetterMember(value)||
           value.type==='Identifier'&&prototypeGetters.has(value.name))
          prototypeGetters.add(name);
        if(isWeakMapPrototypeExpression(value))prototypeAliases.add(name);
      } else if(node.left.type==='MemberExpression') {
        const root=rootIdentifier(node.left.object);
        const info=nearestFunctionInfo(ancestors);
        const classOwner=[...ancestors].reverse().find(ancestor=>
          ancestor.type==='ClassDeclaration'&&ancestor.id?.type==='Identifier');
        if(root&&containsWeakMapInstanceValue(node.right))
          weakMapContainerInstances.add(root);
        memberWrites.push({
          root,
          ownerName:info?.ownerName??classOwner?.id?.name??null,
          global:isGlobalObjectPath(node.left.object),
          imported:Boolean(root&&importedLocalNames.has(root)),
          exportedFunction:Boolean(info?.exported),
          value:node.right
        });
      }
    }
    if(node.type==='ReturnStatement'||node.type==='YieldExpression') {
      const info=nearestFunctionInfo(ancestors);
      if(info&&node.argument)info.returnValues.push(node.argument);
    }
    const unknownGlobalSlotAssignment=
      node.type==='MemberExpression'&&parent?.type==='AssignmentExpression'&&key==='left'&&
      (()=> {
        const globalProperty=globalRootProperty(node);
        return globalProperty!==null&&globalProperty!=='*'&&
          !knownGlobalConstructorNames.has(globalProperty)&&
          !['prototype','__proto__'].includes(memberKey(node)??'');
      })();
    if(!unknownGlobalSlotAssignment&&isWeakMapPrototypeExpression(node))exposed=true;
    // Direct arguments to opaque calls escape. A unique private local reader
    // is exempt only for parameters whose complete body proves a native
    // get/has/delete receiver-only use.
    if(node.type==='CallExpression') {
      const summary=node.callee.type==='Identifier'?
        localFunctionSummaries.get(node.callee.name):undefined;
      if(node.arguments.some((/** @type {AstNode} */ argument,/** @type {number} */ index)=>
        isWeakMapInstance(argument)&&!summary?.safeParameters.has(index)))exposed=true;
    }
    // Also cover a WeakMap nested in an array/object/factory expression passed
    // as a call argument, without treating unrelated prototype reads as escapes.
    if(node.type==='NewExpression'&&isWeakMapConstructor(node.callee)) {
      const enclosingCall=[...ancestors].reverse().find(ancestor=>
        ancestor.type==='CallExpression'&&ancestor.arguments.some((/** @type {AstNode} */ argument)=>
          argument.start<=node.start&&argument.end>=node.end));
      if(enclosingCall) {
        const argumentIndex=enclosingCall.arguments.findIndex((/** @type {AstNode} */ argument)=>
          argument.start<=node.start&&argument.end>=node.end);
        const summary=enclosingCall.callee.type==='Identifier'?
          localFunctionSummaries.get(enclosingCall.callee.name):undefined;
        const directArgument=enclosingCall.arguments[argumentIndex]===node;
        if(!(directArgument&&summary?.safeParameters.has(argumentIndex)))exposed=true;
      }
    }
  });

  // Resolve return/yield values after the complete file has contributed its
  // constructor and instance aliases. This handles helpers declared after
  // their callers and generators that yield a WeakMap instance.
  for(const info of functionInfoByNode.values()) {
    for(const value of info.returnValues) {
      if(containsWeakMapInstanceValue(value))info.returnsWeakMap=true;
      else if(value.type==='CallExpression'&&value.callee.type==='Identifier')
        info.returnedFactories.add(value.callee.name);
    }
  }
  // Exporting a WeakMap instance, constructor, container, or factory that
  // returns/yields a WeakMap is a group escape: another supplied file (or a
  // consumer of the entry module) can obtain the instance and inspect the
  // process-wide prototype. Public member writes and global publication are
  // also escapes; unrelated local WeakMaps remain eligible.
  let changed=true;
  while(changed) {
    changed=false;
    for(const info of functionInfoByNode.values()) {
      if(!info.returnsWeakMap&&
         info.returnValues.some(containsWeakMapInstanceValue)) {
        info.returnsWeakMap=true;
        changed=true;
      }
      if(!info.returnsWeakMap&&
         [...info.returnedFactories].some(name=>weakMapFactories.has(name))) {
        info.returnsWeakMap=true;
        changed=true;
      }
      if(info.returnsWeakMap) {
        for(const name of [info.name,info.ownerName]) {
          if(name&&!weakMapFactories.has(name)) {
            weakMapFactories.add(name);
            changed=true;
          }
        }
        if(info.exported)exposed=true;
      }
    }
  }
  // Resolve writes only after factory summaries reach a fixed point. A
  // helper declared later in the module can return a WeakMap that is stored
  // into an exported object, a global slot, or a public instance property.
  for(const write of memberWrites) {
    if(!containsWeakMapInstanceValue(write.value))continue;
    if(write.global||write.imported) {
      exposed=true;
      break;
    }
    if(write.ownerName) {
      weakMapContainerOwners.add(write.ownerName);
      weakMapContainerInstances.add(write.ownerName);
      continue;
    }
    if(write.root) {
      weakMapContainerOwners.add(write.root);
      weakMapContainerInstances.add(write.root);
      continue;
    }
    if(write.exportedFunction) {
      exposed=true;
      break;
    }
    // An unrooted member target cannot be proven private.
    exposed=true;
    break;
  }
  // Member-write summaries can reveal a local carrier only after factory
  // return summaries have reached their first fixed point. Propagate those
  // newly discovered container bindings back into enclosing factory returns.
  let containerFactoryChanged=true;
  while(containerFactoryChanged) {
    containerFactoryChanged=false;
    for(const info of functionInfoByNode.values()) {
      if(!info.returnsWeakMap&&
         info.returnValues.some(containsWeakMapInstanceValue)) {
        info.returnsWeakMap=true;
        containerFactoryChanged=true;
      }
      if(!info.returnsWeakMap)continue;
      if(info.name&&!weakMapFactories.has(info.name)) {
        weakMapFactories.add(info.name);
        containerFactoryChanged=true;
      }
      if(info.ownerName&&!weakMapFactories.has(info.ownerName)) {
        weakMapFactories.add(info.ownerName);
        containerFactoryChanged=true;
      }
      for(const factory of info.returnedFactories) {
        if(weakMapFactories.has(factory)&&info.name&&!weakMapFactories.has(info.name)) {
          weakMapFactories.add(info.name);
          containerFactoryChanged=true;
        }
        if(weakMapFactories.has(factory)&&info.ownerName&&!weakMapFactories.has(info.ownerName)) {
          weakMapFactories.add(info.ownerName);
          containerFactoryChanged=true;
        }
      }
    }
  }
  /**
   * Follow local aliases and object values at CommonJS publication points.
   * @param {string} name
   * @param {Set<AstNode|string>} seen
   * @returns {boolean}
   */
  function containsExportedWeakMapCapabilityIdentifier(name,seen) {
    const visitKey='identifier:'+name;
    if(seen.has(visitKey))return false;
    seen.add(visitKey);
    if(weakMapInstances.has(name)||
       weakMapContainerInstances.has(name)||
       weakMapContainerOwners.has(name)||
       weakMapFactories.has(name)||
       weakMapConstructors.has(name)||
       weakMapDerivedConstructors.has(name)||
       prototypeAliases.has(name)||
       importedLocalNames.has(name))return true;
    const exportedValue=exportedValueNodes.get(name);
    if(exportedValue&&containsExportedWeakMapCapability(exportedValue,seen))return true;
    const alias=objectAliases.get(name);
    return Boolean(alias&&containsExportedWeakMapCapabilityIdentifier(alias,seen));
  }
  /**
   * CommonJS publication points are reachable by consumers outside the
   * supplied module graph. Treat exported WeakMap instances, derived
   * constructors, factories, and unresolved imported capabilities as escapes.
   * @param {AstNode|null|undefined} node
   * @param {Set<AstNode|string>} [seen=new Set()]
   * @returns {boolean}
   */
  function containsExportedWeakMapCapability(node,seen=new Set()) {
    if(!node)return false;
    if(node.type==='Identifier')
      return containsExportedWeakMapCapabilityIdentifier(node.name,seen);
    if(seen.has(node))return false;
    seen.add(node);
    if(node.type==='ClassDeclaration'||node.type==='ClassExpression')
      return weakMapDerivedDepth(node)!==undefined||containsWeakMapInstanceValue(node);
    if(functionTypes.has(node.type)) {
      const info=functionInfoByNode.get(node);
      return Boolean(info?.returnsWeakMap||
        [...(info?.returnedFactories??[])].some(name=>weakMapFactories.has(name)));
    }
    if(node.type==='ObjectExpression') {
      return (node.properties??[]).some((/** @type {AstNode} */ property)=>
        property.type==='SpreadElement'?
          containsExportedWeakMapCapability(property.argument,seen):
        property.type==='Property'?
          containsExportedWeakMapCapability(property.value,seen):false);
    }
    if(node.type==='ArrayExpression')
      return (node.elements??[]).some((/** @type {AstNode|null} */ element)=>
        containsExportedWeakMapCapability(element,seen));
    if(node.type==='CallExpression') {
      if(node.callee.type==='Identifier'&&
         (weakMapFactories.has(node.callee.name)||importedLocalNames.has(node.callee.name)))return true;
      if(isRequireCall(node.callee))return true;
      if(node.callee.type==='MemberExpression'&&
         (isRequireCall(node.callee.object)||
          Boolean(rootIdentifier(node.callee.object)&&
            importedLocalNames.has(rootIdentifier(node.callee.object)??''))))return true;
      return containsWeakMapInstanceValue(node);
    }
    if(node.type==='AssignmentExpression')
      return containsExportedWeakMapCapability(node.right,seen);
    if(node.type==='ConditionalExpression')
      return containsExportedWeakMapCapability(node.consequent,seen)||
        containsExportedWeakMapCapability(node.alternate,seen);
    if(node.type==='LogicalExpression')
      return containsExportedWeakMapCapability(node.left,seen)||
        containsExportedWeakMapCapability(node.right,seen);
    if(node.type==='SequenceExpression')
      return containsExportedWeakMapCapability(node.expressions.at(-1),seen);
    if(node.type==='AwaitExpression'||node.type==='YieldExpression')
      return containsExportedWeakMapCapability(node.argument,seen);
    if(node.type==='ChainExpression')
      return containsExportedWeakMapCapability(node.expression,seen);
    if(node.type==='MemberExpression') {
      const root=rootIdentifier(node);
      return Boolean(root&&importedLocalNames.has(root))||
        isRequireCall(node.object)||containsWeakMapInstanceValue(node);
    }
    return containsWeakMapInstanceValue(node);
  }
  /**
   * @param {string} name
   * @param {Set<string>} seen
   * @returns {boolean}
   */
  function isCommonJsExportObjectIdentifier(name,seen) {
    if(name==='exports')return true;
    if(seen.has(name))return false;
    seen.add(name);
    const alias=objectAliases.get(name);
    if(alias&&isCommonJsExportObjectIdentifier(alias,seen))return true;
    const value=exportedValueNodes.get(name);
    return Boolean(value&&isCommonJsExportObject(value,seen));
  }
  /**
   * @param {AstNode|null|undefined} node
   * @param {Set<string>} [seen=new Set()]
   * @returns {boolean}
   */
  function isCommonJsExportObject(node,seen=new Set()) {
    if(!node)return false;
    if(node.type==='MemberExpression') {
      return node.object?.type==='Identifier'&&node.object.name==='module'&&
        memberKey(node)==='exports';
    }
    return node.type==='Identifier'&&
      isCommonJsExportObjectIdentifier(node.name,seen);
  }
  /**
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isCommonJsExportTarget(node) {
    if(node?.type!=='MemberExpression')return false;
    if(node.object?.type==='Identifier'&&node.object.name==='module'&&
       memberKey(node)==='exports')return true;
    return isCommonJsExportObject(node.object);
  }
  walk(ast,node=>{
    if(node.type==='AssignmentExpression'&&isCommonJsExportTarget(node.left)&&
       containsExportedWeakMapCapability(node.right))exposed=true;
  });
  for(const name of exportedLocalNames) {
    if(weakMapInstances.has(name)||weakMapFactories.has(name)||
       weakMapConstructors.has(name)||weakMapDerivedConstructors.has(name)||
       prototypeAliases.has(name)) {
      exposed=true;
      break;
    }
    const exportedValue=exportedValueNodes.get(name);
    if(exportedValue&&containsWeakMapInstanceValue(exportedValue)) {
      exposed=true;
      break;
    }
  }
  for(const name of weakMapContainerOwners) {
    if(resolvesToEscapedContainer(name)) {
      exposed=true;
      break;
    }
  }
  // A direct zero-argument local helper may write a WeakMap into a captured
  // carrier even when its return value says nothing about that effect.
  // Keep the simulation narrowly scoped to a syntactic WeakMap construction,
  // and may-join its effects rather than assuming direct calls are immutable.
  /** @type {Map<string,AstNode[]>} */
  const localWeakMapEffectDeclarations=new Map();
  for(const [functionNode,info] of functionInfoByNode) {
    if(functionNode.type!=='FunctionDeclaration'||!info.name||!functionNode.body)continue;
    let hasLocalWeakMap=false;
    walk(functionNode.body,node=>{
      if(node.type==='NewExpression'&&isWeakMapConstructor(node.callee))
        hasLocalWeakMap=true;
    });
    if(!hasLocalWeakMap)continue;
    const definitions=localWeakMapEffectDeclarations.get(info.name)??[];
    definitions.push(functionNode);
    localWeakMapEffectDeclarations.set(info.name,definitions);
  }
  // A bounded intra-module points-to pass closes the gap between a WeakMap
  // constructor and a later prototype-getter call that receives a container
  // member, destructured alias, spread copy, factory result, or class field.
  // It intentionally models only statically resolvable object/array keys;
  // unresolved imported/dynamic values are treated as possibly carrying a
  // WeakMap when they reach an opaque call.
  /** @typedef {{kind:'container',properties:Map<string,CarrierValue>,unknown:boolean}} CarrierContainer */
  /** @typedef {{kind:'weakmap'}|{kind:'maybe'}|{kind:'other'}|CarrierContainer} CarrierValue */
  /** @typedef {{value:CarrierValue,environment:Map<string,CarrierValue>}} CarrierThrow */
  /** @type {CarrierValue} */
  const carrierWeakMap={kind:'weakmap'};
  /** @type {CarrierValue} */
  const carrierMaybe={kind:'maybe'};
  /** @type {CarrierValue} */
  const carrierOther={kind:'other'};
  /** @returns {CarrierContainer} */
  function carrierContainer() {
    return {kind:'container',properties:new Map(),unknown:false};
  }
  /**
   * Snapshot the abstract heap at a control-flow fork. A shallow Map copy
   * leaves both paths sharing mutable CarrierContainer.properties; a write
   * along an unexecuted path can then erase a live WeakMap carrier. Preserve
   * alias sharing within each snapshot and terminate on cyclic containers.
   * @param {Map<string,CarrierValue>} environment
   * @returns {Map<string,CarrierValue>}
   */
  function snapshotCarrierEnvironment(environment) {
    /** @type {Map<CarrierContainer,CarrierContainer>} */
    const clones=new Map();
    /** @param {CarrierValue} value @returns {CarrierValue} */
    function snapshot(value) {
      if(value.kind!=='container')return value;
      const existing=clones.get(value);
      if(existing)return existing;
      const copy=carrierContainer();
      clones.set(value,copy);
      copy.unknown=value.unknown;
      for(const [key,nested] of value.properties)
        copy.properties.set(key,snapshot(nested));
      return copy;
    }
    return new Map([...environment].map(([name,value])=>[name,snapshot(value)]));
  }
  /**
   * @param {AstNode} property
   * @param {boolean} computed
   * @returns {string|null}
   */
  function carrierStaticKey(property,computed) {
    if(!computed&&property.type==='Identifier')return property.name;
    const key=staticString(property);
    if(key!==null)return key;
    if(property.type==='Literal'&&
       (typeof property.value==='number'||typeof property.value==='string'))
      return String(property.value);
    return null;
  }
  /**
   * Recursion-safe carrier membership, including containers with self-aliases.
   * @param {CarrierValue} value
   * @param {Set<CarrierContainer>} [seen=new Set()]
   * @returns {boolean}
   */
  function carrierMayContainWeakMap(value,seen=new Set()) {
    if(value.kind==='weakmap'||value.kind==='maybe')return true;
    if(value.kind==='container') {
      if(value.unknown)return true;
      if(seen.has(value))return false;
      seen.add(value);
      for(const nested of value.properties.values()) {
        if(carrierMayContainWeakMap(nested,seen))return true;
      }
    }
    return false;
  }
  /**
   * Join all statically represented slots for a dynamic key. A missing key is
   * not safe when another possible slot contains a WeakMap.
   * @param {CarrierValue} container
   * @param {string|null} key
   * @returns {CarrierValue}
   */
  function carrierLookupValue(container,key) {
    if(container.kind!=='container')return carrierOther;
    if(key!==null) {
      if(container.properties.has(key))return container.properties.get(key)??carrierOther;
      return container.unknown?carrierMaybe:carrierOther;
    }
    let value=carrierOther;
    for(const nested of container.properties.values())
      value=mergeCarrierValues(value,nested);
    if(container.unknown)value=mergeCarrierValues(value,carrierMaybe);
    return value;
  }
  /**
   * Join may-values with a pair memo. Both cyclic graphs and aliases shared
   * across environment bindings must survive a CFG join as one abstract heap.
   * @param {CarrierValue} left
   * @param {CarrierValue} right
   * @param {Map<CarrierContainer,Map<CarrierContainer,CarrierContainer>>} [pairs=new Map()]
   * @returns {CarrierValue}
   */
  function mergeCarrierValues(left,right,pairs=new Map()) {
    if(left.kind==='container'&&right.kind==='container') {
      let byRight=pairs.get(left);
      if(!byRight) {
        byRight=new Map();
        pairs.set(left,byRight);
      }
      const already=byRight.get(right);
      if(already)return already;
      const merged=carrierContainer();
      byRight.set(right,merged);
      merged.unknown=left.unknown||right.unknown;
      for(const [key,value] of left.properties)merged.properties.set(key,value);
      for(const [key,value] of right.properties) {
        merged.properties.set(key,merged.properties.has(key)?
          mergeCarrierValues(merged.properties.get(key)??carrierOther,value,pairs):value);
      }
      return merged;
    }
    if(left.kind==='weakmap'&&right.kind==='weakmap')return carrierWeakMap;
    if(left.kind==='other'&&right.kind==='other')return carrierOther;
    return carrierMayContainWeakMap(left)||carrierMayContainWeakMap(right)?
      carrierMaybe:carrierOther;
  }
  /**
   * Join two alternative environments with one alias-sharing graph memo.
   * @param {Map<string,CarrierValue>} target
   * @param {Map<string,CarrierValue>} left
   * @param {Map<string,CarrierValue>} right
   * @returns {void}
   */
  function joinCarrierEnvironments(target,left,right) {
    /** @type {Map<CarrierContainer,Map<CarrierContainer,CarrierContainer>>} */
    const pairs=new Map();
    const names=[...new Set([...left.keys(),...right.keys()])];
    for(const name of names)
      target.set(name,mergeCarrierValues(
        left.get(name)??carrierOther,right.get(name)??carrierOther,pairs));

    // A per-name (left,right) memo does not preserve *disjunctive* aliases.
    // Consider one path where a===b and another where a!==b. The two
    // separately merged result objects must still may-alias: a later write
    // through a may-alias can affect b. Coalesce root binding components that
    // were the identical container on *either* predecessor. This can decline
    // benign rewrites, but must not drop a feasible WeakMap prototype effect.
    /** @type {Map<string,string>} */
    const representatives=new Map(names.map(name=>[name,name]));
    /** @param {string} name @returns {string} */
    function find(name) {
      const parent=representatives.get(name)??name;
      if(parent===name)return name;
      const root=find(parent);
      representatives.set(name,root);
      return root;
    }
    /** @param {string} first @param {string} second @returns {void} */
    function unite(first,second) {
      representatives.set(find(first),find(second));
    }
    for(const predecessor of [left,right]) {
      /** @type {Map<CarrierContainer,string>} */
      const seen=new Map();
      for(const name of names) {
        const value=predecessor.get(name);
        if(value?.kind!=='container')continue;
        const earlier=seen.get(value);
        if(earlier!==undefined)unite(earlier,name);
        else seen.set(value,name);
      }
    }
    /** @type {Map<string,string[]>} */
    const groups=new Map();
    for(const name of names) {
      const root=find(name);
      const group=groups.get(root)??[];
      group.push(name);
      groups.set(root,group);
    }
    for(const group of groups.values()) {
      if(group.length<2)continue;
      let combined=target.get(group[0])??carrierOther;
      /** @type {Map<CarrierContainer,Map<CarrierContainer,CarrierContainer>>} */
      const sharedPairs=new Map();
      for(const name of group.slice(1)) {
        const value=target.get(name)??carrierOther;
        if(combined!==value)
          combined=mergeCarrierValues(combined,value,sharedPairs);
      }
      for(const name of group)target.set(name,combined);
    }
  }
  /**
   * Whether an accessor or method can yield a WeakMap carrier. Unknown
   * external getter values remain MaybeWeakMap; proven primitive/local values
   * retain their existing precision.
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function functionMayReturnWeakMap(node) {
    if(!node)return true;
    if(node.type==='Identifier')
      return importedLocalNames.has(node.name)||weakMapFactories.has(node.name);
    if(!functionTypes.has(node.type))return true;
    const info=functionInfoByNode.get(node);
    if(!info)return true;
    return Boolean(info.returnsWeakMap||
      [...info.returnedFactories].some(name=>
        weakMapFactories.has(name)||importedLocalNames.has(name)));
  }
  /**
   * @param {AstNode|null|undefined} node
   * @param {Map<string,CarrierValue>} environment
   * @param {CarrierValue} [thisValue=carrierOther]
   * @returns {CarrierValue}
   */
  function evaluateCarrierValue(node,environment,thisValue=carrierOther) {
    if(!node)return carrierOther;
    if(node.type==='Identifier') {
      if(environment.has(node.name))return environment.get(node.name)??carrierOther;
      if(weakMapInstances.has(node.name))return carrierWeakMap;
      if(importedLocalNames.has(node.name))return carrierMaybe;
      return carrierOther;
    }
    if(node.type==='ThisExpression')return thisValue;
    if(node.type==='NewExpression') {
      if(isWeakMapConstructor(node.callee))return carrierWeakMap;
      if(node.callee.type==='Identifier'&&weakMapFactories.has(node.callee.name))
        return carrierMaybe;
      if(node.callee.type==='Identifier'&&weakMapContainerOwners.has(node.callee.name)) {
        const instance=carrierContainer();
        instance.unknown=true;
        return instance;
      }
      return carrierOther;
    }
    if(node.type==='ObjectExpression') {
      const value=carrierContainer();
      for(const property of node.properties??[]) {
        if(property.type==='SpreadElement') {
          const spread=evaluateCarrierValue(property.argument,environment,thisValue);
          if(spread.kind==='container') {
            for(const [key,nested] of spread.properties)value.properties.set(key,nested);
            value.unknown=value.unknown||spread.unknown;
          } else if(carrierMayContainWeakMap(spread))value.unknown=true;
          continue;
        }
        if(property.type!=='Property') {
          value.unknown=true;
          continue;
        }
        const propertyKey=carrierStaticKey(property.key,property.computed);
        if(propertyKey===null) {
          value.unknown=true;
          continue;
        }
        const getterMayReturnWeakMap=property.kind==='get'&&
          functionMayReturnWeakMap(property.value);
        value.properties.set(propertyKey,getterMayReturnWeakMap?
          carrierMaybe:evaluateCarrierValue(property.value,environment,thisValue));
      }
      return value;
    }
    if(node.type==='ArrayExpression') {
      const value=carrierContainer();
      let index=0;
      for(const element of node.elements??[]) {
        if(element?.type==='SpreadElement') {
          const spread=evaluateCarrierValue(element.argument,environment,thisValue);
          if(spread.kind==='container') {
            const keys=[...spread.properties.keys()].sort((left,right)=>Number(left)-Number(right));
            for(const key of keys)value.properties.set(String(index++),spread.properties.get(key)??carrierOther);
            value.unknown=value.unknown||spread.unknown;
          } else if(carrierMayContainWeakMap(spread))value.unknown=true;
          continue;
        }
        value.properties.set(String(index++),evaluateCarrierValue(element,environment,thisValue));
      }
      return value;
    }
    if(node.type==='MemberExpression') {
      const key=carrierStaticKey(node.property,node.computed);
      if(node.object.type==='Identifier'&&weakMapContainerOwners.has(node.object.name)&&
         !environment.has(node.object.name))return carrierMaybe;
      const base=evaluateCarrierValue(node.object,environment,thisValue);
      if(base.kind==='container')return carrierLookupValue(base,key);
      return base.kind==='maybe'?carrierMaybe:carrierOther;
    }
    if(node.type==='CallExpression') {
      // An imported binding or unresolved CommonJS module can return a
      // WeakMap even when its implementation is outside this compilation.
      // Preserve that uncertainty through calls and member-call receivers.
      if(isRequireCall(node))return carrierMaybe;
      if(node.callee.type==='Identifier') {
        const calledValue=environment.get(node.callee.name);
        if(importedLocalNames.has(node.callee.name)||calledValue?.kind==='maybe')
          return carrierMaybe;
        const summary=localFunctionSummaries.get(node.callee.name);
        if(summary) {
          for(const index of summary.returnParameterIndices)
            return evaluateCarrierValue(node.arguments[index],environment,thisValue);
          for(const index of summary.returnMaybeParameters) {
            const argumentValue=evaluateCarrierValue(node.arguments[index],environment,thisValue);
            const isPlainContainer=argumentValue.kind==='container'&&!argumentValue.unknown&&
              !argumentValue.properties.has('constructor');
            if(summary.prototypeReturnParameters.has(index)&&isPlainContainer)
              return carrierOther;
            if(carrierMayContainWeakMap(argumentValue))return carrierMaybe;
          }
        }
      }
      if(node.callee.type==='Identifier'&&weakMapFactories.has(node.callee.name))
        return carrierMaybe;
      if(node.callee.type==='MemberExpression') {
        const receiver=evaluateCarrierValue(node.callee.object,environment,thisValue);
        if(carrierMayContainWeakMap(receiver))return carrierMaybe;
        const methodOwner=node.callee.object.type==='Identifier'?
          node.callee.object.name:
          node.callee.object.type==='NewExpression'&&node.callee.object.callee.type==='Identifier'?
            node.callee.object.callee.name:null;
        if(methodOwner&&weakMapFactories.has(methodOwner))return carrierMaybe;
      }
      return carrierOther;
    }
    if(node.type==='ConditionalExpression')
      return mergeCarrierValues(
        evaluateCarrierValue(node.consequent,environment,thisValue),
        evaluateCarrierValue(node.alternate,environment,thisValue));
    if(node.type==='LogicalExpression')
      return mergeCarrierValues(
        evaluateCarrierValue(node.left,environment,thisValue),
        evaluateCarrierValue(node.right,environment,thisValue));
    if(node.type==='SequenceExpression')
      return evaluateCarrierValue(node.expressions.at(-1),environment,thisValue);
    if(node.type==='AssignmentExpression')
      return evaluateCarrierValue(node.right,environment,thisValue);
    if(node.type==='AwaitExpression'||node.type==='YieldExpression')
      return evaluateCarrierValue(node.argument,environment,thisValue);
    if(node.type==='ChainExpression')
      return evaluateCarrierValue(node.expression,environment,thisValue);
    if(node.type==='SpreadElement')
      return evaluateCarrierValue(node.argument,environment,thisValue);
    return carrierOther;
  }
  /**
   * @param {AstNode} pattern
   * @param {CarrierValue} value
   * @param {Map<string,CarrierValue>} environment
   */
  function bindCarrierPattern(pattern,value,environment) {
    if(pattern.type==='Identifier') {
      environment.set(pattern.name,value);
      return;
    }
    if(pattern.type==='AssignmentPattern') {
      bindCarrierPattern(pattern.left,value.kind==='other'?
        evaluateCarrierValue(pattern.right,environment):value,environment);
      return;
    }
    if(pattern.type==='RestElement') {
      bindCarrierPattern(pattern.argument,carrierMayContainWeakMap(value)?carrierMaybe:carrierOther,environment);
      return;
    }
    if(pattern.type==='ObjectPattern') {
      for(const property of pattern.properties??[]) {
        if(property.type==='RestElement') {
          if(value.kind==='container') {
            const rest=carrierContainer();
            rest.unknown=value.unknown;
            const omitted=new Set();
            for(const picked of pattern.properties??[]) {
              if(picked.type!=='Property')continue;
              const key=carrierStaticKey(picked.key,picked.computed);
              if(key===null)rest.unknown=true;
              else omitted.add(key);
            }
            for(const [key,nested] of value.properties)
              if(!omitted.has(key))rest.properties.set(key,nested);
            bindCarrierPattern(property.argument,rest,environment);
          } else bindCarrierPattern(property.argument,
            value.kind==='maybe'?carrierMaybe:carrierOther,environment);
          continue;
        }
        if(property.type!=='Property')continue;
        const key=carrierStaticKey(property.key,property.computed);
        const nested=value.kind==='container'?
          carrierLookupValue(value,key):
          value.kind==='maybe'?carrierMaybe:carrierOther;
        bindCarrierPattern(property.value,nested,environment);
      }
      return;
    }
    if(pattern.type==='ArrayPattern') {
      for(let index=0;index<(pattern.elements??[]).length;index++) {
        const element=pattern.elements[index];
        if(!element)continue;
        if(element.type==='RestElement') {
          if(value.kind==='container') {
            const rest=carrierContainer();
            rest.unknown=value.unknown;
            for(const [key,nested] of value.properties) {
              const inputIndex=Number(key);
              if(Number.isInteger(inputIndex)&&inputIndex>=index)
                rest.properties.set(String(inputIndex-index),nested);
              else if(!Number.isInteger(inputIndex)||inputIndex<0)
                rest.unknown=true;
            }
            bindCarrierPattern(element.argument,rest,environment);
          } else bindCarrierPattern(element.argument,
            value.kind==='maybe'?carrierMaybe:carrierOther,environment);
          continue;
        }
        const nested=value.kind==='container'?
          value.properties.get(String(index))??(value.unknown?carrierMaybe:carrierOther):
          value.kind==='maybe'?carrierMaybe:carrierOther;
        bindCarrierPattern(element,nested,environment);
      }
    }
  }
  /** @type {Set<AstNode>} */
  const activeCarrierFunctions=new Set();
  /** @type {Map<AstNode,Map<string,CarrierValue>>} */
  const functionClosureEnvironments=new Map();
  /**
   * @param {CarrierValue} target
   * @param {string|null} key
   * @param {AstNode|null|undefined} descriptor
   * @returns {void}
   */
  function applyAccessorDescriptor(target,key,descriptor) {
    if(target.kind!=='container')return;
    if(key===null||descriptor?.type!=='ObjectExpression') {
      target.unknown=true;
      return;
    }
    const getter=(descriptor.properties??[]).find((/** @type {AstNode} */ property)=>
      property.type==='Property'&&carrierStaticKey(property.key,property.computed)==='get');
    if(!getter)return;
    target.properties.set(key,functionMayReturnWeakMap(getter.value)?
      carrierMaybe:carrierOther);
  }
  /**
   * @param {AstNode|null|undefined} node
   * @param {Map<string,CarrierValue>} environment
   * @param {CarrierValue} [thisValue=carrierOther]
   * @returns {void}
   */
  function visitCarrierExpression(node,environment,thisValue=carrierOther) {
    if(!node)return;
    if(functionTypes.has(node.type)) {
      if(!functionClosureEnvironments.has(node))
        functionClosureEnvironments.set(node,environment);
      return;
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression') {
      const operation=memberKey(node.callee);
      const namespace=node.callee.object;
      const isObjectDefinition=isNamespace(namespace,objectNamespaces)&&
        ['defineProperty','defineProperties'].includes(operation??'');
      const isReflectDefinition=isNamespace(namespace,reflectNamespaces)&&
        operation==='defineProperty';
      if(isObjectDefinition||isReflectDefinition) {
        const target=evaluateCarrierValue(node.arguments[0],environment,thisValue);
        if(target.kind==='container') {
          if(operation==='defineProperty') {
            const key=staticString(node.arguments[1]) ??
              (node.arguments[1]?.type==='Identifier'?
                staticStringAliases.get(node.arguments[1].name)??null:null);
            applyAccessorDescriptor(target,key,node.arguments[2]);
          } else {
            const descriptors=node.arguments[1];
            if(descriptors?.type!=='ObjectExpression')target.unknown=true;
            else for(const property of descriptors.properties??[]) {
              if(property.type!=='Property') {
                target.unknown=true;
                continue;
              }
              applyAccessorDescriptor(
                target,carrierStaticKey(property.key,property.computed),property.value);
            }
          }
        }
      }
    }
    if(node.type==='CallExpression') {
      const summary=node.callee.type==='Identifier'?
        localFunctionSummaries.get(node.callee.name):undefined;
      for(let index=0;index<(node.arguments??[]).length;index++) {
        const argument=node.arguments[index];
        const value=evaluateCarrierValue(argument,environment,thisValue);
        const isPlainPrototypeReaderInput=summary?.prototypeReturnParameters.has(index)&&
          value.kind==='container'&&!value.unknown&&!value.properties.has('constructor');
        const provenPrivateReader=summary?.safeParameters.has(index)&&(
          value.kind==='weakmap'||summary.returnParameterIndices.has(index)||isPlainPrototypeReaderInput
        );
        if(carrierMayContainWeakMap(value)&&!provenPrivateReader)exposed=true;
        visitCarrierExpression(argument,environment,thisValue);
      }
      visitCarrierExpression(node.callee,environment,thisValue);
      if(node.callee.type==='Identifier') {
        const definitions=localWeakMapEffectDeclarations.get(node.callee.name)??[];
        for(const definition of definitions) {
          if(activeCarrierFunctions.has(definition)||definition.params.length||
              definition.async||definition.generator) {
            // The invoked body cannot be safely modeled as one local transfer.
            exposed=true;
            continue;
          }
          activeCarrierFunctions.add(definition);
          try {
            const before=snapshotCarrierEnvironment(environment);
            const invoked=snapshotCarrierEnvironment(environment);
            visitCarrierStatement(definition.body,invoked,thisValue);
            // Block/parameter-local names must not escape the call site.
            for(const name of [...invoked.keys()])
              if(!before.has(name))invoked.delete(name);
            joinCarrierEnvironments(environment,before,invoked);
          } finally {
            activeCarrierFunctions.delete(definition);
          }
        }
      }
      return;
    }
    if(node.type==='NewExpression') {
      for(const argument of node.arguments??[]) {
        if(carrierMayContainWeakMap(evaluateCarrierValue(argument,environment,thisValue)))
          exposed=true;
        visitCarrierExpression(argument,environment,thisValue);
      }
      return;
    }
    if(node.type==='AssignmentExpression') {
      visitCarrierExpression(node.right,environment,thisValue);
      const assigned=evaluateCarrierValue(node.right,environment,thisValue);
      if(node.left.type==='Identifier') {
        environment.set(node.left.name,assigned);
      } else if(node.left.type==='MemberExpression') {
        const base=evaluateCarrierValue(node.left.object,environment,thisValue);
        const key=carrierStaticKey(node.left.property,node.left.computed);
        if(base.kind==='container') {
          if(key===null)base.unknown=true;
          else base.properties.set(key,assigned);
        } else if(base.kind==='maybe'&&(
          carrierMayContainWeakMap(assigned)||['set','get','has','delete'].includes(key??'')
        )) {
          exposed=true;
        } else if(base.kind==='weakmap'&&['set','get','has','delete'].includes(key??'')) {
          exposed=true;
        }
        visitCarrierExpression(node.left.object,environment,thisValue);
      } else if(node.left.type==='ObjectPattern'||node.left.type==='ArrayPattern') {
        bindCarrierPattern(node.left,assigned,environment);
      }
      return;
    }
    if(node.type==='ConditionalExpression') {
      visitCarrierExpression(node.test,environment,thisValue);
      const consequent=snapshotCarrierEnvironment(environment);
      const alternate=snapshotCarrierEnvironment(environment);
      visitCarrierExpression(node.consequent,consequent,thisValue);
      visitCarrierExpression(node.alternate,alternate,thisValue);
      joinCarrierEnvironments(environment,consequent,alternate);
      return;
    }
    if(node.type==='LogicalExpression') {
      visitCarrierExpression(node.left,environment,thisValue);
      const skipped=snapshotCarrierEnvironment(environment);
      const executed=snapshotCarrierEnvironment(environment);
      visitCarrierExpression(node.right,executed,thisValue);
      joinCarrierEnvironments(environment,skipped,executed);
      return;
    }
    if(node.type==='ObjectExpression') {
      for(const property of node.properties??[]) {
        if(property.type==='SpreadElement')visitCarrierExpression(property.argument,environment,thisValue);
        else if(property.type==='Property')visitCarrierExpression(property.value,environment,thisValue);
      }
      return;
    }
    if(node.type==='ArrayExpression') {
      for(const element of node.elements??[])visitCarrierExpression(element,environment,thisValue);
      return;
    }
    if(node.type==='MemberExpression') {
      visitCarrierExpression(node.object,environment,thisValue);
      if(node.computed)visitCarrierExpression(node.property,environment,thisValue);
      return;
    }
    if(node.type==='VariableDeclaration') {
      for(const declaration of node.declarations??[]) {
        visitCarrierExpression(declaration.init,environment,thisValue);
        bindCarrierPattern(declaration.id,
          evaluateCarrierValue(declaration.init,environment,thisValue),environment);
      }
      return;
    }
    for(const value of Object.values(node)) {
      if(Array.isArray(value)) {
        for(const child of value) {
          if(child&&typeof child==='object'&&typeof child.type==='string')
            visitCarrierExpression(child,environment,thisValue);
        }
      } else if(value&&typeof value==='object'&&typeof value.type==='string') {
        visitCarrierExpression(value,environment,thisValue);
      }
    }
  }
  /**
   * @param {AstNode} statement
   * @param {Map<string,CarrierValue>} environment
   * @param {CarrierValue} [thisValue]
   */
  /**
   * @param {AstNode} statement
   * @param {Map<string,CarrierValue>} environment
   * @param {CarrierValue} [thisValue=carrierOther]
   * @param {boolean} [includeVarBindings=true]
   * @param {CarrierThrow[]|null} [throwCollector=null]
   * @returns {void}
   */
  function visitScopedCarrierBlock(statement,environment,thisValue=carrierOther,includeVarBindings=true,throwCollector=null) {
    const scopedEnvironment=new Map(environment);
    const blockScopedNames=new Set();
    const varNames=new Set();
    for(const child of statement.body??[]) {
      if(child.type==='VariableDeclaration') {
        const target=includeVarBindings&&child.kind==='var'?varNames:blockScopedNames;
        for(const declaration of child.declarations??[]) {
          const names=new Map();
          addPatternBindings(declaration.id,names);
          for(const name of names.keys())target.add(name);
        }
      } else if((child.type==='ClassDeclaration'||child.type==='FunctionDeclaration')&&
                child.id?.type==='Identifier') {
        blockScopedNames.add(child.id.name);
      }
    }
    for(const child of statement.body??[])
      visitCarrierStatement(child,scopedEnvironment,thisValue,throwCollector);
    for(const [name,value] of scopedEnvironment) {
      if(blockScopedNames.has(name))continue;
      if(environment.has(name)||varNames.has(name))environment.set(name,value);
    }
  }
  /**
   * @param {AstNode} statement
   * @param {Map<string,CarrierValue>} environment
   * @param {CarrierValue} [thisValue=carrierOther]
   * @param {CarrierThrow[]|null} [throwCollector=null]
   * @returns {void}
   */
  function visitCarrierStatement(statement,environment,thisValue=carrierOther,throwCollector=null) {
    if(statement.type==='Program') {
      for(const child of statement.body??[])
        visitCarrierStatement(child,environment,thisValue,throwCollector);
      return;
    }
    if(statement.type==='BlockStatement') {
      visitScopedCarrierBlock(statement,environment,thisValue,true,throwCollector);
      return;
    }
    if(statement.type==='StaticBlock') {
      visitScopedCarrierBlock(statement,environment,thisValue,false,throwCollector);
      return;
    }
    if(statement.type==='ExportNamedDeclaration'||statement.type==='ExportDefaultDeclaration') {
      if(statement.declaration)
        visitCarrierStatement(statement.declaration,environment,thisValue,throwCollector);
      return;
    }
    if(statement.type==='VariableDeclaration') {
      visitCarrierExpression(statement,environment,thisValue);
      return;
    }
    if(statement.type==='ExpressionStatement') {
      visitCarrierExpression(statement.expression,environment,thisValue);
      return;
    }
    if(statement.type==='IfStatement') {
      visitCarrierExpression(statement.test,environment,thisValue);
      const consequent=snapshotCarrierEnvironment(environment);
      const alternate=snapshotCarrierEnvironment(environment);
      visitCarrierStatement(statement.consequent,consequent,thisValue,throwCollector);
      if(statement.alternate)
        visitCarrierStatement(statement.alternate,alternate,thisValue,throwCollector);
      joinCarrierEnvironments(environment,consequent,alternate);
      return;
    }
    if(statement.type==='LabeledStatement') {
      visitCarrierStatement(statement.body,environment,thisValue,throwCollector);
      return;
    }
    if(statement.type==='ClassDeclaration') {
      const staticValue=carrierContainer();
      if(statement.id?.type==='Identifier')
        environment.set(statement.id.name,staticValue);
      for(const element of statement.body.body??[]) {
        if(element.type==='PropertyDefinition') {
          const thisValue=element.static?staticValue:carrierOther;
          visitCarrierExpression(element.value,environment,thisValue);
          const fieldValue=evaluateCarrierValue(element.value,environment,thisValue);
          if(element.static) {
            const fieldKey=carrierStaticKey(element.key,element.computed);
            if(fieldKey===null)staticValue.unknown=true;
            else staticValue.properties.set(fieldKey,fieldValue);
          } else if(carrierMayContainWeakMap(fieldValue)&&statement.id?.type==='Identifier') {
            weakMapContainerOwners.add(statement.id.name);
          }
        } else if(element.type==='StaticBlock') {
          // Static blocks execute during class evaluation; their writes to
          // existing outer bindings are visible after the declaration.
          visitCarrierStatement(element,environment,staticValue,throwCollector);
        } else if(element.type==='MethodDefinition'&&element.value?.body) {
          // Class methods close over the lexical environment at the class
          // declaration site. Preserve it for the later interprocedural pass.
          if(!functionClosureEnvironments.has(element.value))
            functionClosureEnvironments.set(element.value,new Map(environment));
        }
      }
      if(statement.id?.type==='Identifier'&&carrierMayContainWeakMap(staticValue))
        weakMapContainerOwners.add(statement.id.name);
      if(statement.id?.type==='Identifier'&&exportedLocalNames.has(statement.id.name)&&
         carrierMayContainWeakMap(staticValue))exposed=true;
      return;
    }
    if(statement.type==='FunctionDeclaration') {
      if(!functionClosureEnvironments.has(statement))
        functionClosureEnvironments.set(statement,environment);
      return;
    }
    if(statement.type==='ReturnStatement') {
      visitCarrierExpression(statement.argument,environment,thisValue);
      return;
    }
    if(statement.type==='ThrowStatement') {
      // A throw takes an exceptional edge *at this program point*. Later
      // syntactic statements must not erase its reaching abstract heap.
      visitCarrierExpression(statement.argument,environment,thisValue);
      if(throwCollector)throwCollector.push({
        value:evaluateCarrierValue(statement.argument,environment,thisValue),
        environment:snapshotCarrierEnvironment(environment)
      });
      return;
    }
    if(statement.type==='TryStatement') {
      const tryEnvironment=snapshotCarrierEnvironment(environment);
      /** @type {CarrierThrow[]} */
      const thrownPaths=[];
      visitCarrierStatement(statement.block,tryEnvironment,thisValue,thrownPaths);
      // Include the state before the try, its syntactic exit, and every
      // explicit throw predecessor. The first two overapproximate implicit
      // exceptional paths; actual explicit throws retain their own heap.
      const catchCandidates=[
        snapshotCarrierEnvironment(environment),
        snapshotCarrierEnvironment(tryEnvironment),
        ...thrownPaths.map(path=>snapshotCarrierEnvironment(path.environment))
      ];
      let catchEnvironment=catchCandidates[0];
      for(const candidate of catchCandidates.slice(1)) {
        /** @type {Map<string,CarrierValue>} */
        const joined=new Map();
        joinCarrierEnvironments(joined,catchEnvironment,candidate);
        catchEnvironment=joined;
      }
      if(statement.handler) {
        const caughtValue=thrownPaths.length?
          thrownPaths.reduce((value,next)=>mergeCarrierValues(value,next.value),carrierOther):
          carrierMaybe;
        if(statement.handler.param)
          bindCarrierPattern(statement.handler.param,caughtValue,catchEnvironment);
        visitCarrierStatement(statement.handler.body,catchEnvironment,thisValue,throwCollector);
      } else if(throwCollector) {
        throwCollector.push(...thrownPaths);
      }
      const names=new Set([
        ...environment.keys(),...tryEnvironment.keys(),...catchEnvironment.keys()
      ]);
      /** @type {Map<CarrierContainer,Map<CarrierContainer,CarrierContainer>>} */
      const joinPairs=new Map();
      for(const name of names) {
        const base=environment.get(name)??carrierOther;
        const tryValue=tryEnvironment.get(name)??base;
        const catchValue=statement.handler?
          catchEnvironment.get(name)??base:base;
        environment.set(name,mergeCarrierValues(tryValue,catchValue,joinPairs));
      }
      if(statement.finalizer)
        visitCarrierStatement(statement.finalizer,environment,thisValue,throwCollector);
      return;
    }
    if(statement.type==='ForStatement'||statement.type==='ForInStatement'||
       statement.type==='ForOfStatement'||statement.type==='WhileStatement'||
       statement.type==='DoWhileStatement') {
      // Loops can mutate an arbitrary number of container slots. Preserve
      // statically known values but mark any touched container as unknown.
      const noIteration=snapshotCarrierEnvironment(environment);
      const loopEnv=snapshotCarrierEnvironment(environment);
      const loopScopedNames=new Map();
      for(const value of loopEnv.values())if(value.kind==='container')value.unknown=true;
      if(statement.init) {
        if(statement.init.type==='VariableDeclaration')
          visitCarrierStatement(statement.init,loopEnv,thisValue,throwCollector);
        else visitCarrierExpression(statement.init,loopEnv,thisValue);
      }
      if(statement.test)visitCarrierExpression(statement.test,loopEnv,thisValue);
      if(statement.type==='ForOfStatement'||statement.type==='ForInStatement') {
        let iterationValue=carrierOther;
        if(statement.type==='ForOfStatement') {
          const iterableValue=evaluateCarrierValue(statement.right,loopEnv,thisValue);
          if(iterableValue.kind==='container') {
            for(const value of iterableValue.properties.values())
              iterationValue=mergeCarrierValues(iterationValue,value);
            if(iterableValue.unknown)
              iterationValue=mergeCarrierValues(iterationValue,carrierMaybe);
          } else if(iterableValue.kind==='maybe') {
            iterationValue=carrierMaybe;
          }
        }
        if(statement.left?.type==='VariableDeclaration') {
          for(const declaration of statement.left.declarations??[]) {
            bindCarrierPattern(declaration.id,iterationValue,loopEnv);
            if(statement.left.kind!=='var')addPatternBindings(declaration.id,loopScopedNames);
          }
        } else if(statement.left) {
          bindCarrierPattern(statement.left,iterationValue,loopEnv);
        }
      }
      if(statement.right)visitCarrierExpression(statement.right,loopEnv,thisValue);
      visitCarrierStatement(statement.body,loopEnv,thisValue,throwCollector);
      if(statement.update)visitCarrierExpression(statement.update,loopEnv,thisValue);
      // The lexical loop locals are not part of the post-loop environment.
      for(const name of loopScopedNames.keys())loopEnv.delete(name);
      joinCarrierEnvironments(environment,noIteration,loopEnv);
      return;
    }
    if(statement.type==='SwitchStatement') {
      visitCarrierExpression(statement.discriminant,environment,thisValue);
      const branches=[];
      let fallthroughEnvironment=snapshotCarrierEnvironment(environment);
      for(const branch of statement.cases??[]) {
        const branchEnv=snapshotCarrierEnvironment(environment);
        for(const [name,value] of fallthroughEnvironment) {
          const base=environment.get(name)??carrierOther;
          branchEnv.set(name,mergeCarrierValues(base,value));
        }
        for(const child of branch.consequent??[])
          visitCarrierStatement(child,branchEnv,thisValue,throwCollector);
        branches.push(branchEnv);
        fallthroughEnvironment=branchEnv;
      }
      // Reuse one pair memo per predecessor when joining across different
      // binding names, or post-switch aliases become unrelated heaps.
      /** @type {Map<CarrierContainer,Map<CarrierContainer,CarrierContainer>>[]} */
      const joinPairs=branches.map(()=>new Map());
      for(const name of new Set(branches.flatMap(branch=>[...branch.keys()]))) {
        let value=environment.get(name)??carrierOther;
        for(let i=0;i<branches.length;i++)
          value=mergeCarrierValues(value,branches[i].get(name)??carrierOther,joinPairs[i]);
        environment.set(name,value);
      }
    }
  }

  // Class constructor/public-field writes are already summarized as owners.
  // Treat an instance as a container with an unknown slot set so a later
  // static member read cannot silently hide the WeakMap value.
  const carrierEnvironment=new Map();
  visitCarrierStatement(ast,carrierEnvironment);

  // Analyze function bodies with their local declarations as well. Exported
  // parameters and class/object receivers are unknown carriers; private
  // local WeakMaps remain ordinary values unless they reach an opaque call.
  for(const [functionNode,info] of functionInfoByNode) {
    if(!functionNode.body)continue;
    const closureEnvironment=functionClosureEnvironments.get(functionNode)??carrierEnvironment;
    const localEnvironment=new Map(closureEnvironment);
    for(const parameter of functionNode.params??[])
      bindCarrierPattern(parameter,carrierOther,localEnvironment);
    const thisValue=info.ownerName&&weakMapContainerOwners.has(info.ownerName)?
      (()=>{const value=carrierContainer();value.unknown=true;return value;})():carrierOther;
    if(functionNode.body.type==='BlockStatement')
      visitCarrierStatement(functionNode.body,localEnvironment,thisValue);
    else
      visitCarrierExpression(functionNode.body,localEnvironment,thisValue);
  }
  return exposed;
}
/**
 * Admit only a tiny source-visible grammar for native-bound targets:
 * top-level fn.bind(null) calls, no opaque calls, dynamic evaluation, host
 * capabilities, prototype access, computed member paths, getters, or member
 * mutation. This gates only the narrow private-target proof. A hostile host
 * preloader can still observe the already-rewritten target source.
 *
 * @param {AstNode} ast
 * @returns {boolean}
 */
function hasUnsafeNativeBindMutationSurface(ast) {
  const globalCapabilities=new Set([
    'Function','globalThis','window','self','global','process','Object',
    'Reflect','Proxy','document','navigator','eval','require','Deno','Bun',
    'frames','parent','top','createRequire','getBuiltinModule'
  ]);
  const prototypeEscapes=new Set([
    'constructor','prototype','__proto__','__lookupGetter__','__lookupSetter__',
    '__defineGetter__','__defineSetter__','require','createRequire','getBuiltinModule'
  ]);
  const functionTypes=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
  // The bound-target proof only consumes a function object whose binding is
  // locally established by a declaration or an immutable direct function
  // initializer. A member merely named "bind" is not evidence of native bind:
  // namespace exports, host metadata, aliases and inline expressions can
  // supply unrelated methods or unproved receivers.
  const localCallableBindings=new Set();
  walk(ast,(node,parent)=>{
    if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier')
      localCallableBindings.add(node.id.name);
    if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&
       parent?.type==='VariableDeclaration'&&parent.kind==='const'&&
       ['FunctionExpression','ArrowFunctionExpression'].includes(node.init?.type))
      localCallableBindings.add(node.id.name);
  });
  /**
   * @param {AstNode|null|undefined} call
   * @returns {boolean}
   */
  function isLiteralNullBindCall(call) {
    return call?.type==='CallExpression'&&!call.optional&&
      call.callee?.type==='MemberExpression'&&
      call.callee.object?.type==='Identifier'&&
      localCallableBindings.has(call.callee.object.name)&&
      !call.callee.computed&&!call.callee.optional&&
      call.callee.property.type==='Identifier'&&
      call.callee.property.name==='bind'&&call.arguments.length===1&&
      call.arguments[0].type==='Literal'&&call.arguments[0].value===null;
  }
  let unsafe=false;
  walk(ast,(node,parent,key,ancestors)=>{
    // Constructing an exported bound wrapper forwards the original target as
    // new.target. Coercing that function (for example in < or +) can invoke
    // Function#toString without an explicit source-observer call.
    if(node.type==='MetaProperty'&&node.meta?.name==='new'&&node.property?.name==='target') {
      unsafe=true;
      return;
    }
    if(node.type==='WithStatement'||node.type==='ThisExpression'||
       node.type==='ImportExpression'||node.type==='NewExpression'||
       node.type==='TaggedTemplateExpression'||node.type==='AwaitExpression'||
       node.type==='YieldExpression'||node.type==='ForOfStatement'||
       node.type==='ForInStatement'||node.type==='SpreadElement'||
       node.type==='ObjectPattern'||node.type==='ArrayPattern'||
       node.type==='ClassDeclaration'||node.type==='ClassExpression'||
       node.type==='MethodDefinition'||node.type==='PropertyDefinition') {
      unsafe=true;
      return;
    }
    if(node.type==='CallExpression'&&
       (!isLiteralNullBindCall(node)||ancestors.some(ancestor=>functionTypes.has(ancestor.type)))) {
      unsafe=true;
      return;
    }
    if(node.type==='Identifier'&&globalCapabilities.has(node.name)) {
      unsafe=true;
      return;
    }
    if(node.type==='Property') {
      const propertyKey=node.computed?staticString(node.key):
        node.key.type==='Identifier'?node.key.name:null;
      if(node.kind!=='init'||node.method||propertyKey==='bind'||
         node.computed&&propertyKey===null)unsafe=true;
    }
    if(node.type==='UpdateExpression'&&node.argument.type==='MemberExpression'||
       node.type==='UnaryExpression'&&node.operator==='delete'&&
         node.argument.type==='MemberExpression')unsafe=true;
    if(node.type==='MemberExpression') {
      const name=node.computed?staticString(node.property):
        node.property.type==='Identifier'?node.property.name:null;
      if(node.computed&&name===null)unsafe=true;
      if(name!==null&&prototypeEscapes.has(name))unsafe=true;
      if(name==='bind'&&!(parent?.type==='CallExpression'&&parent.callee===node&&
         isLiteralNullBindCall(parent)&&
         !ancestors.some(ancestor=>functionTypes.has(ancestor.type))))unsafe=true;
    }
    if(node.type==='Literal'&&typeof node.value==='string'&&
       prototypeEscapes.has(node.value))unsafe=true;
  });
  return unsafe;
}

/**
 * Apply edits in descending offset order, rejecting overlaps and out-of-range edits.
 * @param {string} source
 * @param {Edit[]} edits
 * @returns {string}
 */
function applyEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let upper = source.length;
  for (const edit of sorted) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) ||
        edit.start < 0 || edit.end < edit.start || edit.end > upper) {
      throw new RangeError(`Invalid or overlapping edit at ${edit.start}:${edit.end}`);
    }
    upper = edit.start;
  }
  let output = source;
  for (const edit of sorted) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}

/**
 * Return the expression whose source spelling V8 may embed in a runtime
 * TypeError for a bounded set of syntax-directed failures. Consumers can
 * conservatively preserve names, keys, or literals anywhere inside it.
 *
 * Object spread is included here for callers that already reject every
 * spread operand. Callers that distinguish object spread can ignore it when
 * the parent is an ObjectExpression.
 *
 * @param {AstNode} node
 * @returns {AstNode|null}
 */
function sourceSpelledErrorOperand(node) {
  if(node.type==='CallExpression'||node.type==='NewExpression')return node.callee;
  if(node.type==='TaggedTemplateExpression')return node.tag;
  if(node.type==='SpreadElement')return node.argument;
  if(node.type==='ForOfStatement')return node.right;
  if(node.type==='YieldExpression'&&node.delegate)return node.argument??null;
  if(node.type==='AssignmentPattern' &&
     ['ArrayPattern','ObjectPattern'].includes(node.left.type))return node.right;
  if(node.type==='VariableDeclarator' &&
     ['ArrayPattern','ObjectPattern'].includes(node.id.type))return node.init??null;
  if(node.type==='AssignmentExpression' &&
     ['ArrayPattern','ObjectPattern'].includes(node.left.type))return node.right;
  return null;
}

/**
 * Resolve only bounded constant string spellings used as computed keys.
 * @param {AstNode|null|undefined} node
 * @param {number} [depth]
 * @returns {string|null}
 */
function staticString(node,depth=0){
  if(!node||depth>16)return null;
  if(node.type==='Literal' && typeof node.value==='string')return node.value;
  if(node.type==='TemplateLiteral' && !node.expressions.length){
    const cooked=node.quasis[0]?.value.cooked;
    return typeof cooked==='string' ? cooked : null;
  }
  if(node.type==='BinaryExpression' && node.operator==='+'){
    const left=staticString(node.left,depth+1);
    const right=staticString(node.right,depth+1);
    return left!==null && right!==null ? left+right : null;
  }
  return null;
}

/**
 * Identify direct local factories that may place an argument inside a
 * returned native Set or Map. The result is a may-carry relationship:
 * duplicate names and multiple return sites are unioned conservatively.
 * Dynamic or indirect factories remain outside this bounded proof.
 *
 * @param {AstNode} ast
 * @returns {Map<string,number[]>}
 */
function collectDirectCarrierFactories(ast) {
  /** @type {Map<string,number[]>} */
  const factories=new Map();
  /** @type {Array<{alias:string,source:string}>} */
  const aliases=[];
  walk(ast,node=>{
    if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
       node.init?.type==='Identifier') {
      aliases.push({alias:node.id.name,source:node.init.name});
    }
    /** @type {string|undefined} */
    let name;
    /** @type {AstNode|undefined} */
    let fn;
    if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier') {
      name=node.id.name;
      fn=node;
    } else if(node.type==='VariableDeclarator'&&
              node.id.type==='Identifier'&&node.init&&
              ['FunctionExpression','ArrowFunctionExpression'].includes(node.init.type)) {
      name=node.id.name;
      fn=node.init;
    }
    if(!name||!fn)return;
    const returned=fn.body.type==='BlockStatement'?
      fn.body.body.filter((/** @type {AstNode} */ stmt)=>
        stmt.type==='ReturnStatement').map((/** @type {AstNode} */ stmt)=>stmt.argument):
      [fn.body];
    const indices=new Set(factories.get(name)??[]);
    for(const value of returned) {
      if(!value||value.type!=='NewExpression'||
         value.callee.type!=='Identifier'||
         !['Set','Map'].includes(value.callee.name))continue;
      const input=value.arguments[0];
      if(!input)continue;
      walk(input,inner=>{
        if(inner.type!=='Identifier')return;
        for(let index=0;index<fn.params.length;index++) {
          const param=fn.params[index];
          if(param?.type==='Identifier'&&param.name===inner.name)indices.add(index);
          if(param?.type==='AssignmentPattern' &&
             param.left?.type==='Identifier'&&param.left.name===inner.name) {
            indices.add(index);
            // A default can supply an observable function when the passed
            // argument is missing or evaluates to undefined.
            indices.add(-1);
          }
        }
      });
    }
    if(indices.size)factories.set(name,[...indices]);
  });
  let changed;
  do {
    changed=false;
    for(const {alias,source} of aliases) {
      const sourceIndices=factories.get(source);
      if(!sourceIndices)continue;
      const prior=factories.get(alias)??[];
      const merged=[...new Set([...prior,...sourceIndices])];
      if(merged.length>prior.length) {
        factories.set(alias,merged);
        changed=true;
      }
    }
  }while(changed);
  return factories;
}

/**
 * Detect common source-observing operations before rewriting AST subtrees.
 * Native Function#toString can expose changed source spelling at runtime.
 * This is a conservative opt-out for known direct operations; arbitrary
 * coercion or reflective indirection still requires a richer proof.
 * @param {AstNode} ast
 * @param {Map<string,string>} [importedStrings] Proven direct ESM string imports.
 * @param {Set<string>} [importedCloneFunctions] Proven native-clone ESM imports.
 * @param {Set<string>} [importedFunctionArrays] Function-bearing named ESM arrays.
 * @param {Set<string>} [importedPrimitives] Proven immutable ESM primitive imports.
 * @param {Set<string>} [importedUrlStaticMethods] Proven native URL parser ESM imports.
 * @param {Set<string>} [importedStorageMethodAliases] Proven native Storage method ESM imports.
 * @param {boolean} [sharedWeakMapPrototypeExposure] Group-wide WeakMap prototype exposure.
 * @returns {boolean}
 */
function observesFunctionSource(ast,importedStrings=new Map(),importedCloneFunctions=new Set(),importedFunctionArrays=new Set(),importedPrimitives=new Set(),importedUrlStaticMethods=new Set(),importedStorageMethodAliases=new Set(),sharedWeakMapPrototypeExposure) {
  // A sibling module can expose the shared WeakMap prototype before this
  // file evaluates, so that group-wide fact also invalidates the cache.
  const weakMapPrototypeExposed=sharedWeakMapPrototypeExposure===undefined?
    hasWeakMapPrototypeExposure(ast):sharedWeakMapPrototypeExposure;
  // A cached opaque-import result does not apply when imported keys have
  // been independently verified against the supplied ESM files.
  if(!weakMapPrototypeExposed&&!importedStrings.size&&!importedCloneFunctions.size&&
     !importedFunctionArrays.size&&!importedPrimitives.size&&
     !importedUrlStaticMethods.size&&!importedStorageMethodAliases.size) {
    const cached=sourceObservationCache.get(ast);
    if(cached!==undefined)return cached;
  }
  const directCarrierFactories=collectDirectCarrierFactories(ast);
  // Aliased string prefixes and aliased String constructors can coerce
  // functions to their exact source text without a literal at the use site.
  const strings=new Set();
  // Array#join and Function#toLocaleString can implicitly format functions as
  // their source text. Track simple aliases and array-element ownership in
  // addition to direct String/RegExp coercers.
  const functions=new Set();
  const boundFunctionAliases=new Set();
  const mutatedBoundFunctionAliases=new Set();
  const arraysWithFunctions=new Set();
  // Native Array algorithms can implicitly stringify contained functions.
  // Track methods detached from Array.prototype through simple assignments;
  // their .call/.apply/.bind invocations otherwise hide the true receiver.
  const sourceCoercingArrayMethods=new Set(['join','toString',
    'toLocaleString','sort','toSorted']);
  const detachedArraySourceMethods=new Set();
  // RegExp native methods stringify their argument, including function source.
  const sourceCoercingRegExpMethods=new Set(['test','exec','compile']);
  const detachedRegExpSourceMethods=new Set();
  const boundRegExpSourceMethods=new Set();
  // Native String.prototype methods generally call ToString(this) even when
  // their arguments are primitive. Invoking them with a Function receiver
  // reveals the exact function-source spelling through the returned string.
  // The non-generic String#toString/#valueOf deliberately are excluded.
  const sourceCoercingStringReceiverMethods=new Set([
    'at','charAt','charCodeAt','codePointAt','concat','endsWith','includes',
    'indexOf','isWellFormed','lastIndexOf','localeCompare','match','matchAll',
    'normalize','padEnd','padStart','repeat','replace','replaceAll','search',
    'slice','split','startsWith','substring','toLocaleLowerCase',
    'toLocaleUpperCase','toLowerCase','toUpperCase','toWellFormed',
    'trim','trimEnd','trimStart',
    'anchor','big','blink','bold','fixed','fontcolor','fontsize','italics',
    'link','small','strike','sub','sup'
  ]);
  const detachedStringReceiverMethods=new Set();
  const stringRawAliases=new Set();
  /** @type {Map<string,Set<string>>} */
  const sourceSymbolKeyAliases=new Map();
  const sourceSymbolMethods=new Set(['iterator','match','matchAll','replace','search','split']);
  const arrayLikeWithFunctions=new Set();
  const entryCollectionsWithFunctionKeys=new Set();
  const fromEntriesMethods=new Set();
  /** @type {Map<string,Set<string>>} */
  const objectFunctionKeys=new Map();
  // Imported bindings and CommonJS require() results may be functions even
  // when their declarations are in a separate file. A consumer's computed
  // property key can stringify the imported function's original source.
  const opaqueFunctions=new Set();
  const opaqueNamespaces=new Set();
  // Track simple aliases before the function-valued-expression fixed point.
  // Function.prototype getters invoked through Reflect/Object aliases can
  // otherwise hide later exact-source reads through dynamic property keys.
  const reflectiveReceivers=new Set(['Reflect','Object']);
  // Resolve native serializer imports before walking the AST. ESM imports
  // may appear before later source-observation helper declarations.
  const v8Modules=new Set();
  const v8Serializers=new Set();
  const v8SerializerConstructors=new Set();
  const v8SerializerInstances=new Set();
  const v8WriteMethods=new Set();
  walk(ast,node=>{
    if(node.type==='ImportDeclaration' &&
       ['v8','node:v8'].includes(String(node.source?.value??''))) {
      for(const spec of node.specifiers) {
        if(['ImportDefaultSpecifier','ImportNamespaceSpecifier'].includes(spec.type))v8Modules.add(spec.local.name);
        if(spec.type==='ImportSpecifier') {
          const name=spec.imported.name??spec.imported.value;
          if(name==='serialize')v8Serializers.add(spec.local.name);
          if(['Serializer','DefaultSerializer'].includes(name))v8SerializerConstructors.add(spec.local.name);
        }
      }
    }
    if((node.type==='FunctionDeclaration'||node.type==='ClassDeclaration') &&
       node.id?.type==='Identifier')functions.add(node.id.name);
    if((node.type==='ImportSpecifier'||node.type==='ImportDefaultSpecifier') &&
       node.local?.type==='Identifier')opaqueFunctions.add(node.local.name);
    if(node.type==='ImportNamespaceSpecifier'&&node.local?.type==='Identifier') {
      opaqueNamespaces.add(node.local.name);
    }
  });
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isRequireCall(node) {
    return Boolean(node?.type==='CallExpression' &&
      node.callee.type==='Identifier'&&node.callee.name==='require');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isOpaqueNamespace(node) {
    return Boolean(node && (node.type==='Identifier'&&opaqueNamespaces.has(node.name) ||
      isRequireCall(node)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isFunctionValue(node) {
    return Boolean(node && (node.type==='Identifier'&&
        !importedStrings.has(node.name) && !importedPrimitives.has(node.name) &&
        (functions.has(node.name)||opaqueFunctions.has(node.name)) ||
      ['FunctionExpression','ArrowFunctionExpression','ClassExpression'].includes(node.type) ||
      // Under construction, new.target is the target function object. Existing
      // coercion checks below must treat it like any other function value.
      node.type==='MetaProperty'&&node.meta?.name==='new'&&node.property?.name==='target' ||

      node.type==='MemberExpression' &&
        (isOpaqueNamespace(node.object) ||
         node.object.type==='Identifier' && node.object.name==='Function' &&
           memberName(node)==='prototype' ||
         node.object.type==='Identifier' &&
           (objectFunctionKeys.get(node.object.name)?.has(memberName(node)??'') ||
            node.computed && arraysWithFunctions.has(node.object.name))) ||
      node.type==='CallExpression' && node.callee.type==='MemberExpression' &&
        (node.callee.object.type==='Identifier' &&
           reflectiveReceivers.has(node.callee.object.name) ||
         node.callee.object.type==='MemberExpression' &&
           isGlobal(node.callee.object.object) &&
           ['Reflect','Object'].includes(memberName(node.callee.object)??'')) &&
        memberName(node.callee)==='getPrototypeOf' &&
        isFunctionValue(node.arguments[0])));
  }
  /**
   * Function.prototype.bind creates an exotic callable whose native
   * Function#toString result is the fixed native-code placeholder, not the
   * target function's source. Treat only direct, unmodified bound functions
   * as safe for Storage DOMString conversion.
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isBoundFunctionExpression(node) {
    return Boolean(node?.type==='CallExpression'&&
      node.callee.type==='MemberExpression'&&memberName(node.callee)==='bind'&&
      isFunctionValue(node.callee.object));
  }
  /**
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isDefinitelyBoundFunction(node) {
    if(isBoundFunctionExpression(node))return true;
    if(node?.type!=='Identifier'||!boundFunctionAliases.has(node.name)||
       mutatedBoundFunctionAliases.has(node.name))return false;
    let mutated=false;
    walk(ast,candidate=>{
      if(candidate.type==='AssignmentExpression'&&
         candidate.left.type==='MemberExpression'&&
         candidate.left.object.type==='Identifier'&&
         candidate.left.object.name===node.name)mutated=true;
      if(candidate.type==='CallExpression'&&
         candidate.callee.type==='MemberExpression'&&
         ['defineProperty','defineProperties','assign','setPrototypeOf','set'].includes(memberName(candidate.callee)??'')&&
         candidate.arguments[0]?.type==='Identifier'&&
         candidate.arguments[0].name===node.name)mutated=true;
    });
    return !mutated;
  }
  /**
   * Recognize direct function-returning mapping callbacks. The result may
   * stringify as exact function source even if input items are primitives.
   * @param {AstNode|null|undefined} node
   * @param {number} depth
   * @returns {boolean}
   */
  function callbackReturnsFunction(node,depth) {
    if(!node||depth>32||
       !['ArrowFunctionExpression','FunctionExpression'].includes(node.type))
      return false;
    const body=node.body;
    if(body.type==='BlockStatement') {
      return body.body.some((/** @type {AstNode} */ statement)=>
        statement.type==='ReturnStatement'&&
        (isFunctionValue(statement.argument)||containsFunction(statement.argument,depth+1)));
    }
    return isFunctionValue(body)||containsFunction(body,depth+1);
  }
  /**
   * Nested arrays stringify recursively through Array#join. A function can
   * therefore leak through [ [fn] ].join() without any direct element
   * identifying as a function.
   * @param {AstNode|null|undefined} node
   * @param {number} [depth]
   * @returns {boolean}
   */
  function containsFunction(node,depth=0) {
    if(!node)return false;
    if(depth>32)return true;
    if(node.type==='Identifier')return arraysWithFunctions.has(node.name)||
      arrayLikeWithFunctions.has(node.name)||importedFunctionArrays.has(node.name);
    if(node.type==='ArrayExpression') {
      return node.elements.some((/** @type {AstNode|null} */ value)=>
        Boolean(value && (isFunctionValue(value)||
          (value.type==='SpreadElement'?
            isFunctionValue(value.argument)||containsFunction(value.argument,depth+1):
            containsFunction(value,depth+1)))));
    }
    // Set/Map preserve inserted function references across iteration.
    if(node.type==='NewExpression' && node.callee.type==='Identifier' &&
       ['Set','Map'].includes(node.callee.name))
      return containsFunction(node.arguments[0],depth+1);
    if(node.type==='CallExpression'&&node.callee.type==='Identifier') {
      const indices=directCarrierFactories.get(node.callee.name);
      if(indices?.some(index=>{
        if(index===-1)return true;
        const value=node.arguments[index];
        if(!value)return true;
        const argument=value.type==='SpreadElement'?value.argument:value;
        return isFunctionValue(argument)||containsFunction(argument,depth+1);
      }))return true;
    }
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression') {
      const member=memberName(node.callee);
      const owner=node.callee.object;
      const arrayStatic=owner.type==='Identifier'&&owner.name==='Array';
      if(['values','keys','entries'].includes(member??'') &&
         containsFunction(owner,depth+1))return true;
      if(arrayStatic&&member==='from')
        return containsFunction(node.arguments[0],depth+1) ||
          callbackReturnsFunction(node.arguments[1],depth+1);
      if(arrayStatic&&member==='of') {
        return node.arguments.some((/** @type {AstNode} */ value)=>
          value.type==='SpreadElement'?
            isFunctionValue(value.argument)||containsFunction(value.argument,depth+1):
            isFunctionValue(value)||containsFunction(value,depth+1));
      }
      // Set composition returns a new collection of references. Intersection
      // and difference can only retain receiver elements; union and
      // symmetricDifference may additionally insert argument elements.
      const setComposition=new Set(['union','intersection','difference',
        'symmetricDifference']);
      if(setComposition.has(member??'')) {
        if(containsFunction(owner,depth+1))return true;
        return ['union','symmetricDifference'].includes(member??'') &&
          containsFunction(node.arguments[0],depth+1);
      }
      const derivedMethods=new Set(['slice','concat','filter','map','flat',
        'flatMap','toReversed','toSorted','toSpliced','with']);
      if(derivedMethods.has(member??'')) {
        if(containsFunction(owner,depth+1))return true;
        if(['map','flatMap'].includes(member??'')&&
           callbackReturnsFunction(node.arguments[0],depth+1))return true;
        // concat/splice-like methods can insert function values into a new
        // array even when the original receiver contains only primitives.
        const inserted=member==='concat'?node.arguments:
          member==='with'?node.arguments.slice(1):
          member==='toSpliced'?node.arguments.slice(2):[];
        return inserted.some((/** @type {AstNode} */ value)=>
          value.type==='SpreadElement'?
            isFunctionValue(value.argument)||containsFunction(value.argument,depth+1):
            isFunctionValue(value)||containsFunction(value,depth+1));
      }
    }
    return false;
  }
  /**
   * Array builtins are generic: .call(arrayLike) may stringify indexed
   * properties of a plain object, including values assigned after creation.
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isArrayIndexNode(node) {
    if(!node||node.type!=='Literal'||!['string','number'].includes(typeof node.value))
      return false;
    const name=String(node.value);
    return /^(?:0|[1-9][0-9]*)$/.test(name)&&Number.isSafeInteger(Number(name));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function containsFunctionInArrayLike(node) {
    if(containsFunction(node))return true;
    if(!node)return false;
    if(node.type==='Identifier')return arrayLikeWithFunctions.has(node.name);
    if(node.type!=='ObjectExpression')return false;
    return node.properties.some((/** @type {AstNode} */ property)=>
      property.type==='Property'&&
      (isArrayIndexNode(property.key)||
       property.computed&&isFunctionValue(property.value))&&
      (isFunctionValue(property.value)||containsFunction(property.value)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isDetachedArraySourceMethod(node) {
    if(!node)return false;
    if(node.type==='Identifier')return detachedArraySourceMethods.has(node.name);
    if(node.type!=='MemberExpression'||
       !sourceCoercingArrayMethods.has(memberName(node)??''))return false;
    const owner=node.object;
    return owner.type==='MemberExpression'&&memberName(owner)==='prototype'&&
      owner.object.type==='Identifier'&&owner.object.name==='Array';
  }
  /** @param {AstNode|null|undefined} expression @param {Set<string>} names @returns {boolean} */
  function isSourceSymbolKey(expression,names) {
    if(!expression)return false;
    if(expression.type==='Identifier')return [...(sourceSymbolKeyAliases.get(expression.name)??[])]
      .some(name=>names.has(name));
    return expression.type==='MemberExpression' &&
      isSymbolConstructor(expression.object) &&
      names.has(memberName(expression)??'');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isDetachedRegExpSourceMethod(node) {
    if(!node)return false;
    if(node.type==='Identifier')return detachedRegExpSourceMethods.has(node.name);
    // Unknown .test/.exec aliases may be native RegExp methods. Over-refusal
    // is safer than assuming a function argument cannot become source text.
    if(node.type!=='MemberExpression')return false;
    if(sourceCoercingRegExpMethods.has(memberName(node)??''))return true;
    // RegExp @@match, @@matchAll, @@replace, @@search and @@split are
    // callable native coercers even when a property is symbol-computed.
    const regexpSymbolMethods=new Set(['match','matchAll','replace','search','split']);
    return node.computed && isSourceSymbolKey(node.property,regexpSymbolMethods);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isDetachedStringReceiverMethod(node) {
    if(!node)return false;
    if(node.type==='Identifier')return detachedStringReceiverMethods.has(node.name);
    if(node.type!=='MemberExpression')return false;
    const ordinary=sourceCoercingStringReceiverMethods.has(memberName(node)??'');
    const iterator=node.computed && isSourceSymbolKey(node.property,new Set(['iterator']));
    if(!ordinary&&!iterator)return false;
    const owner=node.object;
    if(owner.type!=='MemberExpression'||memberName(owner)!=='prototype')return false;
    const root=owner.object;
    return root.type==='Identifier'&&root.name==='String' ||
      root.type==='MemberExpression'&&isGlobal(root.object)&&memberName(root)==='String';
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStringRaw(node) {
    if(!node)return false;
    if(node.type==='Identifier')return stringRawAliases.has(node.name);
    return node.type==='MemberExpression'&&memberName(node)==='raw' &&
      isCoercer(node.object);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function containsFunctionKeyEntries(node) {
    return Boolean(node && (node.type==='Identifier' &&
        entryCollectionsWithFunctionKeys.has(node.name) ||
      node.type==='ArrayExpression' && node.elements.some(
        (/** @type {AstNode|null} */ entry)=>entry?.type==='ArrayExpression' &&
          isFunctionValue(entry.elements[0])) ||
      node.type==='NewExpression' && node.callee.type==='Identifier' &&
        node.callee.name==='Map' && containsFunctionKeyEntries(node.arguments[0])));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isObjectFromEntries(node) {
    return Boolean(node && (node.type==='Identifier' && fromEntriesMethods.has(node.name) ||
      node.type==='MemberExpression' && node.object.type==='Identifier' &&
        node.object.name==='Object' && memberName(node)==='fromEntries'));
  }
  // These standard builtins coerce a nonprimitive argument to a string.
  // That invokes Function#toString when the argument is a function. A
  // source rewrite can therefore change RegExp.source, Symbol.description,
  // or the output of URI encoders even without an explicit String(...) call.
  const builtinCoercers=new Set(['String','BigInt','RegExp','Symbol','encodeURI',
    'encodeURIComponent','decodeURI','decodeURIComponent','escape','unescape',
    // Web-compatible btoa performs ToString on its input before Base64 encoding.
    'btoa',
    'Error','TypeError','RangeError','ReferenceError','SyntaxError',
    'URIError','EvalError']);
  const coercers=new Set(builtinCoercers);
  const nodeBufferNamespaces=new Set();
  // Node's built-in buffer module re-exports the native btoa coercer.
  // Recognize named and namespace/default ESM imports before scanning
  // calls, including local const aliases of those namespace imports.
  walk(ast,node=>{
    if(node.type!=='ImportDeclaration'||
       !['buffer','node:buffer'].includes(String(node.source?.value??'')))return;
    for(const spec of node.specifiers) {
      if(spec.type==='ImportSpecifier' &&
         (spec.imported.name??spec.imported.value)==='btoa')
        coercers.add(spec.local.name);
      if(spec.type==='ImportNamespaceSpecifier'||
         spec.type==='ImportDefaultSpecifier')
        nodeBufferNamespaces.add(spec.local.name);
    }
  });
  // JSON.parse and JSON.rawJSON call ToString on their text input.
  // Their SyntaxError.message can reveal a function's original source.
  const jsonNamespaces=new Set(['JSON']);
  const nativeStringConstructors=new Set(['String']);
  const nativeRegExpConstructors=new Set(['RegExp']);
  const boundRegExpConstructors=new Set();
  const boundStringConstructors=new Set();
  // Failed structured cloning can expose a function's exact source spelling
  // in DataCloneError.message, including functions nested in clone inputs.
  const cloneFunctions=new Set(['structuredClone',...importedCloneFunctions]);
  const aggregateErrors=new Set(['AggregateError']);
  // Web IDL string arguments and string-valued record/sequence entries also
  // invoke ToString, so exposed source can cross a browser API boundary.
  const webScalarNames=new Set(['DOMException','URL']);
  const webDictionaryNames=new Set(['URLSearchParams','Headers','Blob']);
  // Built-in Web APIs convert string/record/sequence arguments through Web IDL.
  // Even implicit conversion and rejected enum/encoding labels can expose
  // Function#toString bytes without an explicit source-reading expression.
  const webRecordNames=new Set(['Request','Response','File',
    'Event','CustomEvent','MessageEvent','BroadcastChannel',
    'TextDecoder','TextDecoderStream','CompressionStream','DecompressionStream']);
  const webScalars=new Set(webScalarNames);
  // URL.parse and URL.canParse convert operands to USVString.
  const urlNativeNames=new Set(['URL']);
  const urlConstructors=new Set(urlNativeNames);
  const urlNodeModules=new Set();
  const urlStaticNames=new Set(['parse','canParse']);
  const urlStaticAliases=new Set(importedUrlStaticMethods);
  /** @type {Map<string,Set<string>>} */
  const urlStaticObjectKeys=new Map();
  // A proven ESM namespace import is an immutable record of exported
  // methods; dotted proof keys retain the namespace owner and export name.
  for(const alias of importedUrlStaticMethods) {
    const dot=alias.indexOf('.');
    if(dot<=0||dot===alias.length-1)continue;
    const receiver=alias.slice(0,dot),method=alias.slice(dot+1);
    let methods=urlStaticObjectKeys.get(receiver);
    if(!methods){methods=new Set();urlStaticObjectKeys.set(receiver,methods);}
    methods.add(method);
  }
  /** @type {Map<string,Set<string>>} */
  const urlConstructorObjectKeys=new Map();
  // Node's ESM URL exports are the WHATWG URL intrinsic, including through
  // named constructor aliases and namespace/default module objects.
  walk(ast,node=>{
    if(node.type!=='ImportDeclaration'||node.source.type!=='Literal'||
       !['url','node:url'].includes(String(node.source.value)))return;
    for(const spec of node.specifiers) {
      if(spec.type==='ImportSpecifier' &&
         (spec.imported.name??spec.imported.value)==='URL') {
        urlConstructors.add(spec.local.name);
      }
      if(spec.type==='ImportNamespaceSpecifier'||spec.type==='ImportDefaultSpecifier') {
        urlNodeModules.add(spec.local.name);
        urlConstructorObjectKeys.set(spec.local.name,new Set(['URL']));
      }
    }
  });
  const webDictionaries=new Set(webDictionaryNames);
  // Blob's second constructor argument is a Web IDL options dictionary.
  const blobNames=new Set(['Blob']);
  const blobConstructors=new Set(blobNames);
  const boundBlobConstructors=new Set();
  const webRecords=new Set(webRecordNames);
  const webStringNames=new Set(['Headers','URLSearchParams']);
  const webStringConstructors=new Set(webStringNames);
  const webStringInstances=new Set();
  // Web Storage stringifies both setItem arguments and the key argument of
  // getItem/removeItem. Track its global roots and simple aliases separately
  // from Headers/URLSearchParams so unrelated custom setItem methods are not
  // treated as Web IDL coercion.
  const storageNames=new Set(['localStorage','sessionStorage']);
  const storageInstances=new Set(storageNames);
  const storageMethodAliases=new Set(importedStorageMethodAliases);
  const storageMethodDescriptorAliases=new Set();
  const storageReflectGetAliases=new Set();
  const storageDescriptorReaderAliases=new Set();
  // Native Request/Response headers and URL searchParams are collection
  // objects that expose the same coercion methods as directly created ones.
  const webRecordInstances=new Set();
  const webScalarInstances=new Set();
  const responseNames=new Set(['Response']);
  const responseConstructors=new Set(responseNames);
  const responseRedirects=new Set();
  // A native Web constructor can flow through a plain local object property.
  // Keep may-flow sets for properties and aliases; writes add candidates
  // monotonically, so an overwritten property merely causes over-refusal.
  /** @type {Map<string,Set<string>>} */
  const webRecordObjectKeys=new Map();
  /** @type {Map<string,Set<string>>} */
  const responseObjectKeys=new Map();
  /** @type {Map<string,Set<string>>} */
  const webStringObjectKeys=new Map();
  /** @type {Map<string,Set<string>>} */
  const blobObjectKeys=new Map();
  /** @type {Map<string,Set<string>>} */
  const boundBlobObjectKeys=new Map();
  /** @type {Map<string,Set<string>>} */
  const boundRegExpObjectKeys=new Map();
  /** @type {Map<string,Set<string>>} */
  const boundStringObjectKeys=new Map();
  /** @type {Map<string,Set<string>>} */
  const redirectObjectKeys=new Map();
  const encoderNames=new Set(['TextEncoder']);
  const formNames=new Set(['FormData']);
  const encoderConstructors=new Set(encoderNames);
  const formConstructors=new Set(formNames);
  const encoderInstances=new Set();
  const formInstances=new Set();
  // ECMA-402 calls can stringify functions and expose native source bytes.
  const intlNamespaces=new Set(['Intl']);
  /** @type {{name:string,constructors:Set<string>,instances:Set<string>}[]} */
  const intlKinds=[
    {name:'Collator',constructors:new Set(),instances:new Set()},
    {name:'ListFormat',constructors:new Set(),instances:new Set()},
    {name:'Segmenter',constructors:new Set(),instances:new Set()},
    {name:'DisplayNames',constructors:new Set(),instances:new Set()},
    {name:'RelativeTimeFormat',constructors:new Set(),instances:new Set()},
    {name:'Locale',constructors:new Set(),instances:new Set()},
    {name:'DateTimeFormat',constructors:new Set(),instances:new Set()},
    {name:'NumberFormat',constructors:new Set(),instances:new Set()},
    {name:'PluralRules',constructors:new Set(),instances:new Set()},
    {name:'DurationFormat',constructors:new Set(),instances:new Set()}
  ];
  const boundCollatorCompares=new Set();
  const intlStaticStringCalls=new Set();
  const nativeLocaleNames=new Set(['toLocaleString','toLocaleDateString',
    'toLocaleTimeString','localeCompare']);
  const nativeLocaleAliases=new Set();
  const symbols=new Set(['Symbol']);
  const globals=new Set(['globalThis','window','self','global']);
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isGlobal(node) {
    return Boolean(node && node.type==='Identifier' && globals.has(node.name));
  }
  /** @param {AstNode} node @returns {string|null} */
  function memberName(node) {
    return node.computed?staticString(node.property):
      node.property.type==='Identifier'?node.property.name:null;
  }
  /**
   * Track native constructor aliases separately from generic coercer aliases,
   * so a destructured method can be attributed to its source observer.
   * @param {AstNode|null|undefined} node
   * @param {Set<string>} aliases
   * @param {string} builtin
   * @returns {boolean}
   */
  function isNativeConstructor(node,aliases,builtin) {
    return Boolean(node && (node.type==='Identifier' && aliases.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)===builtin));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isSymbolConstructor(node) {
    return Boolean(node && (node.type==='Identifier' && symbols.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='Symbol'));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isJsonNamespace(node) {
    return Boolean(node && (node.type==='Identifier' &&
      jsonNamespaces.has(node.name) || node.type==='MemberExpression' &&
      isGlobal(node.object) && memberName(node)==='JSON'));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isNodeBufferNamespace(node) {
    return Boolean(node && (node.type==='Identifier' &&
      nodeBufferNamespaces.has(node.name) || isRequireCall(node) &&
      node.arguments.length===1 &&
      ['buffer','node:buffer'].includes(staticString(node.arguments[0])??'')));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isCoercer(node) {
    if(!node)return false;
    if(node.type==='Identifier')return coercers.has(node.name);
    if(node.type!=='MemberExpression')return false;
    const name=memberName(node);
    return isGlobal(node.object) && name!==null && builtinCoercers.has(name) ||
      name==='btoa' && isNodeBufferNamespace(node.object) ||
      name==='for' && isSymbolConstructor(node.object) ||
      isJsonNamespace(node.object) &&
      (['parse','rawJSON'].includes(name??'')||node.computed&&name===null);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStructuredClone(node) {
    return Boolean(node && (node.type==='Identifier' && cloneFunctions.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='structuredClone'));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isV8Module(node) {
    return Boolean(node && (node.type==='Identifier' && v8Modules.has(node.name) ||
      isRequireCall(node) &&
      ['v8','node:v8'].includes(staticString(node.arguments[0])??'')));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isV8Serialize(node) {
    return Boolean(node && (node.type==='Identifier' && v8Serializers.has(node.name) ||
      node.type==='MemberExpression' && memberName(node)==='serialize' &&
      isV8Module(node.object)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isV8SerializerConstructor(node) {
    return Boolean(node && (node.type==='Identifier' &&
      v8SerializerConstructors.has(node.name) ||
      node.type==='MemberExpression' &&
      ['Serializer','DefaultSerializer'].includes(memberName(node)??'') &&
      isV8Module(node.object)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isV8SerializerInstance(node) {
    return Boolean(node && (node.type==='Identifier' &&
      v8SerializerInstances.has(node.name) ||
      node.type==='NewExpression' &&
      isV8SerializerConstructor(node.callee)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isV8SerializerWrite(node) {
    return Boolean(node && (node.type==='Identifier' &&
      v8WriteMethods.has(node.name) ||
      node.type==='MemberExpression' && memberName(node)==='writeValue' &&
      isV8SerializerInstance(node.object)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isAggregateError(node) {
    return Boolean(node && (node.type==='Identifier'&&aggregateErrors.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='AggregateError'));
  }
  /**
   * Recognize the immutable Node builtin URL module, directly from require()
   * or via local aliases and named/default ESM imports.
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isNodeUrlModule(node) {
    if(!node)return false;
    if(node.type==='Identifier')return urlNodeModules.has(node.name);
    return node.type==='CallExpression' &&
      node.callee.type==='Identifier'&&node.callee.name==='require'&&
      node.arguments.length===1&&
      ['node:url','url'].includes(staticString(node.arguments[0])??'');
  }
  /** @param {AstNode|null|undefined} node @param {Set<string>} aliases
   *  @param {Set<string>} builtins @returns {boolean} */
  function isWebConstructor(node,aliases,builtins) {
    if(!node)return false;
    if(node.type==='Identifier')return aliases.has(node.name);
    if(node.type!=='MemberExpression')return false;
    const name=memberName(node);
    if(isGlobal(node.object) && builtins.has(name??''))return true;
    if(aliases===urlConstructors && name==='URL'&&isNodeUrlModule(node.object))
      return true;
    if(node.object.type!=='Identifier')return false;
    const properties=aliases===webRecords ? webRecordObjectKeys :
      aliases===responseConstructors ? responseObjectKeys :
      aliases===webStringConstructors ? webStringObjectKeys :
      aliases===blobConstructors ? blobObjectKeys :
      aliases===urlConstructors ? urlConstructorObjectKeys : null;
    const keys=properties?.get(node.object.name);
    // A runtime-computed key could select any recorded native method.
    return name!==null ? keys?.has(name)??false : Boolean(node.computed&&keys?.size);
  }
  /**
   * A native RegExp or String constructor remains source-coercing when bound.
   * Capture aliases conservatively, including owners' property reads.
   * @param {AstNode|null|undefined} node
   * @param {Set<string>} aliases
   * @param {Map<string,Set<string>>} objectKeys
   * @param {Set<string>} nativeAliases
   * @param {string} builtin
   * @returns {boolean}
   */
  function isBoundNativeConstructor(node,aliases,objectKeys,nativeAliases,builtin) {
    if(!node)return false;
    if(node.type==='Identifier')return aliases.has(node.name);
    if(node.type==='MemberExpression'&&node.object.type==='Identifier') {
      const keys=objectKeys.get(node.object.name);
      const key=memberName(node);
      return key!==null ? keys?.has(key)??false : Boolean(node.computed&&keys?.size);
    }
    return node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
      memberName(node.callee)==='bind'&&
      isNativeConstructor(node.callee.object,nativeAliases,builtin);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isBoundRegExpConstructor(node) {
    return isBoundNativeConstructor(node,boundRegExpConstructors,
      boundRegExpObjectKeys,nativeRegExpConstructors,'RegExp');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isBoundStringConstructor(node) {
    return isBoundNativeConstructor(node,boundStringConstructors,
      boundStringObjectKeys,nativeStringConstructors,'String');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isBlobConstructor(node) {
    if(node?.type==='SequenceExpression') {
      return isBlobConstructor(node.expressions[node.expressions.length-1]);
    }
    return isWebConstructor(node,blobConstructors,blobNames);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isBoundBlobConstructor(node) {
    if(!node)return false;
    if(node.type==='Identifier')return boundBlobConstructors.has(node.name);
    if(node.type==='MemberExpression' && node.object.type==='Identifier') {
      const keys=boundBlobObjectKeys.get(node.object.name);
      const name=memberName(node);
      return name!==null ? keys?.has(name)??false :
        Boolean(node.computed&&keys?.size);
    }
    return node.type==='CallExpression' &&
      node.callee.type==='MemberExpression' &&
      memberName(node.callee)==='bind' && isBlobConstructor(node.callee.object);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isResponseRedirect(node) {
    return Boolean(node && (node.type==='Identifier' &&
      responseRedirects.has(node.name) || node.type==='MemberExpression' &&
      (memberName(node)==='redirect' &&
       isWebConstructor(node.object,responseConstructors,responseNames) ||
       node.object.type==='Identifier' &&
       (memberName(node)!==null ?
         redirectObjectKeys.get(node.object.name)?.has(memberName(node)??'') :
         node.computed && Boolean(redirectObjectKeys.get(node.object.name)?.size)))));
  }
  /**
   * Recognize native URL static parsing methods and bounded local aliases.
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isUrlStaticMethod(node) {
    if(!node)return false;
    if(node.type==='SequenceExpression')
      return isUrlStaticMethod(node.expressions[node.expressions.length-1]);
    if(node.type==='Identifier')return urlStaticAliases.has(node.name);
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       memberName(node.callee)==='bind')
      return isUrlStaticMethod(node.callee.object);
    if(node.type!=='MemberExpression')return false;
    const name=memberName(node);
    if(isWebConstructor(node.object,urlConstructors,urlNativeNames))
      return urlStaticNames.has(name??'')||Boolean(node.computed&&name===null);
    if(node.object.type!=='Identifier')return false;
    const keys=urlStaticObjectKeys.get(node.object.name);
    return name!==null?keys?.has(name)??false:Boolean(node.computed&&keys?.size);
  }
  /** @param {AstNode|null|undefined} node @param {Set<string>} instances
   *  @param {Set<string>} constructors @param {Set<string>} names @returns {boolean} */
  function isWebInstance(node,instances,constructors,names) {
    return Boolean(node && (node.type==='Identifier'&&instances.has(node.name) ||
      node.type==='NewExpression'&&isWebConstructor(node.callee,constructors,names)));
  }
  /**
   * Headers and URLSearchParams arise from constructor calls or via native
   * Request/Response/URL accessors. Following simple aliases of their owners
   * preserves source-observer detection without treating every .append call
   * on arbitrary user objects as a Web IDL coercion.
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isWebStringCollection(node) {
    if(!node)return false;
    if(isWebInstance(node,webStringInstances,webStringConstructors,webStringNames))
      return true;
    if(node.type!=='MemberExpression')return false;
    const name=memberName(node);
    return (name==='headers'||node.computed&&name===null) &&
      isWebInstance(node.object,webRecordInstances,webRecords,webRecordNames) ||
      (name==='searchParams'||node.computed&&name===null) &&
      isWebInstance(node.object,webScalarInstances,webScalars,webScalarNames);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStorageCollection(node) {
    if(!node)return false;
    if(node.type==='Identifier')return storageInstances.has(node.name);
    return node.type==='MemberExpression' && isGlobal(node.object) &&
      storageNames.has(memberName(node)??'');
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStoragePrototype(node) {
    if(node?.type!=='MemberExpression'||memberName(node)!=='prototype')return false;
    const root=node.object;
    return root.type==='Identifier'&&root.name==='Storage' ||
      root.type==='MemberExpression'&&isGlobal(root.object)&&memberName(root)==='Storage';
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStorageMethodOwner(node) {
    return isStorageCollection(node)||isStoragePrototype(node);
  }
  /** @param {string|null} name @returns {boolean} */
  function isStorageMethodName(name) {
    return name===null||['setItem','getItem','removeItem'].includes(name);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStorageReflectGetMethod(node) {
    if(!node)return false;
    if(node.type==='Identifier')return storageReflectGetAliases.has(node.name);
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       memberName(node.callee)==='bind')
      return isStorageReflectGetMethod(node.callee.object);
    return node.type==='MemberExpression'&&memberName(node)==='get'&&
      isReflectiveReceiver(node.object);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStorageDescriptorReader(node) {
    if(!node)return false;
    if(node.type==='Identifier')return storageDescriptorReaderAliases.has(node.name);
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       memberName(node.callee)==='bind')
      return isStorageDescriptorReader(node.callee.object);
    return node.type==='MemberExpression'&&
      memberName(node)==='getOwnPropertyDescriptor'&&
      isReflectiveReceiver(node.object);
  }
  /**
   * Object.getOwnPropertyDescriptor(Storage.prototype, method) recovers the
   * same Web IDL method as a direct Storage.prototype member reference.
   * Descriptor aliases are propagated through simple identifier bindings.
   * @param {AstNode|null|undefined} node
   * @returns {boolean}
   */
  function isStorageMethodDescriptor(node) {
    if(!node)return false;
    if(node.type==='Identifier')return storageMethodDescriptorAliases.has(node.name);
    if(node.type!=='CallExpression'||
       !isStorageDescriptorReader(node.callee))return false;
    return isStoragePrototype(node.arguments[0])&&
      isStorageMethodName(sourceStringKey(node.arguments[1]));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStorageMethodReference(node) {
    if(!node)return false;
    if(node.type==='Identifier')return storageMethodAliases.has(node.name);
    if(node.type==='CallExpression') {
      if(node.callee.type==='MemberExpression' &&
         memberName(node.callee)==='bind')
        return isStorageMethodReference(node.callee.object);
      // Reflect.get can detach a native Storage method without leaving a
      // MemberExpression at the eventual invocation site. Aliased readers are
      // propagated by the same fixed-point pass as the method references.
      if(isStorageReflectGetMethod(node.callee)&&
         isStorageMethodOwner(node.arguments[0])&&
         isStorageMethodName(sourceStringKey(node.arguments[1])))return true;
      return false;
    }
    if(node.type!=='MemberExpression')return false;
    if(memberName(node)==='value'&&isStorageMethodDescriptor(node.object))return true;
    return isStorageMethodName(memberName(node))&&isStorageMethodOwner(node.object);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isIntlNamespace(node) {
    return Boolean(node && (node.type==='Identifier' &&
      intlNamespaces.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='Intl'));
  }
  /** @param {AstNode|null|undefined} node @param {{name:string,constructors:Set<string>}} kind @returns {boolean} */
  function isIntlConstructor(node,kind) {
    return Boolean(node && (node.type==='Identifier' &&
      kind.constructors.has(node.name) ||
      node.type==='MemberExpression' && isIntlNamespace(node.object) &&
        memberName(node)===kind.name));
  }
  /** @param {AstNode|null|undefined} node @param {{name:string,constructors:Set<string>,instances:Set<string>}} kind @returns {boolean} */
  function isIntlInstance(node,kind) {
    return Boolean(node && (node.type==='Identifier' &&
      kind.instances.has(node.name) ||
      (node.type==='NewExpression'||node.type==='CallExpression') &&
        isIntlConstructor(node.callee,kind)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isStringValue(node) {
    return Boolean(node && (staticString(node)!==null ||
      node.type==='Identifier'&&strings.has(node.name) ||
      node.type==='TemplateLiteral' ||
      node.type==='CallExpression'&&isCoercer(node.callee)));
  }
  /** @param {Set<string>} target @param {string} name @returns {boolean} */
  function add(target,name) {
    if(target.has(name))return false;
    target.add(name);
    return true;
  }
  /** @type {boolean} */
  let changed=false;
  /** @param {string} receiver @param {string} name @returns {void} */
  function addObjectFunctionKey(receiver,name) {
    let keys=objectFunctionKeys.get(receiver);
    if(!keys) {
      keys=new Set();
      objectFunctionKeys.set(receiver,keys);
    }
    if(!keys.has(name)){keys.add(name);changed=true;}
  }
  /**
   * Record one local object property holding a native Web constructor/method.
   * @param {Map<string,Set<string>>} map
   * @param {string} receiver
   * @param {string} name
   * @returns {void}
   */
  function addWebObjectKey(map,receiver,name) {
    let keys=map.get(receiver);
    if(!keys){keys=new Set();map.set(receiver,keys);}
    if(!keys.has(name)){keys.add(name);changed=true;}
  }
  /**
   * Track a directly initialized or assigned native Web object property.
   * @param {string} receiver
   * @param {string} key
   * @param {AstNode} expression
   * @returns {void}
   */
  function addWebObjectExpression(receiver,key,expression) {
    if(isWebConstructor(expression,webRecords,webRecordNames))
      addWebObjectKey(webRecordObjectKeys,receiver,key);
    if(isWebConstructor(expression,responseConstructors,responseNames))
      addWebObjectKey(responseObjectKeys,receiver,key);
    if(isWebConstructor(expression,webStringConstructors,webStringNames))
      addWebObjectKey(webStringObjectKeys,receiver,key);
    if(isBlobConstructor(expression))
      addWebObjectKey(blobObjectKeys,receiver,key);
    if(isBoundBlobConstructor(expression))
      addWebObjectKey(boundBlobObjectKeys,receiver,key);
    if(isBoundRegExpConstructor(expression))
      addWebObjectKey(boundRegExpObjectKeys,receiver,key);
    if(isBoundStringConstructor(expression))
      addWebObjectKey(boundStringObjectKeys,receiver,key);
    if(isResponseRedirect(expression))
      addWebObjectKey(redirectObjectKeys,receiver,key);
    if(isUrlStaticMethod(expression))
      addWebObjectKey(urlStaticObjectKeys,receiver,key);
    if(isWebConstructor(expression,urlConstructors,urlNativeNames))
      addWebObjectKey(urlConstructorObjectKeys,receiver,key);
  }
  do {
    changed=false;
    walk(ast,node=>{
      if(node.type==='VariableDeclarator' && node.id.type==='Identifier' ||
         node.type==='AssignmentExpression' && node.operator==='=' &&
         node.left.type==='Identifier') {
        const name=node.type==='VariableDeclarator'?node.id.name:node.left.name;
        const value=node.type==='VariableDeclarator'?node.init:node.right;
        if(isStringValue(value))changed=add(strings,name)||changed;
        if(isJsonNamespace(value))changed=add(jsonNamespaces,name)||changed;
        if(isNodeBufferNamespace(value))changed=add(nodeBufferNamespaces,name)||changed;
        if(isCoercer(value) || value?.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           isCoercer(value.callee.object))
          changed=add(coercers,name)||changed;
        if(isNativeConstructor(value,nativeStringConstructors,'String'))
          changed=add(nativeStringConstructors,name)||changed;
        if(isNativeConstructor(value,nativeRegExpConstructors,'RegExp'))
          changed=add(nativeRegExpConstructors,name)||changed;
        if(isBoundRegExpConstructor(value))
          changed=add(boundRegExpConstructors,name)||changed;
        if(isBoundStringConstructor(value))
          changed=add(boundStringConstructors,name)||changed;
        if(isV8Module(value))changed=add(v8Modules,name)||changed;
        if(isV8SerializerConstructor(value))changed=add(v8SerializerConstructors,name)||changed;
        if(isV8SerializerInstance(value))changed=add(v8SerializerInstances,name)||changed;
        if(isV8SerializerWrite(value) || value?.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           isV8SerializerWrite(value.callee.object)) {
          changed=add(v8WriteMethods,name)||changed;
        }
        if(isV8Serialize(value) || value?.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           isV8Serialize(value.callee.object)) {
          changed=add(v8Serializers,name)||changed;
        }
        if(isStructuredClone(value) || value?.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           isStructuredClone(value.callee.object)) {
          changed=add(cloneFunctions,name)||changed;
        }
        if(isObjectFromEntries(value))changed=add(fromEntriesMethods,name)||changed;
        if(isDetachedArraySourceMethod(value)) {
          changed=add(detachedArraySourceMethods,name)||changed;
        }
        // Symbol.match/iterator aliases can be assigned repeatedly. Preserve
        // every observed candidate to avoid assuming immutable bindings.
        if(value?.type==='Identifier' && sourceSymbolKeyAliases.has(value.name) ||
           value?.type==='MemberExpression'&&
             isSymbolConstructor(value.object)&&
             sourceSymbolMethods.has(memberName(value)??'')) {
          let keys=sourceSymbolKeyAliases.get(name);
          if(!keys) {
            keys=new Set();
            sourceSymbolKeyAliases.set(name,keys);
          }
          const source=value.type==='Identifier' ?
            sourceSymbolKeyAliases.get(value.name)??new Set() :
            new Set([memberName(value)??'']);
          for(const key of source) {
            if(!keys.has(key)) {
              keys.add(key);
              changed=true;
            }
          }
        }
        if(isStringRaw(value))changed=add(stringRawAliases,name)||changed;
        if(isDetachedStringReceiverMethod(value)) {
          changed=add(detachedStringReceiverMethods,name)||changed;
        }
        if(isDetachedRegExpSourceMethod(value)) {
          changed=add(detachedRegExpSourceMethods,name)||changed;
        }
        if(value?.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           isDetachedRegExpSourceMethod(value.callee.object) ||
           value?.type==='Identifier'&&boundRegExpSourceMethods.has(value.name)) {
          changed=add(boundRegExpSourceMethods,name)||changed;
        }
        if(isAggregateError(value))changed=add(aggregateErrors,name)||changed;
        if(isWebConstructor(value,webScalars,webScalarNames)) {
          changed=add(webScalars,name)||changed;
        }
        if(isWebConstructor(value,urlConstructors,urlNativeNames))
          changed=add(urlConstructors,name)||changed;
        if(isNodeUrlModule(value))
          changed=add(urlNodeModules,name)||changed;
        if(isUrlStaticMethod(value))
          changed=add(urlStaticAliases,name)||changed;
        if(isWebConstructor(value,webDictionaries,webDictionaryNames)) {
          changed=add(webDictionaries,name)||changed;
        }
        if(isBlobConstructor(value)) {
          changed=add(blobConstructors,name)||changed;
        }
        if(isBoundBlobConstructor(value)) {
          changed=add(boundBlobConstructors,name)||changed;
        }
        if(isWebConstructor(value,webRecords,webRecordNames)) {
          changed=add(webRecords,name)||changed;
        }
        if(isWebConstructor(value,responseConstructors,responseNames)) {
          changed=add(responseConstructors,name)||changed;
        }
        if(isWebConstructor(value,webStringConstructors,webStringNames)) {
          changed=add(webStringConstructors,name)||changed;
        }
        if(isResponseRedirect(value) || value?.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           isResponseRedirect(value.callee.object)) {
          changed=add(responseRedirects,name)||changed;
        }
        if(isWebConstructor(value,encoderConstructors,encoderNames)) {
          changed=add(encoderConstructors,name)||changed;
        }
        if(isWebConstructor(value,formConstructors,formNames)) {
          changed=add(formConstructors,name)||changed;
        }
        if(isWebInstance(value,encoderInstances,encoderConstructors,encoderNames)) {
          changed=add(encoderInstances,name)||changed;
        }
        if(isWebInstance(value,formInstances,formConstructors,formNames)) {
          changed=add(formInstances,name)||changed;
        }
        if(isWebInstance(value,webRecordInstances,webRecords,webRecordNames)) {
          changed=add(webRecordInstances,name)||changed;
        }
        if(isWebInstance(value,webScalarInstances,webScalars,webScalarNames)) {
          changed=add(webScalarInstances,name)||changed;
        }
        if(isWebStringCollection(value)) {
          changed=add(webStringInstances,name)||changed;
        }
        if(isBoundFunctionExpression(value))
          changed=add(boundFunctionAliases,name)||changed;
        if(node.type==='AssignmentExpression'&&boundFunctionAliases.has(name))
          changed=add(mutatedBoundFunctionAliases,name)||changed;
        if(isStorageCollection(value)) {
          changed=add(storageInstances,name)||changed;
        }
        if(isStorageReflectGetMethod(value)) {
          changed=add(storageReflectGetAliases,name)||changed;
        }
        if(isStorageDescriptorReader(value)) {
          changed=add(storageDescriptorReaderAliases,name)||changed;
        }
        if(isStorageMethodDescriptor(value)) {
          changed=add(storageMethodDescriptorAliases,name)||changed;
        }
        if(isStorageMethodReference(value)) {
          changed=add(storageMethodAliases,name)||changed;
        }
        if(value?.type==='MemberExpression' &&
           nativeLocaleNames.has(memberName(value)??'') ||
           value?.type==='Identifier' && nativeLocaleAliases.has(value.name)) {
          changed=add(nativeLocaleAliases,name)||changed;
        }
        if(isIntlNamespace(value))changed=add(intlNamespaces,name)||changed;
        if(value?.type==='MemberExpression'&&isIntlNamespace(value.object)&&
           ['supportedValuesOf','getCanonicalLocales'].includes(memberName(value)??'') ||
           value?.type==='Identifier'&&intlStaticStringCalls.has(value.name)) {
          changed=add(intlStaticStringCalls,name)||changed;
        }
        for(const kind of intlKinds) {
          if(isIntlConstructor(value,kind))changed=add(kind.constructors,name)||changed;
          if(isIntlInstance(value,kind))changed=add(kind.instances,name)||changed;
        }
        if(value?.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           (value.callee.object.type==='Identifier' &&
             boundCollatorCompares.has(value.callee.object.name) ||
            value.callee.object.type==='MemberExpression' &&
              memberName(value.callee.object)==='compare' &&
              isIntlInstance(value.callee.object.object,intlKinds[0]))) {
          changed=add(boundCollatorCompares,name)||changed;
        }
        if(value?.type==='MemberExpression' &&
           memberName(value)==='compare' &&
           isIntlInstance(value.object,intlKinds[0])) {
          changed=add(boundCollatorCompares,name)||changed;
        }
        if(value?.type==='Identifier'&&boundCollatorCompares.has(value.name)) {
          changed=add(boundCollatorCompares,name)||changed;
        }
        if(isSymbolConstructor(value))changed=add(symbols,name)||changed;
        if(isGlobal(value))changed=add(globals,name)||changed;
        if(value?.type==='Identifier'&&reflectiveReceivers.has(value.name) ||
           value?.type==='MemberExpression'&&isGlobal(value.object)&&
             ['Reflect','Object'].includes(memberName(value)??'')) {
          changed=add(reflectiveReceivers,name)||changed;
        }
        if(isFunctionValue(value))changed=add(functions,name)||changed;
        if(value?.type==='ObjectExpression') {
          for(const property of value.properties) {
            if(property.type!=='Property')continue;
            const key=property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key);
            if(key!==null) {
              if(isFunctionValue(property.value))addObjectFunctionKey(name,key);
              if(property.kind==='init'&&!property.method)
                addWebObjectExpression(name,key,property.value);
            }
          }
        }
        if(value?.type==='Identifier') {
          for(const key of objectFunctionKeys.get(value.name)??[]) {
            addObjectFunctionKey(name,key);
          }
          for(const map of [webRecordObjectKeys,responseObjectKeys,webStringObjectKeys,
            blobObjectKeys,boundBlobObjectKeys,boundRegExpObjectKeys,
            boundStringObjectKeys,redirectObjectKeys,urlStaticObjectKeys,
            urlConstructorObjectKeys]) {
            // A direct object alias shares the original mutable record.
            // May-flow is bidirectional so later property writes through
            // either binding remain visible in every fixed-point iteration.
            for(const key of map.get(value.name)??[])addWebObjectKey(map,name,key);
            for(const key of map.get(name)??[])addWebObjectKey(map,value.name,key);
          }
        }
        if(isOpaqueNamespace(value)) {
          changed=add(opaqueNamespaces,name)||changed;
          changed=add(opaqueFunctions,name)||changed;
        }
        if(containsFunction(value))changed=add(arraysWithFunctions,name)||changed;
        if(containsFunctionInArrayLike(value)) {
          changed=add(arrayLikeWithFunctions,name)||changed;
        }
        if(value?.type==='Identifier'&&arrayLikeWithFunctions.has(name)) {
          // Mutation through a simple alias changes the original owner too.
          changed=add(arrayLikeWithFunctions,value.name)||changed;
        }
        if(containsFunctionKeyEntries(value)) {
          changed=add(entryCollectionsWithFunctionKeys,name)||changed;
        }
      }
      // A known function-bearing iterable can pass the function to a
      // local for-of binding or a synchronous Array#forEach callback.
      if(node.type==='ForOfStatement' &&
         node.left.type==='VariableDeclaration' &&
         node.left.declarations.length===1 &&
         node.left.declarations[0].id.type==='Identifier' &&
         containsFunction(node.right)) {
        changed=add(functions,node.left.declarations[0].id.name)||changed;
      }
      if(node.type==='CallExpression' &&
         node.callee.type==='MemberExpression' &&
         memberName(node.callee)==='forEach' &&
         containsFunction(node.callee.object)) {
        const callback=node.arguments[0];
        if(callback &&
           ['FunctionExpression','ArrowFunctionExpression'].includes(callback.type)) {
          // Set passes the value twice, and Map passes the key second.
          // Both can carry a source-observable function.
          for(const param of callback.params.slice(0,2)) {
            if(param?.type==='Identifier')
              changed=add(functions,param.name)||changed;
          }
          // The third callback argument is the collection itself.
          if(callback.params[2]?.type==='Identifier') {
            changed=add(arraysWithFunctions,callback.params[2].name)||changed;
          }
        }
      }
      // Mutators can introduce function-valued array elements well after
      // declaration. Fixed-point alias propagation handles mutation via
      // another local identifier before the original owner is stringified.
      if(node.type==='CallExpression' &&
         node.callee.type==='MemberExpression' &&
         node.callee.object.type==='Identifier') {
        const method=memberName(node.callee);
        const inserted=method==='splice'?node.arguments.slice(2):
          method==='set'?node.arguments.slice(1):
          ['push','unshift','fill','add'].includes(method??'')?node.arguments:[];
        if(inserted.some((/** @type {AstNode} */ argument)=>
          argument.type==='SpreadElement'?
            isFunctionValue(argument.argument)||containsFunction(argument.argument):
            isFunctionValue(argument)||containsFunction(argument))) {
          changed=add(arrayLikeWithFunctions,node.callee.object.name)||changed;
        }
      }
      if(node.type==='AssignmentExpression' && node.operator==='=' &&
         node.left.type==='MemberExpression' &&
         node.left.object.type==='Identifier') {
        const key=memberName(node.left);
        if(key!==null) {
          if(isFunctionValue(node.right))addObjectFunctionKey(node.left.object.name,key);
          addWebObjectExpression(node.left.object.name,key,node.right);
        }
        if(isFunctionValue(node.right)&&isArrayIndexNode(node.left.property)) {
          changed=add(arrayLikeWithFunctions,node.left.object.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
         node.init || node.type==='AssignmentExpression'&&node.operator==='='&&
         node.left.type==='ObjectPattern') {
        const pattern=node.type==='VariableDeclarator'?node.id:node.left;
        const target=node.type==='VariableDeclarator'?node.init:node.right;
        const fromStorage=isStorageMethodOwner(target);
        const fromDescriptor=isStorageMethodDescriptor(target);
        if(fromStorage||fromDescriptor)for(const property of pattern.properties) {
          if(property.type!=='Property')continue;
          const name=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          const binding=property.value.type==='AssignmentPattern'?
            property.value.left:property.value;
          if(binding.type!=='Identifier')continue;
          if(fromStorage&&isStorageMethodName(name) ||
             fromDescriptor&&name==='value') {
            changed=add(storageMethodAliases,binding.name)||changed;
          }
        }
      }
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         node.init?.type==='Identifier') {
        const known=objectFunctionKeys.get(node.init.name);
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const key=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(key===null)continue;
          if(known?.has(key))changed=add(functions,property.value.name)||changed;
          if(webRecordObjectKeys.get(node.init.name)?.has(key))
            changed=add(webRecords,property.value.name)||changed;
          if(responseObjectKeys.get(node.init.name)?.has(key))
            changed=add(responseConstructors,property.value.name)||changed;
          if(webStringObjectKeys.get(node.init.name)?.has(key))
            changed=add(webStringConstructors,property.value.name)||changed;
          if(blobObjectKeys.get(node.init.name)?.has(key))
            changed=add(blobConstructors,property.value.name)||changed;
          if(boundBlobObjectKeys.get(node.init.name)?.has(key))
            changed=add(boundBlobConstructors,property.value.name)||changed;
          if(boundRegExpObjectKeys.get(node.init.name)?.has(key))
            changed=add(boundRegExpConstructors,property.value.name)||changed;
          if(boundStringObjectKeys.get(node.init.name)?.has(key))
            changed=add(boundStringConstructors,property.value.name)||changed;
          if(redirectObjectKeys.get(node.init.name)?.has(key))
            changed=add(responseRedirects,property.value.name)||changed;
          if(urlStaticObjectKeys.get(node.init.name)?.has(key))
            changed=add(urlStaticAliases,property.value.name)||changed;
          if(urlConstructorObjectKeys.get(node.init.name)?.has(key))
            changed=add(urlConstructors,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         isV8Module(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name==='serialize')changed=add(v8Serializers,property.value.name)||changed;
          if(name==='Serializer'||name==='DefaultSerializer') {
            changed=add(v8SerializerConstructors,property.value.name)||changed;
          }
        }
      }
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         isRequireCall(node.init)) {
        for(const property of node.id.properties) {
          if(property.type==='Property'&&property.value.type==='Identifier') {
            changed=add(opaqueFunctions,property.value.name)||changed;
          }
        }
      }
      if((node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern' ||
          node.type==='AssignmentExpression'&&node.operator==='='&&
            node.left.type==='ObjectPattern')) {
        const pattern=node.type==='VariableDeclarator'?node.id:node.left;
        const value=node.type==='VariableDeclarator'?node.init:node.right;
        const fromHeaders=isWebInstance(value,webRecordInstances,webRecords,webRecordNames);
        const fromSearch=isWebInstance(value,webScalarInstances,webScalars,webScalarNames);
        if(fromHeaders||fromSearch)for(const property of pattern.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(fromHeaders&&(name==='headers'||name===null&&property.computed) ||
             fromSearch&&(name==='searchParams'||name===null&&property.computed))
            changed=add(webStringInstances,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
         isNodeUrlModule(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name==='URL'||property.computed&&name===null)
            changed=add(urlConstructors,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
         isWebConstructor(node.init,urlConstructors,urlNativeNames)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(urlStaticNames.has(name??'')||property.computed&&name===null)
            changed=add(urlStaticAliases,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
         isWebConstructor(node.init,responseConstructors,responseNames)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name==='redirect')changed=add(responseRedirects,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
         isIntlNamespace(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          const kind=intlKinds.find(item=>item.name===name);
          if(kind)changed=add(kind.constructors,property.value.name)||changed;
          if(['supportedValuesOf','getCanonicalLocales'].includes(name??'')) {
            changed=add(intlStaticStringCalls,property.value.name)||changed;
          }
        }
      }
      // Destructuring a native method is equivalent to detaching it.
      // The method may stringify a function argument or receiver even
      // though no MemberExpression for the selected method survives.
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         node.init) {
        const target=node.init;
        const proto=target.type==='MemberExpression' &&
          memberName(target)==='prototype' ? target.object : null;
        const regexpProto=isNativeConstructor(proto,nativeRegExpConstructors,'RegExp');
        const stringProto=isNativeConstructor(proto,nativeStringConstructors,'String');
        const stringCtor=isNativeConstructor(target,nativeStringConstructors,'String');
        const regexpSymbols=new Set(['match','matchAll','replace','search','split']);
        const stringSymbols=new Set(['iterator']);
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(regexpProto &&
             (sourceCoercingRegExpMethods.has(name??'') ||
              property.computed && isSourceSymbolKey(property.key,regexpSymbols))) {
            changed=add(detachedRegExpSourceMethods,property.value.name)||changed;
          }
          if(stringProto &&
             (sourceCoercingStringReceiverMethods.has(name??'') ||
              property.computed && isSourceSymbolKey(property.key,stringSymbols))) {
            changed=add(detachedStringReceiverMethods,property.value.name)||changed;
          }
          if(stringCtor && name==='raw')
            changed=add(stringRawAliases,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         isNodeBufferNamespace(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name===null || name==='btoa')
            changed=add(coercers,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         isJsonNamespace(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name===null || name==='parse'||name==='rawJSON')
            changed=add(coercers,property.value.name)||changed;
        }
      }
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         isGlobal(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property' || property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name==='Intl')changed=add(intlNamespaces,property.value.name)||changed;
          if(name==='JSON')changed=add(jsonNamespaces,property.value.name)||changed;
          if(name==='structuredClone')changed=add(cloneFunctions,property.value.name)||changed;
          if(name!==null && builtinCoercers.has(name)) {
            changed=add(coercers,property.value.name)||changed;
            if(name==='Symbol')changed=add(symbols,property.value.name)||changed;
            if(name==='String')
              changed=add(nativeStringConstructors,property.value.name)||changed;
            if(name==='RegExp')
              changed=add(nativeRegExpConstructors,property.value.name)||changed;
          }
          if(name!==null&&webScalarNames.has(name)) {
            changed=add(webScalars,property.value.name)||changed;
          }
          if(name==='URL')changed=add(urlConstructors,property.value.name)||changed;
          if(name!==null&&webDictionaryNames.has(name)) {
            changed=add(webDictionaries,property.value.name)||changed;
          }
          if(name==='Blob') {
            changed=add(blobConstructors,property.value.name)||changed;
          }
          if(name!==null&&webRecordNames.has(name)) {
            changed=add(webRecords,property.value.name)||changed;
          }
          if(name!==null&&responseNames.has(name)) {
            changed=add(responseConstructors,property.value.name)||changed;
          }
          if(name!==null&&encoderNames.has(name)) {
            changed=add(encoderConstructors,property.value.name)||changed;
          }
          if(name!==null&&formNames.has(name)) {
            changed=add(formConstructors,property.value.name)||changed;
          }
          if(name!==null&&webStringNames.has(name)) {
            changed=add(webStringConstructors,property.value.name)||changed;
          }
        }
      }
    });
  }while(changed);
  // A template substitution may preserve a function's native source, but
  // expressions proven primitive cannot contain a function object. Only
  // uniquely declared, immutable const bindings are followed. Names with
  // shadowed declarations or dynamic scope must remain unproved.
  /** @type {Map<string,number>} */
  const bindingCounts=new Map();
  const bindingNodes=new Set();
  /** @type {Map<string,AstNode>} */
  const primitiveCandidates=new Map();
  /** @type {Map<string,number>} */
  const topLevelConstEnds=new Map();
  /** @param {AstNode|null|undefined} pattern @returns {void} */
  function recordPattern(pattern) {
    if(!pattern)return;
    if(pattern.type==='Identifier') {
      bindingNodes.add(pattern);
      bindingCounts.set(pattern.name,(bindingCounts.get(pattern.name)??0)+1);
    } else if(pattern.type==='RestElement'||pattern.type==='AssignmentPattern') {
      recordPattern(pattern.argument??pattern.left);
    } else if(pattern.type==='ArrayPattern') {
      for(const value of pattern.elements)recordPattern(value);
    } else if(pattern.type==='ObjectPattern') {
      for(const value of pattern.properties) {
        recordPattern(value.type==='RestElement'?value.argument:value.value);
      }
    }
  }
  let dynamicScope=false;
  walk(ast,(node,parent)=>{
    if(node.type==='WithStatement' ||
       node.type==='Identifier' && node.name==='eval')dynamicScope=true;
    if(node.type==='VariableDeclarator')recordPattern(node.id);
    if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||
       node.type==='ArrowFunctionExpression') {
      recordPattern(node.id);
      for(const param of node.params)recordPattern(param);
    }
    if(node.type==='ClassDeclaration'||node.type==='ClassExpression')recordPattern(node.id);
    if(node.type==='CatchClause')recordPattern(node.param);
    if(node.type==='ImportSpecifier'||node.type==='ImportDefaultSpecifier'||
       node.type==='ImportNamespaceSpecifier')recordPattern(node.local);
    if(node.type==='VariableDeclaration'&&node.kind==='const') {
      for(const declaration of node.declarations) {
        if(declaration.id.type==='Identifier'&&declaration.init) {
          primitiveCandidates.set(declaration.id.name,declaration.init);
          if(parent?.type==='Program')
            topLevelConstEnds.set(declaration.id.name,declaration.end);
        }
      }
    }
  });
  const primitives=new Set();
  /** @param {AstNode|null|undefined} node @param {number} [depth] @returns {boolean} */
  function isDefinitelyPrimitive(node,depth=0) {
    if(!node||depth>32)return false;
    if(node.type==='Literal')return node.regex===undefined &&
      (node.value===null||['string','number','boolean','bigint'].includes(typeof node.value));
    if(node.type==='Identifier')return primitives.has(node.name) ||
      !dynamicScope && (importedStrings.has(node.name)||importedPrimitives.has(node.name));
    // The ArrayLiteral always owns its length data property. Reading it
    // immediately produces a number regardless of inherited getters or
    // setters. Exclude spreads as a bounded side-effect/error safeguard.
    if(node.type==='MemberExpression' &&
       node.object.type==='ArrayExpression' &&
       (node.computed ? staticString(node.property)==='length' :
         node.property.type==='Identifier' && node.property.name==='length') &&
       node.object.elements.every((/** @type {AstNode|null} */ item)=>
         item?.type!=='SpreadElement'))return true;
    // A fresh array literal's initialized numeric slot is an own data
    // property even when Array.prototype contains a hostile accessor.
    // Reject the selected hole and all spreads: an absent selected slot
    // can inherit a function, and a spread can shift the selected index.
    if(node.type==='MemberExpression' && node.computed &&
       node.object.type==='ArrayExpression' &&
       node.property.type==='Literal' &&
       typeof node.property.value==='number' &&
       Number.isSafeInteger(node.property.value) && node.property.value>=0 &&
       node.object.elements.every((/** @type {AstNode|null} */ item)=>
         item?.type!=='SpreadElement') &&
       node.property.value<node.object.elements.length) {
      const selected=node.object.elements[node.property.value];
      return Boolean(selected&&isDefinitelyPrimitive(selected,depth+1));
    }
    if(node.type==='TemplateLiteral')return node.expressions.every(
      (/** @type {AstNode} */ value)=>isDefinitelyPrimitive(value,depth+1));
    if(node.type==='UnaryExpression') {
      // These unary operators return a primitive without invoking
      // ToPrimitive on their operand. A function reference can therefore
      // be used under typeof/void/! without observing its source spelling.
      if(['typeof','void','!'].includes(node.operator))return true;
      // Numeric unaries can invoke user-defined coercion on nonprimitives.
      return ['~','+','-'].includes(node.operator) &&
        isDefinitelyPrimitive(node.argument,depth+1);
    }
    if(node.type==='BinaryExpression') {
      return !['in','instanceof'].includes(node.operator) &&
        isDefinitelyPrimitive(node.left,depth+1)&&
        isDefinitelyPrimitive(node.right,depth+1);
    }
    if(node.type==='LogicalExpression')return isDefinitelyPrimitive(node.left,depth+1)&&
      isDefinitelyPrimitive(node.right,depth+1);
    if(node.type==='ConditionalExpression') {
      if(!isDefinitelyPrimitive(node.test,depth+1)||
         !isDefinitelyPrimitive(node.alternate,depth+1))return false;
      if(isDefinitelyPrimitive(node.consequent,depth+1))return true;
      // typeof only narrows a captured, unique, top-level const binding:
      // a second read of process.argv[2] could return a different value
      // (e.g. a function from a hostile getter), so it is NOT equivalent.
      const value=node.consequent;
      const guard=node.test;
      if(dynamicScope||value.type!=='Identifier'||
         bindingCounts.get(value.name)!==1||
         (topLevelConstEnds.get(value.name)??Infinity)>=guard.start||
         guard.type!=='BinaryExpression'||guard.operator!=='===')return false;
      /** @param {AstNode} expression @returns {boolean} */
      const isTypeofValue=expression=>expression.type==='UnaryExpression'&&
        expression.operator==='typeof'&&expression.argument.type==='Identifier'&&
        expression.argument.name===value.name;
      /** @param {AstNode} expression @returns {boolean} */
      const isString=expression=>expression.type==='Literal'&&
        expression.value==='string';
      return isTypeofValue(guard.left)&&isString(guard.right)||
        isTypeofValue(guard.right)&&isString(guard.left);
    }
    if(node.type==='SequenceExpression')return node.expressions.every(
      (/** @type {AstNode} */ value)=>isDefinitelyPrimitive(value,depth+1));
    return false;
  }
  if(!dynamicScope) {
    let progress;
    do {
      progress=false;
      for(const [name,initial] of primitiveCandidates) {
        if(bindingCounts.get(name)!==1||primitives.has(name))continue;
        if(isDefinitelyPrimitive(initial)) {
          primitives.add(name);
          progress=true;
        }
      }
    } while(progress);
  }
  /**
   * An inline array or data-object literal containing only proven primitive
   * values cannot carry a function source into structured cloning. Avoid
   * opaque identifiers, constructors, spread, getters and computed effects.
   * @param {AstNode|null|undefined} node
   * @param {number} [depth]
   * @returns {boolean}
   */
  function isInertCloneInput(node,depth=0) {
    if(!node||depth>16)return false;
    if(isDefinitelyPrimitive(node))return true;
    if(node.type==='ArrayExpression') {
      return node.elements.every((/** @type {AstNode|null} */ value)=>
        value===null || value.type!=='SpreadElement' &&
          isInertCloneInput(value,depth+1));
    }
    if(node.type==='ObjectExpression') {
      return node.properties.every((/** @type {AstNode} */ property)=>
        property.type==='Property' && property.kind==='init' &&
        !property.method && (!property.computed || staticString(property.key)!==null) &&
        isInertCloneInput(property.value,depth+1));
    }
    return false;
  }
  /**
   * Inline fresh literal records whose own data fields are proven primitive
   * have only native Object.prototype source methods at construction time.
   * Never extrapolate this proof across aliases, writes, or unknown escapes.
   * @param {AstNode|null|undefined} input
   * @returns {boolean}
   */
  function isInertPlainRecord(input) {
    if(!input || input.type!=='ObjectExpression')return false;
    return input.properties.every((/** @type {AstNode} */ property)=>{
      if(property.type!=='Property'||property.kind!=='init'||
         property.computed||property.method)return false;
      const name=property.key.type==='Identifier'?
        property.key.name:staticString(property.key);
      const value=property.value;
      return name!==null &&
        !['__proto__','toString','toLocaleString','toSource'].includes(name) &&
        value.type==='Literal' && (value.value===null ||
          ['string','number','boolean','bigint'].includes(typeof value.value));
    });
  }
  /**
   * An unknown source-method receiver may be callable after arbitrary
   * forwarding, including promises and opaque imported return values.
   * Refuse source-affecting edits except for proven primitives and inert
   * local literal records under the native-realm contract.
   * @param {AstNode|null|undefined} input
   * @returns {boolean}
   */
  function mayBeMemberMethod(input) {
    return Boolean(input && !isDefinitelyPrimitive(input) &&
      !isInertPlainRecord(input));
  }
  /**
   * Find direct, nested or array-carried source method destructuring. The
   * outer receiver check separately decides whether a callable is possible.
   * @param {AstNode|null|undefined} pattern
   * @param {number} [depth]
   * @returns {boolean}
   */
  function patternReadsSourceMethod(pattern,depth=0) {
    if(!pattern)return false;
    if(depth>32)return true;
    if(pattern.type==='AssignmentPattern')
      return patternReadsSourceMethod(pattern.left,depth+1);
    if(pattern.type==='ArrayPattern')
      return pattern.elements.some((/** @type {AstNode|null} */ value)=>
        patternReadsSourceMethod(value,depth+1));
    if(pattern.type!=='ObjectPattern')return false;
    return pattern.properties.some((/** @type {AstNode} */ property)=>{
      if(property.type==='RestElement')return false;
      if(property.type!=='Property')return true;
      const name=property.computed?sourceStringKey(property.key):
        property.key.type==='Identifier'?property.key.name:staticString(property.key);
      return name===null ||
        ['toString','toSource','toLocaleString'].includes(name) ||
        patternReadsSourceMethod(property.value,depth+1);
    });
  }
  /**
   * Recognize immutable, uniquely-bound constant string keys at a consumer.
   * Local variables used as computed member names are common around native
   * toString/Reflect.get observers. Ambiguous bindings remain unresolved.
   * @param {AstNode|null|undefined} node
   * @param {number} [depth]
   * @returns {string|null}
   */
  function sourceStringKey(node,depth=0) {
    if(!node || depth>32)return null;
    const literal=staticString(node);
    if(literal!==null)return literal;
    if(node.type==='Identifier' && !dynamicScope &&
       bindingCounts.get(node.name)===1) {
      const imported=importedStrings.get(node.name);
       if(imported!==undefined)return imported;
       return sourceStringKey(primitiveCandidates.get(node.name),depth+1);
    }
    if(node.type==='BinaryExpression' && node.operator==='+') {
      const left=sourceStringKey(node.left,depth+1);
      const right=sourceStringKey(node.right,depth+1);
      return left!==null && right!==null ? left+right : null;
    }
    return null;
  }
  /** @param {AstNode|null|undefined} node @param {number} [depth] @returns {boolean} */
  function mayCoerceSourceWithinWebRecord(node,depth=0) {
    if(!node || depth>16)return true;
    if(isDefinitelyPrimitive(node))return false;
    if(node.type==='ObjectExpression') {
      return node.properties.some((/** @type {AstNode} */ property)=>
        property.type!=='Property' || property.computed &&
          staticString(property.key)===null ||
        mayCoerceSourceWithinWebRecord(property.value,depth+1));
    }
    if(node.type==='ArrayExpression') {
      return node.elements.some((/** @type {AstNode|null} */ value)=>
        mayCoerceSourceWithinWebRecord(value,depth+1));
    }
    if(node.type==='NewExpression' && node.callee.type==='Identifier' &&
        node.callee.name==='Map') {
      return mayCoerceSourceWithinWebRecord(node.arguments[0],depth+1);
    }
    return true;
  }
  /**
   * A local own Symbol.toPrimitive/toString hook can prevent Function's
   * inherited native toString from participating in Web IDL DOMString
   * conversion. Prove only tiny inline hooks whose statements cannot forward
   * the function object and whose every explicit return is primitive.
   * @param {AstNode|null|undefined} node
   * @param {number} [depth]
   * @returns {boolean}
   */
  function isPrimitiveCoercionResult(node,depth=0) {
    if(!node)return true;
    if(depth>16)return false;
    if(node.type==='ConditionalExpression')
      return isPrimitiveCoercionResult(node.consequent,depth+1)&&
        isPrimitiveCoercionResult(node.alternate,depth+1);
    if(node.type==='LogicalExpression')
      return isPrimitiveCoercionResult(node.left,depth+1)&&
        isPrimitiveCoercionResult(node.right,depth+1);
    return isDefinitelyPrimitive(node);
  }
  /**
   * Whitelist the side-effect shapes used by a local conversion hook. Calls,
   * member reads/writes, and arbitrary control flow remain unproved.
   * @param {AstNode} statement
   * @param {string} functionName
   * @returns {boolean}
   */
  function isSafeCoercionHookStatement(statement,functionName) {
    if(statement.type==='EmptyStatement')return true;
    if(statement.type==='ReturnStatement')
      return isPrimitiveCoercionResult(statement.argument);
    if(statement.type!=='ExpressionStatement')return false;
    const expression=statement.expression;
    if(expression.type==='UpdateExpression')
      return expression.argument.type==='Identifier';
    if(expression.type!=='AssignmentExpression'||expression.operator!=='='||
       expression.left.type!=='Identifier')return false;
    const value=expression.right;
    if(value.type==='Literal')return isDefinitelyPrimitive(value);
    if(value.type==='Identifier')return !functions.has(value.name);
    if(value.type==='BinaryExpression'&&['===','!=='].includes(value.operator)) {
      return value.left.type==='ThisExpression'&&
          value.right.type==='Identifier'&&value.right.name===functionName ||
        value.right.type==='ThisExpression'&&
          value.left.type==='Identifier'&&value.left.name===functionName;
    }
    return false;
  }
  /**
   * Prove a function-valued Storage key/value is converted by a preceding
   * local primitive-returning own hook rather than Function.prototype.toString.
   * The nearest function/Program body is inspected in source order; branches,
   * aliases and hooks with opaque behavior are intentionally not inferred.
   * @param {AstNode|null|undefined} value
   * @param {AstNode} use
   * @param {AstNode[]} ancestors
   * @returns {boolean}
   */
  function hasSafeOwnFunctionStringCoercion(value,use,ancestors) {
    if(value?.type!=='Identifier'||!isFunctionValue(value))return false;
    const functionTypes=['FunctionDeclaration','FunctionExpression',
      'ArrowFunctionExpression'];
    const scope=[...ancestors].reverse().find(node=>functionTypes.includes(node.type))??ast;
    const statements=scope.type==='Program'?scope.body:
      scope.body?.type==='BlockStatement'?scope.body.body:[];
    let symbolHook;
    let stringHook;
    for(const statement of statements) {
      if(statement.start>=use.start)break;
      if(statement.type!=='ExpressionStatement'||
         statement.expression.type!=='AssignmentExpression')continue;
      const assignment=statement.expression;
      const left=assignment.left;
      if(left.type!=='MemberExpression'||left.object.type!=='Identifier'||
         left.object.name!==value.name)continue;
      const isSymbolHook=left.computed&&left.property.type==='MemberExpression'&&
        left.property.object.type==='Identifier'&&left.property.object.name==='Symbol'&&
        memberName(left.property)==='toPrimitive';
      const isStringHook=!left.computed&&left.property.type==='Identifier'&&
        left.property.name==='toString';
      if(!isSymbolHook&&!isStringHook)continue;
      const hook=assignment.right;
      const safe=Boolean((hook.type==='FunctionExpression'||
        hook.type==='ArrowFunctionExpression')&&!hook.async&&!hook.generator&&
        (hook.body.type==='BlockStatement'?
          hook.body.body.every((/** @type {AstNode} */ statement)=>
            isSafeCoercionHookStatement(statement,value.name)):
          isPrimitiveCoercionResult(hook.body)));
      if(isSymbolHook)symbolHook=safe;
      else stringHook=safe;
    }
    if(symbolHook!==undefined)return symbolHook;
    return stringHook===true;
  }
  /** @param {AstNode|null|undefined} value @param {AstNode} use @param {AstNode[]} ancestors @returns {boolean} */
  function isUnsafeStorageStringValue(value,use,ancestors) {
    return Boolean(value&&!isDefinitelyPrimitive(value)&&
      !isDefinitelyBoundFunction(value)&&
      !hasSafeOwnFunctionStringCoercion(value,use,ancestors));
  }
  /**
   * Recognize a local WeakMap created without arguments and never rebound.
   * Its native set operation stores references without DOMString conversion.
   * @param {string} name
   * @returns {boolean}
   */
  function isStableWeakMapInstance(name) {
    let declarations=0;
    let nativeConstruction=false;
    let reassigned=false;
    let methodMutated=false;
    let escaped=false;
    let weakMapIntrinsicEscaped=weakMapPrototypeExposed;
    const allowedMapReferences=new WeakSet();
    walk(ast,node=>{
      if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
         node.callee.object.type==='Identifier'&&node.callee.object.name===name) {
        const method=memberName(node.callee);
        if(method==='set'||method==='get')allowedMapReferences.add(node.callee.object);
      }
    });
    walk(ast,(node,parent)=>{
      if(node.type==='Identifier'&&node.name==='WeakMap'&&
         !(parent?.type==='NewExpression'&&parent.callee===node))
        weakMapIntrinsicEscaped=true;
      if(node.type==='MemberExpression'&&memberName(node)==='WeakMap'&&
         isGlobal(node.object))weakMapIntrinsicEscaped=true;
      if(node.type==='VariableDeclarator'&&node.init?.type==='Identifier'&&
         isGlobal(node.init))weakMapIntrinsicEscaped=true;
      if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
         isReflectiveReceiver(node.callee.object)&&isGlobal(node.arguments[0]))
        weakMapIntrinsicEscaped=true;
      if(node.type==='Identifier'&&isGlobal(node)&&parent?.type==='CallExpression'&&
         parent.arguments.includes(node))weakMapIntrinsicEscaped=true;
      if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&
         node.id.name===name) {
        declarations++;
        nativeConstruction=node.init?.type==='NewExpression'&&
          node.init.callee.type==='Identifier'&&node.init.callee.name==='WeakMap'&&
          node.init.arguments.length===0&&!bindingCounts.has('WeakMap');
      }
      if(node.type==='AssignmentExpression'&&node.left.type==='Identifier'&&
         node.left.name===name)reassigned=true;
      if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&
         memberName(node.left)==='set'&&node.left.object.type==='Identifier'&&
         node.left.object.name===name)methodMutated=true;
      if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
         memberName(node.callee)==='defineProperty'&&
         node.arguments[0]?.type==='Identifier'&&node.arguments[0].name===name&&
         sourceStringKey(node.arguments[1])==='set')methodMutated=true;
      if(node.type==='ExportNamedDeclaration') {
        const declaration=node.declaration;
        if(declaration?.type==='VariableDeclaration') {
          for(const item of declaration.declarations)
            if(item.id.type==='Identifier'&&item.id.name===name)escaped=true;
        }
        for(const specifier of node.specifiers)
          if(specifier.local?.type==='Identifier'&&specifier.local.name===name)escaped=true;
      }
      if(node.type==='ExportDefaultDeclaration'&&
         node.declaration?.type==='Identifier'&&node.declaration.name===name)
        escaped=true;
      if(node.type==='Identifier'&&node.name===name) {
        if(parent?.type==='VariableDeclarator'&&parent.id===node)return;
        if(allowedMapReferences.has(node))return;
        escaped=true;
      }
    });
    return declarations===1&&nativeConstruction&&!reassigned&&!methodMutated&&
      !escaped&&!weakMapIntrinsicEscaped;
  }
  /**
   * A Storage.prototype override that only stores its receiver/value pair in
   * a stable WeakMap does not perform Web IDL DOMString conversion. Keep this
   * proof deliberately narrow; arbitrary override bodies remain conservative.
   * @param {AstNode|null|undefined} value
   * @returns {boolean}
   */
  function isReferenceOnlyStorageOverride(value) {
    if(!value||!['FunctionExpression','ArrowFunctionExpression'].includes(value.type)||
       value.async||value.generator||value.body.type!=='BlockStatement'||
       value.body.body.length!==1)return false;
    const parameter=value.params[1];
    const statement=value.body.body[0];
    if(parameter?.type!=='Identifier'||statement.type!=='ExpressionStatement'||
       statement.expression.type!=='CallExpression')return false;
    const call=statement.expression;
    return call.callee.type==='MemberExpression'&&
      memberName(call.callee)==='set'&&
      call.callee.object.type==='Identifier'&&
      isStableWeakMapInstance(call.callee.object.name)&&
      call.arguments.length===2&&call.arguments[0].type==='ThisExpression'&&
      call.arguments[1].type==='Identifier'&&call.arguments[1].name===parameter.name;
  }
  /**
   * Find the latest direct Storage.prototype method replacement before a
   * direct instance call. Only a replacement proven to store references in a
   * native WeakMap suppresses the native DOMString observer.
   * @param {string|null} method
   * @param {AstNode} use
   * @param {AstNode[]} ancestors
   * @returns {boolean}
   */
  function hasReferenceOnlyStorageOverride(method,use,ancestors) {
    if(!method)return false;
    const functionTypes=['FunctionDeclaration','FunctionExpression',
      'ArrowFunctionExpression'];
    const scope=[...ancestors].reverse().find(node=>functionTypes.includes(node.type))??ast;
    const statements=scope.type==='Program'?scope.body:
      scope.body?.type==='BlockStatement'?scope.body.body:[];
    /** @type {AstNode|null} */
    let current=null;
    for(const statement of statements) {
      if(statement.start>=use.start)break;
      if(statement.type!=='ExpressionStatement')continue;
      const expression=statement.expression;
      if(expression.type==='AssignmentExpression'&&
         expression.left.type==='MemberExpression'&&
         isStoragePrototype(expression.left.object)&&
         memberName(expression.left)===method) {
        current=expression.right;
        continue;
      }
      if(expression.type!=='CallExpression'||
         expression.callee.type!=='MemberExpression'||
         memberName(expression.callee)!=='defineProperty'||
         !isReflectiveReceiver(expression.callee.object)||
         !isStoragePrototype(expression.arguments[0])||
         sourceStringKey(expression.arguments[1])!==method)continue;
      const descriptor=expression.arguments[2];
      if(descriptor?.type!=='ObjectExpression') {
        current=null;
        continue;
      }
      current=null;
      for(const property of descriptor.properties) {
        if(property.type!=='Property')continue;
        const name=property.computed?sourceStringKey(property.key):
          property.key.type==='Identifier'?property.key.name:staticString(property.key);
        if(name==='value')current=property.value;
      }
    }
    return isReferenceOnlyStorageOverride(current);
  }
  let observed=false;
  // ToPropertyKey applies ToPrimitive with a string hint. Functions with
  // ordinary prototype methods stringify to their source text. Restrict the
  // guard to syntactically tracked functions so string/number computed keys
  // keep their existing transformations.
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function hasFunctionKey(node) {
    return isFunctionValue(node);
  }
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function isNativeLocaleMethod(expression) {
    return Boolean(expression && (expression.type==='Identifier' &&
      nativeLocaleAliases.has(expression.name) ||
      expression.type==='MemberExpression' &&
        nativeLocaleNames.has(memberName(expression)??'')));
  }
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function isIntlSourceCallback(expression) {
    return Boolean(expression && (
      expression.type==='Identifier' &&
        (boundCollatorCompares.has(expression.name) ||
          intlStaticStringCalls.has(expression.name)) ||
      expression.type==='MemberExpression' &&
        (memberName(expression)==='compare' &&
           isIntlInstance(expression.object,intlKinds[0]) ||
         isIntlNamespace(expression.object) &&
           ['supportedValuesOf','getCanonicalLocales'].includes(memberName(expression)??''))
    ));
  }
  const stringCoercionMethods=new Set(['includes','startsWith','endsWith',
    'indexOf','lastIndexOf','split','replace','replaceAll','match','matchAll',
    'search','localeCompare','concat','padStart','padEnd']);
  // A captured Reflect.get or Object.getOwnPropertyDescriptor can retrieve
  // Function#toString without any direct reflective call at the use site.
  // Overapproximate named aliases: shadowing or mutation can only cause a
  // conservative refusal, never an unsafe source rewrite.
  const reflectiveReaders=new Set();
  const reflectiveBulkReaders=new Set();
  const reflectiveApplyMethods=new Set();
  const reflectiveConstructMethods=new Set();
  const reflectGetReceivers=new Set(['Reflect']);
  const reflectGetMethods=new Set();
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function isReflectiveReceiver(expression) {
    return Boolean(expression && (expression.type==='Identifier' &&
      reflectiveReceivers.has(expression.name) ||
      expression.type==='MemberExpression' && isGlobal(expression.object) &&
      ['Reflect','Object'].includes(memberName(expression)??'')));
  }
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function isReflectGetReceiver(expression) {
    return Boolean(expression && (
      expression.type==='Identifier' && reflectGetReceivers.has(expression.name) ||
      expression.type==='MemberExpression' && isGlobal(expression.object) &&
        memberName(expression)==='Reflect'
    ));
  }
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function isReflectGetMethod(expression) {
    return Boolean(expression && (
      expression.type==='Identifier' && reflectGetMethods.has(expression.name) ||
      expression.type==='MemberExpression' && isReflectGetReceiver(expression.object) &&
        (expression.computed?sourceStringKey(expression.property):memberName(expression))==='get'
    ));
  }
  let reflectiveChanged;
  do {
    reflectiveChanged=false;
    walk(ast,node=>{
      // The monotone summary also accepts assignment aliases. A mutable
      // binding may later change its value, which over-refuses safely.
      const declaration=node.type==='VariableDeclarator' && node.init;
      const assignment=node.type==='AssignmentExpression' && node.operator==='=';
      if(!declaration && !assignment)return;
      const pattern=declaration?node.id:node.left;
      const value=declaration?node.init:node.right;
      if(pattern.type==='Identifier') {
        const name=pattern.name;
        if(isReflectiveReceiver(value) && !reflectiveReceivers.has(name)) {
          reflectiveReceivers.add(name);
          reflectiveChanged=true;
        }
        if(isReflectGetReceiver(value) && !reflectGetReceivers.has(name)) {
          reflectGetReceivers.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='Identifier' && reflectGetMethods.has(value.name) &&
           !reflectGetMethods.has(name)) {
          reflectGetMethods.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='CallExpression'&&value.callee.type==='MemberExpression'&&
           memberName(value.callee)==='bind'&&
           isReflectGetMethod(value.callee.object)&&value.arguments.length<=1&&
           !reflectGetMethods.has(name)) {
          reflectGetMethods.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='Identifier' && reflectiveApplyMethods.has(value.name) &&
           !reflectiveApplyMethods.has(name)) {
          reflectiveApplyMethods.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='Identifier' && reflectiveConstructMethods.has(value.name) &&
           !reflectiveConstructMethods.has(name)) {
          reflectiveConstructMethods.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='CallExpression' &&
           value.callee.type==='MemberExpression' &&
           memberName(value.callee)==='bind' &&
           isReflectConstructMethod(value.callee.object) &&
           !reflectiveConstructMethods.has(name)) {
          reflectiveConstructMethods.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='Identifier' && reflectiveReaders.has(value.name) &&
           !reflectiveReaders.has(name)) {
          reflectiveReaders.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='Identifier' && reflectiveBulkReaders.has(value.name) &&
           !reflectiveBulkReaders.has(name)) {
          reflectiveBulkReaders.add(name);
          reflectiveChanged=true;
        }
        if(value.type==='MemberExpression' && isReflectiveReceiver(value.object)) {
          const method=memberName(value);
          if((method==='apply'||method===null && value.computed) &&
             !reflectiveApplyMethods.has(name)) {
            reflectiveApplyMethods.add(name);
            reflectiveChanged=true;
          }
          if((method==='construct'||method===null && value.computed) &&
             !reflectiveConstructMethods.has(name)) {
            reflectiveConstructMethods.add(name);
            reflectiveChanged=true;
          }
          if(['get','getOwnPropertyDescriptor'].includes(method??'') &&
             !reflectiveReaders.has(name)) {
            reflectiveReaders.add(name);
            reflectiveChanged=true;
          }
          if(isReflectGetReceiver(value.object) && method==='get' &&
             !reflectGetMethods.has(name)) {
            reflectGetMethods.add(name);
            reflectiveChanged=true;
          }
          if(method==='getOwnPropertyDescriptors'&&!reflectiveBulkReaders.has(name)) {
            reflectiveBulkReaders.add(name);
            reflectiveChanged=true;
          }
        }
      } else if(pattern.type==='ObjectPattern' && isReflectiveReceiver(value)) {
        for(const property of pattern.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const method=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if((method===null || method==='apply') &&
             !reflectiveApplyMethods.has(property.value.name)) {
            reflectiveApplyMethods.add(property.value.name);
            reflectiveChanged=true;
          }
          if((method===null || method==='construct') &&
             !reflectiveConstructMethods.has(property.value.name)) {
            reflectiveConstructMethods.add(property.value.name);
            reflectiveChanged=true;
          }
          if((method===null || ['get','getOwnPropertyDescriptor'].includes(method)) &&
             !reflectiveReaders.has(property.value.name)) {
            reflectiveReaders.add(property.value.name);
            reflectiveChanged=true;
          }
          if(isReflectGetReceiver(value) && method==='get' &&
             !reflectGetMethods.has(property.value.name)) {
            reflectGetMethods.add(property.value.name);
            reflectiveChanged=true;
          }
          if((method===null || method==='getOwnPropertyDescriptors') &&
             !reflectiveBulkReaders.has(property.value.name)) {
            reflectiveBulkReaders.add(property.value.name);
            reflectiveChanged=true;
          }
        }
      }
    });
  }while(reflectiveChanged);
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isReflectConstructMethod(node) {
    return Boolean(node && (node.type==='Identifier' &&
      reflectiveConstructMethods.has(node.name) ||
      node.type==='MemberExpression' &&
      isReflectiveReceiver(node.object) &&
      (memberName(node)==='construct'||node.computed&&memberName(node)===null)));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isReflectApplyMethod(node) {
    return Boolean(node && (node.type==='Identifier' &&
      reflectiveApplyMethods.has(node.name) ||
      node.type==='MemberExpression' &&
      isReflectiveReceiver(node.object) && memberName(node)==='apply'));
  }
  /**
   * Resolve bounded invocation wrappers around Reflect.get.
   * @param {AstNode|null|undefined} node
   * @returns {(AstNode|null)[]|null}
   */
  function reflectGetInvocation(node) {
    if(node?.type!=='CallExpression')return null;
    if(isReflectApplyMethod(node.callee)&&isReflectGetMethod(node.arguments[0])) {
      const list=node.arguments[2];
      return list?.type==='ArrayExpression'?list.elements:[null];
    }
    if(isReflectGetMethod(node.callee))return node.arguments;
    if(node.callee.type!=='MemberExpression')return null;
    const method=memberName(node.callee);
    if(!['call','apply'].includes(method??'')||
       !isReflectGetMethod(node.callee.object))return null;
    if(method==='call')return node.arguments.slice(1);
    const list=node.arguments[1];
    return list?.type==='ArrayExpression'?list.elements:[null];
  }
  /**
   * An indirect native constructor can stringify its first argument, and
   * RegExp can also stringify its optional flags argument. An opaque list
   * may contain functions, so the proof must refuse that invocation.
   * @param {AstNode|null|undefined} target
   * @param {AstNode|null|undefined} passed
   * @returns {boolean}
   */
  function constructObservesSource(target,passed) {
    const boundRegExp=isBoundRegExpConstructor(target);
    const boundString=isBoundStringConstructor(target);
    const nativeStringCoercer=isCoercer(target)||boundRegExp||boundString;
    const webScalar=isWebConstructor(target,webScalars,webScalarNames);
    const webDictionary=isWebConstructor(target,webDictionaries,webDictionaryNames);
    const blobOptions=isBlobConstructor(target);
    const boundBlob=isBoundBlobConstructor(target);
    const webRecord=isWebConstructor(target,webRecords,webRecordNames);
    if(!nativeStringCoercer&&!webScalar&&!webDictionary&&!webRecord&&
       !blobOptions&&!boundBlob)return false;
    if(passed?.type==='ArrayExpression') {
      const values=nativeStringCoercer ?
        (boundRegExp||boundString ? passed.elements :
          isNativeConstructor(target,nativeRegExpConstructors,'RegExp') ?
          passed.elements.slice(0,2):passed.elements.slice(0,1)) :
        boundBlob?passed.elements:
        webDictionary||blobOptions?passed.elements.slice(0,blobOptions?2:1):passed.elements;
      return values.some((/** @type {AstNode|null} */ value)=>
        Boolean(value && (webDictionary||webRecord||blobOptions||boundBlob ?
          mayCoerceSourceWithinWebRecord(value):!isDefinitelyPrimitive(value))));
    }
    return Boolean(passed);
  }
  /**
   * String.raw stringifies each visited raw segment and substitution. The
   * first argument can be a record with nested raw values; all later args
   * are evaluated substitutions. Unknown values are conservatively unsafe.
   * @param {AstNode[]} args
   * @returns {boolean}
   */
  function rawObservesSource(args) {
    return Boolean(args.length && mayCoerceSourceWithinWebRecord(args[0]) ||
      args.slice(1).some(value=>
        value.type==='SpreadElement'||!isDefinitelyPrimitive(value)));
  }
  /**
   * Object.groupBy converts each callback result to a property key, and a
   * function-valued key is observable as exact Function#toString source.
   * Only an inline callback returning a proven primitive can be exempted.
   * Named and opaque callbacks remain unsafe without whole-program proof.
   * @param {AstNode|null|undefined} callback
   * @returns {boolean}
   */
  function isPrimitiveGroupByCallback(callback) {
    if(!callback || !['ArrowFunctionExpression','FunctionExpression'].includes(callback.type))
      return false;
    const body=callback.body;
    if(body.type!=='BlockStatement')return isDefinitelyPrimitive(body);
    if(body.body.length!==1||body.body[0].type!=='ReturnStatement')return false;
    return isDefinitelyPrimitive(body.body[0].argument);
  }
  /** @param {AstNode|null|undefined} callee @returns {boolean} */
  function isObjectGroupBy(callee) {
    return Boolean(callee?.type==='MemberExpression' &&
      isReflectiveReceiver(callee.object)&&memberName(callee)==='groupBy');
  }
  // Node warning calls capture caller positions under --trace-warnings.
  // Native process.emitWarning remains callable after local extraction/binding.
  const warningMethodAliases=new Set();
  const processModuleNamespaces=new Set();
  const processBindingNodes=new Set();
  // Node diagnostic reports embed the live JavaScript call stack. Reading a
  // report object or writing one to disk therefore exposes generated source
  // coordinates even without a syntactic .stack access.
  const processReportNamespaces=new Set();
  const processReportBindingNodes=new Set();
  const processReportMethods=new Set();
  /** @type {Map<string,string>} */
  const processReportMutators=new Map();
  const processParameterScopes=new Set();
  const shadowedProcessIdentifiers=new Set();
  /** @param {AstNode|null|undefined} pattern @returns {boolean} */
  function patternContainsProcess(pattern) {
    if(!pattern)return false;
    if(pattern.type==='Identifier')return pattern.name==='process';
    if(pattern.type==='RestElement'||pattern.type==='AssignmentPattern')
      return patternContainsProcess(pattern.argument??pattern.left);
    if(pattern.type==='ArrayPattern')
      return pattern.elements.some((/** @type {AstNode|null} */ value)=>
        patternContainsProcess(value));
    if(pattern.type==='ObjectPattern')
      return pattern.properties.some((/** @type {AstNode} */ property)=>
        patternContainsProcess(property.type==='RestElement'?
          property.argument:property.value));
    return false;
  }
  walk(ast,node=>{
    if((node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||
        node.type==='ArrowFunctionExpression') &&
       node.params.some((/** @type {AstNode} */ param)=>patternContainsProcess(param)))
      processParameterScopes.add(node);
  });
  walk(ast,(node,parent,key,ancestors)=>{
    if(node.type==='Identifier'&&node.name==='process'&&!bindingNodes.has(node)&&
       ancestors.some(ancestor=>processParameterScopes.has(ancestor)))
      shadowedProcessIdentifiers.add(node);
  });
  const processReportTriggers=new Set([
    'reportOnUncaughtException','reportOnFatalError','reportOnSignal'
  ]);
  /** @param {AstNode|null|undefined} value @returns {boolean} */
  function isLiteralFalse(value) {
    return Boolean(value?.type==='Literal'&&value.value===false);
  }
  /** @param {AstNode} member @returns {string|null} */
  function processReportMemberName(member) {
    return member.computed?sourceStringKey(member.property):memberName(member);
  }
  /** @param {AstNode} property @returns {boolean} */
  function processReportPropertyMayEnable(property) {
    if(property.type!=='Property')return true;
    const name=property.computed?sourceStringKey(property.key):
      property.key.type==='Identifier'?property.key.name:staticString(property.key);
    if(isLiteralFalse(property.value))return false;
    return name===null?property.computed:processReportTriggers.has(name);
  }
  /** @param {AstNode|null|undefined} source @returns {boolean} */
  function processReportAssignmentSourceMayEnable(source) {
    return !source||source.type!=='ObjectExpression' ||
      /** @type {AstNode[]} */ (source.properties).some(processReportPropertyMayEnable);
  }
  walk(ast,node=>{
    if(node.type!=='ImportDeclaration' ||
       !['process','node:process'].includes(String(node.source?.value??'')))return;
    for(const spec of node.specifiers) {
      if(['ImportDefaultSpecifier','ImportNamespaceSpecifier'].includes(spec.type)) {
        processModuleNamespaces.add(spec.local.name);
        processBindingNodes.add(spec.local);
      }
      if(spec.type==='ImportSpecifier' &&
         String(spec.imported.name??spec.imported.value)==='report') {
        processReportNamespaces.add(spec.local.name);
        processReportBindingNodes.add(spec.local);
      }
    }
  });
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isProcessModuleRequire(node) {
    return Boolean(node?.type==='CallExpression' &&
      node.callee.type==='Identifier'&&node.callee.name==='require' &&
      node.arguments.length===1 &&
      ['process','node:process'].includes(staticString(node.arguments[0])??''));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isProcessReceiver(node) {
    const reflected=reflectGetInvocation(node);
    return Boolean(node && (
      node.type==='Identifier'&&
        (node.name==='process'&&!shadowedProcessIdentifiers.has(node) ||
         processModuleNamespaces.has(node.name)) ||
      node.type==='MemberExpression'&&isGlobal(node.object)&&
        (node.computed?sourceStringKey(node.property):memberName(node))==='process' ||
      reflected&&isGlobal(reflected[0])&&sourceStringKey(reflected[1])==='process' ||
      isProcessModuleRequire(node)
    ));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isProcessReportNamespace(node) {
    const reflected=reflectGetInvocation(node);
    return Boolean(node && (node.type==='Identifier'&&
      processReportNamespaces.has(node.name) ||
      node.type==='MemberExpression'&&isProcessReceiver(node.object)&&
        (processReportMemberName(node)==='report' ||
         node.computed&&processReportMemberName(node)===null) ||
      reflected&&isProcessReceiver(reflected[0])&&
        (sourceStringKey(reflected[1])==='report' ||
         sourceStringKey(reflected[1])===null)));
  }
  /** @param {AstNode} node @returns {AstNode} */
  function unwrapAssignmentPattern(node) {
    return node.type==='AssignmentPattern'?node.left:node;
  }
  /** @param {AstNode|null|undefined} node @param {number} [depth] @returns {boolean} */
  function isProcessReportMethod(node,depth=0) {
    if(!node||depth>16)return false;
    if(node.type==='Identifier')return processReportMethods.has(node.name);
    if(node.type==='MemberExpression') {
      const name=processReportMemberName(node);
      if(isProcessReportNamespace(node.object)&&
         (['getReport','writeReport'].includes(name??'') ||
          node.computed&&name===null))return true;
      if(['call','apply'].includes(name??''))
        return isProcessReportMethod(node.object,depth+1);
    }
    if(node.type==='CallExpression') {
      if(node.callee.type==='MemberExpression'&&memberName(node.callee)==='bind')
        return isProcessReportMethod(node.callee.object,depth+1);
      const reflected=reflectGetInvocation(node);
      if(reflected&&isProcessReportNamespace(reflected[0])&&
         (['getReport','writeReport'].includes(sourceStringKey(reflected[1])??'') ||
          sourceStringKey(reflected[1])===null))
        return true;
    }
    return false;
  }
  /** @param {AstNode|null|undefined} node @param {number} [depth] @returns {string|null} */
  function processReportMutator(node,depth=0) {
    if(!node||depth>16)return null;
    if(node.type==='Identifier')return processReportMutators.get(node.name)??null;
    if(node.type==='MemberExpression') {
      const name=memberName(node);
      if(['set','assign'].includes(name??'')&&isReflectiveReceiver(node.object))
        return name;
      if(['call','apply'].includes(name??''))
        return processReportMutator(node.object,depth+1);
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       memberName(node.callee)==='bind')
      return processReportMutator(node.callee.object,depth+1);
    return null;
  }
  /**
   * @param {AstNode} node
   * @returns {{method:string,args:(AstNode|null)[]}|null}
   */
  function processReportMutatorInvocation(node) {
    if(node.type!=='CallExpression')return null;
    if(isReflectApplyMethod(node.callee)) {
      const method=processReportMutator(node.arguments[0]);
      if(!method)return null;
      const list=node.arguments[2];
      return {method,args:list?.type==='ArrayExpression'?list.elements:[null]};
    }
    const method=processReportMutator(node.callee);
    if(!method)return null;
    if(node.callee.type==='MemberExpression'&&memberName(node.callee)==='call')
      return {method,args:node.arguments.slice(1)};
    if(node.callee.type==='MemberExpression'&&memberName(node.callee)==='apply') {
      const list=node.arguments[1];
      return {method,args:list?.type==='ArrayExpression'?list.elements:[null]};
    }
    return {method,args:node.arguments};
  }
  let changedProcessReportAliases;
  do {
    changedProcessReportAliases=false;
    walk(ast,node=>{
      const id=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(!id||!value)return;
      if(id.type==='Identifier'&&isProcessReceiver(value)) {
        processBindingNodes.add(id);
        if(!processModuleNamespaces.has(id.name)) {
          processModuleNamespaces.add(id.name);
          changedProcessReportAliases=true;
        }
      }
      if(id.type==='ObjectPattern'&&isGlobal(value)) {
        for(const property of id.properties) {
          if(property.type!=='Property')continue;
          const name=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name!=='process')continue;
          const processBinding=unwrapAssignmentPattern(property.value);
          if(processBinding.type==='Identifier') {
            processBindingNodes.add(processBinding);
            if(!processModuleNamespaces.has(processBinding.name)) {
              processModuleNamespaces.add(processBinding.name);
              changedProcessReportAliases=true;
            }
          }
        }
      }
      if(id.type==='ObjectPattern'&&isProcessReceiver(value)) {
        for(const property of id.properties) {
          if(property.type!=='Property')continue;
          const name=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name!=='report')continue;
          const reportBinding=unwrapAssignmentPattern(property.value);
          if(reportBinding.type==='Identifier') {
            processReportBindingNodes.add(reportBinding);
            if(!processReportNamespaces.has(reportBinding.name)) {
              processReportNamespaces.add(reportBinding.name);
              changedProcessReportAliases=true;
            }
          }
          if(reportBinding.type==='ObjectPattern') {
            for(const methodProperty of reportBinding.properties) {
              if(methodProperty.type!=='Property')continue;
              const methodBinding=unwrapAssignmentPattern(methodProperty.value);
              if(methodBinding.type!=='Identifier')continue;
              const method=methodProperty.computed?sourceStringKey(methodProperty.key):
                methodProperty.key.type==='Identifier'?methodProperty.key.name:
                  staticString(methodProperty.key);
              if(['getReport','writeReport'].includes(method??'') &&
                 !processReportMethods.has(methodBinding.name)) {
                processReportMethods.add(methodBinding.name);
                changedProcessReportAliases=true;
              }
            }
          }
        }
        return;
      }
      if(id.type==='ObjectPattern'&&isProcessReportNamespace(value)) {
        for(const property of id.properties) {
          if(property.type!=='Property')continue;
          const methodBinding=unwrapAssignmentPattern(property.value);
          if(methodBinding.type!=='Identifier')continue;
          const name=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(['getReport','writeReport'].includes(name??'')&&
             !processReportMethods.has(methodBinding.name)) {
            processReportMethods.add(methodBinding.name);
            changedProcessReportAliases=true;
          }
        }
        return;
      }
      if(id.type==='ObjectPattern'&&isReflectiveReceiver(value)) {
        for(const property of id.properties) {
          if(property.type!=='Property')continue;
          const binding=unwrapAssignmentPattern(property.value);
          if(binding.type!=='Identifier')continue;
          const name=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(['set','assign'].includes(name??'')&&
             processReportMutators.get(binding.name)!==name) {
            processReportMutators.set(binding.name,name);
            changedProcessReportAliases=true;
          }
        }
        return;
      }
      if(id.type!=='Identifier')return;
      if(isProcessReportNamespace(value)) {
        processReportBindingNodes.add(id);
        if(!processReportNamespaces.has(id.name)) {
          processReportNamespaces.add(id.name);
          changedProcessReportAliases=true;
        }
      }
      if(isProcessReportMethod(value)&&!processReportMethods.has(id.name)) {
        processReportMethods.add(id.name);
        changedProcessReportAliases=true;
      }
      const mutator=processReportMutator(value);
      if(mutator&&processReportMutators.get(id.name)!==mutator) {
        processReportMutators.set(id.name,mutator);
        changedProcessReportAliases=true;
      }
    });
  }while(changedProcessReportAliases);
  /** @param {AstNode|null|undefined} node @param {number} [depth] @returns {boolean} */
  function isWarningMethod(node,depth=0) {
    if(!node||depth>16)return false;
    if(node.type==='Identifier')return warningMethodAliases.has(node.name);
    if(node.type==='MemberExpression') {
      if(memberName(node)==='emitWarning'&&isProcessReceiver(node.object))
        return true;
      if(['call','apply'].includes(memberName(node)??''))
        return isWarningMethod(node.object,depth+1);
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       memberName(node.callee)==='bind')
      return isWarningMethod(node.callee.object,depth+1);
    return false;
  }
  let changedWarningAliases;
  do {
    changedWarningAliases=false;
    walk(ast,node=>{
      const id=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(id?.type==='Identifier'&&isWarningMethod(value)&&
         !warningMethodAliases.has(id.name)) {
        warningMethodAliases.add(id.name);
        changedWarningAliases=true;
      }
    });
  }while(changedWarningAliases);
  // The Node util formatter can expose Error capture locations and function
  // names through inspect/format without an explicit .stack/.name read.
  const nodeUtilNamespaces=new Set();
  /** @type {Map<string,string>} */
  const nodeUtilMethods=new Map();
  const inspectedUtilMethods=new Set(['inspect','format','formatWithOptions',
    'getCallSites','getCallSite']);
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isNodeUtilRequire(node) {
    return Boolean(node?.type==='CallExpression' &&
      node.callee.type==='Identifier'&&node.callee.name==='require' &&
      node.arguments.length===1 &&
      ['node:util','util'].includes(staticString(node.arguments[0])??''));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isNodeUtilNamespace(node) {
    return Boolean(node && (node.type==='Identifier'&&nodeUtilNamespaces.has(node.name)||
      isNodeUtilRequire(node)));
  }
  /**
   * Resolve direct, detached and bound Node util inspection methods.
   * @param {AstNode|null|undefined} node
   * @param {number} [depth]
   * @returns {string|null}
   */
  function nodeUtilMethod(node,depth=0) {
    if(!node||depth>16)return null;
    if(node.type==='Identifier')return nodeUtilMethods.get(node.name)??null;
    if(node.type==='MemberExpression'&&isNodeUtilNamespace(node.object)) {
      const name=node.computed?sourceStringKey(node.property):memberName(node);
      return name!==null&&inspectedUtilMethods.has(name)?name:null;
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       memberName(node.callee)==='bind')
      return nodeUtilMethod(node.callee.object,depth+1);
    return null;
  }
  walk(ast,node=>{
    if(node.type!=='ImportDeclaration' ||
       !['node:util','util'].includes(String(node.source?.value??'')))return;
    for(const spec of node.specifiers) {
      if(['ImportDefaultSpecifier','ImportNamespaceSpecifier'].includes(spec.type))
        nodeUtilNamespaces.add(spec.local.name);
      if(spec.type==='ImportSpecifier') {
        const name=spec.imported.name??spec.imported.value;
        if(inspectedUtilMethods.has(String(name)))
          nodeUtilMethods.set(spec.local.name,String(name));
      }
    }
  });
  let changedNodeUtil;
  do {
    changedNodeUtil=false;
    walk(ast,node=>{
      const id=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(!id||!value)return;
      if(id.type==='ObjectPattern'&&isNodeUtilNamespace(value)) {
        for(const property of id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name!==null&&inspectedUtilMethods.has(name)&&
             !nodeUtilMethods.has(property.value.name)) {
            nodeUtilMethods.set(property.value.name,name);
            changedNodeUtil=true;
          }
        }
        return;
      }
      if(id.type!=='Identifier')return;
      if(isNodeUtilNamespace(value)&&!nodeUtilNamespaces.has(id.name)) {
        nodeUtilNamespaces.add(id.name);
        changedNodeUtil=true;
      }
      const method=nodeUtilMethod(value);
      if(method!==null&&!nodeUtilMethods.has(id.name)) {
        nodeUtilMethods.set(id.name,method);
        changedNodeUtil=true;
      }
    });
  }while(changedNodeUtil);
  // Node console methods format Error objects with captured frame coordinates,
  // even when the program never reads .stack. console.trace() also captures
  // the caller's location without an explicit Error construction.
  const stackErrorConstructors=new Set(['Error','EvalError','RangeError',
    'ReferenceError','SyntaxError','TypeError','URIError','AggregateError']);
  const stackErrorAliases=new Set();
  const stackConsoleAliases=new Set(['console']);
  const stackConsoleMethodNames=new Set(['trace','log','info','warn','error','debug','dir',
    // Node's additional console formatters inspect functions or stringify
    // their labels, exposing native names and sometimes full source text.
    'table','assert','dirxml','group','groupCollapsed','count','countReset',
    'time','timeLog','timeEnd','timeStamp','profile','profileEnd']);
  /** @type {Map<string,string>} */
  const stackConsoleMethods=new Map();
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isConsoleReceiver(node) {
    return Boolean(node && (node.type==='Identifier' &&
      stackConsoleAliases.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='console'));
  }
  /**
   * Node Console methods remain bound when extracted from the global console.
   * Follow direct members, simple aliases, and the ordinary .bind wrapper.
   * @param {AstNode|null|undefined} node
   * @param {number} [depth]
   * @returns {string|null}
   */
  function stackConsoleMethod(node,depth=0) {
    if(!node||depth>16)return null;
    if(node.type==='Identifier')return stackConsoleMethods.get(node.name)??null;
    if(node.type==='MemberExpression' && isConsoleReceiver(node.object)) {
      const method=node.computed?sourceStringKey(node.property):memberName(node);
      return method!==null && stackConsoleMethodNames.has(method)?method:null;
    }
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression' &&
       memberName(node.callee)==='bind')
      return stackConsoleMethod(node.callee.object,depth+1);
    return null;
  }
  /**
   * Recognize stack-bearing values through simple assignments and literal
   * containers. A conservative may-flow result is enough to block an unsafe
   * source-coordinate rewrite when an Error reaches a native logger.
   * @param {AstNode|null|undefined} node
   * @param {number} [depth]
   * @returns {boolean}
   */
  function containsStackError(node,depth=0) {
    if(!node||depth>32)return false;
    if(node.type==='Identifier')return stackErrorAliases.has(node.name);
    if((node.type==='NewExpression'||node.type==='CallExpression') &&
       node.callee.type==='Identifier' &&
       stackErrorConstructors.has(node.callee.name))return true;
    if(node.type==='ArrayExpression')return node.elements.some(
      (/** @type {AstNode|null} */ value)=>containsStackError(
        value?.type==='SpreadElement'?value.argument:value,depth+1));
    if(node.type==='ObjectExpression')return node.properties.some(
      (/** @type {AstNode} */ property)=>
        containsStackError(property.type==='Property'?property.value:
          property.type==='SpreadElement'?property.argument:null,depth+1));
    if(node.type==='ConditionalExpression')return containsStackError(node.consequent,depth+1)||
      containsStackError(node.alternate,depth+1);
    if(node.type==='LogicalExpression')return containsStackError(node.left,depth+1)||
      containsStackError(node.right,depth+1);
    return false;
  }
  // Node's util.inspect also prints function names, which identifier
  // mangling can change without any explicit Function#name or toString read.
  /** @param {AstNode|null|undefined} node @param {number} [depth] @returns {boolean} */
  function containsConsoleFunction(node,depth=0) {
    if(!node||depth>32)return false;
    if(isFunctionValue(node)||containsFunction(node))return true;
    if(node.type==='ArrayExpression')return node.elements.some(
      (/** @type {AstNode|null} */ value)=>containsConsoleFunction(
        value?.type==='SpreadElement'?value.argument:value,depth+1));
    if(node.type==='ObjectExpression')return node.properties.some(
      (/** @type {AstNode} */ property)=>containsConsoleFunction(
        property.type==='Property'?property.value:
          property.type==='SpreadElement'?property.argument:null,depth+1));
    return false;
  }
  // Monotone alias discovery handles a logger or Error declared after its
  // consumer and transitive const/assignment aliases without scope guessing.
  let changedStackAliases;
  do {
    changedStackAliases=false;
    walk(ast,node=>{
      const id=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(!value)return;
      if(id?.type==='ObjectPattern' && isConsoleReceiver(value)) {
        for(const property of id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const method=property.computed?sourceStringKey(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(method!==null&&stackConsoleMethodNames.has(method)&&
             !stackConsoleMethods.has(property.value.name)) {
            stackConsoleMethods.set(property.value.name,method);
            changedStackAliases=true;
          }
        }
        return;
      }
      if(id?.type!=='Identifier')return;
      if(isConsoleReceiver(value)&&!stackConsoleAliases.has(id.name)) {
        stackConsoleAliases.add(id.name);
        changedStackAliases=true;
      }
      const method=stackConsoleMethod(value);
      if(method!==null&&!stackConsoleMethods.has(id.name)) {
        stackConsoleMethods.set(id.name,method);
        changedStackAliases=true;
      }
      if(containsStackError(value)&&!stackErrorAliases.has(id.name)) {
        stackErrorAliases.add(id.name);
        changedStackAliases=true;
      }
    });
  }while(changedStackAliases);
  const globalErrorHandlerNames=new Set([
    'onerror','onunhandledrejection','onrejectionhandled'
  ]);
  const globalErrorEventNames=new Set([
    'error','unhandledrejection','rejectionhandled'
  ]);
  const workerInstances=new Set();
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isWorkerConstructor(node) {
    return Boolean(node && (
      node.type==='Identifier' && ['Worker','SharedWorker'].includes(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        ['Worker','SharedWorker'].includes(memberName(node)??'')
    ));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isWorkerInstance(node) {
    return Boolean(node && (
      node.type==='Identifier' && workerInstances.has(node.name) ||
      node.type==='NewExpression' && isWorkerConstructor(node.callee)
    ));
  }
  let changedWorkerInstances;
  do {
    changedWorkerInstances=false;
    walk(ast,node=>{
      const id=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression' && node.operator==='='?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression' && node.operator==='='?node.right:null;
      if(id?.type==='Identifier' && isWorkerInstance(value) &&
         !workerInstances.has(id.name)) {
        workerInstances.add(id.name);
        changedWorkerInstances=true;
      }
    });
  }while(changedWorkerInstances);
  /**
   * Return true when a runtime failure can escape the nearest local catch.
   * A catch surrounding a function declaration does not catch a later call
   * into that function, so function boundaries end this bounded proof.
   * @param {AstNode[]} ancestors
   * @returns {boolean}
   */
  function failureMayReachHost(ancestors) {
    for(let i=ancestors.length-1;i>=0;i--) {
      const ancestor=ancestors[i];
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(ancestor.type))
        return true;
      if(ancestor.type==='TryStatement' && ancestor.handler &&
         ancestor.block===ancestors[i+1])return false;
    }
    return true;
  }
  walk(ast,(node,parent,key,ancestors)=>{
    // An uncaught throw is itself a source-coordinate observer in Node: the
    // process diagnostic prints the throwing source line, caret and stack
    // column. Browser hosts can likewise surface uncaught error locations.
    // Preserve exact source whenever a throw lacks a syntactically enclosing
    // catch before the current function boundary.
    if(node.type==='ThrowStatement'&&failureMayReachHost(ancestors))observed=true;
    // A statically nullish ordinary member access is a guaranteed TypeError.
    // If it escapes, the host diagnostic exposes the generated line/caret and
    // stack column even though source never reads Error.stack.
    const staticallyNullishObject=node.type==='MemberExpression'&&(
      node.object.type==='Literal'&&node.object.value===null ||
      node.object.type==='UnaryExpression'&&node.object.operator==='void');
    if(staticallyNullishObject&&node.optional!==true&&
       failureMayReachHost(ancestors))observed=true;
    // Keep precise local aliases and direct member access analyzable, while
    // refusing opaque process/report capability escapes that can reach getReport later.
    const directMember=parent?.type==='MemberExpression'&&key==='object';
    const staticKey=node.type==='Identifier'&&parent&&
      (parent.type==='MemberExpression'&&key==='property'&&!parent.computed ||
       parent.type==='Property'&&key==='key'&&!parent.computed);
    const localAlias=parent?.type==='VariableDeclarator'&&key==='init'&&
      ['Identifier','ObjectPattern'].includes(parent.id.type);
    const assignedAlias=parent?.type==='AssignmentExpression'&&key==='right'&&
      ['Identifier','ObjectPattern'].includes(parent.left.type);
    const reflectedProcessRead=parent?.type==='CallExpression'?
      reflectGetInvocation(parent):null;
    const benignProcessEnvironmentRead=reflectedProcessRead?.[0]===node&&
      sourceStringKey(reflectedProcessRead[1])==='env';
    const reportMutation=parent?.type==='CallExpression'?
      processReportMutatorInvocation(parent):null;
    const benignProcessReportMutationTarget=reportMutation?.args[0]===node&&(
      reportMutation.method==='set'&&isLiteralFalse(reportMutation.args[2]) ||
      reportMutation.method==='assign'&&
        reportMutation.args.slice(1).every(source=>
          !processReportAssignmentSourceMayEnable(source))
    );
    if(isProcessReceiver(node)&&parent&&!processBindingNodes.has(node)&&
       !bindingNodes.has(node)&&!benignProcessEnvironmentRead&&
       !directMember&&!staticKey&&!localAlias&&!assignedAlias)observed=true;
    if(isProcessReportNamespace(node)&&parent&&
       !processReportBindingNodes.has(node)&&!benignProcessReportMutationTarget&&
       !directMember&&!staticKey&&!localAlias&&!assignedAlias)observed=true;
    // Window/Worker runtime error delivery exposes source coordinates without
    // requiring a .stack read in the compiled program. The historical onerror
    // callback receives line/column arguments directly; ErrorEvent listeners
    // can read lineno/colno. A later source prefix such as the host-lock guard
    // therefore has to fail closed around these registrations/reads too.
    if(node.type==='AssignmentExpression' && node.operator==='=' &&
       (node.left.type==='MemberExpression' &&
          (isGlobal(node.left.object) &&
             globalErrorHandlerNames.has(memberName(node.left)??'') ||
           isWorkerInstance(node.left.object) && memberName(node.left)==='onerror') ||
        node.left.type==='Identifier' && globalErrorHandlerNames.has(node.left.name) &&
          !bindingCounts.has(node.left.name))) observed=true;
    if(node.type==='CallExpression' && node.arguments[0] &&
       (node.callee.type==='MemberExpression' &&
          memberName(node.callee)==='addEventListener' &&
          (isGlobal(node.callee.object) &&
             globalErrorEventNames.has(staticString(node.arguments[0])??'') ||
           isWorkerInstance(node.callee.object) &&
             staticString(node.arguments[0])==='error') ||
        node.callee.type==='Identifier' && node.callee.name==='addEventListener' &&
          !bindingCounts.has('addEventListener') &&
          globalErrorEventNames.has(staticString(node.arguments[0])??''))) observed=true;
    if(node.type==='MemberExpression'&&isProcessReceiver(node.object)&&
       processReportMemberName(node)===null)observed=true;
    if(node.type==='MemberExpression'&&
       isProcessReportNamespace(node.object)&&processReportMemberName(node)===null)
      observed=true;
    // Acquiring a live reporting method can move it through arbitrary user
    // containers before invocation. Preserve source at capability acquisition.
    if(isProcessReportMethod(node))observed=true;
    // Object rest/spread can copy Node's enumerable getReport/writeReport
    // methods into an ordinary object, preserving their reporting capability.
    const reportCopyPattern=node.type==='VariableDeclarator'?
      {pattern:node.id,value:node.init}:
      node.type==='AssignmentExpression'?
        {pattern:node.left,value:node.right}:null;
    if(reportCopyPattern?.pattern.type==='ObjectPattern'&&
       isProcessReportNamespace(reportCopyPattern.value)&&
       reportCopyPattern.pattern.properties.some(
         (/** @type {AstNode} */ property)=>property.type==='RestElement'))
      observed=true;
    if(node.type==='ObjectExpression'&&
       node.properties.some((/** @type {AstNode} */ property)=>
         property.type==='SpreadElement'&&
         isProcessReportNamespace(property.argument)))observed=true;
    // Legacy accessor reflection can recover Node's native automatic-report
    // setter. Merely exposing that capability is enough to make later source
    // coordinates observable through a generated report.
    if(node.type==='MemberExpression'&&
       isProcessReportNamespace(node.object)&&
       memberName(node)==='__lookupSetter__')observed=true;
    // Programmatic diagnostic-report triggers can emit a later JavaScript
    // stack without any explicit getReport()/writeReport() call. Conservatively
    // preserve the source whenever code writes one of the enabling switches.
    if(node.type==='AssignmentExpression'&&
       node.left.type==='MemberExpression'&&
       isProcessReportNamespace(node.left.object)&&!isLiteralFalse(node.right)&&
       (processReportTriggers.has(processReportMemberName(node.left)??'') ||
        node.left.computed&&processReportMemberName(node.left)===null))observed=true;
    if(node.type==='CallExpression') {
      const mutation=processReportMutatorInvocation(node);
      if(mutation?.method==='set'&&mutation.args[1]&&!isLiteralFalse(mutation.args[2])&&
         isProcessReportNamespace(mutation.args[0])&&
         (processReportTriggers.has(sourceStringKey(mutation.args[1])??'') ||
          sourceStringKey(mutation.args[1])===null))observed=true;
      if(mutation?.method==='assign'&&
         mutation.args.slice(1).some(
           (/** @type {AstNode|null} */ source)=>isProcessReportNamespace(source)))
        observed=true;
      if(mutation?.method==='assign'&&
         isProcessReportNamespace(mutation.args[0])&&
         mutation.args.slice(1).some(processReportAssignmentSourceMayEnable))
        observed=true;
    }
    // URL setters accept USVString values through the platform's native
    // conversion. Rewriting a function's body changes the percent-encoded
    // pathname/search/hash/credentials observable after assignment.
    if(node.type==='AssignmentExpression'&&
       node.left.type==='MemberExpression'&&
       isWebInstance(node.left.object,webScalarInstances,webScalars,webScalarNames)&&
       (['href','protocol','username','password','host','hostname',
         'port','pathname','search','hash'].includes(memberName(node.left)??'')||
        node.left.computed&&memberName(node.left)===null) &&
       !isDefinitelyPrimitive(node.right))observed=true;
    if(node.type==='TaggedTemplateExpression'&&isStringRaw(node.tag) &&
       node.quasi.expressions.some((/** @type {AstNode} */ value)=>
         !isDefinitelyPrimitive(value)))observed=true;
    if(node.type==='CallExpression') {
      const callee=node.callee;
      // process.report.getReport() returns the current JavaScript stack and
      // writeReport() persists it. Either operation observes source locations.
      if(isProcessReportMethod(callee))observed=true;
      if(callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object)&&memberName(callee)==='apply' &&
         isProcessReportMethod(node.arguments[0]))observed=true;
      const reportDescriptorRead=node.arguments.length>1&&
        isProcessReportNamespace(node.arguments[0])&&
        (processReportTriggers.has(sourceStringKey(node.arguments[1])??'') ||
         sourceStringKey(node.arguments[1])===null)&&
        (callee.type==='MemberExpression'&&
          isReflectiveReceiver(callee.object)&&
          memberName(callee)==='getOwnPropertyDescriptor' ||
         callee.type==='Identifier'&&reflectiveReaders.has(callee.name));
      if(reportDescriptorRead)observed=true;
      if(callee.type==='MemberExpression'&&
         ['call','apply'].includes(memberName(callee)??'')&&
         callee.object.type==='MemberExpression'&&
         memberName(callee.object)==='__lookupSetter__'&&
         isProcessReportNamespace(node.arguments[0])) {
        const trigger=memberName(callee)==='call'?
          sourceStringKey(node.arguments[1]):
          node.arguments[1]?.type==='ArrayExpression'?
            sourceStringKey(node.arguments[1].elements[0]):null;
        if(trigger===null||processReportTriggers.has(trigger))observed=true;
      }
      if(isReflectApplyMethod(callee)&&
         node.arguments[0]?.type==='MemberExpression'&&
         memberName(node.arguments[0])==='__lookupSetter__'&&
         isProcessReportNamespace(node.arguments[1])) {
        const list=node.arguments[2];
        if(list?.type==='ArrayExpression'&&
           (sourceStringKey(list.elements[0])===null ||
            processReportTriggers.has(sourceStringKey(list.elements[0])??'')))observed=true;
      }
      // With Node --trace-warnings, a literal-string warning reveals its
      // callsite even through extracted, bound, or .call/.apply aliases.
      if(isWarningMethod(callee))observed=true;
      const utilMethod=nodeUtilMethod(callee);
      // Node util.getCallSites returns the live caller's source columns.
      if(utilMethod==='getCallSites'||utilMethod==='getCallSite')observed=true;
      if(utilMethod==='inspect' && node.arguments[0] &&
         !isDefinitelyPrimitive(node.arguments[0]) ||
         utilMethod==='format' && node.arguments.some(
           (/** @type {AstNode} */ value)=>!isDefinitelyPrimitive(value)) ||
         utilMethod==='formatWithOptions' && node.arguments.slice(1).some(
           (/** @type {AstNode} */ value)=>!isDefinitelyPrimitive(value)))
        observed=true;
      const consoleMethod=stackConsoleMethod(callee);
      if(consoleMethod==='trace' ||
         consoleMethod!==null && consoleMethod!=='trace' &&
           node.arguments.some((/** @type {AstNode} */ argument)=>
             containsStackError(argument)||containsConsoleFunction(argument)))
        observed=true;
      if(isObjectGroupBy(callee) &&
         !isPrimitiveGroupByCallback(node.arguments[1]))observed=true;
      if(callee.type==='MemberExpression' && isObjectGroupBy(callee.object)) {
        const method=memberName(callee);
        if(method==='call' && !isPrimitiveGroupByCallback(node.arguments[2]))
          observed=true;
        if(method==='apply') {
          const input=node.arguments[1];
          if(input?.type==='ArrayExpression') {
            if(!isPrimitiveGroupByCallback(input.elements[1]))observed=true;
          } else observed=true;
        }
        if(method==='bind')observed=true;
      }
      if(callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object)&&memberName(callee)==='apply' &&
         isObjectGroupBy(node.arguments[0])) {
        const input=node.arguments[2];
        if(input?.type==='ArrayExpression') {
          if(!isPrimitiveGroupByCallback(input.elements[1]))observed=true;
        } else observed=true;
      }
      if(isStringRaw(callee) && rawObservesSource(node.arguments))observed=true;
      if(callee.type==='MemberExpression' && isStringRaw(callee.object)) {
        const method=memberName(callee);
        if(method==='call' && rawObservesSource(node.arguments.slice(1)))observed=true;
        if(method==='apply') {
          const actual=node.arguments[1];
          if(actual?.type==='ArrayExpression') {
            if(rawObservesSource(actual.elements.filter(Boolean)))observed=true;
          } else if(actual)observed=true;
        }
        if(method==='bind')observed=true;
      }
      if(callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object)&&memberName(callee)==='apply' &&
         isStringRaw(node.arguments[0])) {
        const actual=node.arguments[2];
        if(actual?.type==='ArrayExpression') {
          if(rawObservesSource(actual.elements.filter(Boolean)))observed=true;
        } else if(actual)observed=true;
      }
    }
    // A recognized source-coercing Intl callback may be executed by an
    // opaque consumer, including Array#sort's implicit compare invocation.
    // Refuse all unknown callback escapes even without a direct call here.
    if(node.type==='Property' && isIntlSourceCallback(node.value) ||
       node.type==='ArrayExpression' &&
         node.elements.some((/** @type {AstNode|null} */ value)=>isIntlSourceCallback(value)) ||
       node.type==='ReturnStatement' && isIntlSourceCallback(node.argument) ||
       node.type==='AssignmentExpression' && isIntlSourceCallback(node.right)) {
      observed=true;
    }
    // Destructuring may acquire native source methods at any nesting level,
    // including via an array of functions or an object holding a callable.
    // Unknown receivers must be treated as potentially function-bearing.
    if(node.type==='VariableDeclarator' &&
         ['ObjectPattern','ArrayPattern'].includes(node.id.type) &&
         (isFunctionValue(node.init)||mayBeMemberMethod(node.init)) ||
       node.type==='AssignmentExpression' &&
         ['ObjectPattern','ArrayPattern'].includes(node.left.type) &&
         (isFunctionValue(node.right)||mayBeMemberMethod(node.right))) {
      const pattern=node.type==='VariableDeclarator'?node.id:node.left;
      if(patternReadsSourceMethod(pattern))observed=true;
    }
    if(node.computed && (node.type==='MemberExpression'||node.type==='Property'||
        node.type==='MethodDefinition'||node.type==='PropertyDefinition') &&
        hasFunctionKey(node.type==='MemberExpression'?node.property:node.key)) {
      observed=true;
    }
    if(node.type==='BinaryExpression' && node.operator==='in' &&
       hasFunctionKey(node.left))observed=true;
    // Decline only interpolations whose primitive value cannot be proved.
    // An unknown or function-valued substitution may expose source text.
    if(node.type==='TemplateLiteral' && node.expressions.some(
      (/** @type {AstNode} */ value)=>!isDefinitelyPrimitive(value)))observed=true;
    // Abstract Equality and relational comparisons call ToPrimitive on a
    // function operand when compared against a primitive. The resulting
    // native source text can be compared without an explicit String() call.
    // Strict equality (===, !==) does not invoke ToPrimitive.
    if(node.type==='BinaryExpression' &&
        ['==','!=','<','<=','>','>='].includes(node.operator) &&
        (isFunctionValue(node.left)||isFunctionValue(node.right)||
         containsFunction(node.left)||containsFunction(node.right))) observed=true;
    if(node.type==='BinaryExpression' && node.operator==='+') {
      const leftText=node.left.type==='Literal' && typeof node.left.value==='string' ||
        node.left.type==='TemplateLiteral' && !node.left.expressions.length;
      const rightText=node.right.type==='Literal' && typeof node.right.value==='string' ||
        node.right.type==='TemplateLiteral' && !node.right.expressions.length;
      // A function is converted to its exact source when '+' performs
      // ToPrimitive, even with no explicit string operand. An array containing
      // a function has the same behavior through Array#toString and join.
      if((leftText || rightText || isStringValue(node.left) ||
          isStringValue(node.right) || isFunctionValue(node.left) ||
          isFunctionValue(node.right) || containsFunction(node.left) ||
          containsFunction(node.right)) && !isDefinitelyPrimitive(node)) observed=true;
    }
    // Stack observation can also be expressed without a .stack member access.
    // A destructuring pattern reads the error's captured source location.
    if(node.type==='Property' && parent?.type==='ObjectPattern') {
      const property=node.computed ? staticString(node.key) :
        node.key.type==='Identifier' ? node.key.name : staticString(node.key);
      if(['stack','lineno','colno'].includes(property??'')) observed=true;
    }
    if(node.type==='MemberExpression') {
      const name=node.computed ? sourceStringKey(node.property) :
        (node.property.type==='Identifier' ? node.property.name : null);
      // Error stack strings expose generated source line/column coordinates.
      // Even harmless identifier-length edits change those coordinates, so
      // refuse rewrites for syntactic stack observers. This deliberately also
      // declines ambiguous user-defined .stack properties rather than guessing
      // whether their values represent a runtime Error.
      if (['stack','captureStackTrace','prepareStackTrace','stackTraceLimit',
           'lineno','colno'].includes(name??'')) observed=true;
      // The special sloppy arguments.callee alias reaches the currently
      // executing function even without any same-spelled lexical identifier.
      // Thus a direct-call-only private helper may export its exact source
      // through arguments.callee, including a subsequent host-side toString.
      if(name==='callee' && node.object.type==='Identifier' &&
         node.object.name==='arguments' &&
         !(parent?.type==='AssignmentExpression' && key==='left' &&
           parent.operator==='=')) observed=true;
      // In non-strict runtimes Function#caller can reveal the current
      // running helper function to a nested callee. A function used only as
      // a direct call is therefore NOT automatically source-private when
      // the callee itself reads its .caller accessor. An external consumer
      // may later inspect the captured helper's original Function#toString.
      // Do not confuse a plain data object's .caller field with a callable.
      if(name==='caller' && isFunctionValue(node.object) &&
         !(parent?.type==='AssignmentExpression' && key==='left' &&
           parent.operator==='=')) observed=true;
      // A function's unknown computed key might evaluate to toString.
      if(node.computed && name===null && isFunctionValue(node.object)) observed=true;
      // A plain assignment overwrites the property without reading or
      // invoking its previous value. Preserve the source-observation guard
      // for calls, reads, compound writes, and other receiver uses.
      // Object#toLocaleString delegates to the receiver's toString method.
      // A prototype-reachable callable can therefore expose its exact source
      // even if this scan has not inferred that the receiver is a function.
      // Reading the unshadowed native Number.prototype formatter only obtains
      // an engine-owned function. Its calls/options are guarded separately,
      // allowing unrelated private-owner edits under the native-realm premise.
      const nativeNumberLocale=name==='toLocaleString' &&
        node.object.type==='MemberExpression' &&
        !node.object.computed && node.object.property.type==='Identifier' &&
        node.object.property.name==='prototype' &&
        node.object.object.type==='Identifier' &&
        node.object.object.name==='Number' &&
        !bindingCounts.has('Number') && !dynamicScope;
      if((name==='toString'||name==='toSource'||name==='toLocaleString') &&
          !isDefinitelyPrimitive(node.object) && !nativeNumberLocale &&
          !(parent?.type==='AssignmentExpression' && key==='left' && parent.operator==='=')) observed=true;
    }
    if(node.type==='CallExpression'||node.type==='NewExpression') {
      const callee=node.callee;
      // MessagePort, Worker and browser postMessage use structured cloning.
      // Their DataCloneError can expose exact function source in the payload,
      // including nested values. The receiver may be an opaque host object.
      if(node.type==='CallExpression' &&
         (callee.type==='Identifier' && callee.name==='postMessage' ||
          callee.type==='MemberExpression' && memberName(callee)==='postMessage') &&
         node.arguments[0] && !isInertCloneInput(node.arguments[0]))observed=true;
      // Both the convenience serializer and stateful Serializer.writeValue
      // throw messages containing the exact native function-source spelling.
      if(node.type==='CallExpression' && isV8SerializerWrite(callee) &&
         node.arguments[0] && !isInertCloneInput(node.arguments[0]))observed=true;
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isV8SerializerWrite(callee.object)) {
        const method=memberName(callee);
        if(method==='call' && node.arguments[1] &&
           !isInertCloneInput(node.arguments[1]))observed=true;
        if(method==='apply'||method==='bind')observed=true;
      }
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object) && memberName(callee)==='apply' &&
         isV8SerializerWrite(node.arguments[0]))observed=true;
      // Node's V8 serializer reuses structured clone rules and can expose the
      // exact source of a failed function operand in its error message.
      if(node.type==='CallExpression' && isV8Serialize(callee) &&
         node.arguments[0] && !isInertCloneInput(node.arguments[0]))observed=true;
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isV8Serialize(callee.object)) {
        const method=memberName(callee);
        if(method==='call' && node.arguments[1] &&
           !isInertCloneInput(node.arguments[1]))observed=true;
        if(method==='apply'||method==='bind')observed=true;
      }
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object) && memberName(callee)==='apply' &&
         isV8Serialize(node.arguments[0]))observed=true;
      // WHATWG structured cloning throws a source-bearing DataCloneError
      // when a function is submitted directly or through an object graph.
      // Unknown inputs may contain functions; keep primitive-only calls safe.
      if(node.type==='CallExpression' && isStructuredClone(callee) &&
         node.arguments[0] && !isInertCloneInput(node.arguments[0]))observed=true;
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isStructuredClone(callee.object)) {
        const method=memberName(callee);
        if(method==='call' && node.arguments[1] &&
           !isInertCloneInput(node.arguments[1]))observed=true;
        if(method==='apply'||method==='bind')observed=true;
      }
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object) && memberName(callee)==='apply' &&
         isStructuredClone(node.arguments[0]))observed=true;
      if(node.arguments.some((/** @type {AstNode} */ value)=>
        isIntlSourceCallback(value)))observed=true;
      // Enumerating descriptors can disclose Function.prototype.toString
      // through a later computed-key read of the returned descriptor map.
      if(node.type==='CallExpression' && node.arguments.length>=1 &&
         (callee.type==='MemberExpression' &&
            isReflectiveReceiver(callee.object) &&
            memberName(callee)==='getOwnPropertyDescriptors' ||
          callee.type==='Identifier' && reflectiveBulkReaders.has(callee.name))) {
        observed=true;
      }
      // Reflect.get and descriptor inspection can read the same stack data
      // without mentioning it in a MemberExpression.
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         node.arguments.length>1 && staticString(node.arguments[1])==='stack' &&
         callee.object.type==='Identifier' &&
         (callee.object.name==='Reflect' &&
           ['get','getOwnPropertyDescriptor'].includes(memberName(callee)??'') ||
          callee.object.name==='Object' &&
           memberName(callee)==='getOwnPropertyDescriptor')) observed=true;
      if(node.type==='CallExpression' && callee.type==='Identifier' &&
         storageMethodAliases.has(callee.name) &&
         node.arguments.slice(0,2).some((/** @type {AstNode} */ value)=>
           isUnsafeStorageStringValue(value,node,ancestors)))observed=true;
      // Web IDL receiver methods accept USVString/DOMString arguments. Check
      // the receiver's local constructor provenance before considering a
      // function-valued argument an implicit source-text observer.
      if(node.type==='CallExpression'&&callee.type==='MemberExpression') {
        const method=memberName(callee);
        if(isWebInstance(callee.object,encoderInstances,encoderConstructors,encoderNames) &&
            ['encode','encodeInto'].includes(method??'') &&node.arguments[0] &&
            !isDefinitelyPrimitive(node.arguments[0]))observed=true;
        if(isWebInstance(callee.object,formInstances,formConstructors,formNames) &&
            ['append','set','get','getAll','delete','has'].includes(method??'')) {
          const positions=method==='append'||method==='set'?
            node.arguments.slice(0,3):node.arguments.slice(0,1);
          if(positions.some((/** @type {AstNode} */ value)=>
            !isDefinitelyPrimitive(value)))observed=true;
        }
        // Headers and URLSearchParams string-coerce names and values in
        // mutators/readers, even when their constructors had inert inputs.
        if(isWebStringCollection(callee.object) &&
            (['append','set','get','getAll','delete','has'].includes(method??'') ||
             callee.computed && method===null) &&
            node.arguments.some((/** @type {AstNode} */ value)=>
              !isDefinitelyPrimitive(value)))observed=true;
        // Storage methods apply Web IDL DOMString conversion to setItem's
        // key/value and to getItem/removeItem's key. A function value here
        // exposes its exact source through localStorage/sessionStorage.
        if(isStorageCollection(callee.object) &&
            (['setItem','getItem','removeItem'].includes(method??'') ||
             callee.computed && method===null) &&
           !hasReferenceOnlyStorageOverride(method,node,ancestors)) {
          const positions=method==='setItem' ? node.arguments.slice(0,2) :
            method==='getItem'||method==='removeItem' ? node.arguments.slice(0,1) :
              node.arguments.slice(0,2);
          if(positions.some((/** @type {AstNode} */ value)=>
            isUnsafeStorageStringValue(value,node,ancestors)))observed=true;
        }
        // Extracted/bound Storage methods and call/apply forms retain the same
        // DOMString coercion contract. Conservatively inspect the first two
        // supplied values; extra inert values do not affect Storage semantics.
        if(callee.type==='MemberExpression' &&
           ['call','apply','bind'].includes(memberName(callee)??'') &&
           isStorageMethodReference(callee.object)) {
          if(memberName(callee)==='apply') {
            const values=node.arguments[1];
            if(values?.type==='ArrayExpression') {
              if(values.elements.some((/** @type {AstNode|null} */ value)=>
                value!==null && isUnsafeStorageStringValue(value,node,ancestors)))observed=true;
            } else if(isUnsafeStorageStringValue(values,node,ancestors))observed=true;
          } else if(node.arguments.slice(1,3).some((/** @type {AstNode} */ value)=>
            isUnsafeStorageStringValue(value,node,ancestors)))observed=true;
        }
        if(callee.type==='MemberExpression' && memberName(callee)==='apply' &&
           isReflectiveReceiver(callee.object) &&
           isStorageMethodReference(node.arguments[0])) {
          const values=node.arguments[2];
          if(values?.type==='ArrayExpression') {
            if(values.elements.some((/** @type {AstNode|null} */ value)=>
              value!==null && isUnsafeStorageStringValue(value,node,ancestors)))observed=true;
          } else if(isUnsafeStorageStringValue(values,node,ancestors))observed=true;
        }
      }
      // Bound, extracted and reflective native method invocations hide the
      // actual string-valued options behind an extra function-call layer.
      if(node.type==='CallExpression' && isNativeLocaleMethod(callee) &&
         node.arguments.some((/** @type {AstNode} */ value)=>
           mayCoerceSourceWithinWebRecord(value)))observed=true;
      if(callee.type==='MemberExpression' &&
         ['call','apply','bind'].includes(memberName(callee)??'') &&
         isNativeLocaleMethod(callee.object) &&
         node.arguments.some((/** @type {AstNode} */ value)=>
           mayCoerceSourceWithinWebRecord(value)))observed=true;
      if(callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object) && memberName(callee)==='apply' &&
         isNativeLocaleMethod(node.arguments[0]) &&
         node.arguments[2] &&
         mayCoerceSourceWithinWebRecord(node.arguments[2]))observed=true;
      // Native Number/BigInt/Date locale-formatters and String#localeCompare
      // forward locales/options into ECMA-402. A function-valued option can
      // be exposed verbatim through V8's diagnostics. Arrays containing a
      // function can also invoke its toLocaleString without a source reader.
      if(callee.type==='MemberExpression') {
        const method=memberName(callee);
        if(['toLocaleString','toLocaleDateString','toLocaleTimeString',
             'localeCompare'].includes(method??'')) {
          const inputs=method==='localeCompare'?
            node.arguments.slice(1,3):node.arguments.slice(0,2);
          if(inputs.some((/** @type {AstNode} */ value)=>
            mayCoerceSourceWithinWebRecord(value)))observed=true;
        }
      }
      // Collator/Segmenter stringify inputs, while ListFormat can expose a
      // function's exact text through its non-string-element TypeError.
      // Constructors can process locale strings and string-valued option
      // records. Only syntactically proven primitive inputs are excluded.
      // This covers locale, timeZone and unit TypeError/RangeError messages
      // that can otherwise carry the exact spelling of a function.
      if(intlKinds.some(kind=>isIntlConstructor(callee,kind)) &&
         node.arguments.some((/** @type {AstNode} */ value)=>
           mayCoerceSourceWithinWebRecord(value)))observed=true;
      if(callee.type==='Identifier' && intlStaticStringCalls.has(callee.name) &&
         node.arguments[0] &&
         mayCoerceSourceWithinWebRecord(node.arguments[0]))observed=true;
      if(callee.type==='MemberExpression' &&
         callee.object.type==='Identifier' &&
         intlStaticStringCalls.has(callee.object.name) &&
         ['call','apply','bind'].includes(memberName(callee)??''))observed=true;
      if(callee.type==='MemberExpression' && isIntlNamespace(callee.object) &&
         ['getCanonicalLocales','supportedValuesOf'].includes(memberName(callee)??'') &&
         node.arguments[0] &&
         mayCoerceSourceWithinWebRecord(node.arguments[0]))observed=true;
      if(callee.type==='MemberExpression') {
        const method=memberName(callee);
        if(isIntlInstance(callee.object,intlKinds[3]) && method==='of' &&
           node.arguments[0] && !isDefinitelyPrimitive(node.arguments[0]))observed=true;
        if(isIntlInstance(callee.object,intlKinds[4]) &&
           ['format','formatToParts'].includes(method??'') &&
           node.arguments[1] && !isDefinitelyPrimitive(node.arguments[1]))observed=true;
        if(method==='compare' && isIntlInstance(callee.object,intlKinds[0]) &&
           node.arguments.slice(0,2).some((/** @type {AstNode} */ value)=>
             !isDefinitelyPrimitive(value)))observed=true;
        if(['format','formatToParts'].includes(method??'') &&
           isIntlInstance(callee.object,intlKinds[1]) &&
           node.arguments[0] &&
           mayCoerceSourceWithinWebRecord(node.arguments[0]))observed=true;
        if(method==='segment' && isIntlInstance(callee.object,intlKinds[2]) &&
           node.arguments[0] && !isDefinitelyPrimitive(node.arguments[0]))observed=true;
      }
      if(callee.type==='Identifier' && boundCollatorCompares.has(callee.name) &&
         node.arguments.slice(0,2).some((/** @type {AstNode} */ value)=>
           !isDefinitelyPrimitive(value)))observed=true;
      // Intl.Collator.compare is a bound getter; callable references also work
      // through Function#call/apply/bind and Reflect.apply. A hidden function
      // argument can then disclose its original body without .toString().
      if(callee.type==='MemberExpression' &&
         callee.object.type==='Identifier' &&
         boundCollatorCompares.has(callee.object.name)) {
        const method=memberName(callee);
        if((method==='call'||method==='bind') &&
           node.arguments.slice(1,3).some((/** @type {AstNode} */ value)=>
             !isDefinitelyPrimitive(value)))observed=true;
        if(method==='apply' && node.arguments[1] &&
           mayCoerceSourceWithinWebRecord(node.arguments[1]))observed=true;
      }
      if(callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object) && memberName(callee)==='apply' &&
         node.arguments[0]?.type==='Identifier' &&
         boundCollatorCompares.has(node.arguments[0].name) &&
         node.arguments[2] &&
         mayCoerceSourceWithinWebRecord(node.arguments[2]))observed=true;
      // URL.parse can expose the original Function#toString in its encoded URL.
      if(isUrlStaticMethod(callee) &&
          node.arguments.slice(0,2).some((/** @type {AstNode} */ value)=>
            !isDefinitelyPrimitive(value)))observed=true;
      if(callee.type==='MemberExpression'&&isUrlStaticMethod(callee.object)) {
        const method=memberName(callee);
        if((method==='call'||method==='bind') &&
           node.arguments.slice(1,3).some((/** @type {AstNode} */ value)=>
             !isDefinitelyPrimitive(value)))observed=true;
        if(method==='apply') {
          const args=node.arguments[1];
          if(args?.type==='ArrayExpression') {
            if(args.elements.slice(0,2).some((/** @type {AstNode|null} */ value)=>
              Boolean(value&&!isDefinitelyPrimitive(value))))observed=true;
          } else if(args)observed=true;
        }
      }
      if(node.type==='CallExpression'&&isReflectApplyMethod(callee)&&
         isUrlStaticMethod(node.arguments[0])) {
        const args=node.arguments[2];
        if(args?.type==='ArrayExpression') {
          if(args.elements.slice(0,2).some((/** @type {AstNode|null} */ value)=>
            Boolean(value&&!isDefinitelyPrimitive(value))))observed=true;
        } else if(args)observed=true;
      }
      if(isWebConstructor(callee,webScalars,webScalarNames) &&
          node.arguments.some((/** @type {AstNode} */ value)=>
            !isDefinitelyPrimitive(value)))observed=true;
      if(isWebConstructor(callee,webDictionaries,webDictionaryNames) &&
          node.arguments[0] &&
          mayCoerceSourceWithinWebRecord(node.arguments[0]))observed=true;
      // Blob's first argument and its second options dictionary may both
      // coerce function values. Bound constructors can shift those offsets.
      if(isBlobConstructor(callee) &&
          node.arguments.slice(0,2).some((/** @type {AstNode} */ value)=>
            mayCoerceSourceWithinWebRecord(value)))observed=true;
      if(isBoundBlobConstructor(callee) &&
          node.arguments.some((/** @type {AstNode} */ value)=>
            mayCoerceSourceWithinWebRecord(value)))observed=true;
      // Bound Blob arguments are captured now and may be converted at a
      // later invocation, including through an exported constructor wrapper.
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
          memberName(callee)==='bind' && isBlobConstructor(callee.object) &&
          node.arguments.slice(1).some((/** @type {AstNode} */ value)=>
            mayCoerceSourceWithinWebRecord(value)))observed=true;
      // Request/Response/File expose function source through BodyInit, URL,
      // BlobPart sequences, filenames, headers and string-valued init fields.
      // Preserve constant primitive records and sequences as positive controls.
      if(isWebConstructor(callee,webRecords,webRecordNames) &&
          node.arguments.some((/** @type {AstNode} */ value)=>
            mayCoerceSourceWithinWebRecord(value)))observed=true;
      if(node.type==='CallExpression' && isResponseRedirect(callee) &&
          node.arguments[0] && !isDefinitelyPrimitive(node.arguments[0]))observed=true;
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
          isResponseRedirect(callee.object)) {
        const invocation=memberName(callee);
        if((invocation==='call'||invocation==='bind') && node.arguments[1] &&
           !isDefinitelyPrimitive(node.arguments[1]))observed=true;
        if(invocation==='apply') {
          const supplied=node.arguments[1];
          if(supplied?.type==='ArrayExpression') {
            if(supplied.elements[0] && !isDefinitelyPrimitive(supplied.elements[0]))
              observed=true;
          } else if(supplied)observed=true;
        }
      }
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
          isReflectiveReceiver(callee.object) && memberName(callee)==='apply' &&
          isResponseRedirect(node.arguments[0])) {
        const supplied=node.arguments[2];
        if(supplied?.type==='ArrayExpression') {
          if(supplied.elements[0] && !isDefinitelyPrimitive(supplied.elements[0]))
            observed=true;
        } else if(supplied)observed=true;
      }
      // Object.fromEntries converts each pair's first value to a property
      // key. A function-valued key exposes the function's native source.
      if(node.type==='CallExpression') {
        /** @type {AstNode|null|undefined} */
        let entryArgument=isObjectFromEntries(callee)?node.arguments[0]:null;
        if(callee.type==='MemberExpression' && isObjectFromEntries(callee.object)) {
          const method=memberName(callee);
          if(method==='call'||method==='bind')entryArgument=node.arguments[1];
          if(method==='apply') {
            const args=node.arguments[1];
            if(args?.type==='ArrayExpression')entryArgument=args.elements[0];
            else if(args)observed=true;
          }
        }
        if(containsFunctionKeyEntries(entryArgument)) observed=true;
      }
      // String prototype search, comparison, replacement and padding methods
      // can coerce an argument into the native source text of a function.
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
          isStringValue(callee.object) &&
          stringCoercionMethods.has(memberName(callee)??'')) {
        const method=memberName(callee);
        const tested=method==='concat'?node.arguments:
          [node.arguments[method==='padStart'||method==='padEnd'?1:0]];
        if(tested.some((/** @type {AstNode|null|undefined} */ value)=>
          isFunctionValue(value)||containsFunction(value))) observed=true;
      }
      // String.prototype generic methods stringify their receiver, which
      // may itself be a function even if every explicit argument is inert.
      // Follow detached method aliases and the Reflect.apply calling form.
      if(node.type==='CallExpression' && callee.type==='MemberExpression') {
        const invocation=memberName(callee);
        if(['call','apply','bind'].includes(invocation??'') &&
           isDetachedStringReceiverMethod(callee.object) &&
           node.arguments[0] && !isDefinitelyPrimitive(node.arguments[0]))
          observed=true;
        if(invocation==='apply' && isReflectiveReceiver(callee.object) &&
           isDetachedStringReceiverMethod(node.arguments[0]) &&
           node.arguments[1] && !isDefinitelyPrimitive(node.arguments[1]))
          observed=true;
      }
      // RegExp#test, #exec and legacy #compile coerce their input to text.
      // A function argument therefore exposes its exact native source bytes
      // even though the consumer never spells .toString or String(...).
      // Unknown nonprimitive inputs must be treated conservatively.
      if(node.type==='CallExpression' && callee.type==='MemberExpression') {
        const method=memberName(callee);
        if(isDetachedRegExpSourceMethod(callee) && node.arguments[0] &&
           !isDefinitelyPrimitive(node.arguments[0]))observed=true;
        // Bound/reflective native method calls can conceal that coercion.
        if(['call','apply','bind'].includes(method??'') &&
           isDetachedRegExpSourceMethod(callee.object)) {
          if(method==='apply') {
            const values=node.arguments[1];
            if(values?.type==='ArrayExpression') {
              if(values.elements[0] && !isDefinitelyPrimitive(values.elements[0]))
                observed=true;
            } else if(values)observed=true;
          } else if(node.arguments[1] &&
                    !isDefinitelyPrimitive(node.arguments[1])) observed=true;
        }
      }
      if(node.type==='CallExpression' && callee.type==='Identifier' &&
         boundRegExpSourceMethods.has(callee.name) && node.arguments[0] &&
         !isDefinitelyPrimitive(node.arguments[0])) observed=true;
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isReflectiveReceiver(callee.object) && memberName(callee)==='apply' &&
         isDetachedRegExpSourceMethod(node.arguments[0])) {
        const supplied=node.arguments[2];
        if(supplied?.type==='ArrayExpression') {
          if(supplied.elements[0] && !isDefinitelyPrimitive(supplied.elements[0]))
            observed=true;
        } else if(supplied) observed=true;
      }
      if(callee.type==='MemberExpression' && callee.object.type==='Identifier' &&
          ['Reflect','Object'].includes(callee.object.name) &&
          ['get','set','has','deleteProperty','defineProperty','getOwnPropertyDescriptor',
            'hasOwn'].includes(memberName(callee)??'') &&
          hasFunctionKey(node.arguments[1])) observed=true;
      // Obtaining an inherited or own Function.prototype.toString method
      // through Reflect.get/descriptor APIs exposes native source inspection
      // without any syntactic member access named "toString". Dynamic keys,
      // spread arguments, and Function#call/apply/bind can hide that method.
      const reflectiveRead=callee.type==='MemberExpression' &&
        isReflectiveReceiver(callee.object) &&
        ['get','getOwnPropertyDescriptor'].includes(memberName(callee)??'') ||
        callee.type==='Identifier' && reflectiveReaders.has(callee.name);
      if(reflectiveRead) {
        if(node.arguments.some((/** @type {AstNode} */ value)=>
             value.type==='SpreadElement') || node.arguments.length<2) {
          observed=true;
        } else {
          const selected=sourceStringKey(node.arguments[1]);
          if(selected===null || ['toString','toSource','toLocaleString'].includes(selected)) {
            observed=true;
          }
        }
      }
      if(callee.type==='MemberExpression' &&
         ['call','apply','bind'].includes(memberName(callee)??'') &&
         (callee.object.type==='Identifier' &&
            reflectiveReaders.has(callee.object.name) ||
          callee.object.type==='MemberExpression' &&
            isReflectiveReceiver(callee.object.object) &&
            ['get','getOwnPropertyDescriptor'].includes(memberName(callee.object)??''))) {
        // For indirect invocations the selected key and receiver are no
        // longer in canonical positions; decline rather than infer them.
        observed=true;
      }
      if(node.type==='CallExpression'&&callee.type==='MemberExpression'&&
         sourceCoercingArrayMethods.has(memberName(callee)??'')&&
         containsFunctionInArrayLike(callee.object))observed=true;
      // Applying a detached Array builtin observes the receiver's values,
      // even though the actual callee is .call/.apply/.bind or Reflect.apply.
      // Conservatively treat a bind as observable because the returned
      // function may be invoked outside the statically visible expression.
      if(node.type==='CallExpression'&&callee.type==='MemberExpression') {
        const invocation=memberName(callee);
        if(['call','apply','bind'].includes(invocation??'') &&
           isDetachedArraySourceMethod(callee.object) &&
           containsFunctionInArrayLike(node.arguments[0]))observed=true;
        if(invocation==='apply'&&isReflectiveReceiver(callee.object)&&
           isDetachedArraySourceMethod(node.arguments[0])&&
           containsFunctionInArrayLike(node.arguments[1]))observed=true;
      }
      // Reflect.apply can invoke a detached JSON.parse/rawJSON or other
      // native String coercer without a visible method call on that callee.
      // Preserve source when the first supplied argument is unproved.
      if(isReflectApplyMethod(callee) &&
         constructObservesSource(node.arguments[0],node.arguments[2]))observed=true;
      // Reflect.construct may itself be called, applied, bound, or passed to
      // Reflect.apply. Its native argument list remains a source observer.
      if(node.type==='CallExpression' && isReflectConstructMethod(callee) &&
         constructObservesSource(node.arguments[0],node.arguments[1]))observed=true;
      if(node.type==='CallExpression' && callee.type==='MemberExpression' &&
         isReflectConstructMethod(callee.object)) {
        const invocation=memberName(callee);
        if(invocation==='call' &&
           constructObservesSource(node.arguments[1],node.arguments[2]))observed=true;
        if(invocation==='apply') {
          const supplied=node.arguments[1];
          if(supplied?.type==='ArrayExpression') {
            if(constructObservesSource(supplied.elements[0],supplied.elements[1]))
              observed=true;
          } else if(supplied)observed=true;
        }
        if(invocation==='bind')observed=true;
      }
      if(node.type==='CallExpression' && isReflectApplyMethod(callee) &&
         isReflectConstructMethod(node.arguments[0])) {
        const supplied=node.arguments[2];
        if(supplied?.type==='ArrayExpression') {
          if(constructObservesSource(supplied.elements[0],supplied.elements[1]))
            observed=true;
        } else if(supplied)observed=true;
      }
      /** @type {AstNode|null|undefined} */
      let argument=null;
      if(isCoercer(callee))argument=node.arguments[0];
      // Bound native constructors may shift their source-coercing operands
      // through captured arguments. A function in any forwarded position
      // is conservatively observable without a complete bind arity proof.
      if((isBoundRegExpConstructor(callee)||isBoundStringConstructor(callee))&&
          node.arguments.some((/** @type {AstNode} */ value)=>
            !isDefinitelyPrimitive(value)))observed=true;
      if(callee.type==='MemberExpression'&&memberName(callee)==='bind'&&
          (isNativeConstructor(callee.object,nativeRegExpConstructors,'RegExp')||
           isNativeConstructor(callee.object,nativeStringConstructors,'String'))&&
          node.arguments.slice(1).some((/** @type {AstNode} */ value)=>
            !isDefinitelyPrimitive(value)))observed=true;
      // Native RegExp constructors stringify an explicit flags operand too.
      if(isNativeConstructor(callee,nativeRegExpConstructors,'RegExp') &&
         node.arguments[1] && !isDefinitelyPrimitive(node.arguments[1]))
        observed=true;
      if(callee.type==='MemberExpression' &&
         isNativeConstructor(callee.object,nativeRegExpConstructors,'RegExp')) {
        const method=memberName(callee);
        if(['call','bind'].includes(method??'') && node.arguments[2] &&
           !isDefinitelyPrimitive(node.arguments[2]))observed=true;
        if(method==='apply') {
          const passed=node.arguments[1];
          if(passed?.type==='ArrayExpression') {
            if(passed.elements[1] && !isDefinitelyPrimitive(passed.elements[1]))
              observed=true;
          } else if(passed) observed=true;
        }
      }
      // BigInt.asIntN/asUintN apply ToBigInt to argument 1. A function
      // can appear verbatim in the resulting SyntaxError's message.
      if(callee.type==='MemberExpression' && isCoercer(callee.object) &&
         ['asIntN','asUintN'].includes(memberName(callee)??'')) {
        argument=node.arguments[1];
      }
      // AggregateError's first argument is the iterable of errors; its
      // optional second message argument is the ToString source observer.
      if(isAggregateError(callee))argument=node.arguments[1];
      if(callee.type==='MemberExpression' && isAggregateError(callee.object) &&
         node.type==='CallExpression') {
        const name=memberName(callee);
        if(name==='call'||name==='bind')argument=node.arguments[2];
        if(name==='apply') {
          const args=node.arguments[1];
          if(args?.type==='ArrayExpression')argument=args.elements[1];
          else if(args)observed=true;
        }
      }
      if(callee.type==='MemberExpression' && isCoercer(callee.object) &&
         node.type==='CallExpression') {
        const name=callee.computed?staticString(callee.property):
          callee.property.type==='Identifier'?callee.property.name:null;
        if(name==='call'||name==='bind')argument=node.arguments[1];
        if(name==='apply') {
          const args=node.arguments[1];
          if(args?.type==='ArrayExpression')argument=args.elements[0];
          else if(args)observed=true;
        }
      }
      // A literal string/number/regex is never a function whose source is
      // exposed through coercion. Keep these common primitives eligible.
      // Immutable, proven primitive expressions cannot carry source text
      // through ToString or ToBigInt. Keep unknown and mutable values
      // under the conservative whole-file source-observation guard.
      if(argument && !isDefinitelyPrimitive(argument)) observed=true;
    }
  });
  if(!importedStrings.size&&!importedCloneFunctions.size&&
     !importedFunctionArrays.size&&!importedPrimitives.size&&
     !importedUrlStaticMethods.size)
    sourceObservationCache.set(ast,observed);
  return observed;
}

/**
 * Source-byte observations are distinct from Function#toString: reading a
 * distributed .mjs file can reveal every identifier/property spelling even
 * when no runtime function object escapes. The precise file path may be built
 * dynamically, so source-capable APIs conservatively disable transformations
 * across the entire supplied group, including single-file self reads.
 *
 * This finite syntax check cannot prove safety against opaque native modules,
 * custom loaders or arbitrary external observers. Its value is preserving
 * known Node/browser source-reader contracts without misclassifying them as
 * ordinary object-property reads.
 * @param {AstNode} ast
 * @param {Map<string,string>} [importedStrings] Proven immutable ESM imports.
 * @returns {boolean}
 */
function observesDistributedSource(ast,importedStrings=new Map()) {
  const fileModules=new Set(['fs','fs/promises','node:fs','node:fs/promises']);
  // Inspector sessions can request Debugger.getScriptSource from V8 for an
  // already-loaded script. This observes exact distributed source bytes
  // without using fs, module loaders, or a browser source-fetch API.
  const loaderModules=new Set(['module','node:module','vm','node:vm',
    'inspector','node:inspector','node:inspector/promises']);
  // CacheStorage.add performs an implicit fetch; Cache.match().text()
  // exposes distributed JavaScript bytes to the caller.
  const browserReaders=new Set(['fetch','XMLHttpRequest','FileReader','FileReaderSync',
    'caches','CacheStorage',
    // Same-origin host HTML can preload a module as text/plain in a named
    // iframe; Window.frames exposes that child Document's exact source body.
    // Declared ESM can also create an iframe and read its Document through
    // HTMLIFrameElement.contentDocument or .contentWindow.
    'frames','contentDocument','contentWindow',
    // Browser ResourceTiming exposes the actual transfer and decoded byte
    // length of same-origin fetched ESM files without exposing their text.
    // A rewritten module can otherwise produce a different observed length.
    // Do not veto ordinary performance.now() measurements.
    'PerformanceObserver','PerformanceResourceTiming',
    'getEntries','getEntriesByType','getEntriesByName',
    'decodedBodySize','encodedBodySize','transferSize']);
  const globals=new Set(['globalThis','window','self','global']);
  // Resource timing methods can be called through a mutable property name
  // on performance itself, or a simple alias of globalThis.performance.
  const performanceRoots=new Set(['performance']);
  // Script-producing DOM writes may publish hash-pinned script elements.
  const documentRoots=new Set(['document']);
  // A detached writer method can be invoked with Function#call/apply or
  // Reflect.apply. Track simple source-visible aliases conservatively.
  const documentWriterRoots=new Set();
  // Track DOM script-element creation and aliases for opaque integrity keys.
  const scriptElementRoots=new Set();
  // Module-registry objects can reach Node's internal source-file loader.
  // Follow simple aliases monotonically, conservatively accepting over-refusal.
  const requireRoots=new Set(['require']);
  const moduleRoots=new Set(['module']);
  const processRoots=new Set(['process']);
  // Follow plain global-object aliases conservatively. An eventual mutable
  // reassignment may create a false positive; it cannot make the guard unsafe.
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function isProcessModuleRequire(expression) {
    if(expression?.type!=='CallExpression' ||
       expression.callee.type!=='Identifier' ||
       expression.callee.name!=='require' || !expression.arguments[0])return false;
    return ['process','node:process'].includes(
      staticString(expression.arguments[0])??'');
  }
  /**
   * A literal SRI hash fed to an opaque computed property can reach a
   * different file's DOM script even when the receiver's provenance is
   * unavailable locally. Use the real SRI base64 grammar as a conservative
   * whole-graph source-byte observer.
   * @param {AstNode|null|undefined} value
   * @returns {boolean}
   */
  function looksLikeSriHash(value) {
    if(!value)return false;
    const known=knownKey(value);
    return known!==null &&
      /(?:^|\s)sha(?:256|384|512)-[A-Za-z0-9+/]{8,}/u.test(known);
  }
  /** @param {AstNode|null|undefined} value @returns {boolean} */
  function isDocumentReceiver(value) {
    if(value?.type==='Identifier')return documentRoots.has(value.name);
    if(value?.type!=='MemberExpression'||value.object.type!=='Identifier'||
       !globals.has(value.object.name))return false;
    const key=value.computed ? staticString(value.property) :
      value.property.type==='Identifier'?value.property.name:null;
    return key==='document';
  }
  /** @param {AstNode|null|undefined} value @returns {boolean} */
  function isDocumentWriterReference(value) {
    if(value?.type==='Identifier')return documentWriterRoots.has(value.name);
    if(value?.type!=='MemberExpression'||!isDocumentReceiver(value.object))return false;
    const method=value.computed ? staticString(value.property) :
      value.property.type==='Identifier'?value.property.name:null;
    return method==='write'||method==='writeln'||
      value.computed&&method===null;
  }
  /** @param {AstNode|null|undefined} value @returns {boolean} */
  function createsDomScript(value) {
    if(value?.type!=='CallExpression'||value.callee.type!=='MemberExpression'||
       !isDocumentReceiver(value.callee.object))return false;
    const method=value.callee.computed ? staticString(value.callee.property) :
      value.callee.property.type==='Identifier'?value.callee.property.name:null;
    if(method!=='createElement'&&method!=='createElementNS')return false;
    const tagArg=value.arguments[method==='createElement'?0:1];
    const tag=tagArg?.type==='SpreadElement'?null:tagArg?staticString(tagArg):null;
    return tag===null || tag.toLowerCase()==='script';
  }
  /** @param {AstNode|null|undefined} value @returns {boolean} */
  function isScriptElementTarget(value) {
    return value?.type==='Identifier' && scriptElementRoots.has(value.name) ||
      createsDomScript(value);
  }
  let changed;
  do {
    changed=false;
    walk(ast,node=>{
      const binding=node.type==='VariableDeclarator' && node.id.type==='Identifier' ?
        node.id : node.type==='AssignmentExpression' && node.operator==='=' &&
          node.left.type==='Identifier' ? node.left : null;
      const initial=node.type==='VariableDeclarator' ? node.init :
        node.type==='AssignmentExpression' ? node.right : null;
      if(binding?.type==='Identifier' && initial?.type==='Identifier') {
        for(const roots of [globals,requireRoots,moduleRoots,processRoots,performanceRoots,documentRoots,documentWriterRoots,scriptElementRoots]) {
          if(roots.has(initial.name) && !roots.has(binding.name)) {
            roots.add(binding.name);
            changed=true;
          }
        }
      }
      if(binding?.type==='Identifier'&&isDocumentWriterReference(initial)&&
         !documentWriterRoots.has(binding.name)){
        documentWriterRoots.add(binding.name);
        changed=true;
      }
      // The Node process builtin is available from a CJS require and from
      // ESM namespace/default imports as well as from the global object.
      if(binding?.type==='Identifier' && createsDomScript(initial) &&
         !scriptElementRoots.has(binding.name)) {
        scriptElementRoots.add(binding.name);
        changed=true;
      }
      if(binding?.type==='Identifier' && isProcessModuleRequire(initial) &&
         !processRoots.has(binding.name)) {
        processRoots.add(binding.name);
        changed=true;
      }
      if(node.type==='ImportDeclaration' &&
         ['process','node:process'].includes(String(node.source?.value))) {
        for(const specifier of node.specifiers) {
          if(specifier.type==='ImportDefaultSpecifier' ||
             specifier.type==='ImportNamespaceSpecifier' ||
             specifier.type==='ImportSpecifier' &&
               (specifier.imported.name==='default' ||
                specifier.imported.value==='default')) {
            if(!processRoots.has(specifier.local.name)) {
              processRoots.add(specifier.local.name);
              changed=true;
            }
          }
        }
      }
      // Object-pattern extraction can also carry the global process root.
      // Key expressions must be constant before we infer a builtin alias.
      const pattern=node.type==='VariableDeclarator' ? node.id :
        node.type==='AssignmentExpression'&&node.operator==='=' ? node.left : null;
      if(pattern?.type==='ObjectPattern' && initial?.type==='Identifier' &&
         globals.has(initial.name)) {
        for(const prop of pattern.properties) {
          if(prop.type!=='Property')continue;
          const alias=prop.value.type==='Identifier'?prop.value:
            prop.value.type==='AssignmentPattern' &&
              prop.value.left.type==='Identifier'?prop.value.left:null;
          if(!alias)continue;
          const field=prop.computed ? staticString(prop.key) :
            prop.key.type==='Identifier'?prop.key.name:
            prop.key.type==='Literal'?prop.key.value:null;
          const roots=field==='process'?processRoots:
            field==='require'?requireRoots:field==='module'?moduleRoots:
              field==='performance'?performanceRoots:
              field==='document'?documentRoots:null;
          if(roots&&!roots.has(alias.name)){
            roots.add(alias.name);
            changed=true;
          }
        }
      }
      // Node also exposes process on globalThis. An alias of that property
      // can later reach mainModule without spelling process at the use site.
      if(binding?.type==='Identifier' && initial?.type==='MemberExpression' &&
         initial.object.type==='Identifier' && globals.has(initial.object.name)) {
        const name=initial.computed ? staticString(initial.property) :
          initial.property.type==='Identifier' ? initial.property.name : null;
        const roots=name==='process' ? processRoots :
          name==='require' ? requireRoots : name==='module' ? moduleRoots :
            name==='performance'?performanceRoots:
            name==='document'?documentRoots:null;
        if(roots && !roots.has(binding.name)) {
          roots.add(binding.name);
          changed=true;
        }
      }
    });
  }while(changed);
  /** @type {Map<string,number>} */
  const bindingCounts=new Map();
  /** @type {Map<string,string>} */
  const localConstants=new Map();
  const modified=new Set();
  let dynamicScope=false;
  /** @param {AstNode|null|undefined} pattern @param {boolean} [isWrite] @returns {void} */
  function recordPattern(pattern,isWrite=false) {
    if(!pattern)return;
    if(pattern.type==='Identifier') {
      const name=pattern.name;
      if(isWrite)modified.add(name);
      else bindingCounts.set(name,(bindingCounts.get(name)??0)+1);
    } else if(pattern.type==='AssignmentPattern')recordPattern(pattern.left,isWrite);
    else if(pattern.type==='RestElement')recordPattern(pattern.argument,isWrite);
    else if(pattern.type==='ArrayPattern') {
      for(const item of pattern.elements)recordPattern(item,isWrite);
    } else if(pattern.type==='ObjectPattern') {
      for(const item of pattern.properties) {
        recordPattern(item.type==='RestElement'?item.argument:item.value,isWrite);
      }
    }
  }
  walk(ast,(node,parent)=>{
    if(node.type==='VariableDeclarator') {
      recordPattern(node.id);
      if(parent?.type==='VariableDeclaration'&&parent.kind==='const'&&
         node.id.type==='Identifier'&&node.init) {
        const value=staticString(node.init);
        if(value!==null)localConstants.set(node.id.name,value);
      }
    }
    if(node.type==='FunctionDeclaration'||node.type==='FunctionExpression'||
       node.type==='ArrowFunctionExpression') {
      recordPattern(node.id);
      for(const param of node.params)recordPattern(param);
    }
    if(node.type==='ClassDeclaration'||node.type==='ClassExpression')recordPattern(node.id);
    if(node.type==='CatchClause')recordPattern(node.param);
    if(node.type==='ImportSpecifier'||node.type==='ImportDefaultSpecifier'||
       node.type==='ImportNamespaceSpecifier')recordPattern(node.local);
    if(node.type==='AssignmentExpression')recordPattern(node.left,true);
    if(node.type==='UpdateExpression')recordPattern(node.argument,true);
    if((node.type==='ForInStatement'||node.type==='ForOfStatement')&&
       node.left.type!=='VariableDeclaration')recordPattern(node.left,true);
    if(node.type==='WithStatement'||
       node.type==='CallExpression'&&node.callee.type==='Identifier'&&
         node.callee.name==='eval')dynamicScope=true;
  });
  /** @type {Map<string,string>} */
  const verifiedKeys=new Map();
  if(!dynamicScope) {
    for(const [name,value] of [...importedStrings,...localConstants]) {
      if(bindingCounts.get(name)===1 && !modified.has(name)) {
        verifiedKeys.set(name,value);
      }
    }
  }
  /** @param {AstNode} property @returns {string|null} */
  function knownKey(property) {
    const literal=staticString(property);
    if(literal!==null)return literal;
    return property.type==='Identifier'?verifiedKeys.get(property.name)??null:null;
  }
  /**
   * A simple ambient Performance root, including globalThis.performance,
   * can expose ESM byte sizes through an unknown computed method selection.
   * @param {AstNode} receiver
   * @returns {boolean}
   */
  function canReadPerformanceRoot(receiver) {
    if(receiver.type==='Identifier')return performanceRoots.has(receiver.name);
    if(receiver.type!=='MemberExpression'||receiver.object.type!=='Identifier'||
       !globals.has(receiver.object.name))return false;
    const key=receiver.computed ? knownKey(receiver.property) :
      receiver.property.type==='Identifier'?receiver.property.name:null;
    return key==='performance';
  }
  /** @param {string} receiver @param {string|null} key @returns {boolean} */
  function canReachLoader(receiver,key) {
    return requireRoots.has(receiver) &&
      (key===null || ['cache','main','extensions'].includes(key)) ||
      moduleRoots.has(receiver) &&
      (key===null || ['children','parent','constructor'].includes(key)) ||
      processRoots.has(receiver) &&
        (key===null || ['mainModule','binding','_linkedBinding','dlopen',
          'getBuiltinModule'].includes(key));
  }
  /** @param {AstNode} receiver @param {string|null} key @returns {boolean} */
  function canReadLoaderRoot(receiver,key) {
    if(receiver.type==='Identifier')return canReachLoader(receiver.name,key);
    if(receiver.type!=='MemberExpression'||receiver.object.type!=='Identifier'||
       !globals.has(receiver.object.name))return false;
    const root=receiver.computed ? knownKey(receiver.property) :
      receiver.property.type==='Identifier' ? receiver.property.name : null;
    return root!==null && canReachLoader(root,key);
  }
  // The first alias pass runs before immutable string keys are verified.
  // Revisit computed globalThis['process'] aliases now that knownKey can
  // resolve unique immutable key bindings without assuming their spelling.
  let loaderChanged;
  do {
    loaderChanged=false;
    walk(ast,node=>{
      const binding=node.type==='VariableDeclarator' && node.id.type==='Identifier' ?
        node.id : node.type==='AssignmentExpression' && node.operator==='=' &&
          node.left.type==='Identifier' ? node.left : null;
      const value=node.type==='VariableDeclarator' ? node.init :
        node.type==='AssignmentExpression' ? node.right : null;
      // Verified computed strings can first resolve globalThis[key] into a
      // Performance alias here. Propagate that alias to simple later bindings.
      if(binding?.type==='Identifier' && value?.type==='Identifier' &&
         performanceRoots.has(value.name) &&
         !performanceRoots.has(binding.name)){
        performanceRoots.add(binding.name);
        loaderChanged=true;
      }
      const pattern=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      if(pattern?.type==='ObjectPattern' && value?.type==='Identifier' &&
         globals.has(value.name)){
        for(const property of pattern.properties){
          if(property.type!=='Property')continue;
          const alias=property.value.type==='Identifier'?property.value:
            property.value.type==='AssignmentPattern' &&
              property.value.left.type==='Identifier'?property.value.left:null;
          if(!alias)continue;
          const key=property.computed ? knownKey(property.key) :
            property.key.type==='Identifier'?property.key.name:null;
          if(key==='performance'&&!performanceRoots.has(alias.name)){
            performanceRoots.add(alias.name);
            loaderChanged=true;
          }
        }
      }
      if(binding?.type!=='Identifier'||value?.type!=='MemberExpression'||
         value.object.type!=='Identifier'||!globals.has(value.object.name))return;
      const key=value.computed ? knownKey(value.property) :
        value.property.type==='Identifier' ? value.property.name : null;
      const roots=key==='process'?processRoots:
        key==='require'?requireRoots:key==='module'?moduleRoots:
          key==='performance'?performanceRoots:null;
      if(roots&&!roots.has(binding.name)){
        roots.add(binding.name);
        loaderChanged=true;
      }
    });
  }while(loaderChanged);
  // Detached native reflection functions retain their ability to reach
  // process's built-in module loader. Follow simple assignment aliases.
  /** @type {Map<string,'get'|'getOwnPropertyDescriptor'>} */
  const reflectionMethods=new Map();
  let reflectionChanged;
  do {
    reflectionChanged=false;
    walk(ast,node=>{
      const binding=node.type==='VariableDeclarator' && node.id.type==='Identifier' ?
        node.id : node.type==='AssignmentExpression' && node.operator==='=' &&
          node.left.type==='Identifier' ? node.left : null;
      const value=node.type==='VariableDeclarator' ? node.init :
        node.type==='AssignmentExpression' ? node.right : null;
      // Direct pattern extraction also detaches a native reflection method:
      // const {get:read}=Reflect; read(process,'getBuiltinModule').
      const pattern=node.type==='VariableDeclarator' ? node.id :
        node.type==='AssignmentExpression'&&node.operator==='=' ?
          node.left : null;
      if(pattern?.type==='ObjectPattern'&&value?.type==='Identifier'&&
         ['Reflect','Object'].includes(value.name)) {
        for(const property of pattern.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const key=property.computed ? knownKey(property.key) :
            property.key.type==='Identifier'?property.key.name:
              staticString(property.key);
          const method=value.name==='Reflect'&&key==='get'?'get':
            value.name==='Object'&&key==='getOwnPropertyDescriptor'?
              'getOwnPropertyDescriptor':null;
          if(method&&!reflectionMethods.has(property.value.name)) {
            reflectionMethods.set(property.value.name,method);
            reflectionChanged=true;
          }
        }
      }
      if(binding?.type!=='Identifier'||!value)return;
      /** @type {'get'|'getOwnPropertyDescriptor'|undefined} */
      let method;
      if(value.type==='Identifier')method=reflectionMethods.get(value.name);
      if(value.type==='MemberExpression'&&value.object.type==='Identifier') {
        const key=value.computed ? knownKey(value.property) :
          value.property.type==='Identifier'?value.property.name:null;
        if(value.object.name==='Reflect'&&key==='get')method='get';
        if(value.object.name==='Object'&&key==='getOwnPropertyDescriptor') {
          method='getOwnPropertyDescriptor';
        }
      }
      if(method&&!reflectionMethods.has(binding.name)) {
        reflectionMethods.set(binding.name,method);
        reflectionChanged=true;
      }
    });
  }while(reflectionChanged);
  /**
   * An HTML parser write may concatenate multiple string arguments. An
   * unproved argument or an incomplete start tag can become SRI metadata.
   * @param {(AstNode|null)[]} args
   * @returns {boolean}
   */
  function mayWriteIntegrityMarkup(args) {
    let markup='';
    for(const argument of args) {
      if(!argument||argument.type==='SpreadElement')return true;
      const fragment=knownKey(argument);
      if(fragment===null)return true;
      markup+=fragment;
    }
    return /integrity\s*=/iu.test(markup) ||
      /<(?:[A-Za-z!?/][^>]*|)$/u.test(markup);
  }
  /** @param {AstNode|null|undefined} argument @returns {boolean} */
  function mayApplyIntegrityMarkup(argument) {
    return argument?.type!=='ArrayExpression' ||
      mayWriteIntegrityMarkup(argument.elements);
  }
  let observed=false;
  walk(ast,node=>{
    // HTMLScriptElement.integrity can pin another published script's exact
    // response bytes even when no static HTML asset declares SRI. The target
    // may be chosen dynamically, so conservatively retain the entire group.
    // This check uses proved constant keys and avoids refusing ordinary
    // reads of unrelated values named "integrity".
    if(node.type==='AssignmentExpression' &&
       node.left.type==='MemberExpression') {
      const key=node.left.computed ? knownKey(node.left.property) :
        node.left.property.type==='Identifier'?node.left.property.name:null;
      if(key==='integrity' || key===null && node.left.computed &&
         (isScriptElementTarget(node.left.object)||looksLikeSriHash(node.right)))observed=true;
    }
    // A parser-active document.write may create SRI-pinned script/link
    // resources even if no provided static HTML contains an integrity tag.
    // Preserve source bytes for explicit integrity HTML or opaque writes;
    // a proved unrelated literal write remains transformable.
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression') {
      const method=node.callee.computed ? knownKey(node.callee.property) :
        node.callee.property.type==='Identifier'?node.callee.property.name:null;
      const receiver=node.callee.object;
      const isDocument=receiver.type==='Identifier' && documentRoots.has(receiver.name) ||
        receiver.type==='MemberExpression' && receiver.object.type==='Identifier' &&
          globals.has(receiver.object.name) &&
          (receiver.computed ? knownKey(receiver.property) :
            receiver.property.type==='Identifier'?receiver.property.name:null)==='document';
      // An opaque computed method on a proven Document may resolve to write
      // or writeln at runtime. Treat its HTML-bearing arguments as parser
      // writes while retaining yield for proved benign static markup.
      if(isDocument && (method==='write'||method==='writeln'||
         node.callee.computed && method===null) &&
         mayWriteIntegrityMarkup(node.arguments))observed=true;
      // The same parser writer may be invoked through native function
      // dispatch, including an extracted local alias of document.write.
      if(isDocumentWriterReference(receiver)) {
        if((method==='call'||method==='bind'||
            node.callee.computed&&method===null) &&
           mayWriteIntegrityMarkup(node.arguments.slice(1)))observed=true;
        if(method==='apply'&&mayApplyIntegrityMarkup(node.arguments[1]))
          observed=true;
      }
      if(receiver.type==='Identifier'&&receiver.name==='Reflect'&&
         method==='apply'&&isDocumentWriterReference(node.arguments[0])&&
         mayApplyIntegrityMarkup(node.arguments[2]))observed=true;
    }
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression') {
      const method=node.callee.computed ? knownKey(node.callee.property) :
        node.callee.property.type==='Identifier'?node.callee.property.name:null;
      // Opaque attribute names can be `integrity` when written to a
      // proven DOM script instance. Exact known unrelated names remain safe.
      const scriptReceiver=isScriptElementTarget(node.callee.object);
      if((method==='setAttribute'||method==='setAttributeNS') &&
         node.arguments[method==='setAttribute'?0:1]) {
        const key=knownKey(node.arguments[method==='setAttribute'?0:1]);
        if(key?.toLowerCase()==='integrity' || key===null &&
           (scriptReceiver || looksLikeSriHash(node.arguments[
             method==='setAttribute'?1:2])))observed=true;
      }
      if(node.callee.object.type==='Identifier' &&
         node.callee.object.name==='Reflect' && method==='set' &&
         node.arguments[1]) {
        const key=knownKey(node.arguments[1]);
        if(key==='integrity' || key===null &&
           (isScriptElementTarget(node.arguments[0])||looksLikeSriHash(node.arguments[2])))
          observed=true;
      }
      if(node.callee.object.type==='Identifier' &&
         node.callee.object.name==='Object' && method==='assign') {
        const scriptTarget=isScriptElementTarget(node.arguments[0]);
        for(const item of node.arguments.slice(1)) {
          if(item.type!=='ObjectExpression'){
            if(scriptTarget)observed=true;
            continue;
          }
          for(const prop of item.properties) {
            if(prop.type!=='Property'){
              if(scriptTarget)observed=true;
              continue;
            }
            const key=prop.computed ? knownKey(prop.key) :
              prop.key.type==='Identifier'?prop.key.name:knownKey(prop.key);
            if(key==='integrity'||key===null&&
               (scriptTarget||looksLikeSriHash(prop.value)))observed=true;
          }
        }
      }
    }
    if(node.type==='ImportDeclaration' || node.type==='ExportAllDeclaration' ||
       node.type==='ExportNamedDeclaration' && node.source) {
      // Import attributes can change the fetched resource's module type and
      // expose its source bytes (notably browser type=text modules).
      if(node.attributes?.length || node.assertions?.length)observed=true;
      if(fileModules.has(node.source?.value) ||
         loaderModules.has(node.source?.value))observed=true;
    }
    // Node process exports a source-capable filesystem loader. Re-exporting
    // that method can make a separate file an observer of the original graph.
    // Preserve the original graph even if the importing file never spells the
    // original process.getBuiltinModule member name locally.
    if((node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration') &&
       ['process','node:process'].includes(String(node.source?.value)) &&
       (node.type==='ExportAllDeclaration'||node.specifiers.some(/** @param {{type:'ExportSpecifier',local:({type:'Identifier',name:string}|{type:'Literal',value:string})}} specifier */ specifier=>
         specifier.type==='ExportSpecifier' &&
         canReachLoader('process',specifier.local.type==='Identifier' ?
           specifier.local.name:String(specifier.local.value)))))observed=true;
    if(node.type==='ImportDeclaration' &&
       ['process','node:process'].includes(String(node.source?.value)) &&
       node.specifiers.some(/** @param {{type:'ImportSpecifier',imported:({type:'Identifier',name:string}|{type:'Literal',value:string})}|{type:'ImportDefaultSpecifier'|'ImportNamespaceSpecifier'}} specifier */ specifier=>specifier.type==='ImportSpecifier' &&
         canReachLoader('process',specifier.imported.type==='Identifier' ?
           specifier.imported.name:String(specifier.imported.value))))observed=true;
    if(node.type==='ImportExpression') {
      if(node.options)observed=true;
      const source=staticString(node.source);
      if(source===null || fileModules.has(source) || loaderModules.has(source) ||
         ['process','node:process'].includes(source))observed=true;
    }
    if(node.type==='CallExpression' && node.callee.type==='Identifier' &&
       node.callee.name==='require' && node.arguments[0]) {
      const source=staticString(node.arguments[0]);
      if(source===null || fileModules.has(source) || loaderModules.has(source))observed=true;
    }
    if(node.type==='VariableDeclarator' && node.init?.type==='Identifier' &&
       node.init.name==='require')observed=true;
    // Destructuring reads a field even when no MemberExpression is present.
    // Opaque computed keys and rest patterns can expose a loader or fetch API.
    const pattern=node.type==='VariableDeclarator' ? node.id :
      node.type==='AssignmentExpression'&&node.operator==='=' ? node.left : null;
    const target=node.type==='VariableDeclarator' ? node.init :
      node.type==='AssignmentExpression' ? node.right : null;
    if(pattern?.type==='ObjectPattern' &&
       (target?.type==='Identifier'||target?.type==='MemberExpression'||
        isProcessModuleRequire(target))) {
      for(const property of pattern.properties) {
        if(property.type!=='Property') {
          if(isProcessModuleRequire(target) || canReadLoaderRoot(target,null) ||
             target.type==='Identifier' && globals.has(target.name))observed=true;
          continue;
        }
        const field=property.computed ? knownKey(property.key) :
          property.key.type==='Identifier' ? property.key.name :
          property.key.type==='Literal'&&typeof property.key.value==='string' ?
            property.key.value : null;
        if(isProcessModuleRequire(target) && canReachLoader('process',field) ||
           canReadLoaderRoot(target,field) || target.type==='Identifier' &&
           globals.has(target.name) &&
           (field===null || browserReaders.has(field) ||
            ['require','module'].includes(field)))observed=true;
      }
    }
    if(node.type==='Identifier' && browserReaders.has(node.name))observed=true;
    if(node.type==='MemberExpression') {
      const key=node.computed ? knownKey(node.property) :
        node.property.type==='Identifier' ? node.property.name : null;
      if(key!==null && (browserReaders.has(key) ||
        ['getBuiltinModule','createRequire','require'].includes(key)) ||
         key===null && node.computed &&
           (node.object.type==='Identifier' && globals.has(node.object.name) ||
            canReadPerformanceRoot(node.object))) {
        observed=true;
      }
      // Cached modules, parent/child links, and the process main module
      // expose constructor._load even without a literal fs import.
      if(canReadLoaderRoot(node.object,key))observed=true;
    }
    if(node.type==='CallExpression' && node.callee.type==='Identifier' &&
       reflectionMethods.has(node.callee.name) && node.arguments[0]) {
      const root=node.arguments[0];
      const target=node.arguments[1] ? knownKey(node.arguments[1]) : null;
      if(root.type==='Identifier' && globals.has(root.name) &&
         (target===null||browserReaders.has(target)||
          ['require','process','module','performance','getBuiltinModule',
            'createRequire'].includes(target)) ||
         canReadPerformanceRoot(root) &&
           (target===null||browserReaders.has(target)) ||
         canReadLoaderRoot(root,target) ||
         isProcessModuleRequire(root) && canReachLoader('process',target)) {
        observed=true;
      }
    }
    if(node.type==='CallExpression' && node.callee.type==='MemberExpression' &&
       node.callee.object.type==='Identifier' &&
       ['Reflect','Object'].includes(node.callee.object.name) &&
       (node.arguments[0]?.type==='Identifier'||
        node.arguments[0]?.type==='MemberExpression'||
        isProcessModuleRequire(node.arguments[0]))) {
      const method=node.callee.computed ? knownKey(node.callee.property) :
        node.callee.property.type==='Identifier' ? node.callee.property.name : null;
      const root=node.arguments[0];
      const target=node.arguments[1] ? knownKey(node.arguments[1]) : null;
      if(['get','getOwnPropertyDescriptor'].includes(method??'')) {
        if(root.type==='Identifier' && globals.has(root.name) &&
           (target===null || browserReaders.has(target) ||
            ['require','process','module','getBuiltinModule','createRequire'].includes(target)))observed=true;
        if(canReadLoaderRoot(root,target) ||
           isProcessModuleRequire(root) && canReachLoader('process',target))observed=true;
      }
      // Enumerating module-registry descriptors exposes the loader root
      // without spelling the selected member in the local expression.
      if((node.callee.object.name==='Object' &&
          ['getOwnPropertyDescriptors','keys','values','entries'].includes(method??'') ||
          node.callee.object.name==='Reflect' && method==='ownKeys') &&
          (canReadLoaderRoot(root,null)||isProcessModuleRequire(root)))observed=true;
    }
  });
  return observed;
}

module.exports = {parse, walk, applyEdits, observesFunctionSource, observesDistributedSource, staticString, collectDirectCarrierFactories, sourceSpelledErrorOperand, hasUnsafeNativeBindMutationSurface, hasWeakMapPrototypeExposure};
