'use strict';

const {parse,walk}=require('./ast');
const {partitionScoAsyncModule,bindScoModuleExports}=require('./sco-partition');

/** @typedef {import('./sco-partition').ScoModulePartition} ScoModulePartition */
/** @typedef {{privateNames:string[],seed?:string,endpoint?:string,batch?:boolean,maxBatchCalls?:number,allowServerEnvConstants?:boolean}} ScoSelectiveOptions */
/** @typedef {ScoModulePartition & {publicNames:string[],privateNames:string[]}} ScoSelectivePartition */

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
 * Replace selected async ESM exports with authenticated SCO RPC facades while
 * preserving explicitly reviewed public function exports verbatim. The module
 * must consist only of direct named function exports or single-function const
 * exports, plus private, unexported synchronous function declarations and
 * unexported primitive-literal const declarations. Local helpers must never
 * be referenced by a retained public function or escape as function values. An explicit opt-in additionally admits direct
 * process.env uppercase-key reads on the trusted server, refusing public
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
      options.allowServerEnvConstants!==undefined &&
      typeof options.allowServerEnvConstants!=='boolean') {
    throw new TypeError('Selective SCO requires a module and distinct privateNames');
  }
  const selected=new Set(options.privateNames);
  const ast=parse(file.code,'module');
  // Move only immutable, primitive literal bindings into server-only source.
  // Effectful initializers and shared mutable objects would violate the
  // original module's client/server state and evaluation-order contracts.
  /** @type {Set<string>} */
  const serverConstants=new Set();
  let serverEnvironmentUsed=false;
  /** @type {string[]} */
  const serverConstantChunks=[];
  for(const statement of ast.body){
    if(statement.type!=='VariableDeclaration')continue;
    if(statement.kind!=='const'||statement.declarations.length===0){
      throw new TypeError('Selective SCO server constants must be immutable const declarations');
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
  for(const statement of ast.body){
    if(statement.type!=='FunctionDeclaration')continue;
    const name=statement.id?.type==='Identifier'?statement.id.name:null;
    if(!name||statement.async||statement.generator||
       statement.params.some((/** @type {import('./ast').AstNode} */ param)=>param.type!=='Identifier')||selected.has(name)||
       serverConstants.has(name)||privateHelperNames.has(name)){
      throw new TypeError('Selective SCO requires distinct synchronous private helper declarations');
    }
    privateHelperNames.add(name);
    privateHelperChunks.push(file.code.slice(statement.start,statement.end));
    privateBodies.push(statement.body);
    walk(statement.body,(node,parent,key)=>{
      if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name)){
        privateAmbient.add(node.name);
      }
    });
  }
  /** @type {string[]} */
  const publicChunks=[];
  /** @type {string[]} */
  const publicNames=[];
  /** @type {Set<string>} */
  const seen=new Set();
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
    if(seen.has(name)||privateHelperNames.has(name))throw new TypeError('Duplicate selective SCO exported binding: '+name);
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
      walk(fn,(node,parent,key)=>{
        if(node.type==='Identifier'&&!isStaticKey(parent,key)&&ambientRoots.has(node.name))publicAmbient.add(node.name);
        if(node.type==='ImportExpression'||node.type==='MetaProperty'||node.type==='WithStatement'||
           node.type==='Identifier'&&(node.name==='eval'||node.name==='Function')) {
          throw new TypeError('Public SCO export uses dynamic module/source inspection: '+name);
        }
        // A caller can bind an ambient global as "this" even when its
        // source code contains no explicit globalThis/process identifier.
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
  }
  if(privateChunks.length!==selected.size)throw new TypeError('Unknown private SCO export name');
  if(!publicChunks.length)throw new TypeError('Selective SCO requires at least one retained public export');
  // Server and client load different function objects. Private code that reads
  // or mutates a public export can observe the wrong copy after partitioning.
  const publicBindings=new Set(publicNames);
  for(const body of privateBodies){
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
  const clientCode=publicChunks.join('\n')+'\n'+partition.clientFile.code;
  parse(clientCode,'module');
  return {...partition,publicNames,privateNames:[...options.privateNames],
    clientFile:{...partition.clientFile,code:clientCode}};
}

module.exports={partitionScoSelectedAsyncExports,bindScoModuleExports};
