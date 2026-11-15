'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const acorn=require('acorn');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{type:'return',expression:string}|{type:'test',expression:string,yes:number,no:number}} RecoveredBlock */

/**
 * Independent source-only reconstruction of the emitted native-superblock
 * format. It never imports the compiler, knows no seed and does not use the
 * original source file. It recovers the branch tree and immediate operations.
 *
 * @param {string} source
 * @param {string} functionName
 * @returns {{source:string,blocks:number,tests:number,operations:number}}
 */
function recoverBranchFunction(source,functionName){
  const ast=/** @type {AstNode} */ (acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'}));
  const functions=ast.body.filter(node=>node.type==='FunctionDeclaration'&&node.id?.name===functionName);
  if(functions.length!==1)throw new TypeError('Expected one flattened function');
  const fn=functions[0];
  const arg=fn.params[0];
  const declaration=fn.body.body[0];
  const loop=fn.body.body[1];
  if(arg?.type!=='Identifier'||declaration?.type!=='VariableDeclaration'||
      loop?.type!=='ForStatement'||loop.body.type!=='BlockStatement') {
    throw new TypeError('Unsupported flattened shape');
  }
  const stateDecl=declaration.declarations[1];
  const switchNode=loop.body.body[0];
  if(stateDecl?.id.type!=='Identifier'||stateDecl.init?.type!=='Literal'||
      switchNode?.type!=='SwitchStatement')throw new TypeError('Missing dispatcher');
  const scratchName=declaration.declarations[0]?.id.name;
  if(typeof scratchName!=='string')throw new TypeError('Missing VM scratch register');
  /**
   * A matching number-only mask is used when dispatching and when storing a
   * target state. Symbolically cancel it without evaluating the input or
   * knowing its runtime value. This routine accepts the exact supported
   * compiler grammar, with no compiler import or seed access.
   * @param {AstNode} expression
   * @returns {AstNode}
   */
  function unmask(expression){
    if(expression.type!=='BinaryExpression'||expression.operator!=='>>>')return expression;
    const xor=expression.left,zero=expression.right;
    if(zero.type!=='Literal'||zero.value!==0||
       xor.type!=='BinaryExpression'||xor.operator!=='^') {
      throw new TypeError('Unsupported dispatcher mask encoding');
    }
    const mask=xor.right;
    if(mask.type!=='ConditionalExpression')throw new TypeError('Unknown operand mask');
    const condition=mask.test,read=mask.consequent,other=mask.alternate;
    if(condition.type!=='BinaryExpression'||condition.operator!=='==='||
       condition.left.type!=='UnaryExpression'||condition.left.operator!=='typeof'||
       condition.left.argument.type!=='Identifier'||condition.left.argument.name!==scratchName||
       condition.right.type!=='Literal'||condition.right.value!=='number'||
       read.type!=='BinaryExpression'||read.operator!=='|'||
       read.left.type!=='Identifier'||read.left.name!==scratchName||
       read.right.type!=='Literal'||read.right.value!==0||
       other.type!=='Literal'||other.value!==0) {
      throw new TypeError('Unrecognized state mask');
    }
    return xor.left;
  }
  const dispatched=unmask(switchNode.discriminant);
  if(dispatched.type!=='Identifier'||dispatched.name!==stateDecl.id.name) {
    throw new TypeError('Nonlinear state switch');
  }
  const stateName=stateDecl.id.name,initial=stateDecl.init.value;
  if(typeof initial!=='number')throw new TypeError('Invalid initial state');
  /** @type {Map<number,RecoveredBlock>} */
  const blocks=new Map();
  let operations=0;
  for(const item of switchNode.cases) {
    if(!item.test)continue;
    if(item.test.type!=='Literal'||typeof item.test.value!=='number')throw new TypeError('Nonliteral state');
    const id=item.test.value;
    const first=item.consequent[0];
    const assign=first?.expression;
    if(first.type!=='ExpressionStatement'||assign?.type!=='AssignmentExpression'||
        assign.operator!=='='||assign.left.type!=='Identifier'||assign.right.type!=='Identifier'||
        assign.right.name!==arg.name)throw new TypeError('Missing argument restoration');
    const valueName=assign.left.name;
    let expression=arg.name;
    /** @type {RecoveredBlock|null} */
    let decoded=null;
    for(const statement of item.consequent.slice(1)){
      if(statement.type==='ReturnStatement'&&statement.argument?.type==='Identifier'&&
          statement.argument.name===valueName) {
        decoded={type:'return',expression};
        continue;
      }
      if(statement.type!=='ExpressionStatement'||statement.expression.type!=='AssignmentExpression')continue;
      const node=statement.expression;
      if(node.left.type!=='Identifier')continue;
      if(node.left.name===valueName&&node.operator.endsWith('=')&&node.operator!=='=') {
        const masked=node.right;
        if(masked.type!=='BinaryExpression'||masked.operator!=='^'||
           masked.left.type!=='Literal'||masked.right.type!=='Literal'||
           typeof masked.left.value!=='number'||typeof masked.right.value!=='number') {
          throw new TypeError('Unsupported immediate encoding');
        }
        const number=masked.left.value^masked.right.value;
        expression='('+expression+' '+node.operator.slice(0,-1)+' '+number+')';
        operations++;
      } else if(node.left.name===stateName&&node.operator==='=') {
        const choice=unmask(node.right);
        if(choice.type!=='ConditionalExpression'||
           choice.test.type!=='Identifier'||choice.test.name!==valueName||
           choice.consequent.type!=='Literal'||choice.alternate.type!=='Literal'||
           typeof choice.consequent.value!=='number'||typeof choice.alternate.value!=='number') {
          throw new TypeError('Unsupported edge encoding');
        }
        decoded={type:'test',expression,
          yes:choice.consequent.value,no:choice.alternate.value};
      }
    }
    if(!decoded)throw new TypeError('State has no successor');
    blocks.set(id,decoded);
  }
  /** @type {Set<number>} */
  const visited=new Set();
  let tests=0;
  /** @param {number} id @returns {string} */
  function reconstruct(id) {
    if(visited.has(id))throw new TypeError('Cycle in flattened graph');
    visited.add(id);
    const block=blocks.get(id);
    if(!block)throw new TypeError('Missing branch target');
    if(block.type==='return')return block.expression;
    tests++;
    return '('+block.expression+' ? '+reconstruct(block.yes)+' : '+reconstruct(block.no)+')';
  }
  const expression=reconstruct(initial);
  if(visited.size!==blocks.size)throw new TypeError('Unreachable flattened state');
  return {source:'function '+functionName+'('+arg.name+'){return '+expression+';}',blocks:visited.size,tests,operations};
}

if(require.main===module) {
  const filename=path.join(__dirname,'../examples/branch-blocks/after/gate.cjs');
  fs.readFile(filename,'utf8').then(source=>{
    const recovered=recoverBranchFunction(source,'gate');
    console.log(JSON.stringify({blocks:recovered.blocks,tests:recovered.tests,operations:recovered.operations},null,2));
    console.log(recovered.source);
  }).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={recoverBranchFunction};
