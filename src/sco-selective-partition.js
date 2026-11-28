'use strict';

const {parse,walk,staticString}=require('./ast');
const {isBuiltin}=require('node:module');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {safePath}=require('./core');
const {collectBindings}=require('./properties');
const {partitionScoAsyncModule,bindScoModuleExports}=require('./sco-partition');
const {createScoHandler}=require('./sco');
const {snapshotSelectedOptions}=require('./sco-selected-options');
const {assertNoPrivateImportMemberState}=require('./sco-private-import-identity');

/** @typedef {import('./sco-partition').ScoModulePartition} ScoModulePartition */
/** @typedef {{path:string,code:string}} ScoPrivateModuleSource */
/** @typedef {{privateNames:string[],publicHelperNames?:string[],seed?:string,endpoint?:string,batch?:boolean,maxBatchCalls?:number,allowServerEnvConstants?:boolean,allowServerImports?:boolean,privateModuleImports?:string[],additionalPrivateModulePaths?:string[],privateModuleSources?:ScoPrivateModuleSource[]}} ScoSelectiveOptions */
/** @typedef {{path:string,sha256:string}} ScoPrivateSourceDigest */
/** @typedef {ScoModulePartition & {publicNames:string[],privateNames:string[],publicHelperNames:string[],privateSourceDigests?:ScoPrivateSourceDigest[]}} ScoSelectivePartition */
/** @type {WeakMap<ScoSelectivePartition,string>} */
const generatedSelectiveSnapshots=new WeakMap();

// A selected function and each audited static dependency are relocated to
// the trusted Node server. Both paths must apply the same client-host global
// admission boundary; otherwise a dependency can silently read browser state
// that is absent or different in the relocated execution environment.
const browserOnlyRoots=new Set(['window','document','navigator','location',
  'localStorage','sessionStorage','indexedDB','self','history','screen',
  'customElements','DOMParser','XMLHttpRequest',
  // Web-exposed globals with no equivalent Node 22 document/window state.
  'caches','origin','devicePixelRatio','isSecureContext',
  'crossOriginIsolated','matchMedia','requestAnimationFrame',
  'cancelAnimationFrame','requestIdleCallback','cancelIdleCallback',
  'MutationObserver','ResizeObserver','IntersectionObserver',
  'FileReader','FileList','Image','Audio','HTMLElement','Element','Node']);

const standardRealmGlobals=new Set([
  'Infinity','NaN','undefined','eval','isFinite','isNaN',
  'parseFloat','parseInt','decodeURI','decodeURIComponent',
  'encodeURI','encodeURIComponent','escape','unescape',
  'Object','Function','Boolean','Symbol','Error','AggregateError',
  'EvalError','RangeError','ReferenceError','SyntaxError','TypeError',
  'URIError','Number','BigInt','Math','Date','String','RegExp','Array',
  'Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array',
  'Int32Array','Uint32Array','Float32Array','Float64Array',
  'BigInt64Array','BigUint64Array','Map','Set','WeakMap','WeakSet',
  'ArrayBuffer','SharedArrayBuffer','DataView','JSON','Promise',
  'Reflect','Proxy','Intl','Atomics','WebAssembly',
  'WeakRef','FinalizationRegistry'
]);

/**
 * Whether an AST literal is an owned primitive whose typeof result does not
 * depend on a host global. RegExp syntax carries an object, so exclude it.
 * @param {import('./ast').AstNode|null|undefined} node
 * @returns {boolean}
 */
function isProvedTypeofLiteral(node){
  return Boolean(node&&node.type==='Literal'&&node.regex===undefined&&
    (node.value===null||
      ['string','number','boolean','bigint'].includes(typeof node.value)));
}

/**
 * An explicitly pinned trusted Node builtin import has the same local
 * server-side value regardless of the private module's source URL.
 * @param {import('./ast').AstNode|null|undefined} node
 * @returns {boolean}
 */
function isProvedTypeofLocalInitializer(node){
  if(isProvedTypeofLiteral(node))return true;
  if(node?.type!=='AwaitExpression'||node.argument?.type!=='ImportExpression')return false;
  const specifier=node.argument.source;
  return specifier?.type==='Literal'&&typeof specifier.value==='string'&&
    specifier.value.startsWith('node:')&&isBuiltin(specifier.value)&&
    !['node:module','node:vm','node:worker_threads',
      'node:child_process','node:process'].includes(specifier.value);
}

/**
 * Find the first unproved unqualified typeof read in a relocated source.
 * A unique binding is necessary, but is not alone sufficient: a sibling
 * function's declaration is not in lexical scope. Accept only the explicit
 * module binding or a literal/parameter/function binding in an ancestor scope.
 * Unknown host roots remain conservatively unproved, even when typeof would
 * return "undefined" instead of throwing on one particular machine.
 *
 * @param {import('./ast').AstNode} root
 * @param {Map<string,number>} bindings
 * @param {Set<string>} moduleBindings
 * @param {Set<string>} rootFormals
 * @returns {string|null}
 */
function firstUnprovedTypeofReference(root,bindings,moduleBindings,rootFormals){
  /** @type {string|null} */
  let unproved=null;
  walk(root,(node,_parent,_key,ancestors)=>{
    if(unproved!==null||node.type!=='UnaryExpression'||node.operator!=='typeof')return;
    // The operand is fully evaluated before typeof computes its final
    // primitive tag. Sequence members, computed keys, object initializers,
    // member roots and conditional branches may all read free host names.
    // Function literals are lazy unless embedded in a call expression:
    // merely creating one has a stable typeof result.
    walk(node.argument,(read,parent,key,inside)=>{
      if(unproved!==null||read.type!=='Identifier'||isStaticKey(parent,key)||
         parent&&['FunctionDeclaration','FunctionExpression',
           'ArrowFunctionExpression','ClassExpression'].includes(parent.type)&&
           (key==='id'||key==='params'))return;
      // An unevaluated function body cannot read host state. Only a function
      // directly invoked as the callee or tag can execute inside this typeof
      // operand. Calls unrelated to its own function node do not prove execution.
      const enclosingFunction=inside.some((scope,index)=>{
        if(!['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
            .includes(scope.type))return false;
        const containing=inside[index-1];
        return !(containing&&(
          (containing.type==='CallExpression'||containing.type==='NewExpression')&&
            containing.callee===scope ||
          containing.type==='TaggedTemplateExpression'&&containing.tag===scope
        ));
      });
      if(enclosingFunction)return;
      const name=read.name;
      const bindingCount=bindings.get(name)??0;
      if(bindingCount===0&&(name==='globalThis'||standardRealmGlobals.has(name)))return;
      if(bindingCount!==1){unproved=name;return;}
      if(moduleBindings.has(name)||rootFormals.has(name))return;
      for(const scope of [...ancestors,...inside]){
        if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']
            .includes(scope.type)){
          if(scope.id?.type==='Identifier'&&scope.id.name===name)return;
          if(Array.isArray(scope.params)&&scope.params.some(
            (/** @type {import('./ast').AstNode} */ parameter)=>
              parameter.type==='Identifier'&&parameter.name===name))return;
        }
        if(scope.type!=='BlockStatement')continue;
        for(const statement of scope.body){
          if(statement.type==='FunctionDeclaration'&&
             statement.id?.type==='Identifier'&&statement.id.name===name)return;
          if(statement.type!=='VariableDeclaration'||statement.kind!=='const')continue;
          for(const declaration of statement.declarations){
            if(declaration.id.type==='Identifier'&&declaration.id.name===name&&
               declaration.start<read.start&&isProvedTypeofLocalInitializer(declaration.init))return;
          }
        }
      }
      unproved=name;
    });
  });
  return unproved;
}

/**
 * Copy the declared numeric array slots without invoking caller-controlled
 * map, iterator or species methods. An accessor at each slot is read once.
 * @template T
 * @param {T[]|undefined} source
 * @returns {T[]|undefined}
 */
function snapshotOptionArray(source){
  if(!Array.isArray(source))return source;
  /** @type {T[]} */
  const result=[];
  for(let index=0;index<source.length;index++)result.push(source[index]);
  return result;
}

/**
 * Uncomputed object and member keys are property labels, not variable reads.
 * Shorthand properties still visit their separate value nodes as references.
 * @param {import('./ast').AstNode|null} parent
 * @param {string|null} key
 * @returns {boolean}
 */
function isStaticKey(parent,key){
  return Boolean(parent&&(
    parent.type==='MemberExpression'&&key==='property'&&!parent.computed ||
    (parent.type==='Property'||parent.type==='MethodDefinition'||
     parent.type==='PropertyDefinition')&&key==='key'&&!parent.computed
  ));
}

/**
 * Browser-relative network requests, workers and event channels depend on
 * host-owned state whose semantics are not preserved by moving code into a
 * Node server. Keep this syntactic admission conservative when local names
 * shadow globals. Inert object-property keys do not count as API references.
 *
 * @param {import('./ast').AstNode} body
 * @param {Set<string>} [explicitServerBindings]
 * @returns {boolean}
 */
function usesUnprovedCrossRealmHostApi(body,explicitServerBindings=new Set()){
  const hostApis=new Set([
    // Node's legacy buffer.atob/btoa errors have different native messages
    // from browser Window atob/btoa, even for identical malformed input.
    'atob','btoa',
    // TextEncoder.encodeInto converts non-string inputs in Chromium but
    // Node 22 throws. Without whole-program source/destination typing we
    // cannot move its constructor across the browser/server boundary.
    // Treat first-class and aliased constructor values as host-sensitive.
    'TextEncoder',
    'console','fetch','Request','Worker','WebSocket','XMLHttpRequest','EventSource',
    'BroadcastChannel','MessageChannel',
    'setTimeout','clearTimeout','setInterval','clearInterval',
    'setImmediate','clearImmediate','queueMicrotask',
    // Browser-only frame/idle APIs are handled by browserOnlyRoots below,
    // preserving their established browser-ambient diagnostic.
    'postMessage','addEventListener','removeEventListener','dispatchEvent',
    'alert','confirm','prompt'
  ]);
  // A uniquely declared function in this immediate source scope shadows
  // the ambient host API name. Function declarations are mutable bindings;
  // a later assignment or loop-target write destroys the local-function
  // provenance. Track writes including destructuring before granting the
  // bounded exemption, and decline ambiguous nested shadowing.
  const bindingCounts=collectBindings(body);
  const mutatedBindings=new Set();
  walk(body,node=>{
    const target=node.type==='AssignmentExpression'?node.left:
      node.type==='UpdateExpression'?node.argument:
      (node.type==='ForInStatement'||node.type==='ForOfStatement')?node.left:null;
    if(!target)return;
    walk(target,(part,parent,key)=>{
      if(part.type==='Identifier'&&hostApis.has(part.name)&&
         !isStaticKey(parent,key))mutatedBindings.add(part.name);
    });
  });
  const ownedFunctions=new Set();
  if(body.type==='BlockStatement'||body.type==='Program'){
    for(const statement of body.body){
      if(statement.type==='FunctionDeclaration'&&
         statement.id?.type==='Identifier'&&
         hostApis.has(statement.id.name)&&
         bindingCounts.get(statement.id.name)===1&&
         !mutatedBindings.has(statement.id.name)){
        ownedFunctions.add(statement.id.name);
      }
      if(statement.type==='VariableDeclaration'&&statement.kind==='const'){
        for(const declaration of statement.declarations){
          if(declaration.id.type==='Identifier'&&hostApis.has(declaration.id.name)&&
             bindingCounts.get(declaration.id.name)===1&&
             !mutatedBindings.has(declaration.id.name)&&declaration.init&&
             ['FunctionExpression','ArrowFunctionExpression'].includes(declaration.init.type)){
            ownedFunctions.add(declaration.id.name);
          }
        }
      }
    }
  }
  let observed=false;
  walk(body,(node,parent,key)=>{
    if(node.type==='DebuggerStatement')observed=true;
    if(node.type==='Identifier'&&hostApis.has(node.name)&&
       !ownedFunctions.has(node.name)&&!explicitServerBindings.has(node.name)&&
       !isStaticKey(parent,key)&&
       !['ImportSpecifier','ImportDefaultSpecifier','ImportNamespaceSpecifier']
         .includes(parent?.type??'')&&
       !(parent?.type==='VariableDeclarator'&&key==='id')&&
       !(parent?.type==='FunctionDeclaration'&&key==='id')){
      observed=true;
    }
  });
  return observed;
}

/**
 * Legacy TextDecoder mappings depend on the Node and browser engine/ICU
 * versions. Node 22.16.0 decodes windows-1252 0x80 differently from
 * Chromium's WHATWG mapping, while later Node 22 patches agree. Only a
 * directly constructed UTF-8 decoder has bounded cross-host provenance.
 * First-class constructors, dynamic labels and global destructuring are
 * conservatively left out of relocated private SCO source.
 *
 * @param {import('./ast').AstNode} body
 * @returns {boolean}
 */
