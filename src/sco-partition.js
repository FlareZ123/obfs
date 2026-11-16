'use strict';

const {createHash,randomBytes}=require('node:crypto');
const {parse,walk}=require('./ast');
const {safePath}=require('./core');
const {createScoBatchMethod}=require('./rpc-batch');

/**
 * @typedef {{
 *   clientFile:{path:string,sourceType:'module',code:string,privateModulePaths?:string[],privateOriginalDigests?:string[]}, 
 *   methodNames:Record<string,string>,
 *   names:string[],
 *   endpoint:string,
 *   batchMethod?:string,
 *   maxBatchCalls?:number
 * }} ScoModulePartition
 */

/**
 * Partition an explicitly dedicated ESM module containing only direct
 * exported async declarations or immutable async expression bindings into a
 * public RPC facade. The original
 * function bodies are never included in the returned client file.
 *
 * Accepted functions have simple, non-default identifier parameters and
 * cannot use this or super. This is deliberately an opt-in boundary for
 * JSON-compatible arguments and results, without automatic closure lifting.
 * All other module constructs are refused to avoid accidentally distributing
 * constants/imports that may contain secrets or dropping top-level effects.
 *
 * Bind the original server-resident namespace with bindScoModuleExports,
 * and serve only the returned clientFile via createScoHandler.
 *
 * @param {{path:string,code:string,sourceType?:'module'}} file
 * @param {{seed?:string,endpoint?:string,batch?:boolean,maxBatchCalls?:number,serverOnlyInitialization?:boolean}} [options]
 * @returns {ScoModulePartition}
 */
