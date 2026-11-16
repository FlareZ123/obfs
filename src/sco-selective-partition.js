'use strict';

const {parse,walk,staticString}=require('./ast');
const {isBuiltin}=require('node:module');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {safePath}=require('./core');
const {partitionScoAsyncModule,bindScoModuleExports}=require('./sco-partition');

/** @typedef {import('./sco-partition').ScoModulePartition} ScoModulePartition */
/** @typedef {{path:string,code:string}} ScoPrivateModuleSource */
/** @typedef {{privateNames:string[],publicHelperNames?:string[],seed?:string,endpoint?:string,batch?:boolean,maxBatchCalls?:number,allowServerEnvConstants?:boolean,allowServerImports?:boolean,privateModuleImports?:string[],additionalPrivateModulePaths?:string[],privateModuleSources?:ScoPrivateModuleSource[]}} ScoSelectiveOptions */
/** @typedef {{path:string,sha256:string}} ScoPrivateSourceDigest */
/** @typedef {ScoModulePartition & {publicNames:string[],privateNames:string[],publicHelperNames:string[],privateSourceDigests?:ScoPrivateSourceDigest[]}} ScoSelectivePartition */

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
 * @param {boolean} [checkHostConfiguration] Only relocated private code inherits a new host configuration.
 * @returns {'prototype'|'RegExp match'|'intrinsic state'|'configuration'|'entropy'|'clock'|null}
 */
