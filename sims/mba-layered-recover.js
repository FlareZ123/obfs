'use strict';

const {parse,walk,applyEdits}=require('../src/ast');
const {normalizeMba}=require('./mba-static-normalize');

/** @typedef {'script'|'module'|'commonjs'} SourceType */
/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{code:string,initial:number,composed:number}} LayerRecovery */

/** @param {AstNode} n @returns {boolean} */
function primitive(n){return n.type==='Identifier'||
  n.type==='Literal'&&typeof n.value==='number';}

/**
 * Validate an expression is pure before treating its repeated appearances
 * as algebraically cancellable. The target still requires primitive Int32
 * arguments; an unknown mutable object bound to a name could be unsafe.
 * @param {AstNode} n
 * @returns {boolean}
 */
function pure(n){
  if(n.type==='Identifier'||n.type==='Literal'&&typeof n.value==='number')return true;
  if(n.type==='UnaryExpression'&&['~','+','-'].includes(n.operator))return pure(n.argument);
  return n.type==='BinaryExpression'&&['+','-','^','&','|','<<','>>','>>>'].includes(n.operator)&&
    pure(n.left)&&pure(n.right);
}

/** @param {AstNode} a @param {AstNode} b @returns {boolean} */
function shape(a,b){
  if(a.type!==b.type)return false;
  switch(a.type){
    case 'Identifier':return a.name===b.name;
    case 'Literal':return Object.is(a.value,b.value);
    case 'UnaryExpression':return a.operator===b.operator&&shape(a.argument,b.argument);
    case 'BinaryExpression':return a.operator===b.operator&&shape(a.left,b.left)&&shape(a.right,b.right);
    default:return false;
  }
}

/**
 * Second-stage attacker. First run the independent seedless public-identity
 * normalizer. It makes two initially distinct De Morgan mask expressions
 * structurally identical. Then cancel repeated pure masks on both sides of
 * XOR without learning any random number or reading compiler source.
 * @param {string} distributedCode
 * @param {SourceType} [sourceType]
 * @returns {LayerRecovery}
 */
function recoverLayeredMba(distributedCode,sourceType='commonjs'){
  const first=normalizeMba(distributedCode,sourceType);
  const ast=parse(first.code,sourceType);
  /** @type {import('../src/ast').Edit[]} */
  const candidates=[];
  walk(ast,node=>{
    if(node.type!=='BinaryExpression'||node.operator!=='^'||
        node.left.type!=='BinaryExpression'||node.left.operator!=='^'||
        node.right.type!=='BinaryExpression'||node.right.operator!=='^')return;
    const a=node.left.left,b=node.right.left;
    const m1=node.left.right,m2=node.right.right;
    if(!primitive(a)||!primitive(b)||!pure(m1)||!shape(m1,m2))return;
    candidates.push({start:node.start,end:node.end,
      text:'('+first.code.slice(a.start,a.end)+'^'+first.code.slice(b.start,b.end)+')'});
  });
  candidates.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  for(const candidate of candidates)if(!edits.some(x=>candidate.start<x.end&&x.start<candidate.end))edits.push(candidate);
  const code=applyEdits(first.code,edits);
  parse(code,sourceType);
  return {code,initial:first.rewrites,composed:edits.length};
}

module.exports={recoverLayeredMba};