function partitionScoAsyncModule(file,options={}) {
  if (!file || typeof file.code!=='string' || typeof file.path!=='string' ||
      (file.sourceType!==undefined && file.sourceType!=='module')) {
    throw new TypeError('Expected one UTF-8 ES module source file');
  }
  const filename=safePath(file.path);
  if(!/\.(?:mjs|js)$/u.test(filename)) throw new TypeError('RPC partition expects a .mjs or .js module');
  const endpoint=options.endpoint??'/obfs/rpc';
  if(typeof endpoint!=='string'||!endpoint.startsWith('/')||endpoint.startsWith('//')||
      /[\\?#\x00-\x20]/u.test(endpoint)) {
    throw new TypeError('RPC endpoint must be a same-origin absolute path');
  }
  const ast=parse(file.code,'module');
  /** @type {{name:string,params:string[],expression:boolean,functionName:string|null}[]} */
  const exported=[];
  /** @type {Set<string>} */
  const used=new Set();
  for(const statement of ast.body) {
    // Explicit serverOnlyInitialization promises that non-exported module
    // initialization and private imports run on the trusted server only.
    // Exporting data or reexporting modules remains forbidden in all cases.
    if(options.serverOnlyInitialization && !statement.type.startsWith('Export')) continue;
    if(statement.type!=='ExportNamedDeclaration' || statement.source ||
        statement.specifiers?.length || !statement.declaration) {
      throw new TypeError('RPC partition requires only direct exported async function declarations or const expressions');
    }
    /** @type {{name:string,fn:import('./ast').AstNode,expression:boolean}[]} */
    const candidates=[];
    if(statement.declaration.type==='FunctionDeclaration') {
      const fn=statement.declaration;
      if(fn.id?.type!=='Identifier')throw new TypeError('RPC partition expects named async functions');
      candidates.push({name:fn.id.name,fn,expression:false});
    } else if(statement.declaration.type==='VariableDeclaration' &&
              statement.declaration.kind==='const') {
      for(const declaration of statement.declaration.declarations) {
        if(declaration.id.type!=='Identifier' || !declaration.init ||
            !['FunctionExpression','ArrowFunctionExpression'].includes(declaration.init.type)) {
          throw new TypeError('RPC partition requires immutable async function expressions');
        }
        candidates.push({name:declaration.id.name,fn:declaration.init,expression:true});
      }
    } else {
      throw new TypeError('RPC partition requires only direct exported async function declarations or const expressions');
    }
    for(const {name,fn,expression} of candidates) {
      if(!fn.async || fn.generator ||
          fn.params.some((/** @type {import('./ast').AstNode} */ param)=>param.type!=='Identifier') ||
          used.has(name)) {
        throw new TypeError('RPC partition requires distinct non-generator async functions with plain parameters');
      }
      let receiverAccess=false;
      walk(fn.body,node=>{
        // Direct eval can observe the original function's receiver without a
        // syntactic ThisExpression (for example eval("this")). The RPC stub
        // cannot reproduce both namespace-method and detached-call receivers.
        if(node.type==='ThisExpression'||node.type==='Super'||
            node.type==='CallExpression'&&node.callee?.type==='Identifier'&&
              node.callee.name==='eval')receiverAccess=true;
      });
      if(receiverAccess)throw new TypeError('RPC partition cannot preserve this/super/direct eval receivers');
      used.add(name);
      // An anonymous function expression assigned to a const receives that
      // binding's name. Explicitly named expressions retain their inner name.
      const functionName=expression && fn.type==='FunctionExpression' &&
        fn.id?.type==='Identifier' ? fn.id.name : null;
      exported.push({name,params:fn.params.map((/** @type {import('./ast').AstNode} */ param)=>param.name),
        expression,functionName});
    }
  }
  if(!exported.length)throw new TypeError('RPC partition requires at least one exported async function');
  if(options.batch && used.has('batch'))throw new TypeError('RPC batch export conflicts with original batch function');
  if(options.maxBatchCalls!==undefined && !options.batch)throw new TypeError('maxBatchCalls requires batch:true');
  const maxBatchCalls=options.batch ? (options.maxBatchCalls??64) : undefined;
  if(maxBatchCalls!==undefined && (!Number.isSafeInteger(maxBatchCalls) || maxBatchCalls<1 || maxBatchCalls>1024)) {
    throw new TypeError('maxBatchCalls must be a positive integer up to 1024');
  }

  const seed=options.seed??randomBytes(24).toString('hex');
  const helper='_scorpc_'+createHash('sha256').update(seed+'/'+filename).digest('hex').slice(0,20);
  if(used.has(helper))throw new Error('RPC helper name collision');
  /** @type {Record<string,string>} */
  const methodNames=Object.create(null);
  /** @type {Set<string>} */
  const methodIds=new Set();
  for(const item of exported) {
    const method='m'+createHash('sha256').update(seed+'/'+filename+'/'+item.name).digest('hex').slice(0,24);
    if(methodIds.has(method))throw new Error('RPC method name collision');
    methodIds.add(method);
    methodNames[item.name]=method;
  }
  const batchMethod=options.batch ? 'm'+createHash('sha256').update(seed+'/'+filename+'/$batch').digest('hex').slice(0,24) : undefined;
  if(batchMethod && methodIds.has(batchMethod))throw new Error('RPC batch method name collision');
  let code='const '+helper+'=async(method,args)=>{'
    +'const response=await fetch('+JSON.stringify(endpoint)+',{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method,args})});'
    +'const payload=await response.json();if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");return payload.value;};\n';
  for(const item of exported) {
    const prefix=item.expression ? 'export const '+item.name+'=async function'+
      (item.functionName ? ' '+item.functionName : '') : 'export async function '+item.name;
    code+=prefix+'('+item.params.join(',')+'){return await '+helper+'('+JSON.stringify(methodNames[item.name])+',[...arguments]);}'+
      (item.expression?';':'')+'\n';
  }
  if(batchMethod) {
    const mapName=helper+'map';
    if(used.has(mapName))throw new Error('RPC batch helper name collision');
    // JSON.parse creates an own __proto__ key, unlike an object literal.
    code+='const '+mapName+'=JSON.parse('+JSON.stringify(JSON.stringify(methodNames))+');\n';
    code+='export async function batch(calls){if(!Array.isArray(calls)||!calls.length||calls.length>'+maxBatchCalls+
      '||calls.some(call=>!call||typeof call.name!=="string"||!Object.hasOwn('+mapName+',call.name)||!Array.isArray(call.args)))throw TypeError("Invalid RPC batch");'+
      'return await '+helper+'('+JSON.stringify(batchMethod)+',[calls.map(call=>({method:'+mapName+'[call.name],args:call.args}))]);}\n';
  }
  return {clientFile:{path:filename,sourceType:'module',code},methodNames,
    names:exported.map(item=>item.name),endpoint,batchMethod,maxBatchCalls};
}

/**
 * Capture the original trusted server module's exports in a registry whose
 * method IDs match a previously generated public partition.
 *
 * The async functions remain in the original, server-local module namespace.
 * Calling each captured function directly avoids changing receiver semantics.
 *
 * @param {ScoModulePartition} partition
 * @param {Record<string,unknown>} serverExports
 * @returns {Record<string,(...args:any[])=>unknown|Promise<unknown>>}
 */
function bindScoModuleExports(partition,serverExports) {
  if(!partition || !Array.isArray(partition.names) || !partition.names.length ||
      !partition.methodNames || !serverExports || typeof serverExports!=='object') {
    throw new TypeError('Expected a remote module partition and server module namespace');
  }
  /** @type {Record<string,(...args:any[])=>unknown|Promise<unknown>>} */
  const methods=Object.create(null);
  for(const name of partition.names) {
    if(!Object.hasOwn(serverExports,name) || typeof serverExports[name]!=='function') {
      throw new TypeError('Missing executable server export: '+name);
    }
    const task=/** @type {(...args:any[])=>unknown|Promise<unknown>} */ (serverExports[name]);
    const methodName=partition.methodNames[name];
    if(typeof methodName!=='string'||Object.hasOwn(methods,methodName)) {
      throw new TypeError('Invalid or colliding RPC method identity');
    }
    methods[methodName]=(...args)=>task(...args);
  }
  if(partition.batchMethod) {
    if(Object.hasOwn(methods,partition.batchMethod))throw new TypeError('Colliding batch method identity');
    methods[partition.batchMethod]=createScoBatchMethod(methods,{maxCalls:partition.maxBatchCalls});
  }
  return methods;
}

module.exports={partitionScoAsyncModule,bindScoModuleExports};
