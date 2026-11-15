'use strict';

const {parse,walk}=require('../src/ast');

/** @typedef {'script'|'module'|'commonjs'} SourceType */
/** @typedef {{expression:string,operations:number,bytecodeLength:number}} RecoveredVm */

/**
 * Source-only attack against the experimental immediate-opcode VM. No seed,
 * execution, server requests, or instrumentation is needed: the public case
 * labels reveal opcode meanings and the public XOR literal reveals immediates.
 *
 * This intentionally accepts only the current generator's documented subset.
 * It is a regression for the limited security of this simple VM design.
 *
 * @param {string} programSource
 * @param {string} functionName
 * @param {SourceType} [sourceType]
 * @returns {RecoveredVm}
 */
function recoverImmediateVm(programSource,functionName,sourceType='script') {
  const ast=parse(programSource,sourceType);
  const functions=ast.body.filter(node=>node.type==='FunctionDeclaration'&&node.id?.name===functionName);
  if(functions.length!==1)throw new Error('Expected one generated function');
  const fn=functions[0];
  /** @type {number[]|null} */
  let program=null;
  /** @type {Map<number,{operator:string,key:number}>} */
  const commands=new Map();
  /** @type {number|null} */
  let returnOpcode=null;
  walk(fn.body,node=>{
    if(node.type==='VariableDeclarator' && node.init?.type==='ArrayExpression' &&
        node.init.elements.length && node.init.elements.every(element=>
          element?.type==='Literal' && typeof element.value==='number' &&
          Number.isSafeInteger(element.value))) {
      if(program!==null)throw new Error('Ambiguous program arrays');
      program=node.init.elements.map(element=>element.value);
    }
    if(node.type!=='SwitchCase' || node.test?.type!=='Literal' ||
        typeof node.test.value!=='number')return;
    const opcode=node.test.value;
    const returnNode=node.consequent.find(item=>item.type==='ReturnStatement');
    if(returnNode) {
      returnOpcode=opcode;
      return;
    }
    const effect=node.consequent.find(item=>item.type==='ExpressionStatement' &&
      item.expression?.type==='AssignmentExpression');
    if(!effect)return;
    const assignment=effect.expression;
    if(!assignment.operator.endsWith('=') || assignment.right.type!=='BinaryExpression' ||
        assignment.right.operator!=='^' || assignment.right.right.type!=='Literal' ||
        typeof assignment.right.right.value!=='number')return;
    commands.set(opcode,{operator:assignment.operator.slice(0,-1),
      key:assignment.right.right.value});
  });
  if(program===null||returnOpcode===null)throw new Error('Not a recognized VM');
  let expression=fn.params[0]?.name;
  if(typeof expression!=='string')throw new Error('Unsupported argument signature');
  let cursor=0,operations=0,returned=false;
  while(cursor<program.length) {
    const opcode=program[cursor++];
    if(opcode===returnOpcode) {
      returned=true;
      break;
    }
    const command=commands.get(opcode);
    if(!command||cursor>=program.length)throw new Error('Unrecognized instruction');
    const constant=program[cursor++]^command.key;
    expression='('+expression+command.operator+constant+')';
    operations++;
  }
  if(!returned||cursor!==program.length)throw new Error('Malformed return instruction');
  return {expression,operations,bytecodeLength:program.length};
}

module.exports={recoverImmediateVm};