function usesUnprovedRelocatedTextDecoder(body){
  const globals=new Set(['globalThis','window','self','global']);
  let changed=true;
  while(changed){
    changed=false;
    walk(body,node=>{
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const initial=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'&&node.operator==='='?node.right:null;
      if(binding?.type==='Identifier'&&initial?.type==='Identifier'&&
         globals.has(initial.name)&&!globals.has(binding.name)){
        globals.add(binding.name);
        changed=true;
      }
    });
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function globalRoot(expression){
    return expression.type==='Identifier'&&globals.has(expression.name);
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function decoderRoot(expression){
    if(expression.type==='Identifier')return expression.name==='TextDecoder';
    return expression.type==='MemberExpression'&&globalRoot(expression.object)&&
      (expression.computed?staticString(expression.property):
        expression.property.type==='Identifier'?expression.property.name:null)==='TextDecoder';
  }
  /** @param {import('./ast').AstNode|undefined} label @returns {boolean} */
  function provedUtf8(label){
    if(label===undefined)return true;
    const value=staticString(label);
    return value!==null&&['utf-8','utf8','unicode-1-1-utf-8'].includes(value.toLowerCase());
  }
  let unproved=false;
  walk(body,(node,parent,key)=>{
    const binding=node.type==='VariableDeclarator'?node.id:
      node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
    const source=node.type==='VariableDeclarator'?node.init:
      node.type==='AssignmentExpression'&&node.operator==='='?node.right:null;
    if(binding?.type==='ObjectPattern'&&source&&globalRoot(source)){
      for(const property of binding.properties){
        if(property.type==='Property'&&
           (property.computed?staticString(property.key):
             property.key.type==='Identifier'?property.key.name:null)==='TextDecoder'){
          unproved=true;
        }
      }
    }
    if(!decoderRoot(node)||node.type==='Identifier'&&(
       isStaticKey(parent,key)||
       parent?.type==='VariableDeclarator'&&key==='id'||
       (parent?.type==='FunctionDeclaration'||parent?.type==='FunctionExpression')&&
         key==='id'))return;
    if(parent?.type==='NewExpression'&&parent.callee===node&&
       parent.arguments.length<=2&&provedUtf8(parent.arguments[0]))return;
    unproved=true;
  });
  return unproved;
}

/**
 * The browser URL constructor and Node's URL constructor both support
 * deterministic parsing, but their static object-URL registries belong to
 * different runtimes. A browser-created blob: URL cannot be replaced by a
 * Node blob:nodedata: URL without changing observable behavior.
 *
 * Admit only direct `new URL(...)` constructor syntax with one bounded,
 * statically valid ASCII HTTP(S) absolute literal, and decline unproved
 * constructor arguments. Node and Chromium can throw different error messages
 * for invalid URLs even though both implement the WHATWG URL Standard.
 * Also decline first-class URL references, constructor aliases and dynamic
 * members; indirect constructor recovery remains outside this bounded proof.
 * @param {import('./ast').AstNode} body
 * @returns {boolean}
 */
function usesUnprovedRelocatedUrlStatic(body){
  /**
   * A direct `new URL(...)` originates in the host URL constructor. The
   * admitted subset contains only local scalar getters and direct toString/
   * toJSON calls; returning or passing URL instances requires a provenance
   * proof that this bounded compiler does not provide.
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function newUrl(node){
    return node.type==='NewExpression'&&node.callee.type==='Identifier'&&
      node.callee.name==='URL';
  }
  /**
   * Admit a deliberately narrow non-throwing URL-construction subset.
   * ASCII HTTP(S) authority labels and unescaped path/query characters
   * avoid runtime input coercion, base resolution, IDNA and invalid-URL
   * exception text. Other legitimate URLs remain conservatively unproved.
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function provenFixedUrl(node){
    if(!newUrl(node)||node.arguments.length!==1)return false;
    const input=node.arguments[0];
    return input.type==='Literal'&&typeof input.value==='string'&&
      /^https?:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?:\/[A-Za-z0-9/_~.?=&-]*)?$/u
        .test(input.value);
  }
  // Propagate simple local aliases without inferring container or call flows.
  const urlInstances=new Set();
  let changed=true;
  while(changed){
    changed=false;
    walk(body,node=>{
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const value=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'&&node.operator==='='?node.right:null;
      if(binding?.type!=='Identifier'||!value)return;
      if((newUrl(value)||value.type==='Identifier'&&urlInstances.has(value.name))&&
         !urlInstances.has(binding.name)){
        urlInstances.add(binding.name);
        changed=true;
      }
    });
  }
  const scalarMembers=new Set(['href','origin','protocol','username',
    'password','host','hostname','port','pathname','search','hash']);
  const invokedMethods=new Set(['toString','toJSON']);
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function urlInstance(node){
    return newUrl(node)||node.type==='Identifier'&&urlInstances.has(node.name);
  }
  let observed=false;
  walk(body,(node,parent,key)=>{
    if(newUrl(node)){
      if(!provenFixedUrl(node))observed=true;
      const directMember=parent?.type==='MemberExpression'&&key==='object';
      const localBinding=parent?.type==='VariableDeclarator'&&key==='init'&&
        parent.id.type==='Identifier';
      const directAssignment=parent?.type==='AssignmentExpression'&&key==='right'&&
        parent.operator==='='&&parent.left.type==='Identifier';
      if(!directMember&&!localBinding&&!directAssignment)observed=true;
    }
    if(node.type==='MemberExpression'&&urlInstance(node.object)){
      const member=node.computed?staticString(node.property):
        node.property.type==='Identifier'?node.property.name:null;
      const scalar=scalarMembers.has(member??'');
      const directInvocation=invokedMethods.has(member??'')&&
        parent?.type==='CallExpression'&&key==='callee'&&
        parent.arguments.length===0;
      const write=parent?.type==='AssignmentExpression'&&key==='left'||
        parent?.type==='UpdateExpression'&&key==='argument'||
        parent?.type==='UnaryExpression'&&parent.operator==='delete';
      if((!scalar&&!directInvocation)||write)observed=true;
    }
    if(node.type==='Identifier'&&urlInstances.has(node.name)&&!isStaticKey(parent,key)){
      const declaration=parent?.type==='VariableDeclarator'&&key==='id';
      const directMember=parent?.type==='MemberExpression'&&key==='object';
      const localAlias=parent?.type==='VariableDeclarator'&&key==='init'&&
        parent.id.type==='Identifier';
      const assignmentAlias=parent?.type==='AssignmentExpression'&&key==='right'&&
        parent.operator==='='&&parent.left.type==='Identifier';
      if(!declaration&&!directMember&&!localAlias&&!assignmentAlias)observed=true;
    }
    if(node.type!=='Identifier'||node.name!=='URL'||isStaticKey(parent,key))return;
    if(parent?.type==='NewExpression'&&key==='callee')return;
    if(key==='id'&&['VariableDeclarator','FunctionDeclaration',
      'FunctionExpression','ClassDeclaration','ClassExpression']
      .includes(parent?.type??''))return;
    observed=true;
  });
  return observed;
}

/**
 * Cross-runtime Web IDL constructors can throw native, host-specific messages
 * for invalid input. Admit a bounded, literal-only, non-throwing subset while
 * refusing first-class or dynamic references that escape this syntax proof.
 * URLSearchParams and Headers have independent Node/browser implementations.
 *
 * @param {import('./ast').AstNode} body
 * @returns {boolean}
 */
function usesUnprovedRelocatedWebIdlConstructors(body){
  const names=new Set(['URLSearchParams','Headers']);
  /** @param {import('./ast').AstNode|null|undefined} value @returns {boolean} */
  function asciiText(value){
    return Boolean(value&&value.type==='Literal'&&
      typeof value.value==='string'&&/^[\x20-\x7e]*$/u.test(value.value));
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function validConstruction(expression){
    if(expression.type!=='NewExpression'||
       expression.callee.type!=='Identifier')return false;
    const name=expression.callee.name;
    if(expression.arguments.length===0)return true;
    if(expression.arguments.length!==1)return false;
    const argument=expression.arguments[0];
    if(name==='URLSearchParams'){
      if(asciiText(argument))return true;
      return argument.type==='ArrayExpression'&&
        argument.elements.every((/** @type {import('./ast').AstNode|null} */ pair)=>
          pair?.type==='ArrayExpression'&&pair.elements.length===2&&
          pair.elements.every((/** @type {import('./ast').AstNode|null} */ value)=>asciiText(value)));
    }
    if(name!=='Headers'||argument.type!=='ObjectExpression')return false;
    return argument.properties.every((/** @type {import('./ast').AstNode} */ property)=>{
      if(property.type!=='Property'||property.computed||
         property.kind!=='init'||property.method||property.shorthand)return false;
      const key=property.key.type==='Identifier'?property.key.name:
        property.key.type==='Literal'&&typeof property.key.value==='string'?
          property.key.value:null;
      return typeof key==='string'&&/^[a-z0-9-]{1,32}$/u.test(key)&&
        asciiText(property.value);
    });
  }
  let unproved=false;
  walk(body,(node,parent,key)=>{
    if(node.type!=='Identifier'||!names.has(node.name)||isStaticKey(parent,key))return;
    if(parent?.type==='NewExpression'&&key==='callee'&&
       validConstruction(parent))return;
    if(parent?.type==='VariableDeclarator'&&key==='id'||parent?.type==='FunctionDeclaration'&&
       key==='id')return;
    unproved=true;
  });
  return unproved;
}

/**
 * Admit only a direct Node.js process.env property read with an explicit
 * static UPPER_SNAKE_CASE key. The private original module runs on the server;
 * this opt-in never copies the environment variable into a client facade.
 * @param {import('./ast').AstNode} expression
 * @returns {boolean}
 */
function isServerEnvironmentRead(expression){
  if(expression.type!=='MemberExpression'||expression.optional)return false;
  const env=expression.object;
  if(env.type!=='MemberExpression'||env.optional||env.computed||
     env.object.type!=='Identifier'||env.object.name!=='process'||
     env.property.type!=='Identifier'||env.property.name!=='env')return false;
  const name=expression.computed?
    (expression.property.type==='Literal'?expression.property.value:null):
    (expression.property.type==='Identifier'?expression.property.name:null);
  return typeof name==='string' && /^[A-Z][A-Z0-9_]*$/u.test(name);
}

/**
 * Refuse known realm-local intrinsic state in split SCO public/private code.
 * Intrinsic prototypes belong to their JavaScript realm, and legacy RegExp
 * match properties store per-realm results of pattern matching. Relocating a
 * match while retaining a corresponding read can silently change behavior.
 * This conservative syntax check makes no whole-program alias guarantee.
 *
 * @param {import('./ast').AstNode} body
 * @param {boolean} [checkHostConfiguration] Only relocated private code inherits a new host configuration.
 * @returns {'prototype'|'RegExp match'|'intrinsic state'|'error stack'|'configuration'|'entropy'|'clock'|null}
 */
function realmStateObservation(body,checkHostConfiguration=false){
  const intrinsicNames=new Set(['Object','Array','Function','String','Number',
    'Boolean','Symbol','BigInt','RegExp','Date','Map','Set','WeakMap','WeakSet',
    'Promise','Error','AggregateError','EvalError','RangeError','ReferenceError',
    'SyntaxError','TypeError','URIError','DOMException','ArrayBuffer','SharedArrayBuffer',
    'DataView','Reflect',
    'Math','JSON','Intl','Atomics','WebAssembly',
    'Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array',
    'Int32Array','Uint32Array','Float32Array','Float64Array','BigInt64Array',
    'BigUint64Array']);
  const reflectorMethods=new Set(['getPrototypeOf','setPrototypeOf',
    'getOwnPropertyDescriptor','getOwnPropertyDescriptors','getOwnPropertyNames',
    'getOwnPropertySymbols','defineProperty','defineProperties','get','set',
    'ownKeys']);
  const globalNames=new Set(['globalThis','window','self','global']);
  /** @type {Map<string,string>} */
  const intrinsicKinds=new Map();
  for(const name of intrinsicNames)intrinsicKinds.set(name,name);
  const immutableMathNumbers=new Set(['E','LN10','LN2','LOG10E','LOG2E','PI','SQRT1_2','SQRT2']);
  const immutableNumberValues=new Set(['EPSILON','MAX_SAFE_INTEGER','MIN_SAFE_INTEGER',
    'MAX_VALUE','MIN_VALUE','NaN','NEGATIVE_INFINITY','POSITIVE_INFINITY']);
  const errorConstructorKinds=new Set(['Error','AggregateError','EvalError',
    'RangeError','ReferenceError','SyntaxError','TypeError','URIError',
    'DOMException','WebAssemblyError']);
  const wasmErrorConstructorNames=new Set(['CompileError','LinkError','RuntimeError']);
  const regexpNames=new Set(['RegExp']);
  const regexpStatics=new Set(['input','$_','lastMatch','$&','lastParen',
    '$+','leftContext','$`','rightContext',"$'",'$1','$2','$3','$4',
    '$5','$6','$7','$8','$9']);
  /** @param {import('./ast').AstNode} node @returns {string|null} */
  function keyName(node){
    if(node.type==='MemberExpression'){
      return node.computed ? staticString(node.property) :
        node.property.type==='Identifier'?node.property.name:null;
    }
    if(node.type==='Property'){
      return node.computed ? staticString(node.key) :
        node.key.type==='Identifier'?node.key.name:staticString(node.key);
    }
    return null;
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function isWebAssemblyRoot(expression){
    return expression.type==='Identifier'&&
        intrinsicKinds.get(expression.name)==='WebAssembly' ||
      expression.type==='MemberExpression'&&
        expression.object.type==='Identifier'&&
        globalNames.has(expression.object.name)&&
        keyName(expression)==='WebAssembly';
  }
  /**
   * Recognize standard immutable numeric constants without assuming all
   * members of Math or Number are primitive. Other intrinsic members may
   * be functions or objects with mutable own properties.
   * @param {import('./ast').AstNode} receiver
   * @param {string} property
   * @returns {boolean}
   */
  function isImmutableNumericProperty(receiver,property){
    const kind=receiver.type==='Identifier'?intrinsicKinds.get(receiver.name):
      receiver.type==='MemberExpression'&&receiver.object.type==='Identifier'&&
      globalNames.has(receiver.object.name)?keyName(receiver):null;
    return kind==='Math'&&immutableMathNumbers.has(property)||
      kind==='Number'&&immutableNumberValues.has(property);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isImmutableNumericMember(node){
    const property=keyName(node);
    return node.type==='MemberExpression'&&property!==null&&
      isImmutableNumericProperty(node.object,property);
  }
  // Track global roots as well as constructor/Reflect aliases. Without
  // this, a private write through `const root=globalThis;root.Math.x=...`
  // may appear independent from a public read of `Math.x`, even though the
  // original module uses one realm and the partition uses two.
  // Alias collection deliberately overapproximates shadowed and reassigned
  // bindings. Such ambiguity causes a safe refusal of the partition.
  let changed=true;
  while(changed){
    changed=false;
    walk(body,node=>{
      /** @param {Set<string>} names @param {string} name @returns {void} */
      function add(names,name){
        if(!names.has(name)){names.add(name);changed=true;}
      }
      if(node.type==='AssignmentExpression'&&node.operator==='='&&
         node.left.type==='Identifier'&&node.right.type==='Identifier'&&
         globalNames.has(node.right.name)){
        add(globalNames,node.left.name);
      }
      if(node.type!=='VariableDeclarator'||!node.init)return;
      // Object, Array, primitive wrappers and functions expose their realm's
      // constructor through an inherited `constructor` key. Unknown owner
      // provenance must not silently turn that key into a harmless local.
      if(node.id.type==='ObjectPattern'){
        for(const property of node.id.properties){
          if(property.type==='Property'&&keyName(property)==='constructor'&&
             property.value.type==='Identifier')add(intrinsicNames,property.value.name);
        }
      }
      if(node.id.type==='ObjectPattern'&&node.init.type==='Identifier'&&
         globalNames.has(node.init.name)){
        for(const property of node.id.properties){
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=keyName(property);
          if(name!==null&&intrinsicNames.has(name)){
            add(intrinsicNames,property.value.name);
            if(!intrinsicKinds.has(property.value.name))intrinsicKinds.set(property.value.name,name);
          }
          if(name==='RegExp')add(regexpNames,property.value.name);
        }
        return;
      }
      if(node.id.type==='ObjectPattern'&&isIntrinsic(node.init)){
        for(const property of node.id.properties){
          if(property.type!=='Property'||property.value.type!=='Identifier')continue;
          const name=keyName(property);
          if(name!==null&&!isImmutableNumericProperty(node.init,name)){
            add(intrinsicNames,property.value.name);
          }
          if(isWebAssemblyRoot(node.init)&&
             wasmErrorConstructorNames.has(name??'')&&
             !intrinsicKinds.has(property.value.name)){
            intrinsicKinds.set(property.value.name,'WebAssemblyError');
            changed=true;
          }
        }
        return;
      }
      if(node.id.type!=='Identifier')return;
      if(node.init.type==='Identifier'&&globalNames.has(node.init.name)){
        add(globalNames,node.id.name);
      }
      if(intrinsicNames.has(node.id.name))return;
      const direct=node.init.type==='Identifier'&&intrinsicNames.has(node.init.name);
      const globalMember=node.init.type==='MemberExpression'&&
        node.init.object.type==='Identifier'&&globalNames.has(node.init.object.name)&&
        intrinsicNames.has(keyName(node.init)??'');
      if(direct||globalMember){
        add(intrinsicNames,node.id.name);
        const kind=direct?intrinsicKinds.get(node.init.name):keyName(node.init);
        if(kind&&!intrinsicKinds.has(node.id.name))intrinsicKinds.set(node.id.name,kind);
      }
      if(node.init.type==='MemberExpression'&&
         (keyName(node.init)==='constructor'||isIntrinsic(node.init.object)&&
          !isImmutableNumericMember(node.init)))add(intrinsicNames,node.id.name);
      if(node.init.type==='MemberExpression'&&isWebAssemblyRoot(node.init.object)&&
         wasmErrorConstructorNames.has(keyName(node.init)??'')&&
         !intrinsicKinds.has(node.id.name)){
        intrinsicKinds.set(node.id.name,'WebAssemblyError');
        changed=true;
      }
      const regexpDirect=node.init.type==='Identifier'&&regexpNames.has(node.init.name);
      const regexpGlobal=node.init.type==='MemberExpression'&&
        node.init.object.type==='Identifier'&&globalNames.has(node.init.object.name)&&
        keyName(node.init)==='RegExp';
      if(regexpDirect||regexpGlobal)add(regexpNames,node.id.name);
    });
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isIntrinsic(node){
    return node.type==='Identifier'&&intrinsicNames.has(node.name)||
      node.type==='MemberExpression'&&node.object.type==='Identifier'&&
      globalNames.has(node.object.name)&&intrinsicNames.has(keyName(node)??'');
  }
  // A tracked alias can refer to Object or Reflect. Declining the same
  // method spelling on other constructor aliases only widens refusals.
  const sensitiveNames=new Set(['prototype','__proto__',...reflectorMethods]);
  /** @param {import('./ast').AstNode} pattern @param {Set<string>} names @returns {boolean} */
  function patternReads(pattern,names){
    return pattern.type==='ObjectPattern'&&pattern.properties.some(
      (/** @type {import('./ast').AstNode} */ property)=>
        property.type==='RestElement'||keyName(property)===null||
        names.has(keyName(property)??''));
  }
  // A selected SCO private export executes on a different host. Date's
  // local-time constructors/getters and Intl's unpinned locale/zone defaults
  // can change a JSON-visible result even if neither realm mutates state.
  // This intentionally refuses certain explicitly pinned Intl operations:
  // proving identical ICU data, locale and timezone across hosts is beyond
  // this syntactic contract. UTC-only Date operations remain eligible.
  const localeConstructors=new Set(['DateTimeFormat','NumberFormat','Collator',
    'PluralRules','RelativeTimeFormat','ListFormat','DisplayNames','Segmenter',
    'DurationFormat','Locale']);
  // ECMAScript's locale-sensitive prototype methods implicitly construct
  // Intl formatters from the executing host's defaults. They can return
  // different JSON-visible strings across client/server locales even if no
  // identifier named Intl appears in the original private body.
  const localePrototypeMethods=new Set(['toLocaleString','toLocaleLowerCase',
    'toLocaleUpperCase','localeCompare']);
  const dateLocalMethods=new Set(['getDate','getDay','getFullYear','getHours',
    'getMilliseconds','getMinutes','getMonth','getSeconds','getTimezoneOffset',
    'getYear','setDate','setFullYear','setHours','setMilliseconds','setMinutes',
    'setMonth','setSeconds','setYear','toString','toDateString','toTimeString',
    'toLocaleString','toLocaleDateString','toLocaleTimeString']);
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function isDateConstructor(expression){
    if(expression.type==='Identifier')return intrinsicKinds.get(expression.name)==='Date';
    return expression.type==='MemberExpression' &&
      expression.object.type==='Identifier' &&
      globalNames.has(expression.object.name) && keyName(expression)==='Date';
  }
  /** @param {import('./ast').AstNode} receiver @returns {boolean} */
  function isIntlNamespace(receiver){
    return receiver.type==='Identifier'&&intrinsicKinds.get(receiver.name)==='Intl' ||
      receiver.type==='MemberExpression' &&
      receiver.object.type==='Identifier' &&
      globalNames.has(receiver.object.name)&&keyName(receiver)==='Intl';
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function isIntlConstructor(expression){
    return expression.type==='MemberExpression' &&
      localeConstructors.has(keyName(expression)??'') &&
      isIntlNamespace(expression.object);
  }
  // ECMA-262 gives each realm's Math.random a distinct pseudorandom
  // sequence. Browser crypto and performance also observe host-specific
  // entropy/clock state that the server does not share with the client.
  /** @type {Map<string,'entropy'|'clock'>} */
  const hostSources=new Map([['crypto','entropy'],['performance','clock']]);
  let sourceChanged=true;
  while(sourceChanged){
    sourceChanged=false;
    walk(body,node=>{
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const initial=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(binding?.type!=='Identifier'||!initial)return;
      const kind=initial.type==='Identifier'?hostSources.get(initial.name):
        initial.type==='MemberExpression' &&
        initial.object.type==='Identifier' &&
        globalNames.has(initial.object.name)?hostSources.get(keyName(initial)??''):undefined;
      if(kind&&!hostSources.has(binding.name)){
        hostSources.set(binding.name,kind);
        sourceChanged=true;
      }
    });
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function isMathRoot(expression){
    return expression.type==='Identifier'&&intrinsicKinds.get(expression.name)==='Math' ||
      expression.type==='MemberExpression' &&
      expression.object.type==='Identifier' &&
      globalNames.has(expression.object.name)&&keyName(expression)==='Math';
  }
  /** @param {import('./ast').AstNode} expression @returns {'entropy'|'clock'|undefined} */
  function hostSourceKind(expression){
    if(expression.type==='Identifier')return hostSources.get(expression.name);
    if(expression.type==='MemberExpression' &&
       expression.object.type==='Identifier' &&
       globalNames.has(expression.object.name)){
      return hostSources.get(keyName(expression)??'');
    }
    return undefined;
  }
  /**
   * Only known intrinsic Error families capture a native call-site stack.
   * A plain JSON record with a field named "stack" remains eligible.
   * @param {import('./ast').AstNode} expression
   * @returns {boolean}
   */
  function isErrorConstructor(expression){
    if(expression.type==='Identifier'){
      return errorConstructorKinds.has(intrinsicKinds.get(expression.name)??'');
    }
    if(expression.type==='MemberExpression'&&
       isWebAssemblyRoot(expression.object)&&
       wasmErrorConstructorNames.has(keyName(expression)??''))return true;
    return expression.type==='MemberExpression'&&
      expression.object.type==='Identifier'&&
      globalNames.has(expression.object.name)&&
      errorConstructorKinds.has(keyName(expression)??'');
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function createsError(expression){
    return (expression.type==='CallExpression'||expression.type==='NewExpression')&&
      isErrorConstructor(expression.callee);
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function pinnedIsoUtcLiteral(expression){
    return expression.type==='Literal' && typeof expression.value==='string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(expression.value);
  }
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function fixedDateConstruction(expression){
    if(expression.type!=='NewExpression'||!isDateConstructor(expression.callee)||
       expression.arguments.length!==1)return false;
    const argument=expression.arguments[0];
    return argument.type==='Literal'&&typeof argument.value==='number' ||
      pinnedIsoUtcLiteral(argument)||argument.type==='CallExpression'&&
      argument.callee.type==='MemberExpression'&&
      isDateConstructor(argument.callee.object)&&keyName(argument.callee)==='UTC';
  }
  // Retain Date-instance origins through simple local aliases. As with the
  // broader intrinsic proof, unrecognized higher-order flows remain outside
  // the verified contract and need independent adversarial tests.
  /** @type {Set<string>} */
  const dateInstances=new Set();
  /** @type {Set<string>} */
  const errorInstances=new Set();
  /** @type {Set<string>} */
  const errorFactories=new Set();
  /** @type {Set<string>} */
  const intlAliases=new Set();
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function returnsError(expression){
    return createsError(expression)||
      expression.type==='Identifier'&&errorInstances.has(expression.name)||
      expression.type==='CallExpression'&&expression.callee.type==='Identifier'&&
        errorFactories.has(expression.callee.name);
  }
  let originChanged=true;
  while(originChanged){
    originChanged=false;
    walk(body,node=>{
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const initial=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      // A direct local function that returns a constructed Error is also an
      // Error origin for its call sites, even if the caller never names Error.
      const factoryFn=node.type==='FunctionDeclaration'?node:
        node.type==='VariableDeclarator'&&node.init&&
        ['FunctionExpression','ArrowFunctionExpression'].includes(node.init.type)?
          node.init:null;
      const factoryName=node.type==='FunctionDeclaration'?node.id?.name:
        node.type==='VariableDeclarator'&&node.id.type==='Identifier'?
          node.id.name:null;
      if(factoryFn&&factoryName){
        let errorReturn=false;
        if(factoryFn.body.type==='BlockStatement'){
          walk(factoryFn.body,(candidate,_parent,_key,ancestors)=>{
            if(candidate.type!=='ReturnStatement'||!candidate.argument||
               ancestors.some((/** @type {import('./ast').AstNode} */ ancestor)=>
                 ['FunctionDeclaration','FunctionExpression',
                   'ArrowFunctionExpression'].includes(ancestor.type)))return;
            if(returnsError(candidate.argument))errorReturn=true;
          });
        }else{
          errorReturn=returnsError(factoryFn.body);
        }
        if(errorReturn&&!errorFactories.has(factoryName)){
          errorFactories.add(factoryName);
          originChanged=true;
        }
      }
      // Destructuring an Intl constructor is an implicit first-class alias.
      // Its default host locale/zone is still observable after extraction.
      if(binding?.type==='ObjectPattern'&&initial&&
         (initial.type==='Identifier'&&intrinsicKinds.get(initial.name)==='Intl'||
          initial.type==='MemberExpression'&&initial.object.type==='Identifier'&&
          globalNames.has(initial.object.name)&&keyName(initial)==='Intl')){
        for(const property of binding.properties){
          if(property.type!=='Property'||property.value.type!=='Identifier'||
             !localeConstructors.has(keyName(property)??''))continue;
          if(!intlAliases.has(property.value.name)){
            intlAliases.add(property.value.name);
            originChanged=true;
          }
        }
      }
      if(binding?.type!=='Identifier'||!initial)return;
      if(initial.type==='NewExpression'&&isDateConstructor(initial.callee)||
         initial.type==='Identifier'&&dateInstances.has(initial.name)){
        if(!dateInstances.has(binding.name)){
          dateInstances.add(binding.name);
          originChanged=true;
        }
      }
      if(initial.type==='Identifier'&&errorFactories.has(initial.name)&&
         !errorFactories.has(binding.name)){
        errorFactories.add(binding.name);
        originChanged=true;
      }
      if(returnsError(initial)){
        if(!errorInstances.has(binding.name)){
          errorInstances.add(binding.name);
          originChanged=true;
        }
      }
      if(isIntlConstructor(initial)||
         initial.type==='Identifier'&&intlAliases.has(initial.name)){
        if(!intlAliases.has(binding.name)){
          intlAliases.add(binding.name);
          originChanged=true;
        }
      }
    });
  }
  // A Date instance passed to another function or container could be used
  // with a local-time getter beyond the syntactically visible call site.
  // Retain a small positive proof for direct UTC-only method invocations.
  const utcDateMethods=new Set(['getTime','valueOf','toISOString','toJSON',
    'getUTCDate','getUTCDay','getUTCFullYear','getUTCHours',
    'getUTCMilliseconds','getUTCMinutes','getUTCMonth','getUTCSeconds']);
  /** @type {Set<import('./ast').AstNode>} */
  const utcDateReceivers=new Set();
  walk(body,node=>{
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       utcDateMethods.has(keyName(node.callee)??'')){
      utcDateReceivers.add(node.callee.object);
    }
  });
  /** @type {Set<string>} */
  const catchBindings=new Set();
  walk(body,node=>{
    if(node.type==='CatchClause'&&node.param?.type==='Identifier'){
      catchBindings.add(node.param.name);
    }
  });
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function isStackReceiver(expression){
    return returnsError(expression)||
      expression.type==='Identifier'&&catchBindings.has(expression.name);
  }
  // Abort APIs synthesize a native DOMException AbortError when no
  // explicitly defined reason is supplied. Its stack captures this host's
  // source filename, just like a directly constructed native DOMException.
  // Carry only simple constructor and controller-instance aliases. Unknown
  // first-class flows remain outside this bounded static proof.
  const abortControllerConstructors=new Set(['AbortController']);
  const abortSignalConstructors=new Set(['AbortSignal']);
  const abortControllers=new Set();
  /** @param {import('./ast').AstNode} receiver @param {Set<string>} aliases @returns {boolean} */
  function isAbortConstructor(receiver,aliases){
    return receiver.type==='Identifier'&&aliases.has(receiver.name)||
      receiver.type==='MemberExpression'&&
        receiver.object.type==='Identifier'&&
        globalNames.has(receiver.object.name)&&
        aliases.has(keyName(receiver)??'');
  }
  let abortAliasesChanged=true;
  while(abortAliasesChanged){
    abortAliasesChanged=false;
    walk(body,node=>{
      const target=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const source=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'&&node.operator==='='?node.right:null;
      if(target?.type!=='Identifier'||!source)return;
      /** @param {Set<string>} names @returns {void} */
      function add(names){
        if(!names.has(target.name)){names.add(target.name);abortAliasesChanged=true;}
      }
      if(isAbortConstructor(source,abortControllerConstructors)){
        add(abortControllerConstructors);
      }
      if(isAbortConstructor(source,abortSignalConstructors)){
        add(abortSignalConstructors);
      }
      if(source.type==='Identifier'&&abortControllers.has(source.name)||
         source.type==='NewExpression'&&
         isAbortConstructor(source.callee,abortControllerConstructors)){
        add(abortControllers);
      }
    });
  }
  /** @param {import('./ast').AstNode} value @returns {boolean} */
  function provedAbortReason(value){
    return value.type==='Literal'&&value.regex===undefined&&
      (value.value===null||
        ['string','number','boolean','bigint'].includes(typeof value.value));
  }
  let stackTouched=false;
  let configurationTouched=false;
  let entropyTouched=false;
  let clockTouched=false;
  let prototypeTouched=false;
  let regexpTouched=false;
  let intrinsicTouched=false;
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function rootedInIntrinsic(node){
    return isIntrinsic(node)||node.type==='MemberExpression'&&
      (keyName(node)==='constructor'||rootedInIntrinsic(node.object));
  }
  /** @param {import('./ast').AstNode} member @returns {boolean} */
  function writesIntrinsic(member){
    return member.type==='MemberExpression'&&rootedInIntrinsic(member.object);
  }
  walk(body,(node,parent,key,ancestors)=>{
    // Extracted host abort methods can later be invoked via .call/.apply,
    // a local alias, or an opaque callback. Unlike a proven direct call with
    // a primitive reason, their eventual default-reason behavior is unproved.
    if(node.type==='MemberExpression'&&keyName(node)==='abort'&&
       !(parent?.type==='CallExpression'&&parent.callee===node)){
      const receiver=node.object;
      if(isAbortConstructor(receiver,abortSignalConstructors)||
         receiver.type==='Identifier'&&abortControllers.has(receiver.name)||
         receiver.type==='NewExpression'&&
         isAbortConstructor(receiver.callee,abortControllerConstructors)){
        stackTouched=true;
      }
    }
    // Both AbortController#abort and AbortSignal.abort can synthesize a
    // source-location-bearing DOMException when no proven defined reason is
    // supplied. Unknown argument expressions may evaluate to undefined.
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
       keyName(node.callee)==='abort'&&
       !(node.arguments.length===1&&provedAbortReason(node.arguments[0]))){
      const receiver=node.callee.object;
      if(isAbortConstructor(receiver,abortSignalConstructors)||
         receiver.type==='Identifier'&&abortControllers.has(receiver.name)||
         receiver.type==='NewExpression'&&
         isAbortConstructor(receiver.callee,abortControllerConstructors)){
        stackTouched=true;
      }
    }
    // Destructuring directly in a catch parameter reads the thrown Error's
    // realm-local stack without introducing an identifier receiver. The
    // computed-key case can resolve to "stack" at runtime.
    if(node.type==='CatchClause'&&node.param?.type==='ObjectPattern'&&
       node.param.properties.some(
         (/** @type {import('./ast').AstNode} */ property)=>
           property.type==='Property'&&
           (keyName(property)==='stack'||keyName(property)===null))){
      stackTouched=true;
    }
    // An Error origin passed to an opaque call or wrapped in a first-class
    // container can later expose .stack through a different receiver. Proven
    // direct name/message reads and simple local aliases stay eligible.
    if(returnsError(node)&&parent&&
       (parent.type==='Property'&&key==='value'||
        parent.type==='ArrayExpression'&&key==='elements'||
        (parent.type==='CallExpression'||parent.type==='NewExpression')&&
          key==='arguments')){
      stackTouched=true;
    }
    // A locale-dependent method may be extracted and invoked later through
    // Function.call/apply, an alias, or a callback. Inspect the member
    // reference itself rather than requiring a direct CallExpression.
    if(node.type==='MemberExpression'){
      const member=keyName(node);
      if(isMathRoot(node.object)&&member==='random')entropyTouched=true;
      // Intl.supportedValuesOf exposes the executing host's ICU/CLDR data.
      // Browser and Node may enumerate different currencies or collations.
      if(isIntlNamespace(node.object)&&member==='supportedValuesOf'){
        configurationTouched=true;
      }
      // Error.stack captures source filenames and call-site coordinates.
      // These change when selected SCO moves work into a server module.
      if((member==='stack'||member===null)&&isStackReceiver(node.object)){
        stackTouched=true;
      }
      if(isErrorConstructor(node.object)&&
         ['captureStackTrace','prepareStackTrace','stackTraceLimit'].includes(member??'')){
        stackTouched=true;
      }
      // Extracted Date.now/parse functions can run under a different clock or
      // timezone. Keep the direct, pinned-ISO Date.parse positive exception.
      if(isDateConstructor(node.object)&&
         (member==='now'||member==='parse')&&
         !(parent?.type==='CallExpression'&&parent.callee===node&&
           member==='parse'&&parent.arguments.length===1&&
           pinnedIsoUtcLiteral(parent.arguments[0]))){
        configurationTouched=true;
      }
      // Calling or binding an intrinsic constructor through Function methods
      // bypasses the direct invocation check. Its eventual host is unproved.
      if(['bind','call','apply'].includes(member??'')&&
         (isDateConstructor(node.object)||isIntlConstructor(node.object)||
          node.object.type==='Identifier'&&intlAliases.has(node.object.name))){
        configurationTouched=true;
      }
      const hostKind=hostSourceKind(node.object);
      if(hostKind==='entropy')entropyTouched=true;
      if(hostKind==='clock')clockTouched=true;
      if(localePrototypeMethods.has(member??''))configurationTouched=true;
      if(member==='supportedLocalesOf'&&
         (isIntlConstructor(node.object)||
          node.object.type==='Identifier'&&intlAliases.has(node.object.name))){
        configurationTouched=true;
      }
    }
    // Extracting a random function or a host timing/crypto function through
    // destructuring has the same cross-realm effect as a direct member read.
    // Include assignment patterns and global-object destructuring aliases.
    const pattern=node.type==='VariableDeclarator'?node.id:
      node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
    const source=node.type==='VariableDeclarator'?node.init:
      node.type==='AssignmentExpression'&&node.operator==='='?node.right:null;
    if(pattern?.type==='ObjectPattern'&&source){
      // Destructuring the host-data function is equivalent to reading it
      // directly; static computed keys are included in keyName().
      if(isIntlNamespace(source)&&pattern.properties.some(
        (/** @type {import('./ast').AstNode} */ property)=>
          property.type!=='Property'||keyName(property)===null||
          keyName(property)==='supportedValuesOf')){
        configurationTouched=true;
      }
      if(isStackReceiver(source)&&pattern.properties.some(
        (/** @type {import('./ast').AstNode} */ property)=>
          property.type!=='Property'||keyName(property)==='stack'||
          keyName(property)===null)){
        stackTouched=true;
      }
      const properties=pattern.properties.filter(
        (/** @type {import('./ast').AstNode} */ property)=>property.type==='Property');
      if(isMathRoot(source)&&properties.some(
        (/** @type {import('./ast').AstNode} */ property)=>keyName(property)==='random')){
        entropyTouched=true;
      }
      if(isDateConstructor(source)&&properties.some(
        (/** @type {import('./ast').AstNode} */ property)=>
          ['now','parse'].includes(keyName(property)??''))){
        configurationTouched=true;
      }
      const origin=hostSourceKind(source);
      if(origin==='entropy')entropyTouched=true;
      if(origin==='clock')clockTouched=true;
      if(source.type==='Identifier'&&globalNames.has(source.name)){
        if(properties.some(
          (/** @type {import('./ast').AstNode} */ property)=>keyName(property)==='crypto')){
          entropyTouched=true;
        }
        if(properties.some(
          (/** @type {import('./ast').AstNode} */ property)=>keyName(property)==='performance')){
          clockTouched=true;
        }
      }
    }
    if((node.type==='CallExpression'||node.type==='NewExpression')&&
       (isIntlConstructor(node.callee)||
         node.callee.type==='Identifier'&&intlAliases.has(node.callee.name))) {
      configurationTouched=true;
    }
    if(node.type==='CallExpression'&&isDateConstructor(node.callee)) {
      // Calling Date as an ordinary function always formats the host clock.
      configurationTouched=true;
    }
    if(node.type==='NewExpression'&&isDateConstructor(node.callee)&&
       !fixedDateConstruction(node))configurationTouched=true;
    // Whitelisted UTC reads must retain the Date receiver locally. A
    // function argument, returned Date, container element or method extraction
    // can otherwise apply a timezone-dependent operation beyond this scan.
    if(node.type==='NewExpression'&&isDateConstructor(node.callee)&&
       !(parent?.type==='VariableDeclarator'&&parent.init===node&&
         parent.id.type==='Identifier')&&!utcDateReceivers.has(node)){
      configurationTouched=true;
    }
    if(node.type==='Identifier'&&dateInstances.has(node.name)&&
       !(parent?.type==='VariableDeclarator'&&
         (parent.id===node||parent.init===node&&
           parent.id.type==='Identifier'&&dateInstances.has(parent.id.name)))&&
       !(parent?.type==='AssignmentExpression'&&
         (parent.left===node||parent.right===node&&
           parent.left.type==='Identifier'&&dateInstances.has(parent.left.name)))&&
       !utcDateReceivers.has(node)&&!isStaticKey(parent,key)){
      configurationTouched=true;
    }
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'){
      const method=keyName(node.callee);
      if(isDateConstructor(node.callee.object)&&
         (method==='now'||method==='parse'&&
           !(node.arguments.length===1&&pinnedIsoUtcLiteral(node.arguments[0])))){
        configurationTouched=true;
      }
      const receiver=node.callee.object;
      if(dateLocalMethods.has(method??'')&&
         (receiver.type==='NewExpression'&&isDateConstructor(receiver.callee)||
          receiver.type==='Identifier'&&dateInstances.has(receiver.name))) {
        configurationTouched=true;
      }
    }
    // A builtin identity copied into an array/object, returned or passed to
    // an opaque function can be mutated through that carrier without any
    // syntactically direct write to Math/JSON/etc. Decline such first-class
    // escapes rather than silently splitting their state between realms.
    // Direct member access, direct invocation and simple recognized aliases
    // retain their existing, more precise write/read checks.
    if((isIntrinsic(node)||node.type==='Identifier'&&globalNames.has(node.name)&&
      !['window','self','global'].includes(node.name))&&
       parent&&!isStaticKey(parent,key)&&
       !(parent.type==='MemberExpression'&&key==='object')&&
       !(parent.type==='VariableDeclarator'&&
         (key==='id'||key==='init'&&
           (parent.id.type==='Identifier'||parent.id.type==='ObjectPattern')))&&
       !(parent.type==='CallExpression'&&key==='callee')&&
       !(parent.type==='NewExpression'&&key==='callee')&&
       !(key==='id'&&['FunctionDeclaration','FunctionExpression','ClassDeclaration',
         'ClassExpression'].includes(parent.type))&&
       !(parent.type==='Property'&&key==='value'&&
         ancestors.some(ancestor=>ancestor.type==='ObjectPattern'))){
      intrinsicTouched=true;
    }
    // A method such as Math.imul or JSON.stringify is itself a mutable
    // first-class function object. Direct invocation is permitted. Sending
    // that object to an unknown consumer or returning it from a private RPC
    // can reveal separated identity or mutable intrinsic state.
    if(node.type==='MemberExpression'&&isIntrinsic(node.object)&&
       !isImmutableNumericMember(node)&&parent&&
       !(parent.type==='MemberExpression'&&key==='object')&&
       !(parent.type==='VariableDeclarator'&&key==='init'&&parent.id.type==='Identifier')&&
       !(parent.type==='CallExpression'&&key==='callee')&&
       !(parent.type==='NewExpression'&&key==='callee')){
      intrinsicTouched=true;
    }
    if(node.type==='MemberExpression'){
      const key=keyName(node);
      if(key==='prototype'||key==='__proto__'||isIntrinsic(node.object)&&key===null)prototypeTouched=true;
      if(isIntrinsic(node.object)&&reflectorMethods.has(key??''))prototypeTouched=true;
      if(node.object.type==='Identifier'&&regexpNames.has(node.object.name)&&
         regexpStatics.has(key??''))regexpTouched=true;
    }
    if(node.type==='VariableDeclarator'&&node.init&&isIntrinsic(node.init)&&
       patternReads(node.id,sensitiveNames))prototypeTouched=true;
    // Nested/defaulted destructuring from an intrinsic can expose a host
    // constructor or mutable method without a locally provable alias.
    if(node.type==='VariableDeclarator'&&node.init&&isIntrinsic(node.init)&&
       node.id.type==='ObjectPattern'&&node.id.properties.some(
         (/** @type {import('./ast').AstNode} */ property)=>
           property.type!=='Property'||property.value.type!=='Identifier'&&
           !(property.value.type==='AssignmentPattern'&&
             property.value.left.type==='Identifier'&&
             isImmutableNumericProperty(node.init,keyName(property)??'')))){
      // A default for a frozen Math/Number numeric constant is unreachable
      // under the same pristine-intrinsic assumption as direct numeric reads.
      // All other defaulted or nested intrinsic destructuring remains unproved.
      intrinsicTouched=true;
    }
    // A nested or defaulted binding pattern can silently extract a builtin
    // function, object, or prototype from the global object. Flat simple
    // aliases are tracked above, but deep patterns need a real provenance
    // analysis before we could safely admit them.
    if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
       node.id.properties.some((/** @type {import('./ast').AstNode} */ property)=>
         property.type==='Property'&&keyName(property)==='constructor'&&
         property.value.type!=='Identifier'))intrinsicTouched=true;
    if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
       node.init?.type==='Identifier'&&globalNames.has(node.init.name)){
      for(const property of node.id.properties){
        if(property.type!=='Property')continue;
        const name=keyName(property);
        if(name!==null&&intrinsicNames.has(name)&&property.value.type!=='Identifier'){
          intrinsicTouched=true;
        }
      }
    }
    if(node.type==='AssignmentExpression'&&isIntrinsic(node.right)&&
       patternReads(node.left,sensitiveNames))prototypeTouched=true;
    if(node.type==='AssignmentExpression'&&writesIntrinsic(node.left)||
       node.type==='UpdateExpression'&&writesIntrinsic(node.argument)||
       node.type==='UnaryExpression'&&node.operator==='delete'&&
         writesIntrinsic(node.argument))intrinsicTouched=true;
    if(node.type==='CallExpression'&&node.arguments.length&&
       node.callee.type==='MemberExpression'&&
       node.callee.object.type==='Identifier'&&
       node.callee.object.name==='Object'&&
       ['assign','freeze','seal','preventExtensions'].includes(keyName(node.callee)??'')&&
       isIntrinsic(node.arguments[0]))intrinsicTouched=true;
  });
  return prototypeTouched?'prototype':regexpTouched?'RegExp match':
    intrinsicTouched?'intrinsic state':stackTouched?'error stack':
    checkHostConfiguration&&entropyTouched?'entropy':
    checkHostConfiguration&&clockTouched?'clock':
    checkHostConfiguration&&configurationTouched?'configuration':null;
}

/**
 * An opt-in project import must resolve to one canonical child path under the
 * source filename's own directory. This rejects URL query/fragment aliases,
 * percent encoding, traversal, ambiguous spelling, and unsafe platform names.
 * Only the original trusted Node server loads this source dependency.
 * @param {string} sourcePath
 * @param {string} specifier
 * @returns {boolean}
 */
function isCanonicalPrivateModulePath(sourcePath,specifier){
  if(!specifier.startsWith('./')||/[\\%?#]/u.test(specifier))return false;
  const directory=path.posix.dirname(sourcePath);
  const resolved=path.posix.normalize(path.posix.join(directory,specifier));
  if(resolved===sourcePath||!/\.mjs$/u.test(resolved))return false;
  try{safePath(resolved);}catch{return false;}
  return './'+path.posix.relative(directory,resolved)===specifier;
}

/**
 * Audit the static ESM import/reexport closure of an explicitly supplied
 * server-private source graph. Runtime-loaded modules are unsupported here:
 * callers must either avoid them or list their paths separately as private.
 * This protects against accidentally serving transitive source files; it does
 * not establish cross-realm semantic equivalence or prove absence of loaders.
 *
 * @param {string[]} directPaths
 * @param {ScoPrivateModuleSource[]} sources
 * @returns {string[]}
 */
function collectPrivateStaticImportClosure(directPaths,sources) {
  /** @type {Map<string,string>} */
  const sourceByPath=new Map();
  const caseNames=new Set();
  for(const source of sources) {
    if(!source || typeof source.path!=='string' || typeof source.code!=='string') {
      throw new TypeError('SCO privateModuleSources must contain {path,code} modules');
    }
    const name=safePath(source.path);
    const caseName=name.toLowerCase();
    if(!/\.mjs$/u.test(name) || caseNames.has(caseName)) {
      throw new TypeError('SCO privateModuleSources requires distinct .mjs paths');
    }
    caseNames.add(caseName);
    sourceByPath.set(name,source.code);
  }
  const discovered=new Set();
  const pending=[...directPaths];
  while(pending.length) {
    const filename=/** @type {string} */ (pending.pop());
    if(discovered.has(filename))continue;
    const code=sourceByPath.get(filename);
    if(code===undefined) {
      throw new TypeError('SCO private static dependency source missing: '+filename);
    }
    discovered.add(filename);
    const ast=parse(code,'module');
    // The source snapshot lets us apply the same bounded intrinsic-state
    // refusal used for directly partitioned functions to imported modules.
    const realmEffect=realmStateObservation(ast,true);
    if(realmEffect) {
      throw new TypeError('SCO private static dependency contains realm-local '+realmEffect+' access: '+filename);
    }
    // Plain global-object mutation is also observable by a retained client
    // function in the original shared realm. Overapproximate simple aliases
    // and reject direct writes rather than trusting a server-only side effect.
    // Node's process is an ambient module-loader capability, not an inert
    // private value: getBuiltinModule('module') gives createRequire without
    // spelling a static node:module import or the require identifier.
    const globalRoots=new Set(['globalThis','window','self','global','process']);
    let aliasesChanged=true;
    while(aliasesChanged) {
      aliasesChanged=false;
      walk(ast,node=>{
        const binding=node.type==='VariableDeclarator'&&node.id.type==='Identifier'?node.id:
          node.type==='AssignmentExpression'&&node.operator==='='&&
            node.left.type==='Identifier'?node.left:null;
        const initial=node.type==='VariableDeclarator'?node.init:
          node.type==='AssignmentExpression'?node.right:null;
        if(binding&&initial&&
           (initial.type==='Identifier'||initial.type==='MemberExpression')&&
           rootedInGlobal(initial)&&!isServerEnvironmentRead(initial)&&
           !globalRoots.has(binding.name)){
          globalRoots.add(binding.name);
          aliasesChanged=true;
        }
      });
    }
    /** @param {import('./ast').AstNode} node @returns {boolean} */
    function rootedInGlobal(node) {
      return node.type==='Identifier'&&globalRoots.has(node.name) ||
        node.type==='MemberExpression'&&rootedInGlobal(node.object);
    }
    // Console output and debugger breakpoints would move from the original
    // client realm to the SCO server when this dependency is partitioned.
    // A value-return-only comparison does not observe that semantic change.
    // Leave property labels named "console" usable on private local records.
    walk(ast,(node,parent,key)=>{
      if(node.type==='DebuggerStatement'){
        throw new TypeError('SCO private static dependency cannot migrate debugger host effects: '+filename);
      }
      const consoleReference=node.type==='Identifier'&&node.name==='console'&&
        !isStaticKey(parent,key)&&
        !(parent?.type==='VariableDeclarator'&&key==='id')&&
        !(parent?.type==='FunctionDeclaration'&&key==='id');
      const globalConsoleMember=node.type==='MemberExpression'&&
        rootedInGlobal(node.object)&&
        (node.computed?staticString(node.property):
          node.property.type==='Identifier'?node.property.name:null)==='console';
      if(consoleReference||globalConsoleMember){
        throw new TypeError('SCO private static dependency cannot migrate console host effects: '+filename);
      }
    });
    if(usesUnprovedCrossRealmHostApi(ast)){
      throw new TypeError(
        'SCO private static dependency contains unproved cross-realm host API: '+filename);
    }
    if(usesUnprovedRelocatedTextDecoder(ast)){
      throw new TypeError(
        'SCO private static dependency contains unproved cross-realm text decoding: '+filename);
    }
    // Private transitive ESM leaf functions execute in the same relocated
    // Node host as selected exports, including native URL failure paths.
    if(usesUnprovedRelocatedUrlStatic(ast)){
      throw new TypeError(
        'SCO private static dependency uses unproved cross-realm object URL API: '+filename);
    }
    if(usesUnprovedRelocatedWebIdlConstructors(ast)){
      throw new TypeError(
        'SCO private static dependency uses unproved cross-realm WebIDL constructor: '+filename);
    }
    // Browser-owned values may differ or be absent in the trusted Node
    // process. Only the original caller can establish its own window,
    // document, navigation and application-level global state.
    // Keep known ECMAScript global names outside this narrow host check;
    // realmStateObservation handles their mutable intrinsic hazards.
    const browserOnlyGlobals=browserOnlyRoots;
    // A unique module-scope const literal supplies an owned primitive even
    // when its spelling matches a browser global. Nested same-name bindings
    // stay unproved: syntax-only name resolution cannot safely unify them.
    const localBindings=collectBindings(ast);
    const provenModuleOwnedBrowserNames=new Set();
    const provenModuleTypeofNames=new Set();
    for(const statement of ast.body){
      if(statement.type==='ImportDeclaration'){
        for(const specifier of statement.specifiers){
          if(specifier.local?.type==='Identifier'&&
             localBindings.get(specifier.local.name)===1){
            provenModuleTypeofNames.add(specifier.local.name);
          }
        }
      }
      const declaration=statement.type==='VariableDeclaration'?statement:
        statement.type==='ExportNamedDeclaration'?statement.declaration:null;
      if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const')continue;
      for(const item of declaration.declarations){
        if(item.id.type!=='Identifier'||!isProvedTypeofLiteral(item.init)||
           localBindings.get(item.id.name)!==1)continue;
        provenModuleTypeofNames.add(item.id.name);
        if(browserOnlyGlobals.has(item.id.name)){
          provenModuleOwnedBrowserNames.add(item.id.name);
        }
      }
    }
    const standardGlobalKeys=new Set([
      'Infinity','NaN','undefined','eval','isFinite','isNaN','process',
      'parseFloat','parseInt','decodeURI','decodeURIComponent',
      'encodeURI','encodeURIComponent','Array','Boolean','Date','Error',
      'Function','JSON','Math','Number','Object','RegExp','String','Symbol',
      'BigInt','Promise','Map','Set','WeakMap','WeakSet','Reflect','Proxy',
      'Intl','ArrayBuffer','SharedArrayBuffer','DataView','Atomics',
      'WebAssembly','Uint8Array','Int8Array','Uint8ClampedArray',
      'Int16Array','Uint16Array','Int32Array','Uint32Array',
      'Float32Array','Float64Array','BigInt64Array','BigUint64Array',
      'AggregateError','EvalError','RangeError','ReferenceError',
      'SyntaxError','TypeError','URIError'
    ]);
    const directGlobalObjects=new Set(['globalThis','global']);
    let globalAliasChanged=true;
    while(globalAliasChanged){
      globalAliasChanged=false;
      walk(ast,node=>{
        const binding=node.type==='VariableDeclarator'?node.id:
          node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
        const value=node.type==='VariableDeclarator'?node.init:
          node.type==='AssignmentExpression'&&node.operator==='='?node.right:null;
        if(binding?.type==='Identifier'&&value?.type==='Identifier'&&
           directGlobalObjects.has(value.name)&&!directGlobalObjects.has(binding.name)){
          directGlobalObjects.add(binding.name);
          globalAliasChanged=true;
        }
      });
    }
    walk(ast,(node,parent,key)=>{
      if(node.type==='Identifier'&&browserOnlyGlobals.has(node.name)&&
         !provenModuleOwnedBrowserNames.has(node.name)&&
         !isStaticKey(parent,key)&&
         !(parent?.type==='VariableDeclarator'&&key==='id')&&
         !(parent?.type==='FunctionDeclaration'&&key==='id')){
        throw new TypeError('SCO private static dependency has unproved client host state: '+filename);
      }
      if(node.type==='MemberExpression'&&node.object.type==='Identifier'&&
         directGlobalObjects.has(node.object.name)&&
         !(parent?.type==='AssignmentExpression'&&key==='left')&&
         !(parent?.type==='UpdateExpression'&&key==='argument')&&
         !(parent?.type==='UnaryExpression'&&parent.operator==='delete'&&key==='argument')&&
         !((parent?.type==='CallExpression'||parent?.type==='NewExpression')&&key==='callee')){
        const member=node.computed?staticString(node.property):
          node.property.type==='Identifier'?node.property.name:null;
        if(member===null||!standardGlobalKeys.has(member)){
          throw new TypeError('SCO private static dependency reads unproved application global: '+filename);
        }
      }
    });
    const freeTypeof=firstUnprovedTypeofReference(ast,localBindings,
      provenModuleTypeofNames,new Set());
    if(freeTypeof!==null){
      throw new TypeError('SCO private static dependency has unproved free typeof reference: '+
        filename+':'+freeTypeof);
    }
    walk(ast,node=>{
      // Destructuring can carry process.getBuiltinModule or a global root
      // into an untracked binding. Refuse these opaque first-class escapes.
      if(node.type==='VariableDeclarator'&&node.id.type!=='Identifier'&&
           node.init&&rootedInGlobal(node.init) ||
         node.type==='AssignmentExpression'&&node.left.type==='ObjectPattern'&&
           rootedInGlobal(node.right) ||
         node.type==='AssignmentExpression'&&rootedInGlobal(node.left) ||
         node.type==='UpdateExpression'&&rootedInGlobal(node.argument) ||
         node.type==='UnaryExpression'&&node.operator==='delete'&&
           rootedInGlobal(node.argument) ||
         (node.type==='CallExpression'||node.type==='NewExpression') &&
           (rootedInGlobal(node.callee) ||
            node.arguments.some((/** @type {import('./ast').AstNode} */ arg)=>rootedInGlobal(arg)))){
        // Passing a global root or its member to an opaque function may write
        // state through first-class APIs such as Object.assign/Reflect.set.
        throw new TypeError('SCO private static dependency writes or escapes cross-realm global state: '+filename);
      }
    });
    // Node exposes a synchronous builtin loader via process.getBuiltinModule,
    // which can obtain node:module without a static ESM import. It can be
    // aliased through local bindings and object destructuring, so treat this
    // capability as unproved even when no dynamic import appears in the AST.
    const processRoots=new Set(['process']);
    let processAliasChanged=true;
    while(processAliasChanged){
      processAliasChanged=false;
      walk(ast,node=>{
        const id=node.type==='VariableDeclarator'?node.id:
          node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
        const init=node.type==='VariableDeclarator'?node.init:
          node.type==='AssignmentExpression'?node.right:null;
        if(id?.type!=='Identifier'||!init)return;
        const processAlias=init.type==='Identifier'&&processRoots.has(init.name)||
          init.type==='MemberExpression'&&
          init.object.type==='Identifier'&&globalRoots.has(init.object.name)&&
          (init.computed?staticString(init.property):init.property.name)==='process';
        if(processAlias&&!processRoots.has(id.name)){
          processRoots.add(id.name);
          processAliasChanged=true;
        }
      });
    }
    const nodeLoaderKeys=new Set(['getBuiltinModule','mainModule',
      'dlopen','binding','_linkedBinding']);
    walk(ast,node=>{
      if(node.type==='MemberExpression'&&node.object.type==='Identifier'&&
         processRoots.has(node.object.name)&&
         nodeLoaderKeys.has((node.computed?staticString(node.property):node.property.name)??'')){
        throw new TypeError('SCO private static graph contains an unproved Node process loader: '+filename);
      }
      if(node.type==='VariableDeclarator'&&node.id.type==='ObjectPattern'&&
         node.init?.type==='Identifier'&&processRoots.has(node.init.name)&&
         node.id.properties.some((/** @type {import('./ast').AstNode} */ property)=>
           property.type==='Property'&&
           nodeLoaderKeys.has((property.computed?
             staticString(property.key):property.key.name??staticString(property.key))??''))){
        throw new TypeError('SCO private static graph destructures an unproved Node process loader: '+filename);
      }
    });
    // Constructor is a loader capability even when reached without a
    // Function/eval/ImportExpression AST node. Track simple literal-key and
    // callable aliases across the file, deliberately overapproximating
    // shadowed names so ambiguous bindings cause a safe decline.
    const constructorKeyAliases=new Set();
    const callableAliases=new Set();
    /** @param {import('./ast').AstNode} expression @returns {boolean} */
    function isConstructorKey(expression){
      if(staticString(expression)==='constructor')return true;
      if(expression.type==='Identifier')return constructorKeyAliases.has(expression.name);
      if(expression.type!=='TemplateLiteral')return false;
      let text='';
      for(let i=0;i<expression.quasis.length;i++){
        const chunk=expression.quasis[i]?.value.cooked;
        if(typeof chunk!=='string')return false;
        text+=chunk;
        if(i<expression.expressions.length){
          const part=staticString(expression.expressions[i]);
          if(part===null)return false;
          text+=part;
        }
      }
      return text==='constructor';
    }
    let constructorAliasChanged=true;
    while(constructorAliasChanged){
      constructorAliasChanged=false;
      walk(ast,node=>{
        if(node.type==='FunctionDeclaration'&&node.id?.type==='Identifier'&&
           !callableAliases.has(node.id.name)){
          callableAliases.add(node.id.name);
          constructorAliasChanged=true;
        }
        const binding=node.type==='VariableDeclarator'?node.id:
          node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
        const initializer=node.type==='VariableDeclarator'?node.init:
          node.type==='AssignmentExpression'?node.right:null;
        if(binding?.type!=='Identifier'||!initializer)return;
        if(isConstructorKey(initializer)&&!constructorKeyAliases.has(binding.name)){
          constructorKeyAliases.add(binding.name);
          constructorAliasChanged=true;
        }
        if((initializer.type==='FunctionExpression'||
            initializer.type==='ArrowFunctionExpression'||
            initializer.type==='Identifier'&&callableAliases.has(initializer.name))&&
           !callableAliases.has(binding.name)){
          callableAliases.add(binding.name);
          constructorAliasChanged=true;
        }
      });
    }
    walk(ast,(node,parent)=>{
      const constructorMember=node.type==='MemberExpression'&&
        (node.computed?isConstructorKey(node.property):node.property.name==='constructor');
      const constructorPattern=node.type==='Property'&&
        parent?.type==='ObjectPattern'&&
        (node.computed?isConstructorKey(node.key):
          node.key.name==='constructor'||staticString(node.key)==='constructor');
      // An unknown computed property of a syntactically known callable may
      // itself resolve to inherited constructor. Numeric/boolean/null literals
      // and exact non-constructor strings cannot resolve to that key.
      const unprovedCallableKey=node.type==='MemberExpression'&&node.computed&&
        !constructorMember&&staticString(node.property)===null&&
        !(node.property.type==='Literal'&&
          ['number','boolean'].includes(typeof node.property.value))&&
        !(node.property.type==='Literal'&&node.property.value===null)&&
        (node.object.type==='FunctionExpression'||
         node.object.type==='ArrowFunctionExpression'||
         node.object.type==='Identifier'&&callableAliases.has(node.object.name));
      if(constructorMember||constructorPattern||unprovedCallableKey){
        throw new TypeError('SCO private static graph contains an unproved runtime loader via constructor: '+filename);
      }
    });
    walk(ast,(node,parent,key)=>{
      // Direct and first-class references to dynamic-source constructors,
      // including "new Function" and aliases, are outside this static model.
      if(node.type==='ImportExpression' ||
         node.type==='Identifier' && ['require','eval','Function'].includes(node.name) &&
           !isStaticKey(parent,key) ||
         node.type==='MetaProperty') {
        throw new TypeError('SCO private static graph contains an unproved runtime loader: '+filename);
      }
    });
    for(const statement of ast.body) {
      const imported=statement.type==='ImportDeclaration' ||
        statement.type==='ExportAllDeclaration' ||
        statement.type==='ExportNamedDeclaration' && statement.source;
      if(!imported)continue;
      const specifier=statement.source?.value;
      if(typeof specifier!=='string') {
        throw new TypeError('SCO private static dependency has an invalid import: '+filename);
      }
      if(specifier.startsWith('node:') && isBuiltin(specifier)) {
        // These builtins can resolve or evaluate unlisted source through
        // aliases and nested calls. A complete static module manifest cannot
        // be inferred when their loaders are available in the private graph.
        if(['node:module','node:vm','node:worker_threads','node:child_process','node:process']
            .includes(specifier)) {
          throw new TypeError('SCO private static graph cannot audit dynamic Node loader: '+specifier);
        }
        continue;
      }
      if(!isCanonicalPrivateModulePath(filename,specifier)) {
        throw new TypeError('SCO private static dependency must use canonical relative .mjs imports: '+filename);
      }
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(filename),specifier));
      pending.push(resolved);
    }
  }
  if(discovered.size!==sourceByPath.size) {
    throw new TypeError('SCO privateModuleSources must describe exactly the reachable static graph');
  }
  return [...discovered].sort();
}

/**
 * Replace selected async ESM exports with authenticated SCO RPC facades while
 * preserving explicitly reviewed public function exports verbatim. The module
 * must consist only of direct named function exports or single-function const
 * exports, plus local non-generator function declarations or immutable function
 * expressions (including async helpers), and unexported primitive constants. Helpers
 * remain private unless listed explicitly in publicHelperNames. A server-only
 * helper cannot escape as a function value or be called from public code.
 * An explicit opt-in admits direct process.env uppercase-key reads, refusing public
 * ambient-global access. Imports, reexports, public data exports,
 * effects in module initializers and public reads of private state are refused.
 * With explicit allowServerImports, named imports from Node builtin modules
 * may remain server-only. Exact opt-in privateModuleImports permits canonical
 * relative .mjs child paths, provided no public function uses their bindings.
 *
 * This deliberate limited contract keeps private bodies off the client while
 * local public functions may call selected private functions asynchronously.
 * It does not relocate arbitrary browser state or preserve source introspection,
 * exceptions, or non-JSON RPC values. Server namespaces are still bound with
 * bindScoModuleExports; the original module remains server-only.
 *
 * @param {{path:string,code:string,sourceType?:'module'}} file
 * @param {ScoSelectiveOptions} options
 * @returns {ScoSelectivePartition}
 */
function partitionScoSelectedAsyncExports(file,options) {
  // Capture compiler inputs once. Accessor-backed source records may otherwise
  // supply different code for AST auditing, digest commitments and emission.
  if(file&&typeof file==='object') {
    file={path:file.path,code:file.code,sourceType:file.sourceType};
  }
  const sourceInputs=options?.privateModuleSources;
  if(options&&typeof options==='object'){
    // Each supported configuration property and every array element becomes
    // one authoritative compiler input, including the returned metadata.
    // This prevents option accessors changing private/public name selection
    // after validation or changing the effective server import allowlist.
    options={
      privateNames:/** @type {string[]} */ (snapshotOptionArray(options.privateNames)),
      publicHelperNames:snapshotOptionArray(options.publicHelperNames),
      privateModuleImports:snapshotOptionArray(options.privateModuleImports),
      additionalPrivateModulePaths:snapshotOptionArray(options.additionalPrivateModulePaths),
      privateModuleSources:sourceInputs,
      allowServerEnvConstants:options.allowServerEnvConstants,
      allowServerImports:options.allowServerImports,
      seed:options.seed,endpoint:options.endpoint,
      batch:options.batch,maxBatchCalls:options.maxBatchCalls
    };
  }
  if(!file||typeof file.code!=='string'||typeof file.path!=='string'||
      (file.sourceType!==undefined&&file.sourceType!=='module')||
      file.code.startsWith('#!')||!options||!Array.isArray(options.privateNames)||
      !options.privateNames.length||options.privateNames.some(n=>typeof n!=='string'||!n)||
      new Set(options.privateNames).size!==options.privateNames.length||
      options.publicHelperNames!==undefined &&
      (!Array.isArray(options.publicHelperNames)||
       options.publicHelperNames.some(n=>typeof n!=='string'||!n)||
       new Set(options.publicHelperNames).size!==options.publicHelperNames.length)||
      options.allowServerEnvConstants!==undefined &&
      typeof options.allowServerEnvConstants!=='boolean'||
      options.allowServerImports!==undefined &&
      typeof options.allowServerImports!=='boolean'||
      options.privateModuleImports!==undefined &&
      (!Array.isArray(options.privateModuleImports)||
       options.privateModuleImports.some(value=>typeof value!=='string')||
       new Set(options.privateModuleImports).size!==options.privateModuleImports.length)||
      options.additionalPrivateModulePaths!==undefined&&
      (!Array.isArray(options.additionalPrivateModulePaths)||
       options.additionalPrivateModulePaths.some(value=>typeof value!=='string')||
       new Set(options.additionalPrivateModulePaths).size!==options.additionalPrivateModulePaths.length)||
      sourceInputs!==undefined && !Array.isArray(sourceInputs)) {
    throw new TypeError('Selective SCO requires a module and distinct privateNames');
  }
  /** @type {ScoPrivateModuleSource[]|undefined} */
  let auditedSources;
  if(sourceInputs!==undefined){
    auditedSources=[];
    for(let index=0;index<sourceInputs.length;index++){
      // Inspect the declared array slots without invoking mutable map,
      // iterator or Symbol.species hooks supplied by the caller.
      const source=sourceInputs[index];
      const sourcePath=source?.path;
      const code=source?.code;
      if(typeof sourcePath!=='string'||typeof code!=='string') {
        throw new TypeError('SCO privateModuleSources must contain {path,code} modules');
      }
      auditedSources.push({path:sourcePath,code});
    }
  }
  const selected=new Set(options.privateNames);
  const requestedPublicHelpers=new Set(options.publicHelperNames??[]);
  const ast=parse(file.code,'module');
  const privateModuleImports=new Set(options.privateModuleImports??[]);
  // Run the additional identity walk only when the declared program can
  // actually relocate a relative private import across browser sessions.
  if(privateModuleImports.size)assertNoPrivateImportMemberState(file.path,file.code);
  /** @type {string[]} */
  const privateModulePaths=[...(options.additionalPrivateModulePaths??[])];
  /** @type {string[]} */
  const directPrivatePaths=[];
  for(const filename of privateModulePaths){
    try{
      if(safePath(filename)!==filename||!/\.mjs$/u.test(filename)||
         filename===file.path)throw new TypeError('Invalid private module path');
    }catch{
      throw new TypeError('Selective SCO additionalPrivateModulePaths requires canonical relative .mjs paths');
    }
  }
  for(const specifier of privateModuleImports){
    if(!isCanonicalPrivateModulePath(file.path,specifier)){
      throw new TypeError('Selective SCO private module import must be a canonical relative .mjs path');
    }
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file.path),specifier));
    directPrivatePaths.push(resolved);
    if(!privateModulePaths.includes(resolved))privateModulePaths.push(resolved);
  }
  if(auditedSources!==undefined){
    for(const resolved of collectPrivateStaticImportClosure(directPrivatePaths,auditedSources)){
      if(!privateModulePaths.includes(resolved))privateModulePaths.push(resolved);
    }
  }
  // Retain digest commitments on the trusted server partition only. They
  // never enter clientFile or the generated browser source. An integrator can
  // verify these exact UTF-8 input bytes against deployed files before loading
  // the server's original module graph.
  /** @type {ScoPrivateSourceDigest[]|undefined} */
  const privateSourceDigests=auditedSources===undefined?undefined:[
    {path:safePath(file.path),sha256:createHash('sha256').update(file.code,'utf8').digest('hex')},
    ...auditedSources.map(source=>({
      path:safePath(source.path),
      sha256:createHash('sha256').update(source.code,'utf8').digest('hex')
    }))
  ];
  // Admit primitive const values, approved environment reads, and inert
  // function-expression const bindings into private source. Effectful
  // initializers and mutable shared objects violate the split contract.
  /** @type {Set<string>} */
  const serverConstants=new Set();
  let serverEnvironmentUsed=false;
  /** @type {string[]} */
  const serverConstantChunks=[];
  /** @type {{name:string,fn:import('./ast').AstNode,text:string}[]} */
  const privateHelperCandidates=[];
  for(const statement of ast.body){
    if(statement.type==='ImportDeclaration'){
      const specifier=statement.source.value;
      if(typeof specifier!=='string'||
         !(options.allowServerImports===true&&
           specifier.startsWith('node:')&&isBuiltin(specifier)||
           privateModuleImports.has(specifier))||
         !statement.specifiers.length||
         statement.specifiers.some((/** @type {import('./ast').AstNode} */ item)=>
           item.type!=='ImportSpecifier'||
           item.local.type!=='Identifier')){
        throw new TypeError('Selective SCO only admits explicitly enabled named Node builtin imports');
      }
      for(const imported of statement.specifiers){
        const name=imported.local.name;
        if(serverConstants.has(name)){
          throw new TypeError('Selective SCO requires distinct server-only import bindings');
        }
        serverConstants.add(name);
      }
      serverConstantChunks.push(file.code.slice(statement.start,statement.end));
      continue;
    }
    if(statement.type!=='VariableDeclaration')continue;
    if(statement.kind!=='const'||statement.declarations.length===0){
      throw new TypeError('Selective SCO server constants must be immutable const declarations');
    }
    if(statement.declarations.length===1){
      const binding=statement.declarations[0];
      if(binding.id.type==='Identifier'&&binding.init&&
         ['FunctionExpression','ArrowFunctionExpression'].includes(binding.init.type)){
        privateHelperCandidates.push({name:binding.id.name,fn:binding.init,
          text:file.code.slice(statement.start,statement.end)});
        continue;
      }
    }
    for(const declaration of statement.declarations){
      const value=declaration.init?.value;
      const primitive=declaration.init?.type==='Literal' &&
        (value===null||typeof value==='string'||typeof value==='number'||
         typeof value==='boolean'||typeof value==='bigint');
      const environment=options.allowServerEnvConstants===true &&
        declaration.init!=null && isServerEnvironmentRead(declaration.init);
      if(declaration.id.type!=='Identifier'||!declaration.init||
         !(primitive||environment)||serverConstants.has(declaration.id.name)){
        throw new TypeError('Selective SCO only admits distinct primitive literal const declarations or explicitly approved server environment reads');
      }
      if(environment)serverEnvironmentUsed=true;
      serverConstants.add(declaration.id.name);
    }
    serverConstantChunks.push(file.code.slice(statement.start,statement.end));
  }
  /** @type {string[]} */
  const privateChunks=[];
  /** @type {import('./ast').AstNode[]} */
  const privateBodies=[];
  /** @type {WeakMap<import('./ast').AstNode,Set<string>>} */
  const privateFormals=new WeakMap();
  /** @param {import('./ast').AstNode} fn @returns {void} */
  function addPrivateBody(fn){
    privateBodies.push(fn.body);
    const parameters=new Set();
    for(const parameter of fn.params){
      if(parameter.type==='Identifier')parameters.add(parameter.name);
    }
    privateFormals.set(fn.body,parameters);
  }
  const ambientRoots=new Set(['globalThis','window','self','document','navigator','location','process','global']);
  /**
   * Prove a literal-only object constructed independently within the function.
   * Nested records remain inert; getters, computed names, spreads and methods
   * could observe arbitrary host capabilities and are conservatively excluded.
   * @param {import('./ast').AstNode} node
   * @returns {boolean}
   */
  function isInertOwnedRecord(node){
    if(node.type==='Literal'){
      return node.value===null||['string','number','boolean','bigint']
        .includes(typeof node.value);
    }
    if(node.type!=='ObjectExpression')return false;
    return node.properties.every((/** @type {import('./ast').AstNode} */ property)=>
      property.type==='Property'&&!property.computed&&!property.method&&
      property.kind==='init'&&isInertOwnedRecord(property.value));
  }
  /**
   * A function-local const bound to an inert record cannot alias an ambient
   * global object unless another nested binding shadows its name. Use this
   * same narrow ownership test for shared-state and private-host guards.
   * @param {import('./ast').AstNode} body
   * @returns {Set<string>}
   */
  function ownedLocalAmbientNames(body) {
    const names=new Set();
    /** @type {Map<string,import('./ast').AstNode>} */
    const provenBindings=new Map();
    if(body.type!=='BlockStatement')return names;
    for(const statement of body.body){
      if(statement.type!=='VariableDeclaration'||statement.kind!=='const')continue;
      for(const declaration of statement.declarations){
        if(declaration.id.type!=='Identifier'||!ambientRoots.has(declaration.id.name)||
           declaration.init?.type!=='ObjectExpression'||
           !isInertOwnedRecord(declaration.init))continue;
        names.add(declaration.id.name);
        provenBindings.set(declaration.id.name,declaration);
      }
    }
    // A nested binding of the same spelling might refer to an entirely
    // different host capability. Do not infer every occurrence from the
    // outer record when nested lexical ownership is not proven.
    const ambiguous=new Set();
    walk(body,node=>{
      if(node.type==='VariableDeclarator'){
        for(const name of names){
          if(node===provenBindings.get(name))continue;
          walk(node.id,part=>{
            if(part.type==='Identifier'&&part.name===name)ambiguous.add(name);
          });
        }
      }
      if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression',
        'ClassDeclaration','ClassExpression'].includes(node.type)){
        if(node.id?.type==='Identifier'&&names.has(node.id.name))ambiguous.add(node.id.name);
        for(const parameter of node.params??[]){
          for(const name of names){
            walk(parameter,part=>{
              if(part.type==='Identifier'&&part.name===name)ambiguous.add(name);
            });
          }
        }
      }
      if(node.type==='CatchClause'&&node.param){
        for(const name of names){
          walk(node.param,part=>{
            if(part.type==='Identifier'&&part.name===name)ambiguous.add(name);
          });
        }
      }
    });
    // For direct members of an owned local root, require a literal own key
    // and refuse unproved direct writes. Nested aliases, inherited methods
    // past the first field, and opaque object operations remain outside this
    // deliberately bounded syntactic proof.
    /** @type {Map<string,Set<string>>} */
    const ownedKeys=new Map();
    for(const [name,declaration] of provenBindings){
      const keys=new Set();
      for(const property of declaration.init.properties){
        const member=property.key.type==='Identifier'&&!property.computed?
          property.key.name:staticString(property.key);
        if(member===null)ambiguous.add(name);
        else keys.add(member);
      }
      ownedKeys.set(name,keys);
    }
    walk(body,(node,parent,key)=>{
      if(node.type==='Identifier'&&names.has(node.name)&&!isStaticKey(parent,key)){
        if(parent?.type==='VariableDeclarator'&&parent===provenBindings.get(node.name)&&
           key==='id')return;
        if(parent?.type==='MemberExpression'&&key==='object')return;
        ambiguous.add(node.name);
      }
      if(node.type!=='MemberExpression'||node.object.type!=='Identifier'||
         !names.has(node.object.name))return;
      const name=node.object.name;
      const member=node.computed?staticString(node.property):
        node.property.type==='Identifier'?node.property.name:null;
      if(member===null||!ownedKeys.get(name)?.has(member))ambiguous.add(name);
      if(parent?.type==='AssignmentExpression'&&key==='left'&&
         (parent.operator!=='='||!isInertOwnedRecord(parent.right)) ||
         parent?.type==='UpdateExpression' ||
         parent?.type==='UnaryExpression'&&parent.operator==='delete' ||
         parent?.type==='CallExpression'&&key==='callee'){
        ambiguous.add(name);
      }
    });
    for(const name of ambiguous)names.delete(name);
    return names;
  }
  /** @type {Set<string>} */
  const privateAmbient=new Set();
  /** @type {Set<string>} */
  const publicAmbient=new Set();
  /** @type {Set<string>} */
  const privateHelperNames=new Set();
  /** @type {string[]} */
  const privateHelperChunks=[];
  /** @type {string[]} */
  const publicHelperChunks=[];
  /** @type {Set<string>} */
  const publicHelperNames=new Set();
  /** @type {{name:string,fn:import('./ast').AstNode}[]} */
  const publicHelperFunctions=[];
  /** @type {Set<string>} */
  const helperBindings=new Set();
  for(const statement of ast.body){
    if(statement.type==='FunctionDeclaration'){
      privateHelperCandidates.push({name:statement.id?.type==='Identifier'?statement.id.name:'',
        fn:statement,text:file.code.slice(statement.start,statement.end)});
    }
  }
  for(const helper of privateHelperCandidates){
    const {name,fn}=helper;
    if(!name||fn.generator||
       !Array.isArray(fn.params)||
       fn.params.some((/** @type {import('./ast').AstNode} */ param)=>param.type!=='Identifier')||
       selected.has(name)||serverConstants.has(name)||helperBindings.has(name)){
      throw new TypeError('Selective SCO requires distinct non-generator private helper bindings');
    }
    helperBindings.add(name);
    if(requestedPublicHelpers.has(name)){
      publicHelperNames.add(name);
      publicHelperChunks.push(helper.text);
      publicHelperFunctions.push({name,fn});
    }else{
      privateHelperNames.add(name);
      privateHelperChunks.push(helper.text);
      addPrivateBody(fn);
      const localAmbient=ownedLocalAmbientNames(fn.body);
      walk(fn.body,(node,parent,key)=>{
        if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name)&&
           !localAmbient.has(node.name)){
          privateAmbient.add(node.name);
        }
      });
    }
  }
  if(publicHelperNames.size!==requestedPublicHelpers.size){
    throw new TypeError('Unknown selective SCO public helper');
  }
  /** @type {string[]} */
  const publicChunks=[];
  /** @type {string[]} */
  const publicNames=[];
  /** @type {Set<string>} */
  const seen=new Set();
  /**
   * Keep every local public function within its original browser-side
   * boundary. This proof covers public helpers and direct exports alike.
   * @param {import('./ast').AstNode} fn
   * @param {string} name
   * @returns {void}
   */
  function inspectPublicFunction(fn,name){
    const realmEffect=realmStateObservation(fn.body);
    if(realmEffect) {
      throw new TypeError('Selective SCO cannot partition realm-local '+realmEffect+' access: '+name);
    }
    const localAmbient=ownedLocalAmbientNames(fn.body);
    walk(fn,(node,parent,key)=>{
      if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name)&&
         !localAmbient.has(node.name))publicAmbient.add(node.name);
      if(node.type==='ImportExpression'||node.type==='MetaProperty'||node.type==='WithStatement'||
         node.type==='Identifier'&&(node.name==='eval'||node.name==='Function')) {
        throw new TypeError('Public SCO export uses dynamic module/source inspection: '+name);
      }
      if(serverEnvironmentUsed&&(node.type==='ThisExpression'||
         node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name))){
        throw new TypeError('Public SCO export cannot share server environment: '+name);
      }
      if(node.type==='Identifier'&&!isStaticKey(parent,key)&&serverConstants.has(node.name)){
        throw new TypeError('Public SCO export reads server-only constant: '+name);
      }
      if(node.type==='Identifier'&&!isStaticKey(parent,key)&&privateHelperNames.has(node.name)){
        throw new TypeError('Public SCO export references a server-only helper: '+name);
      }
      if(node.type==='Identifier'&&!isStaticKey(parent,key)&&selected.has(node.name)&&
         !(parent?.type==='CallExpression'&&key==='callee')) {
        throw new TypeError('Public SCO export observes a private function value: '+name);
      }
    });
  }
  for(const helper of publicHelperFunctions)inspectPublicFunction(helper.fn,helper.name);
  for(const statement of ast.body) {
    if(statement.type==='VariableDeclaration'||statement.type==='FunctionDeclaration'||
       statement.type==='ImportDeclaration')continue;
    if(statement.type!=='ExportNamedDeclaration'||statement.source||
       statement.specifiers?.length||!statement.declaration) {
      throw new TypeError('Selective SCO requires direct named function exports only');
    }
    const declaration=statement.declaration;
    /** @type {import('./ast').AstNode} */
    let fn;
    /** @type {string} */
    let name;
    if(declaration.type==='FunctionDeclaration' && declaration.id?.type==='Identifier') {
      name=declaration.id.name;
      fn=declaration;
    }else if(declaration.type==='VariableDeclaration' && declaration.kind==='const' &&
             declaration.declarations.length===1){
      const binding=declaration.declarations[0];
      if(binding.id.type!=='Identifier'||!binding.init||
         !['FunctionExpression','ArrowFunctionExpression'].includes(binding.init.type)) {
        throw new TypeError('Selective SCO requires single-function const exports');
      }
      name=binding.id.name;
      fn=binding.init;
    }else{
      throw new TypeError('Selective SCO requires function declarations or single-function const exports');
    }
    if(seen.has(name)||helperBindings.has(name))throw new TypeError('Duplicate selective SCO exported binding: '+name);
    seen.add(name);
    const text=file.code.slice(statement.start,statement.end);
    if(selected.has(name)){
      if(!fn.async||fn.generator)throw new TypeError('Private SCO export must be async: '+name);
      privateChunks.push(text);
      addPrivateBody(fn);
      const localAmbient=ownedLocalAmbientNames(fn.body);
      walk(fn.body,(node,parent,key)=>{
        if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name)&&
           !localAmbient.has(node.name))privateAmbient.add(node.name);
      });
    }else{
      publicNames.push(name);
      publicChunks.push(text);
      inspectPublicFunction(fn,name);
    }
  }
  if(privateChunks.length!==selected.size)throw new TypeError('Unknown private SCO export name');
  if(!publicChunks.length)throw new TypeError('Selective SCO requires at least one retained public export');
  // Server and client load different function objects. Private code that reads
  // or mutates a public export can observe the wrong copy after partitioning.
  const publicBindings=new Set([...publicNames,...publicHelperNames]);
  // ECMAScript permits host-defined properties on the global object. Values
  // such as globalThis.externalBridge cannot be migrated to an independent
  // server realm without an application-specific contract.
  // Even the standard globalThis property is a distinct mutable host object
  // in each realm. Refuse nested self-references rather than allowing aliases
  // such as globalThis.globalThis.externalBridge around this guard.
  // Preserve the previously established shared-state diagnostic when the
  // same ambient root is consumed on both sides of the partition.
  const sharedAmbient=privateAmbient.size>0&&publicAmbient.size>0;
  const allPrivateBindings=collectBindings(ast);
  // Server imports and primitive constants were already admitted as explicit
  // immutable private bindings. Exempt only globally unique lexical names;
  // a shadowed formal or nested declaration cannot inherit their provenance.
  const explicitServerHostNames=new Set([...serverConstants].filter(name=>
    allPrivateBindings.get(name)===1));
  for(const body of privateBodies){
    // The selected function and helpers execute in a different ESM module
    // on a trusted Node server. Module metadata and dynamic import therefore
    // resolve against the server-side module instead of the client module.
    // Reject these operations until a true cross-host equivalence proof exists.
    walk(body,node=>{
      if(node.type==='MetaProperty'){
        throw new TypeError('Private SCO export or helper uses unproved module-relative execution');
      }
      if(node.type==='ImportExpression'){
        // A fixed Node builtin module resolves independently of the current
        // ESM module URL. Server-private crypto code historically relies on
        // import('node:crypto'); computed, relative and loader-capability
        // imports cannot use this exception.
        const specifier=node.source.type==='Literal'?node.source.value:null;
        if(typeof specifier==='string'&&specifier.startsWith('node:')&&
           isBuiltin(specifier)&&
           !['node:module','node:vm','node:worker_threads',
             'node:child_process','node:process'].includes(specifier))return;
        throw new TypeError('Private SCO export or helper uses unproved module-relative execution');
      }
    });
    if(usesUnprovedCrossRealmHostApi(body,explicitServerHostNames)){
      throw new TypeError('Private SCO export or helper contains unproved cross-realm host API');
    }
    if(usesUnprovedRelocatedUrlStatic(body)){
      throw new TypeError('Private SCO export or helper uses unproved cross-realm object URL API');
    }
    if(usesUnprovedRelocatedWebIdlConstructors(body)){
      throw new TypeError('Private SCO export or helper uses unproved cross-realm WebIDL constructor');
    }
    if(usesUnprovedRelocatedTextDecoder(body)){
      throw new TypeError('Private SCO export or helper uses unproved cross-realm text decoding');
    }
    const realmEffect=realmStateObservation(body,true);
    if(realmEffect) {
      throw new TypeError('Selective SCO cannot partition realm-local '+realmEffect+' access');
    }
    // A declaration in this function's outermost block shadows the host
    // binding throughout the body. The bounded proof avoids mistaking safe
    // locals named "window" or "document" for ambient browser capabilities.
    const localBrowserNames=new Set();
    if(body.type==='BlockStatement'){
      for(const statement of body.body){
        if(statement.type==='VariableDeclaration'){
          for(const declaration of statement.declarations){
            if(declaration.id.type==='Identifier'&&browserOnlyRoots.has(declaration.id.name)){
              localBrowserNames.add(declaration.id.name);
            }
          }
        }
        if((statement.type==='FunctionDeclaration'||statement.type==='ClassDeclaration')&&
           statement.id?.type==='Identifier'&&browserOnlyRoots.has(statement.id.name)){
          localBrowserNames.add(statement.id.name);
        }
      }
    }
    // Only declarations in the enclosing function body reliably shadow the
    // ambient globalThis for all references in this bounded source scan.
    const localGlobalThis=ownedLocalAmbientNames(body).has('globalThis');
    const globalAliases=new Set(localGlobalThis?[]:['globalThis']);
    let aliasesChanged=true;
    while(aliasesChanged){
      aliasesChanged=false;
      walk(body,node=>{
        if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&
           node.init?.type==='Identifier'&&globalAliases.has(node.init.name)&&
           !globalAliases.has(node.id.name)){
          globalAliases.add(node.id.name);
          aliasesChanged=true;
        }
      });
    }
    walk(body,(node,parent,key)=>{
      if(node.type==='MemberExpression'&&node.object.type==='Identifier'&&
         globalAliases.has(node.object.name)){
        const member=node.computed?staticString(node.property):
          node.property.type==='Identifier'?node.property.name:null;
        if(member===null||browserOnlyRoots.has(member)){
          throw new TypeError('Private SCO export uses browser-only ambient state: '+member);
        }
        if(!standardRealmGlobals.has(member)&&!sharedAmbient){
          throw new TypeError('Private SCO export uses unproved host-global state: '+member);
        }
      }
      if(node.type==='VariableDeclarator'&&node.init?.type==='Identifier'&&
         globalAliases.has(node.init.name)&&node.id.type==='ObjectPattern'){
        for(const property of node.id.properties){
          const member=property.type==='Property'?
            (property.computed?staticString(property.key):
              property.key.type==='Identifier'?property.key.name:staticString(property.key)):null;
          if(member===null||browserOnlyRoots.has(member)){
            throw new TypeError('Private SCO export uses browser-only ambient state: '+member);
          }
          if(!standardRealmGlobals.has(member)&&!sharedAmbient){
            throw new TypeError('Private SCO export uses unproved host-global state: '+member);
          }
        }
      }
      if(node.type!=='Identifier'||isStaticKey(parent,key))return;
      if(browserOnlyRoots.has(node.name)&&!localBrowserNames.has(node.name)){
        throw new TypeError('Private SCO export uses browser-only ambient state: '+node.name);
      }
      if(publicBindings.has(node.name)){
        throw new TypeError('Private SCO export references a separated public binding: '+node.name);
      }
      // The original private function is a distinct singleton on each client.
      // Reading/writing its properties after migration would share the single
      // server function across clients, silently changing module behavior.
      if(selected.has(node.name)&&!(parent?.type==='CallExpression'&&key==='callee')){
        throw new TypeError('Private SCO export exposes a stateful private function value: '+node.name);
      }
      if(privateHelperNames.has(node.name)&&!(parent?.type==='CallExpression'&&key==='callee')){
        throw new TypeError('Private SCO helper may only be called directly: '+node.name);
      }
      if(node.name==='eval'||node.name==='Function'){
        throw new TypeError('Private SCO export uses dynamic lexical execution: '+node.name);
      }
    });
    const freeTypeof=firstUnprovedTypeofReference(body,allPrivateBindings,
      serverConstants,privateFormals.get(body)??new Set());
    if(freeTypeof!==null){
      throw new TypeError('Private SCO export or helper uses unproved free typeof reference: '+freeTypeof);
    }
  }
  // Global roots can alias across spellings, e.g. window versus globalThis.
  // Decline any cross-boundary ambient use rather than proving deep aliases.
  if(privateAmbient.size && publicAmbient.size){
    throw new TypeError('Private/public exports share ambient state roots');
  }
  const partition=partitionScoAsyncModule({
    path:file.path,sourceType:'module',code:serverConstantChunks.join('\n')+'\n'+privateHelperChunks.join('\n')+'\n'+privateChunks.join('\n')
  },{seed:options.seed,endpoint:options.endpoint,batch:options.batch,maxBatchCalls:options.maxBatchCalls,
    serverOnlyInitialization:true});
  const clientCode=(publicHelperChunks.length?publicHelperChunks.join('\n')+'\n':'')+
    publicChunks.join('\n')+'\n'+partition.clientFile.code;
  parse(clientCode,'module');
  const result={...partition,publicNames,publicHelperNames:[...publicHelperNames],
    privateNames:[...options.privateNames],
    ...(privateSourceDigests?{privateSourceDigests}:{}),
    clientFile:{...partition.clientFile,code:clientCode,
      ...(privateModulePaths.length?{privateModulePaths}:{})}};
  // Keep compiler-owned publication bytes and method identities separate
  // from the caller-mutatable partition object and its graph metadata.
  generatedSelectiveSnapshots.set(result,JSON.stringify(result));
  return result;
}

