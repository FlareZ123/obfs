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
 * Resolve only bounded constant string spellings used as computed keys.
 * @param {AstNode} node
 * @param {number} [depth]
 * @returns {string|null}
 */
function staticString(node,depth=0){
  if(depth>16)return null;
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
 * Detect common source-observing operations before rewriting AST subtrees.
 * Native Function#toString can expose changed source spelling at runtime.
 * This is a conservative opt-out for known direct operations; arbitrary
 * coercion or reflective indirection still requires a richer proof.
 * @param {AstNode} ast
 * @returns {boolean}
 */
function observesFunctionSource(ast) {
  const cached=sourceObservationCache.get(ast);
  if(cached!==undefined) return cached;
  // Aliased string prefixes and aliased String constructors can coerce
  // functions to their exact source text without a literal at the use site.
  const strings=new Set();
  // Array#join and Function#toLocaleString can implicitly format functions as
  // their source text. Track simple aliases and array-element ownership in
  // addition to direct String/RegExp coercers.
  const functions=new Set();
  const arraysWithFunctions=new Set();
  const entryCollectionsWithFunctionKeys=new Set();
  const fromEntriesMethods=new Set();
  /** @type {Map<string,Set<string>>} */
  const objectFunctionKeys=new Map();
  // Imported bindings and CommonJS require() results may be functions even
  // when their declarations are in a separate file. A consumer's computed
  // property key can stringify the imported function's original source.
  const opaqueFunctions=new Set();
  const opaqueNamespaces=new Set();
  walk(ast,node=>{
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
        (functions.has(node.name)||opaqueFunctions.has(node.name)) ||
      ['FunctionExpression','ArrowFunctionExpression','ClassExpression'].includes(node.type) ||
      node.type==='MemberExpression' &&
        (isOpaqueNamespace(node.object) || node.object.type==='Identifier' &&
          (objectFunctionKeys.get(node.object.name)?.has(memberName(node)??'') ||
           node.computed && arraysWithFunctions.has(node.object.name)))));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function containsFunction(node) {
    return Boolean(node && (node.type==='Identifier'&&arraysWithFunctions.has(node.name) ||
      node.type==='ArrayExpression'&&node.elements.some((/** @type {AstNode|null} */ value)=>
        value && (isFunctionValue(value)||value.type==='SpreadElement'&&containsFunction(value.argument)))));
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
  const builtinCoercers=new Set(['String','RegExp','Symbol','encodeURI',
    'encodeURIComponent','decodeURI','decodeURIComponent','escape','unescape',
    'Error','TypeError','RangeError','ReferenceError','SyntaxError',
    'URIError','EvalError']);
  const coercers=new Set(builtinCoercers);
  const aggregateErrors=new Set(['AggregateError']);
  // Web IDL string arguments and string-valued record/sequence entries also
  // invoke ToString, so exposed source can cross a browser API boundary.
  const webScalarNames=new Set(['DOMException','URL']);
  const webDictionaryNames=new Set(['URLSearchParams','Headers','Blob']);
  const webScalars=new Set(webScalarNames);
  const webDictionaries=new Set(webDictionaryNames);
  const encoderNames=new Set(['TextEncoder']);
  const formNames=new Set(['FormData']);
  const encoderConstructors=new Set(encoderNames);
  const formConstructors=new Set(formNames);
  const encoderInstances=new Set();
  const formInstances=new Set();
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
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isSymbolConstructor(node) {
    return Boolean(node && (node.type==='Identifier' && symbols.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='Symbol'));
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isCoercer(node) {
    if(!node)return false;
    if(node.type==='Identifier')return coercers.has(node.name);
    if(node.type!=='MemberExpression')return false;
    const name=memberName(node);
    return isGlobal(node.object) && name!==null && builtinCoercers.has(name) ||
      name==='for' && isSymbolConstructor(node.object);
  }
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function isAggregateError(node) {
    return Boolean(node && (node.type==='Identifier'&&aggregateErrors.has(node.name) ||
      node.type==='MemberExpression' && isGlobal(node.object) &&
        memberName(node)==='AggregateError'));
  }
  /** @param {AstNode|null|undefined} node @param {Set<string>} aliases
   *  @param {Set<string>} builtins @returns {boolean} */
  function isWebConstructor(node,aliases,builtins) {
    if(!node)return false;
    if(node.type==='Identifier')return aliases.has(node.name);
    return node.type==='MemberExpression'&&isGlobal(node.object)&&
      builtins.has(memberName(node)??'');
  }
  /** @param {AstNode|null|undefined} node @param {Set<string>} instances
   *  @param {Set<string>} constructors @param {Set<string>} names @returns {boolean} */
  function isWebInstance(node,instances,constructors,names) {
    return Boolean(node && (node.type==='Identifier'&&instances.has(node.name) ||
      node.type==='NewExpression'&&isWebConstructor(node.callee,constructors,names)));
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
  do {
    changed=false;
    walk(ast,node=>{
      if(node.type==='VariableDeclarator' && node.id.type==='Identifier' ||
         node.type==='AssignmentExpression' && node.operator==='=' &&
         node.left.type==='Identifier') {
        const name=node.type==='VariableDeclarator'?node.id.name:node.left.name;
        const value=node.type==='VariableDeclarator'?node.init:node.right;
        if(isStringValue(value))changed=add(strings,name)||changed;
        if(isCoercer(value))changed=add(coercers,name)||changed;
        if(isObjectFromEntries(value))changed=add(fromEntriesMethods,name)||changed;
        if(isAggregateError(value))changed=add(aggregateErrors,name)||changed;
        if(isWebConstructor(value,webScalars,webScalarNames)) {
          changed=add(webScalars,name)||changed;
        }
        if(isWebConstructor(value,webDictionaries,webDictionaryNames)) {
          changed=add(webDictionaries,name)||changed;
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
        if(isSymbolConstructor(value))changed=add(symbols,name)||changed;
        if(isGlobal(value))changed=add(globals,name)||changed;
        if(isFunctionValue(value))changed=add(functions,name)||changed;
        if(value?.type==='ObjectExpression') {
          for(const property of value.properties) {
            if(property.type!=='Property')continue;
            const key=property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key);
            if(key!==null && isFunctionValue(property.value))addObjectFunctionKey(name,key);
          }
        }
        if(value?.type==='Identifier') {
          for(const key of objectFunctionKeys.get(value.name)??[]) {
            addObjectFunctionKey(name,key);
          }
        }
        if(isOpaqueNamespace(value)) {
          changed=add(opaqueNamespaces,name)||changed;
          changed=add(opaqueFunctions,name)||changed;
        }
        if(containsFunction(value))changed=add(arraysWithFunctions,name)||changed;
        if(containsFunctionKeyEntries(value)) {
          changed=add(entryCollectionsWithFunctionKeys,name)||changed;
        }
      }
      if(node.type==='AssignmentExpression' && node.operator==='=' &&
         node.left.type==='MemberExpression' &&
         node.left.object.type==='Identifier' && isFunctionValue(node.right)) {
        const key=memberName(node.left);
        if(key!==null)addObjectFunctionKey(node.left.object.name,key);
      }
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         node.init?.type==='Identifier') {
        const known=objectFunctionKeys.get(node.init.name);
        if(known)for(const property of node.id.properties) {
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const key=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(key!==null&&known.has(key)) {
            changed=add(functions,property.value.name)||changed;
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
      if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         isGlobal(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property' || property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name!==null && builtinCoercers.has(name)) {
            changed=add(coercers,property.value.name)||changed;
            if(name==='Symbol')changed=add(symbols,property.value.name)||changed;
          }
          if(name!==null&&webScalarNames.has(name)) {
            changed=add(webScalars,property.value.name)||changed;
          }
          if(name!==null&&webDictionaryNames.has(name)) {
            changed=add(webDictionaries,property.value.name)||changed;
          }
          if(name!==null&&encoderNames.has(name)) {
            changed=add(encoderConstructors,property.value.name)||changed;
          }
          if(name!==null&&formNames.has(name)) {
            changed=add(formConstructors,property.value.name)||changed;
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
  /** @type {Map<string,AstNode>} */
  const primitiveCandidates=new Map();
  /** @param {AstNode|null|undefined} pattern @returns {void} */
  function recordPattern(pattern) {
    if(!pattern)return;
    if(pattern.type==='Identifier') {
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
  walk(ast,node=>{
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
    if(node.type==='Identifier')return primitives.has(node.name);
    if(node.type==='TemplateLiteral')return node.expressions.every(
      (/** @type {AstNode} */ value)=>isDefinitelyPrimitive(value,depth+1));
    if(node.type==='UnaryExpression') {
      return ['!','~','+','-','typeof','void'].includes(node.operator) &&
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
      return isDefinitelyPrimitive(node.test,depth+1)&&
        isDefinitelyPrimitive(node.consequent,depth+1)&&
        isDefinitelyPrimitive(node.alternate,depth+1);
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
  let observed=false;
  // ToPropertyKey applies ToPrimitive with a string hint. Functions with
  // ordinary prototype methods stringify to their source text. Restrict the
  // guard to syntactically tracked functions so string/number computed keys
  // keep their existing transformations.
  /** @param {AstNode|null|undefined} node @returns {boolean} */
  function hasFunctionKey(node) {
    return isFunctionValue(node);
  }
  const stringCoercionMethods=new Set(['includes','startsWith','endsWith',
    'indexOf','lastIndexOf','split','replace','replaceAll','match','matchAll',
    'search','localeCompare','concat','padStart','padEnd']);
  walk(ast,(node,parent,key)=>{
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
          containsFunction(node.right)) && staticString(node)===null) observed=true;
    }
    if(node.type==='MemberExpression') {
      const name=node.computed ? staticString(node.property) :
        (node.property.type==='Identifier' ? node.property.name : null);
      // A plain assignment overwrites the property without reading or
      // invoking its previous value. Preserve the source-observation guard
      // for calls, reads, compound writes, and other receiver uses.
      if((name==='toString'||name==='toSource' ||
          name==='toLocaleString'&&isFunctionValue(node.object)) &&
          !(parent?.type==='AssignmentExpression' && key==='left' && parent.operator==='=')) observed=true;
    }
    if(node.type==='CallExpression'||node.type==='NewExpression') {
      const callee=node.callee;
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
      }
      if(isWebConstructor(callee,webScalars,webScalarNames) &&
          node.arguments.some((/** @type {AstNode} */ value)=>
            !isDefinitelyPrimitive(value)))observed=true;
      if(isWebConstructor(callee,webDictionaries,webDictionaryNames) &&
          node.arguments[0] &&
          mayCoerceSourceWithinWebRecord(node.arguments[0]))observed=true;
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
      if(callee.type==='MemberExpression' && callee.object.type==='Identifier' &&
          ['Reflect','Object'].includes(callee.object.name) &&
          ['get','set','has','deleteProperty','defineProperty','getOwnPropertyDescriptor',
            'hasOwn'].includes(memberName(callee)??'') &&
          hasFunctionKey(node.arguments[1])) observed=true;
      // Obtaining an inherited or own Function.prototype.toString method
      // through Reflect.get/descriptor APIs exposes native source inspection
      // without any syntactic member access named "toString".
      if(callee.type==='MemberExpression' && callee.object.type==='Identifier' &&
          ['Reflect','Object'].includes(callee.object.name) &&
          ['get','getOwnPropertyDescriptor'].includes(memberName(callee)??'') &&
          node.arguments.length>=2 &&
          ['toString','toSource','toLocaleString'].includes(
            staticString(node.arguments[1])??'')) observed=true;
      if(node.type==='CallExpression'&&callee.type==='MemberExpression'&&
         memberName(callee)==='join'&&containsFunction(callee.object))observed=true;
      /** @type {AstNode|null|undefined} */
      let argument=null;
      if(isCoercer(callee))argument=node.arguments[0];
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
      if(argument && argument.type!=='Literal' &&
          !(argument.type==='TemplateLiteral' && argument.expressions.length===0)) observed=true;
    }
  });
  sourceObservationCache.set(ast,observed);
  return observed;
}

module.exports = {parse, walk, applyEdits, observesFunctionSource, staticString};
