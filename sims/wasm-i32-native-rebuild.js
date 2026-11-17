'use strict';

const acorn=require('acorn');
const walk=require('acorn-walk');
const {recoverPublicWasmExpression}=require('./wasm-i32-static-recover');

/**
 * Public-output-only reconstruction of a small CommonJS API from actual
 * compiler-emitted WebAssembly and its wrapper syntax. No obfuscator imports,
 * source original, compiler seed, or execution of the protected module.
 *
 * Scope: one top-level module.exports object of direct function references,
 * where every exported function simply forwards its own parameters to an
 * eagerly initialized Wasm helper. Unsupported graphs refuse reconstruction.
 *
 * @typedef {{name:string,localName:string,parameters:string[],expression:string,wasmBytes:number}} RecoveredExport
 */

/**
 * @param {string} publicSource
 * @returns {{code:string,functions:RecoveredExport[],sourceBytes:number,replacementBytes:number}}
 */
function reconstructPublicWasmCommonJs(publicSource){
  if(typeof publicSource!=='string')throw new TypeError('Expected delivered CommonJS source');
  const ast=acorn.parse(publicSource,{ecmaVersion:'latest',sourceType:'script',
    allowReturnOutsideFunction:true,allowHashBang:true});
  /** @type {Map<string,string>} */
  const helpers=new Map();
  /** @type {Map<string,{parameters:string[],helper:string}>} */
  const wrappers=new Map();
  walk.simple(ast,{
    VariableDeclarator(node){
      if(node.id.type!=='Identifier'||!node.init)return;
      const candidate=publicSource.slice(node.init.start,node.init.end);
      if(candidate.includes('new globalThis.WebAssembly.Module('))
        helpers.set(node.id.name,candidate);
    },
    FunctionDeclaration(node){
      const statement=node.body.body[0];
      if(!node.id||node.params.some(param=>param.type!=='Identifier')||
          node.body.body.length!==1||statement.type!=='ReturnStatement')return;
      const parameters=node.params.map(param=>
        (/** @type {import('acorn').Identifier} */ (param)).name);
      let expression=statement.argument;
      if(!expression)return;
      if(expression.type==='BinaryExpression'&&expression.operator==='>>>'&&
          expression.right.type==='Literal'&&expression.right.value===0&&
          expression.left.type!=='PrivateIdentifier')
        expression=expression.left;
      if(expression.type!=='CallExpression'||expression.callee.type!=='Identifier'||
          expression.arguments.length!==parameters.length||
          expression.arguments.some((arg,index)=>arg.type!=='Identifier'||
            arg.name!==parameters[index]))return;
      wrappers.set(node.id.name,{parameters,helper:expression.callee.name});
    }
  });
  /** @type {Array<{name:string,localName:string}>} */
  let exportsList=[];
  let exportAssignments=0;
  for(const statement of ast.body){
    if(statement.type!=='ExpressionStatement')continue;
    const assignment=statement.expression;
    if(assignment.type!=='AssignmentExpression'||assignment.operator!=='='||
        assignment.left.type!=='MemberExpression'||assignment.left.computed||
        assignment.left.object.type!=='Identifier'||
        assignment.left.object.name!=='module'||
        assignment.left.property.type!=='Identifier'||
        assignment.left.property.name!=='exports')continue;
    exportAssignments++;
    if(assignment.right.type!=='ObjectExpression')
      throw new TypeError('Expected an exported object of direct function references');
    exportsList=assignment.right.properties.map(property=>{
      if(property.type!=='Property'||property.computed||
          property.value.type!=='Identifier')
        throw new TypeError('Unsupported CommonJS export property');
      const name=property.key.type==='Identifier'?property.key.name:
        property.key.type==='Literal'&&typeof property.key.value==='string'?
          property.key.value:null;
      if(!name)throw new TypeError('Unsupported CommonJS export key');
      return {name,localName:property.value.name};
    });
  }
  if(exportAssignments!==1||!exportsList.length||
      new Set(exportsList.map(item=>item.name)).size!==exportsList.length)
    throw new TypeError('Expected one unambiguous CommonJS export-object assignment');
  /** @type {RecoveredExport[]} */
  const functions=[];
  for(const item of exportsList){
    const wrapper=wrappers.get(item.localName);
    const initializer=wrapper&&helpers.get(wrapper.helper);
    if(!wrapper||!initializer)
      throw new TypeError('No reconstructable Wasm wrapper for '+item.name);
    const recovered=recoverPublicWasmExpression(initializer,wrapper.parameters);
    functions.push({name:item.name,localName:item.localName,
      parameters:wrapper.parameters,expression:recovered.expression,
      wasmBytes:recovered.bytes});
  }
  const declarations=functions.map(item=>'function '+item.localName+
    '('+item.parameters.join(',')+'){return '+item.expression+';}');
  const exported=functions.map(item=>JSON.stringify(item.name)+':'+item.localName).join(',');
  const code="'use strict';\n"+declarations.join('\n')+
    '\nmodule.exports={'+exported+'};\n';
  return {code,functions,sourceBytes:Buffer.byteLength(publicSource),
    replacementBytes:Buffer.byteLength(code)};
}

module.exports={reconstructPublicWasmCommonJs};
