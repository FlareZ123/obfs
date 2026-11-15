'use strict';

const {parse,walk,applyEdits}=require('../src/ast');

/** @typedef {'script'|'module'|'commonjs'} SourceType */
/** @typedef {{operator:string,pattern:string}} Identity */
/** @typedef {{code:string,rewrites:number}} Recovery */
/** @typedef {import('../src/ast').AstNode} AstNode */

// Source-only attacker: recognizes public polynomial identities, with no
// compiler source, seed, mask, hash-function implementation, or original input.
// This is deliberately independent of workplace/mba-i32-lower.js.
/** @type {Identity[]} */
const IDENTITIES=[
  {operator:'+',pattern:'(((__L|__R)+(__L&__R)))'},
  {operator:'+',pattern:'(((__L^__R)+((__L&__R)<<1)))'},
  {operator:'+',pattern:'(((__L&__R)-(~__L&~__R)-1))'},
  {operator:'-',pattern:'((__L+~__R+1))'},
  {operator:'-',pattern:'(((__L^~__R)+((__L&~__R)<<1)+1))'},
  {operator:'-',pattern:'(((__L|~__R)+(__L&~__R)+1))'},
  {operator:'^',pattern:'(((__L|__R)&~(__L&__R)))'},
  {operator:'^',pattern:'(((__L&~__R)|(~__L&__R)))'},
  {operator:'^',pattern:'(((__L^__M)^(__R^__M)))'},
  {operator:'&',pattern:'(((__L|__R)^(__L^__R)))'},
  {operator:'&',pattern:'((~(~__L|~__R)))'},
  {operator:'&',pattern:'(((__L^__R)^(__L|__R)))'},
  {operator:'|',pattern:'(((__L^__R)|(__L&__R)))'},
  {operator:'|',pattern:'((~(~__L&~__R)))'},
  {operator:'|',pattern:'(((__L^__R)^(__L&__R)))'}
];

const TEMPLATES=IDENTITIES.map(item=>({operator:item.operator,
  ast:/** @type {AstNode} */ (parse(item.pattern,'script').body[0].expression)}));

/** @param {AstNode} n @returns {boolean} */
function atom(n){return n.type==='Identifier'||n.type==='Literal'&&typeof n.value==='number';}
/** @param {AstNode} n @returns {boolean} */
function mask(n){return n.type==='Literal'&&Number.isInteger(n.value) ||
  n.type==='UnaryExpression'&&n.operator==='-'&&n.argument.type==='Literal'&&
    Number.isInteger(n.argument.value);}
/** @param {AstNode} left @param {AstNode} right @returns {boolean} */
function equal(left,right){
  return left.type===right.type&&
    (left.type==='Identifier'?left.name===right.name:
      left.type==='Literal'?Object.is(left.value,right.value):
      left.type==='UnaryExpression'?left.operator===right.operator&&equal(left.argument,right.argument):false);
}

/**
 * Match only narrowly proven tree identities on side-effect-free literal or
 * identifier operands. Prevents rewriting calls/getters during an attack.
 * @param {AstNode} template
 * @param {AstNode} actual
 * @param {Map<string,AstNode>} bound
 * @returns {boolean}
 */
function unify(template,actual,bound){
  if(template.type==='Identifier'&&['__L','__R','__M'].includes(template.name)){
    const name=template.name;
    if(name==='__M'?!mask(actual):!atom(actual))return false;
    const old=bound.get(name);
    if(old)return equal(old,actual);
    bound.set(name,actual);
    return true;
  }
  if(template.type!==actual.type)return false;
  if(template.type==='BinaryExpression')return template.operator===actual.operator&&
    unify(template.left,actual.left,bound)&&unify(template.right,actual.right,bound);
  if(template.type==='UnaryExpression')return template.operator===actual.operator&&
    unify(template.argument,actual.argument,bound);
  if(template.type==='Literal')return Object.is(template.value,actual.value);
  if(template.type==='Identifier')return template.name===actual.name;
  return false;
}

/**
 * Independent source-only MBA canonicalizer. The attacker needs only the
 * distributed JavaScript source; there is no oracle and no knowledge of seed.
 * Scope: the 15 current public identities on primitive operand leaves.
 * @param {string} source
 * @param {SourceType} [sourceType]
 * @returns {Recovery}
 */
function normalizeMba(source,sourceType='commonjs'){
  const ast=parse(source,sourceType);
  /** @type {import('../src/ast').Edit[]} */
  const candidates=[];
  walk(ast,node=>{
    if(node.type!=='BinaryExpression'&&node.type!=='UnaryExpression')return;
    for(const identity of TEMPLATES){
      /** @type {Map<string,AstNode>} */
      const bindings=new Map();
      if(!unify(identity.ast,node,bindings))continue;
      const left=bindings.get('__L'),right=bindings.get('__R');
      if(!left||!right)continue;
      candidates.push({start:node.start,end:node.end,text:'('+
        source.slice(left.start,left.end)+identity.operator+
        source.slice(right.start,right.end)+')'});
      break;
    }
  });
  // Prefer the outermost certified identity. An inner sub-expression may itself
  // coincidentally match another identity; the outer match recovers more code.
  candidates.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  for(const candidate of candidates){
    if(edits.some(other=>candidate.start<other.end&&other.start<candidate.end))continue;
    edits.push(candidate);
  }
  const code=applyEdits(source,edits);
  parse(code,sourceType);
  return {code,rewrites:edits.length};
}

module.exports={normalizeMba};
