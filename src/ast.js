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
 * @returns {boolean}
 */
function observesFunctionSource(ast,importedStrings=new Map(),importedCloneFunctions=new Set(),importedFunctionArrays=new Set()) {
  // A cached opaque-import result does not apply when imported keys have
  // been independently verified against the supplied ESM files.
  if(!importedStrings.size&&!importedCloneFunctions.size&&!importedFunctionArrays.size) {
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
        !importedStrings.has(node.name) &&
        (functions.has(node.name)||opaqueFunctions.has(node.name)) ||
      ['FunctionExpression','ArrowFunctionExpression','ClassExpression'].includes(node.type) ||
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
    'Error','TypeError','RangeError','ReferenceError','SyntaxError',
    'URIError','EvalError']);
  const coercers=new Set(builtinCoercers);
  const nativeStringConstructors=new Set(['String']);
  const nativeRegExpConstructors=new Set(['RegExp']);
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
  const webDictionaries=new Set(webDictionaryNames);
  const webRecords=new Set(webRecordNames);
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
  function isCoercer(node) {
    if(!node)return false;
    if(node.type==='Identifier')return coercers.has(node.name);
    if(node.type!=='MemberExpression')return false;
    const name=memberName(node);
    return isGlobal(node.object) && name!==null && builtinCoercers.has(name) ||
      name==='for' && isSymbolConstructor(node.object);
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
  /** @param {AstNode|null|undefined} node @param {Set<string>} aliases
   *  @param {Set<string>} builtins @returns {boolean} */
  function isWebConstructor(node,aliases,builtins) {
    if(!node)return false;
    if(node.type==='Identifier')return aliases.has(node.name);
    if(node.type!=='MemberExpression')return false;
    const name=memberName(node);
    if(isGlobal(node.object))return builtins.has(name??'');
    if(node.object.type!=='Identifier'||name===null)return false;
    const properties=aliases===webRecords ? webRecordObjectKeys :
      aliases===responseConstructors ? responseObjectKeys : null;
    const keys=properties?.get(node.object.name);
    // A runtime-computed key could select any recorded native method.
    return name!==null ? keys?.has(name)??false : Boolean(node.computed&&keys?.size);
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
  /** @param {AstNode|null|undefined} node @param {Set<string>} instances
   *  @param {Set<string>} constructors @param {Set<string>} names @returns {boolean} */
  function isWebInstance(node,instances,constructors,names) {
    return Boolean(node && (node.type==='Identifier'&&instances.has(node.name) ||
      node.type==='NewExpression'&&isWebConstructor(node.callee,constructors,names)));
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
    if(isResponseRedirect(expression))
      addWebObjectKey(redirectObjectKeys,receiver,key);
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
        if(isNativeConstructor(value,nativeStringConstructors,'String'))
          changed=add(nativeStringConstructors,name)||changed;
        if(isNativeConstructor(value,nativeRegExpConstructors,'RegExp'))
          changed=add(nativeRegExpConstructors,name)||changed;
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
        if(isWebConstructor(value,webDictionaries,webDictionaryNames)) {
          changed=add(webDictionaries,name)||changed;
        }
        if(isWebConstructor(value,webRecords,webRecordNames)) {
          changed=add(webRecords,name)||changed;
        }
        if(isWebConstructor(value,responseConstructors,responseNames)) {
          changed=add(responseConstructors,name)||changed;
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
          for(const map of [webRecordObjectKeys,responseObjectKeys,redirectObjectKeys]) {
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
          if(redirectObjectKeys.get(node.init.name)?.has(key))
            changed=add(responseRedirects,property.value.name)||changed;
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
         isGlobal(node.init)) {
        for(const property of node.id.properties) {
          if(property.type!=='Property' || property.value.type!=='Identifier')continue;
          const name=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if(name==='Intl')changed=add(intlNamespaces,property.value.name)||changed;
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
          if(name!==null&&webDictionaryNames.has(name)) {
            changed=add(webDictionaries,property.value.name)||changed;
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
    if(node.type==='Identifier')return primitives.has(node.name) ||
      !dynamicScope && importedStrings.has(node.name);
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
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function isReflectiveReceiver(expression) {
    return Boolean(expression && (expression.type==='Identifier' &&
      reflectiveReceivers.has(expression.name) ||
      expression.type==='MemberExpression' && isGlobal(expression.object) &&
      ['Reflect','Object'].includes(memberName(expression)??'')));
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
          if(['get','getOwnPropertyDescriptor'].includes(method??'') &&
             !reflectiveReaders.has(name)) {
            reflectiveReaders.add(name);
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
          const method=property.computed?staticString(property.key):
            property.key.type==='Identifier'?property.key.name:staticString(property.key);
          if((method===null || ['get','getOwnPropertyDescriptor'].includes(method)) &&
             !reflectiveReaders.has(property.value.name)) {
            reflectiveReaders.add(property.value.name);
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
  walk(ast,(node,parent,key)=>{
    if(node.type==='TaggedTemplateExpression'&&isStringRaw(node.tag) &&
       node.quasi.expressions.some((/** @type {AstNode} */ value)=>
         !isDefinitelyPrimitive(value)))observed=true;
    if(node.type==='CallExpression') {
      const callee=node.callee;
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
    // Destructuring is a property read too: a first-class native source
    // method can be obtained from a function or Function.prototype without
    // any MemberExpression named "toString" in the AST.
    if(node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
         isFunctionValue(node.init) ||
       node.type==='AssignmentExpression' && node.left.type==='ObjectPattern' &&
         isFunctionValue(node.right)) {
      const pattern=node.type==='VariableDeclarator'?node.id:node.left;
      for(const property of pattern.properties) {
        if(property.type!=='Property')continue;
        const name=property.computed?sourceStringKey(property.key):
          property.key.type==='Identifier'?property.key.name:staticString(property.key);
        if(name===null || ['toString','toSource','toLocaleString'].includes(name)) {
          observed=true;
        }
      }
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
      if(property==='stack') observed=true;
    }
    if(node.type==='MemberExpression') {
      const name=node.computed ? sourceStringKey(node.property) :
        (node.property.type==='Identifier' ? node.property.name : null);
      // Error stack strings expose generated source line/column coordinates.
      // Even harmless identifier-length edits change those coordinates, so
      // refuse rewrites for syntactic stack observers. This deliberately also
      // declines ambiguous user-defined .stack properties rather than guessing
      // whether their values represent a runtime Error.
      if (['stack','captureStackTrace','prepareStackTrace','stackTraceLimit'].includes(name??'')) observed=true;
      // A function's unknown computed key might evaluate to toString.
      if(node.computed && name===null && isFunctionValue(node.object)) observed=true;
      // A plain assignment overwrites the property without reading or
      // invoking its previous value. Preserve the source-observation guard
      // for calls, reads, compound writes, and other receiver uses.
      if(((name==='toString'||name==='toSource') &&
            !isDefinitelyPrimitive(node.object) ||
          name==='toLocaleString'&&(isFunctionValue(node.object)||containsFunction(node.object))) &&
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
      if(isWebConstructor(callee,webScalars,webScalarNames) &&
          node.arguments.some((/** @type {AstNode} */ value)=>
            !isDefinitelyPrimitive(value)))observed=true;
      if(isWebConstructor(callee,webDictionaries,webDictionaryNames) &&
          node.arguments[0] &&
          mayCoerceSourceWithinWebRecord(node.arguments[0]))observed=true;
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
      /** @type {AstNode|null|undefined} */
      let argument=null;
      if(isCoercer(callee))argument=node.arguments[0];
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
  if(!importedStrings.size&&!importedCloneFunctions.size)sourceObservationCache.set(ast,observed);
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
  const browserReaders=new Set(['fetch','XMLHttpRequest','FileReader','FileReaderSync']);
  const globals=new Set(['globalThis','window','self','global']);
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
        for(const roots of [globals,requireRoots,moduleRoots,processRoots]) {
          if(roots.has(initial.name) && !roots.has(binding.name)) {
            roots.add(binding.name);
            changed=true;
          }
        }
      }
      // The Node process builtin is available from a CJS require and from
      // ESM namespace/default imports as well as from the global object.
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
          if(prop.type!=='Property'||prop.value.type!=='Identifier')continue;
          const field=prop.computed ? staticString(prop.key) :
            prop.key.type==='Identifier'?prop.key.name:
            prop.key.type==='Literal'?prop.key.value:null;
          const roots=field==='process'?processRoots:
            field==='require'?requireRoots:field==='module'?moduleRoots:null;
          if(roots&&!roots.has(prop.value.name)){
            roots.add(prop.value.name);
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
          name==='require' ? requireRoots : name==='module' ? moduleRoots : null;
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
      if(binding?.type!=='Identifier'||value?.type!=='MemberExpression'||
         value.object.type!=='Identifier'||!globals.has(value.object.name))return;
      const key=value.computed ? knownKey(value.property) :
        value.property.type==='Identifier' ? value.property.name : null;
      const roots=key==='process'?processRoots:
        key==='require'?requireRoots:key==='module'?moduleRoots:null;
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
  let observed=false;
  walk(ast,node=>{
    if(node.type==='ImportDeclaration' || node.type==='ExportAllDeclaration' ||
       node.type==='ExportNamedDeclaration' && node.source) {
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
         node.object.type==='Identifier' && globals.has(node.object.name)) {
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
          ['require','process','module','getBuiltinModule',
            'createRequire'].includes(target)) ||
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

module.exports = {parse, walk, applyEdits, observesFunctionSource, observesDistributedSource, staticString, collectDirectCarrierFactories};