function realmStateObservation(body,checkHostConfiguration=false){
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
  // A selected SCO private export executes on a different host. Date's
  // local-time constructors/getters and Intl's unpinned locale/zone defaults
  // can change a JSON-visible result even if neither realm mutates state.
  // This intentionally refuses certain explicitly pinned Intl operations:
  // proving identical ICU data, locale and timezone across hosts is beyond
  // this syntactic contract. UTC-only Date operations remain eligible.
  const localeConstructors=new Set(['DateTimeFormat','NumberFormat','Collator',
    'PluralRules','RelativeTimeFormat','ListFormat','DisplayNames','Segmenter',
    'DurationFormat']);
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
  /** @param {import('./ast').AstNode} expression @returns {boolean} */
  function isIntlConstructor(expression){
    if(expression.type!=='MemberExpression' ||
       !localeConstructors.has(keyName(expression)??''))return false;
    const receiver=expression.object;
    return receiver.type==='Identifier'&&intrinsicKinds.get(receiver.name)==='Intl' ||
      receiver.type==='MemberExpression' &&
      receiver.object.type==='Identifier' &&
      globalNames.has(receiver.object.name)&&keyName(receiver)==='Intl';
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
  const intlAliases=new Set();
  let originChanged=true;
  while(originChanged){
    originChanged=false;
    walk(body,node=>{
      const binding=node.type==='VariableDeclarator'?node.id:
        node.type==='AssignmentExpression'&&node.operator==='='?node.left:null;
      const initial=node.type==='VariableDeclarator'?node.init:
        node.type==='AssignmentExpression'?node.right:null;
      if(binding?.type!=='Identifier'||!initial)return;
      if(initial.type==='NewExpression'&&isDateConstructor(initial.callee)||
         initial.type==='Identifier'&&dateInstances.has(initial.name)){
        if(!dateInstances.has(binding.name)){
          dateInstances.add(binding.name);
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
    // A locale-dependent method may be extracted and invoked later through
    // Function.call/apply, an alias, or a callback. Inspect the member
    // reference itself rather than requiring a direct CallExpression.
    if(node.type==='MemberExpression'){
      const member=keyName(node);
      if(isMathRoot(node.object)&&member==='random')entropyTouched=true;
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
      const properties=pattern.properties.filter(
        (/** @type {import('./ast').AstNode} */ property)=>property.type==='Property');
      if(isMathRoot(source)&&properties.some(
        (/** @type {import('./ast').AstNode} */ property)=>keyName(property)==='random')){
        entropyTouched=true;
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
    intrinsicTouched?'intrinsic state':checkHostConfiguration&&entropyTouched?'entropy':
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
      options.privateModuleSources!==undefined && !Array.isArray(options.privateModuleSources)) {
    throw new TypeError('Selective SCO requires a module and distinct privateNames');
  }
  const selected=new Set(options.privateNames);
  const requestedPublicHelpers=new Set(options.publicHelperNames??[]);
  const ast=parse(file.code,'module');
  const privateModuleImports=new Set(options.privateModuleImports??[]);
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
  if(options.privateModuleSources!==undefined){
    for(const resolved of collectPrivateStaticImportClosure(directPrivatePaths,options.privateModuleSources)){
      if(!privateModulePaths.includes(resolved))privateModulePaths.push(resolved);
    }
  }
  // Retain digest commitments on the trusted server partition only. They
  // never enter clientFile or the generated browser source. An integrator can
  // verify these exact UTF-8 input bytes against deployed files before loading
  // the server's original module graph.
  /** @type {ScoPrivateSourceDigest[]|undefined} */
  const privateSourceDigests=options.privateModuleSources===undefined?undefined:[
    {path:safePath(file.path),sha256:createHash('sha256').update(file.code,'utf8').digest('hex')},
    ...options.privateModuleSources.map(source=>({
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
  const ambientRoots=new Set(['globalThis','window','self','document','navigator','location','process','global']);
  /**
   * An immutable function-local plain record containing only inert primitive
   * values cannot be an alias of the host global object. Distinguish its
   * spelled name from ambient state when comparing public/private functions.
   * Keep dynamic initializers, getters, spreads, and writable aliases in the
   * conservative ambient bucket until their ownership can be proven.
   * @param {import('./ast').AstNode} fn
   * @returns {Set<string>}
   */
  function ownedLocalAmbientNames(fn) {
    const names=new Set();
    /** @type {Map<string,import('./ast').AstNode>} */
    const provenBindings=new Map();
    if(fn.body?.type!=='BlockStatement')return names;
    for(const statement of fn.body.body){
      if(statement.type!=='VariableDeclaration'||statement.kind!=='const')continue;
      for(const declaration of statement.declarations){
        if(declaration.id.type!=='Identifier'||!ambientRoots.has(declaration.id.name)||
           declaration.init?.type!=='ObjectExpression')continue;
        const properties=declaration.init.properties;
        if(properties.every((/** @type {import('./ast').AstNode} */ property)=>
          property.type==='Property'&&!property.computed&&!property.method&&
          property.kind==='init'&&property.value.type==='Literal'&&
          (property.value.value===null||['string','number','boolean','bigint']
            .includes(typeof property.value.value)))){
          names.add(declaration.id.name);
          provenBindings.set(declaration.id.name,declaration);
        }
      }
    }
    // A nested binding of the same spelling might refer to an entirely
    // different host capability. Do not infer every occurrence from the
    // outer record when nested lexical ownership is not proven.
    const ambiguous=new Set();
    walk(fn.body,node=>{
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
      privateBodies.push(fn.body);
      const localAmbient=ownedLocalAmbientNames(fn);
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
    const localAmbient=ownedLocalAmbientNames(fn);
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
      privateBodies.push(fn.body);
      const localAmbient=ownedLocalAmbientNames(fn);
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
  const browserOnlyRoots=new Set(['window','document','navigator','location',
    'localStorage','sessionStorage','indexedDB','self','history','screen',
    'customElements','DOMParser','XMLHttpRequest']);
  // ECMAScript permits host-defined properties on the global object. Values
  // such as globalThis.externalBridge cannot be migrated to an independent
  // server realm without an application-specific contract.
  // Even the standard globalThis property is a distinct mutable host object
  // in each realm. Refuse nested self-references rather than allowing aliases
  // such as globalThis.globalThis.externalBridge around this guard.
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
  // Preserve the previously established shared-state diagnostic when the
  // same ambient root is consumed on both sides of the partition.
  const sharedAmbient=privateAmbient.size>0&&publicAmbient.size>0;
  for(const body of privateBodies){
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
    const localGlobalThis=body.type==='BlockStatement'&&body.body.some(
      (/** @type {import('./ast').AstNode} */ statement)=>
        statement.type==='VariableDeclaration'&&statement.declarations.some(
          (/** @type {import('./ast').AstNode} */ declaration)=>
            declaration.id.type==='Identifier'&&declaration.id.name==='globalThis') ||
        (statement.type==='FunctionDeclaration'||statement.type==='ClassDeclaration')&&
        statement.id?.name==='globalThis');
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
    ...(privateSourceDigests?{privateSourceDigests}:{}),
    clientFile:{...partition.clientFile,code:clientCode,
      ...(privateModulePaths.length?{privateModulePaths}:{})}};
}

module.exports={partitionScoSelectedAsyncExports,bindScoModuleExports};
