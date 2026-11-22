'use strict';

const acorn=require('acorn');
const {recoverPublicWasmExpression,isGeneratedWasmExportReference}=
  require('./wasm-i32-static-recover');

/** @typedef {{name:string,exportName:string,parameters:string[],expression:string,wasmBytes:number}} RecoveredExport */

/**
 * Rebuild private ESM Wasm kernels from delivered output while preserving
 * public wrapper declarations byte-for-byte. A public export may forward
 * through private local wrappers before reaching a generated Wasm helper.
 *
 * @param {string} publicSource
 * @returns {{code:string,functions:RecoveredExport[],sourceBytes:number,replacementBytes:number}}
 */
function reconstructPublicWasmEsm(publicSource){
  if(typeof publicSource!=='string')throw new TypeError('Expected delivered ESM JavaScript text');
  const ast=acorn.parse(publicSource,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
  /** @type {string[]} */
  const preservedImports=[];
  /** @type {Map<string,import('acorn').FunctionDeclaration>} */
  const helpers=new Map();
  /** @type {Map<string,{source:string,start:number}>} */
  const functionSources=new Map();
  /** @type {Array<{node:import('acorn').FunctionDeclaration,name:string}>} */
  const exported=[];
  for(const statement of ast.body){
    if(statement.type==='ImportDeclaration'){
      preservedImports.push(publicSource.slice(statement.start,statement.end));
      continue;
    }
    if(statement.type==='FunctionDeclaration'){
      if(!statement.id||helpers.has(statement.id.name))throw new TypeError('Duplicate top-level function');
      helpers.set(statement.id.name,statement);
      functionSources.set(statement.id.name,{source:publicSource.slice(statement.start,statement.end),start:statement.start});
      continue;
    }
    if(statement.type==='ExportNamedDeclaration'&&statement.declaration?.type==='FunctionDeclaration'){
      const fn=statement.declaration;
      if(!fn.id||helpers.has(fn.id.name))throw new TypeError('Duplicate exported function');
      helpers.set(fn.id.name,fn);
      functionSources.set(fn.id.name,{source:publicSource.slice(statement.start,statement.end),start:statement.start});
      exported.push({node:fn,name:fn.id.name});
      continue;
    }
    if(statement.type==='ExpressionStatement'&&statement.directive)continue;
    throw new TypeError('Unproved ESM module top-level effect');
  }
  if(!exported.length)throw new TypeError('Expected an exported Wasm wrapper');

  /**
   * Return the next function name for a simple positional forwarding wrapper.
   * @param {import('acorn').FunctionDeclaration} fn
   * @returns {string|null}
   */
  function forwardingTarget(fn){
    if(fn.params.length<1||fn.params.length>4||
       fn.params.some(param=>param.type!=='Identifier')||fn.body.body.length!==1)return null;
    const statement=fn.body.body[0];
    if(statement.type!=='ReturnStatement'||!statement.argument)return null;
    let expression=statement.argument;
    if(expression.type==='BinaryExpression'&&expression.operator==='>>>'&&
       expression.right.type==='Literal'&&expression.right.value===0&&
       expression.left.type!=='PrivateIdentifier')expression=expression.left;
    if(expression.type!=='CallExpression'||expression.callee.type!=='Identifier'||
       expression.arguments.length!==fn.params.length||
       expression.arguments.some((arg,index)=>arg.type!=='Identifier'||
         arg.name!==fn.params[index].name))return null;
    return expression.callee.name;
  }

  /**
   * Determine whether a function declaration is a compiler-generated lazy
   * Wasm export helper with the expected two-statement initialization shape.
   * @param {string} name
   * @param {import('acorn').FunctionDeclaration} fn
   * @returns {boolean}
   */
  function isGeneratedHelper(name,fn){
    const statements=fn.body.body;
    const initializer=statements[0]?.type==='ExpressionStatement'?
      statements[0].expression:null;
    const returning=statements[1];
    if(statements.length!==2||initializer?.type!=='AssignmentExpression'||
       initializer.operator!=='='||initializer.left.type!=='Identifier'||
       initializer.left.name!==name||
       !isGeneratedWasmExportReference(initializer.right,publicSource)||
       returning?.type!=='ReturnStatement'||!returning.argument||
       returning.argument.type!=='CallExpression'||
       returning.argument.callee.type!=='Identifier'||
       returning.argument.callee.name!==name||
       fn.params.length<1||fn.params.length>4||
       fn.params.some(param=>param.type!=='Identifier'))return false;
    const parameters=fn.params.map(param=>
      (/** @type {import('acorn').Identifier} */(param)).name);
    return returning.argument.arguments.length===parameters.length&&
      returning.argument.arguments.every((arg,index)=>
        arg.type==='Identifier'&&arg.name===parameters[index]);
  }

  /** @type {Set<string>} */
  const usedFunctions=new Set();
  /** @type {Set<string>} */
  const generatedHelpers=new Set();
  /** @type {Set<string>} */
  const kernelNames=new Set();
  /** @type {Set<string>} */
  const directlyExportedKernels=new Set();
  /** @type {RecoveredExport[]} */
  const functions=[];
  for(const item of exported){
    let currentName=item.name;
    const chain=[];
    const seen=new Set();
    while(true){
      if(seen.has(currentName))throw new TypeError('Cyclic ESM wrapper chain');
      seen.add(currentName);
      const current=helpers.get(currentName);
      if(!current)throw new TypeError('Missing ESM wrapper '+currentName);
      chain.push(currentName);
      if(isGeneratedHelper(currentName,current)){
        generatedHelpers.add(currentName);
        usedFunctions.add(currentName);
        throw new TypeError('Export points directly to a generated helper');
      }
      const nextName=forwardingTarget(current);
      if(!nextName)throw new TypeError(chain.length===1?
        'Unsupported exported ESM wrapper '+currentName:
        'Unrecognized compiler helper '+currentName);
      const next=helpers.get(nextName);
      if(!next)throw new TypeError('Missing compiler helper '+nextName);
      if(next.params.length!==current.params.length)
        throw new TypeError('Unproved ESM wrapper arity '+currentName);
      if(isGeneratedHelper(nextName,next)){
        const kernelName=currentName;
        const parameters=current.params.map(param=>
          (/** @type {import('acorn').Identifier} */(param)).name);
        const recovered=recoverPublicWasmExpression(
          publicSource.slice(next.start,next.end),parameters);
        functions.push({name:kernelName,exportName:item.name,parameters,
          expression:recovered.expression,wasmBytes:recovered.bytes});
        kernelNames.add(kernelName);
        generatedHelpers.add(nextName);
        usedFunctions.add(nextName);
        for(const name of chain)usedFunctions.add(name);
        if(chain.length===1)directlyExportedKernels.add(kernelName);
        break;
      }
      currentName=nextName;
    }
  }
  if(usedFunctions.size!==helpers.size||
     new Set(functions.map(fn=>fn.name)).size!==functions.length)
    throw new TypeError('Unrecognized or unreferenced ESM function declarations');

  const uniqueKernels=new Map();
  for(const fn of functions)if(!uniqueKernels.has(fn.name))uniqueKernels.set(fn.name,fn);
  const kernelDeclarations=[...uniqueKernels.values()].map(fn=>
    (directlyExportedKernels.has(fn.name)?'export function ':'function ')+
      fn.name+'('+fn.parameters.join(',')+'){return '+fn.expression+';}');
  const preservedWrappers=[...usedFunctions]
    .filter(name=>!kernelNames.has(name)&&!generatedHelpers.has(name))
    .map(name=>functionSources.get(name)).filter(Boolean)
    .sort((a,b)=>a.start-b.start).map(item=>item.source);
  const code=preservedImports.join('\n')+(preservedImports.length?'\n':'')+
    kernelDeclarations.join('\n')+
    (preservedWrappers.length?'\n'+preservedWrappers.join('\n'):'')+'\n';
  return {code,functions,sourceBytes:Buffer.byteLength(publicSource),
    replacementBytes:Buffer.byteLength(code)};
}

module.exports={reconstructPublicWasmEsm};
