'use strict';

const {parse,walk}=require('../src/ast');

/** @typedef {'module'|'commonjs'} SourceType */
/** @typedef {{expression:string,operations:number,parameterNames:string[],bytecodeLength:number}} Recovery */

/**
 * Recover the symbolic original return expression from the experimental
 * public postfix VM emitted by sims/expr-vm.js, with no source, seed, runtime
 * access, oracle calls or debug hooks. The case bodies themselves document
 * each randomized opcode's semantics. Only the generator's known register
 * helper shape is supported.
 *
 * @param {string} transformedSource
 * @param {string} functionName
 * @param {SourceType} sourceType
 * @returns {Recovery}
 */
function recoverExpressionVm(transformedSource,functionName,sourceType) {
  const ast=parse(transformedSource,sourceType);
  /** @type {Map<number,{kind:'param'|'literal'|'binary'|'unary',symbol?:string}>} */
  const opcodes=new Map();
  walk(ast,node=>{
    if(node.type!=='SwitchCase'||node.test?.type!=='Literal' ||
       typeof node.test.value!=='number')return;
    const body=transformedSource.slice(node.start,node.end);
    /** @type {{kind:'param'|'literal'|'binary'|'unary',symbol?:string}|null} */
    let operation=null;
    // Indexed stack assignments expose the same native operators as before.
    // Recover the meaning of their randomized numeric switch labels.
    if(/stack\[sp\+\+\]=args\[inst\[1\]\]/u.test(body)) {
      operation={kind:'param'};
    } else if(/stack\[sp\+\+\]=inst\[1\]/u.test(body)) {
      operation={kind:'literal'};
    } else {
      const binary=/stack\[sp\+\+\]=a\s*(===|!==|>>>|>>|<<|==|!=|\*\*|<=|>=|[+\-*/%|&^<>])\s*b/u.exec(body);
      const unary=/stack\[sp\+\+\]=(typeof\s+|void\s+|[!~+\-])a/u.exec(body);
      if(binary)operation={kind:'binary',symbol:binary[1]};
      else if(unary)operation={kind:'unary',symbol:unary[1].trim()};
    }
    if(operation!==null)opcodes.set(node.test.value,operation);
  });

  const topLevel=ast.body.map(node=>node.type==='ExportNamedDeclaration'?node.declaration:node);
  const targets=topLevel.filter(node=>node?.type==='FunctionDeclaration'&&node.id?.name===functionName);
  if(targets.length!==1)throw new Error('Expected exactly one transformed named function');
  const fn=targets[0];
  const parameters=fn.params.map(node=>node.type==='Identifier'?node.name:null);
  if(parameters.some(name=>name===null))throw new Error('Unsupported transformed parameter');
  const ret=fn.body.body.find(node=>node.type==='ReturnStatement');
  const call=ret?.argument;
  const index=call?.arguments?.[0];
  const argumentsObject=call?.arguments?.[1];
  if(call?.type!=='CallExpression'||call.callee.type!=='Identifier'||
      index?.type!=='Literal'||typeof index.value!=='number'||
      !Number.isSafeInteger(index.value)||index.value<0||
      argumentsObject?.type!=='Identifier'||argumentsObject.name!=='arguments') {
    throw new Error('Target does not call a recognized VM helper');
  }
  // Locate the public, lazily cached program array within the exact helper
  // called by the target declaration. A random opcode mapping or helper name
  // does not prevent reconstruction when the bytecode is sent to the client.
  const helpers=topLevel.filter(node=>
    node?.type==='FunctionDeclaration'&&node.id?.name===call.callee.name);
  if(helpers.length!==1)throw new Error('Expected exactly one VM helper');
  /** @type {import('../src/ast').AstNode|null} */
  let programs=null;
  walk(helpers[0],node=>{
    if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&
       node.id.name==='programs'&&node.init?.type==='LogicalExpression'&&
       node.init.operator==='||'&&node.init.right?.type==='AssignmentExpression'&&
       node.init.right.operator==='='&&node.init.right.right?.type==='ArrayExpression') {
      programs=node.init.right.right;
    }
  });
  if(!programs)throw new Error('No initialized VM bytecode table');
  const selected=/** @type {import('../src/ast').AstNode} */(programs).elements[index.value];
  if(!selected||selected.type!=='ArrayExpression')throw new Error('Missing VM bytecode program');
  const program=selected.elements;
  /** @type {string[]} */
  const stack=[];
  for(const element of program) {
    if(element?.type!=='ArrayExpression'||element.elements.length<1 ||
        element.elements[0]?.type!=='Literal' ||
        typeof element.elements[0].value!=='number')throw new Error('Unsupported instruction');
    const code=element.elements[0].value;
    const operation=opcodes.get(code);
    if(!operation)throw new Error('Unknown interpreter opcode');
    const immediate=element.elements[1];
    /** @type {string|number|boolean|null} */
    let argument=null;
    if(immediate) {
      if(immediate.type!=='Literal'||!(immediate.value===null||
          ['string','number','boolean'].includes(typeof immediate.value))) {
        throw new Error('Unsupported immediate');
      }
      argument=immediate.value;
    }
    switch(operation.kind) {
      case 'param': {
        if(typeof argument!=='number'||!Number.isInteger(argument)||
            argument<0||argument>=parameters.length)throw new Error('Invalid formal parameter index');
        stack.push(/** @type {string} */(parameters[argument]));
        break;
      }
      case 'literal':
        stack.push(JSON.stringify(argument));
        break;
      case 'unary': {
        const a=stack.pop();
        if(a===undefined)throw new Error('VM stack underflow');
        const separator=operation.symbol==='typeof'||operation.symbol==='void'?' ':'';
        stack.push('('+operation.symbol+separator+a+')');
        break;
      }
      case 'binary': {
        const b=stack.pop(),a=stack.pop();
        if(a===undefined||b===undefined)throw new Error('VM stack underflow');
        stack.push('('+a+operation.symbol+b+')');
        break;
      }
    }
  }
  if(stack.length!==1)throw new Error('Malformed postfix stack');
  return {expression:stack[0],operations:program.length,
    parameterNames:/** @type {string[]} */(parameters),bytecodeLength:program.length};
}

module.exports={recoverExpressionVm};
