'use strict';

const acorn=require('acorn');
const assert=require('node:assert/strict');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{name:string,paths:number,delta:number,source:string}} Recovery */

/**
 * @param {AstNode} node
 * @returns {number|null}
 */
function literalInt(node){
  if(node?.type==='Literal'&&typeof node.value==='number'&&
    Number.isSafeInteger(node.value))return node.value;
  if(node?.type==='UnaryExpression'&&
    ['+','-'].includes(node.operator)){
    const inner=literalInt(node.argument);
    return inner===null?null:node.operator==='-'?-inner:inner;
  }
  return null;
}

/**
 * A source-only, seedless attacker for the compact public case layout.
 * It extracts each variant's independently declared additive pair, proves
 * that all cases agree modulo 2^32, and emits a one-expression replacement.
 * The attacker is deliberately separate from the compiler implementation.
 *
 * @param {string} source
 * @param {string[]} names
 * @returns {Recovery[]}
 */
function recoverCompact(source,names){
  const ast=/** @type {AstNode} */ (/** @type {unknown} */ (
    acorn.parse(source,{sourceType:'module',ecmaVersion:'latest'})
  ));
  /** @type {Recovery[]} */
  const recovered=[];
  for(const name of names){
    const declaration=ast.body.find((/** @type {AstNode} */ statement)=>
      statement.type==='ExportNamedDeclaration'&&
      statement.declaration?.type==='FunctionDeclaration'&&
      statement.declaration.id?.name===name)?.declaration;
    if(!declaration||declaration.params?.length!==1||
      declaration.params[0].type!=='Identifier'){
      throw new Error('Missing compact public target '+name);
    }
    const parameter=declaration.params[0].name;
    const statements=declaration.body.body;
    const init=statements[0];
    const select=statements[1];
    if(!init||init.type!=='VariableDeclaration'||!select||
      select.type!=='SwitchStatement'){
      throw new Error('Unexpected public dispatcher '+name);
    }
    const normalized=init.declarations[0]?.id?.name;
    /** @type {number[]} */
    const deltas=[];
    for(const entry of select.cases){
      if(entry.test===null)continue;
      const body=entry.consequent;
      if(body.length!==1||body[0].type!=='BlockStatement'||
        body[0].body.length!==2){
        throw new Error('Unexpected public case block '+name);
      }
      const [declarationNode,returnNode]=body[0].body;
      const part=declarationNode.declarations?.[0];
      const expression=part?.init;
      const result=returnNode.argument;
      if(declarationNode.type!=='VariableDeclaration'||returnNode.type!=='ReturnStatement'||
        expression?.type!=='BinaryExpression'||expression.operator!=='+'||
        expression.left?.name!==normalized||
        result?.type!=='BinaryExpression'||result.operator!=='|'||
        result.right?.value!==0||result.left?.type!=='BinaryExpression'||
        result.left.operator!=='+'||result.left.left?.name!==part.id.name){
        throw new Error('Unexpected compact arithmetic case '+name);
      }
      const first=literalInt(expression.right),last=literalInt(result.left.right);
      if(first===null||last===null)throw new Error('Nonliteral public additive terms '+name);
      deltas.push((first+last)|0);
    }
    if(deltas.length<2||!deltas.every(delta=>delta===deltas[0])){
      throw new Error('Inconsistent public compact cases '+name);
    }
    const delta=deltas[0];
    const output='function '+name+'('+parameter+'){return (('+parameter+'|0)+('+delta+'))|0;}';
    recovered.push({name,paths:deltas.length,delta,source:output});
  }
  return recovered;
}

/**
 * @param {string} source
 * @param {string[]} names
 * @returns {string}
 */
function summarizeRecovered(source,names){
  const recovered=recoverCompact(source,names);
  assert.equal(recovered.length,names.length);
  return recovered.map(item=>item.source).join('\n');
}

module.exports={recoverCompact,summarizeRecovered};
