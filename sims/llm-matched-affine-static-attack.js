'use strict';

const acorn=require('acorn');
const {performance}=require('node:perf_hooks');
const {recover}=require('./polyvariant-affine-static-recover');
const {recoverMinifiedPublicMath}=require('./polyvariant-app-minified-static-attacker');

const targetNames=Object.freeze(['round1','round2','round3']);

/** @typedef {{factor:number,offset:number,normalized:boolean}} Linear */
/** @typedef {{kind:'generated'|'esbuild-minified',offsets:Record<string,number>,bytes:number,attackMs:number}} Attack */

/**
 * A symbolic Int32 expression interpreter operating only on the public
 * minified function's AST, without calling the function or the original.
 * It declines if a parameter appears outside explicit |0 normalization.
 * The grammar is narrow by design: signed integer literals and +,-,|0.
 *
 * @param {import('../src/ast').AstNode} node
 * @param {string} parameter
 * @returns {Linear}
 */
function linear(node,parameter){
  if(node.type==='Identifier'){
    if(node.name!==parameter)throw new TypeError('Unknown symbolic variable');
    return {factor:1,offset:0,normalized:false};
  }
  if(node.type==='Literal'&&typeof node.value==='number'&&
     Number.isInteger(node.value)&&Math.abs(node.value)<=2147483647){
    return {factor:0,offset:node.value|0,normalized:true};
  }
  if(node.type==='UnaryExpression'&&(node.operator==='+'||node.operator==='-')){
    const arg=linear(node.argument,parameter);
    return node.operator==='-'?
      {factor:(-arg.factor)|0,offset:(-arg.offset)|0,normalized:arg.normalized}:arg;
  }
  if(node.type==='BinaryExpression'&&node.operator==='|'){
    if(node.right.type!=='Literal'||node.right.value!==0)
      throw new TypeError('Only explicit Int32 normalization is supported');
    const arg=linear(node.left,parameter);
    const directlyCoercedInput=node.left.type==='Identifier'&&
      node.left.name===parameter;
    return {factor:arg.factor|0,offset:arg.offset|0,
      normalized:arg.normalized||directlyCoercedInput};
  }
  if(node.type==='BinaryExpression'&&(node.operator==='+'||node.operator==='-')){
    const left=linear(node.left,parameter);
    const right=linear(node.right,parameter);
    const multiplier=node.operator==='+'?1:-1;
    return {
      factor:(left.factor+multiplier*right.factor)|0,
      offset:(left.offset+multiplier*right.offset)|0,
      normalized:left.normalized&&right.normalized
    };
  }
  throw new TypeError('Unsupported minified expression '+node.type);
}

/**
 * The equivalent exported ESM function is extracted by a separate,
 * source-only Acorn parser. Parse only that returned function expression,
 * conservatively refusing non-expression bodies and indirect bindings.
 *
 * @param {string} publicFunction
 * @returns {number}
 */
function minifiedOffset(publicFunction){
  const parsed=/** @type {import('../src/ast').AstNode} */ (acorn.parse(
    '('+publicFunction+')',{ecmaVersion:'latest',sourceType:'module'}
  ));
  const fn=parsed.body[0]?.expression;
  if(!fn||!['FunctionExpression','ArrowFunctionExpression'].includes(fn.type)||
     fn.params.length!==1||fn.params[0].type!=='Identifier')
    throw new TypeError('Unknown minified public callable');
  const expression=fn.body.type==='BlockStatement'?
    (fn.body.body.length===1&&fn.body.body[0].type==='ReturnStatement'?
      fn.body.body[0].argument:null):fn.body;
  if(!expression)throw new TypeError('Missing single return');
  const result=linear(expression,fn.params[0].name);
  if(result.factor!==1||!result.normalized)
    throw new TypeError('Unproved single Int32 translation');
  return result.offset;
}

/**
 * Independently recover the same announced Int32 translation family from
 * one distributed source, with no function execution or runtime oracle.
 * The generated branch uses an existing source-only published interpreter;
 * the ordinary esbuild branch uses a separate restrictive AST algebra.
 * The selected branch is recognized by the actual public text grammar.
 *
 * @param {string} source
 * @returns {Attack}
 */
function attackPublishedSource(source){
  const begun=performance.now();
  const bytes=Buffer.byteLength(source);
  /** @type {Record<string,number>} */
  const offsets=Object.create(null);
  /** @type {'generated'|'esbuild-minified'} */
  let kind;
  if(source.includes('_ap_input_')&&source.includes('switch(')){
    kind='generated';
    for(const name of targetNames){
      const learned=recover(source,name,'module');
      if(learned.cases!==2)throw new Error('Missing two public paths');
      offsets[name]=learned.offset;
    }
  }else{
    kind='esbuild-minified';
    const parsed=recoverMinifiedPublicMath(source);
    for(const fn of parsed.functions)offsets[fn.name]=minifiedOffset(fn.source);
  }
  return {kind,offsets,bytes,attackMs:performance.now()-begun};
}

module.exports={attackPublishedSource,minifiedOffset};
