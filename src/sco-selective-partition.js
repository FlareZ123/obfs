'use strict';

const {parse,walk,staticString}=require('./ast');
const {partitionScoAsyncModule,bindScoModuleExports}=require('./sco-partition');

/** @typedef {import('./sco-partition').ScoModulePartition} ScoModulePartition */
/** @typedef {{privateNames:string[],publicHelperNames?:string[],seed?:string,endpoint?:string,batch?:boolean,maxBatchCalls?:number,allowServerEnvConstants?:boolean}} ScoSelectiveOptions */
/** @typedef {ScoModulePartition & {publicNames:string[],privateNames:string[],publicHelperNames:string[]}} ScoSelectivePartition */

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
 * @returns {'prototype'|'RegExp match'|'intrinsic state'|null}
 */
function realmStateObservation(body){
  const intrinsicNames=new Set(['Object','Array','Function','String','Number',
    'Boolean','Symbol','BigInt','RegExp','Date','Map','Set','WeakMap','WeakSet',
    'Promise','Error','ArrayBuffer','SharedArrayBuffer','DataView','Reflect',
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
    intrinsicTouched?'intrinsic state':null;
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
      typeof options.allowServerEnvConstants!=='boolean') {
    throw new TypeError('Selective SCO requires a module and distinct privateNames');
  }
  const selected=new Set(options.privateNames);
  const requestedPublicHelpers=new Set(options.publicHelperNames??[]);
  const ast=parse(file.code,'module');
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
  const ambientRoots=new Set(['globalThis','window','self','document','navigator','location','process','global']);
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
      privateBodies.push(fn.body);
      walk(fn.body,(node,parent,key)=>{
        if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name)){
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
    walk(fn,(node,parent,key)=>{
      if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name))publicAmbient.add(node.name);
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
    if(statement.type==='VariableDeclaration'||statement.type==='FunctionDeclaration')continue;
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
      privateBodies.push(fn.body);
      walk(fn.body,(node,parent,key)=>{
        if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name))privateAmbient.add(node.name);
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
  const browserOnlyRoots=new Set(['window','document','navigator','location',
    'localStorage','sessionStorage','indexedDB','self','history','screen',
    'customElements','DOMParser','XMLHttpRequest']);
  for(const body of privateBodies){
    const realmEffect=realmStateObservation(body);
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
    const globalAliases=new Set(['globalThis']);
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
  return {...partition,publicNames,publicHelperNames:[...publicHelperNames],
    privateNames:[...options.privateNames],
    clientFile:{...partition.clientFile,code:clientCode}};
}

module.exports={partitionScoSelectedAsyncExports,bindScoModuleExports};
