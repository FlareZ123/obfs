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
 * Refuse known cross-realm prototype access in split SCO public and private
 * functions. Intrinsic prototypes belong to their JavaScript realm, so
 * partitioning code that mutates them can silently change observations.
 * This conservative syntax check makes no whole-program alias guarantee.
 *
 * @param {import('./ast').AstNode} body
 * @returns {boolean}
 */
function touchesRealmPrototype(body){
  const intrinsicNames=new Set(['Object','Array','Function','String','Number',
    'Boolean','Symbol','BigInt','RegExp','Date','Map','Set','WeakMap','WeakSet',
    'Promise','Error','ArrayBuffer','SharedArrayBuffer','DataView','Reflect',
    'Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array',
    'Int32Array','Uint32Array','Float32Array','Float64Array','BigInt64Array',
    'BigUint64Array']);
  const reflectorMethods=new Set(['getPrototypeOf','setPrototypeOf',
    'getOwnPropertyDescriptor','getOwnPropertyDescriptors','getOwnPropertyNames',
    'getOwnPropertySymbols','defineProperty','defineProperties','get','set',
    'ownKeys']);
  const globalNames=new Set(['globalThis','window','self','global']);
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
  // Track simple constructor and Reflect aliases across declarations. This
  // overapproximates reassigned or shadowed bindings to preserve safe refusal.
  let changed=true;
  while(changed){
    changed=false;
    walk(body,node=>{
      if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier'||!node.init||
         intrinsicNames.has(node.id.name))return;
      const direct=node.init.type==='Identifier'&&intrinsicNames.has(node.init.name);
      const globalMember=node.init.type==='MemberExpression'&&
        node.init.object.type==='Identifier'&&globalNames.has(node.init.object.name)&&
        intrinsicNames.has(keyName(node.init)??'');
      if(direct||globalMember){
        intrinsicNames.add(node.id.name);
        changed=true;
      }
    });
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isIntrinsic(node){
    return node.type==='Identifier'&&intrinsicNames.has(node.name);
  }
  /** @param {import('./ast').AstNode} node @returns {boolean} */
  function isReflector(node){
    return node.type==='Identifier'&&
      (node.name==='Object'||node.name==='Reflect'||intrinsicNames.has(node.name)&&
        // Aliases may refer to Object/Reflect. Refusing reflector methods on
        // other constructor aliases is a safe overapproximation.
        node.name!=='');
  }
  /** @param {import('./ast').AstNode} pattern @param {Set<string>} names @returns {boolean} */
  function patternReads(pattern,names){
    return pattern.type==='ObjectPattern'&&pattern.properties.some(
      (/** @type {import('./ast').AstNode} */ property)=>
        property.type==='RestElement'||keyName(property)===null||
        names.has(keyName(property)??''));
  }
  let touched=false;
  walk(body,node=>{
    if(node.type==='MemberExpression'){
      const key=keyName(node);
      if(key==='prototype'||key==='__proto__'||isIntrinsic(node.object)&&key===null)touched=true;
      if(isReflector(node.object)&&reflectorMethods.has(key??''))touched=true;
    }
    if(node.type==='VariableDeclarator'&&node.init&&isIntrinsic(node.init)&&
       patternReads(node.id,new Set(['prototype','__proto__',
         ...reflectorMethods])))touched=true;
    if(node.type==='AssignmentExpression'&&isIntrinsic(node.right)&&
       patternReads(node.left,new Set(['prototype','__proto__',
         ...reflectorMethods])))touched=true;
  });
  return touched;
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
    if(touchesRealmPrototype(fn.body)) {
      throw new TypeError('Selective SCO cannot partition realm-local prototype access: '+name);
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
  for(const body of privateBodies){
    if(touchesRealmPrototype(body)) {
      throw new TypeError('Selective SCO cannot partition realm-local prototype access');
    }
    walk(body,(node,parent,key)=>{
      if(node.type!=='Identifier'||isStaticKey(parent,key))return;
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
