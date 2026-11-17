'use strict';

const acorn=require('acorn');
const {recoverPublicWasmExpression}=require('./wasm-i32-static-recover');

/** @typedef {{name:string,parameters:string[],expression:string,wasmBytes:number}} RecoveredExport */

/**
 * Rebuild a pure, explicitly exported ESM WebAssembly kernel solely from the
 * publicly distributed compiler output. Reject extra top-level effects.
 * Does not inspect compiler internals, original source or build seed.
 *
 * @param {string} publicSource
 * @returns {{code:string,functions:RecoveredExport[],sourceBytes:number,replacementBytes:number}}
 */
function reconstructPublicWasmEsm(publicSource){
  if(typeof publicSource!=='string')throw new TypeError('Expected delivered ESM JavaScript text');
  const ast=acorn.parse(publicSource,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true});
  /** @type {Map<string,import('acorn').FunctionDeclaration>} */
  const helpers=new Map();
  /** @type {import('acorn').FunctionDeclaration[]} */
  const exported=[];
  for(const statement of ast.body){
    if(statement.type==='FunctionDeclaration'){
      if(helpers.has(statement.id.name))throw new TypeError('Duplicate top-level function');
      helpers.set(statement.id.name,statement);
      continue;
    }
    if(statement.type==='ExportNamedDeclaration'&&statement.declaration?.type==='FunctionDeclaration'){
      exported.push(statement.declaration);
      continue;
    }
    if(statement.type==='ExpressionStatement'&&statement.directive)continue;
    throw new TypeError('Unproved ESM module top-level effect');
  }
  if(!exported.length)throw new TypeError('Expected an exported Wasm kernel');
  /** @type {Set<string>} */
  const observedHelpers=new Set();
  /** @type {RecoveredExport[]} */
  const functions=[];
  for(const fn of exported){
    if(fn.params.length<1||fn.params.length>4||fn.params.some(param=>param.type!=='Identifier')||
        fn.body.body.length!==1)throw new TypeError('Unsupported Wasm export signature');
    const statement=fn.body.body[0];
    if(statement.type!=='ReturnStatement'||!statement.argument)
      throw new TypeError('Unsupported exported wrapper');
    const parameters=fn.params.map(param=>(/** @type {import('acorn').Identifier} */(param)).name);
    let expression=statement.argument;
    if(expression.type==='BinaryExpression'&&expression.operator==='>>>'&&
        expression.right.type==='Literal'&&expression.right.value===0&&
        expression.left.type!=='PrivateIdentifier')expression=expression.left;
    if(expression.type!=='CallExpression'||expression.callee.type!=='Identifier'||
        expression.arguments.length!==parameters.length||
        expression.arguments.some((arg,index)=>arg.type!=='Identifier'||arg.name!==parameters[index]))
      throw new TypeError('Unsupported exported Wasm forwarding');
    const helperName=expression.callee.name;
    const helper=helpers.get(helperName);
    if(!helper)throw new TypeError('Missing compiler helper '+helperName);
    const helperSource=publicSource.slice(helper.start,helper.end);
    if(!helperSource.includes('new globalThis.WebAssembly.Instance('))
      throw new TypeError('Unrecognized compiler helper '+helperName);
    const recovered=recoverPublicWasmExpression(helperSource,parameters);
    functions.push({name:fn.id.name,parameters,expression:recovered.expression,wasmBytes:recovered.bytes});
    observedHelpers.add(helperName);
  }
  if(observedHelpers.size!==helpers.size||new Set(functions.map(fn=>fn.name)).size!==functions.length)
    throw new TypeError('Unrecognized top-level declarations');
  const code=functions.map(fn=>'export function '+fn.name+'('+fn.parameters.join(',')+')'+
    '{return '+fn.expression+';}').join('\n')+'\n';
  return {code,functions,sourceBytes:Buffer.byteLength(publicSource),
    replacementBytes:Buffer.byteLength(code)};
}

module.exports={reconstructPublicWasmEsm};
