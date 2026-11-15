'use strict';

const {createHash}=require('node:crypto');
const {parse,applyEdits,observesFunctionSource}=require('../src/ast');

/** @typedef {'script'|'module'|'commonjs'} SourceType */
/** @typedef {{sourceType?:SourceType,seed?:string}} VmOptions */
/** @typedef {{code:string,transformed:boolean,reason:string,bytecode:number[]}} VmResult */

const OPERATOR_IDS=Object.freeze({
  '+':1,'-':2,'*':3,'^':4,'&':5,'|':6,'<<':7,'>>':8,'>>>':9
});

/**
 * A narrow structural proof: one function parameter is read once, followed
 * by immediate integer operations. There are no calls, property reads,
 * captures, branches, or hidden expression effects. Defer arbitrary JS
 * lowering until a semantics proof and a profile budget exist.
 *
 * @param {import('../src/ast').AstNode} expression
 * @param {string} parameter
 * @returns {{operator:string,operand:number}[]|null}
 */
function compileImmediateChain(expression,parameter) {
  if(expression.type==='Identifier'&&expression.name===parameter)return [];
  if(expression.type!=='BinaryExpression')return null;
  const operation=expression.operator;
  if(!Object.hasOwn(OPERATOR_IDS,operation))return null;
  const right=expression.right;
  if(right.type!=='Literal'||typeof right.value!=='number'||
      !Number.isInteger(right.value)||right.value<0||right.value>255)return null;
  const previous=compileImmediateChain(expression.left,parameter);
  if(previous===null)return null;
  return [...previous,{operator:operation,operand:right.value}];
}

/**
 * Generate an experimental register VM by replacing the body of one exact
 * named single-argument function declaration. This changes Function#toString
 * and stack formatting, so it is deliberately not wired into core passes.
 * The input must be audited/opted-in by the caller.
 *
 * @param {string} source
 * @param {string} functionName
 * @param {VmOptions} [options]
 * @returns {VmResult}
 */
function lowerImmediateFunction(source,functionName,options={}) {
  const sourceType=options.sourceType??'script';
  const ast=parse(source,sourceType);
  const skipped=/** @param {string} reason @returns {VmResult} */ reason=>
    ({code:source,transformed:false,reason,bytecode:[]});
  if(observesFunctionSource(ast))return skipped('Function source introspection may expose changed body');
  const matches=ast.body.filter(node=>
    node.type==='FunctionDeclaration' && node.id?.name===functionName);
  if(matches.length!==1)return skipped('Expected exactly one top-level named function declaration');
  const functionNode=matches[0];
  if(functionNode.async||functionNode.generator||functionNode.params.length!==1||
      functionNode.params[0].type!=='Identifier')return skipped('Unsupported function signature');
  const body=functionNode.body.body;
  if(body.length!==1||body[0].type!=='ReturnStatement'||!body[0].argument) {
    return skipped('Function must only return a pure immediate expression');
  }
  const parameter=functionNode.params[0].name;
  const operations=compileImmediateChain(body[0].argument,parameter);
  if(!operations||operations.length===0)return skipped('Unsupported expression shape');
  const entropy=createHash('sha256').update(options.seed??'vm-experiment').update('\0')
    .update(functionName).digest();
  const rotation=entropy[0];
  const immediateKey=entropy[1];
  /** @param {number} opcode @returns {number} */
  const op=opcode=>(opcode+rotation)&255;
  /** @type {number[]} */
  const bytes=[];
  for(const item of operations)bytes.push(op(OPERATOR_IDS[/** @type {keyof typeof OPERATOR_IDS} */(item.operator)]),item.operand^immediateKey);
  bytes.push(op(10));
  const prefix='__vm_'+entropy.subarray(2,6).toString('hex')+'_';
  const program=prefix+'p',counter=prefix+'i',value=prefix+'v';
  const cases=Object.entries(OPERATOR_IDS).map(([operator,id])=>
    `case ${op(id)}:${value}${operator}= (${program}[${counter}++]^${immediateKey});break;`).join('');
  const replacement=`{const ${program}=${JSON.stringify(bytes)};let ${value}=${parameter},${counter}=0;for(;;){switch(${program}[${counter}++]){${cases}case ${op(10)}:return ${value};}}}`;
  const code=applyEdits(source,[{
    start:functionNode.body.start,end:functionNode.body.end,text:replacement
  }]);
  parse(code,sourceType);
  return {code,transformed:true,reason:'one-argument immediate expression proved',bytecode:bytes};
}

module.exports={lowerImmediateFunction};
