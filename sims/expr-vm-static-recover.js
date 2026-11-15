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
    if(/stack\.push\(args\[inst\[1\]\]\)/u.test(body)) {
      operation={kind:'param'};
    } else if(/stack\.push\(inst\[1\]\)/u.test(body)) {
      operation={kind:'literal'};
    } else {
      const binary=/stack\.push\(a\s*(===|!==|>>>|>>|<<|==|!=|\*\*|<=|>=|[+\-*/%|&^<>])\s*b\)/u.exec(body);
      const unary=/stack\.push\((typeof\s+|void\s+|[!~+\-])a\)/u.exec(body);
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
  if(!ret||ret.argument?.type!=='CallExpression'||
      ret.argument.arguments[0]?.type!=='ArrayExpression') {
    throw new Error('Target does not call a recognized VM helper');
  }
  const program=ret.argument.arguments[0].elements;
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