/**
 * Expose exactly one compiler-generated selective SCO public ESM facade.
 * The caller never supplies a sourceFiles array or a replacement RPC registry,
 * preventing accidental publication of imported private implementation files.
 * Only an in-process compiler result is accepted. A serialized/copyable
 * partition is not trusted because it has lost its original source provenance.
 *
 * The trusted server must still verify audited private source digests before
 * loading its original ESM graph, and enforce account/operation authorization.
 * This helper adds no execution-time client overhead beyond createScoHandler.
 *
 * @param {ScoSelectivePartition} partition
 * @param {Record<string,unknown>} serverExports Original server-side ESM namespace.
 * @param {Omit<import('./sco').ScoOptions,'publicPaths'|'remoteMethods'>} options
 * @returns {import('node:http').RequestListener}
 */
function createScoSelectedHandler(partition,serverExports,options) {
  if(!partition||!options||typeof options!=='object'||
     Object.hasOwn(options,'publicPaths')||Object.hasOwn(options,'remoteMethods')){
    throw new TypeError('SCO selective handler requires generated partition and separately authorized server options');
  }
  // Capture caller option getters exactly once before comparing the RPC
  // endpoint. The transport must not see a different routePrefix during
  // handler construction from the value used for the endpoint check.
  const stableOptions=snapshotSelectedOptions(options);
  const snapshot=generatedSelectiveSnapshots.get(partition);
  if(snapshot===undefined){
    throw new TypeError('SCO selective handler requires a partition generated in this process');
  }
  if(JSON.stringify(partition)!==snapshot){
    throw new TypeError('SCO selective manifest was modified after partitioning');
  }
  const trusted=/** @type {ScoSelectivePartition} */ (JSON.parse(snapshot));
  const expectedEndpoint=(stableOptions.routePrefix??'/obfs/')+'rpc';
  if(trusted.endpoint!==expectedEndpoint){
    throw new TypeError('SCO selective RPC endpoint does not match routePrefix');
  }
  const remoteMethods=bindScoModuleExports(trusted,serverExports);
  return createScoHandler([trusted.clientFile],{
    ...stableOptions,
    publicPaths:[trusted.clientFile.path],
    remoteMethods
  });
}

module.exports={partitionScoSelectedAsyncExports,bindScoModuleExports,createScoSelectedHandler};
