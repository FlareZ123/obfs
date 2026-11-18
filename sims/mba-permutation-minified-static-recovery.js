'use strict';

const assert=require('node:assert/strict');
const {transformSync}=require('esbuild');
const {parse,walk}=require('../src/ast');
const {inverseChain}=require('./mba-permutation-component-inverse');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * Flatten a binary tree for one operator.
 * @param {AstNode} node
 * @param {string} operator
 * @param {AstNode[]} [out]
 * @returns {AstNode[]}
 */
function flatten(node,operator,out=[]){
  if(node.type==='BinaryExpression'&&node.operator===operator){
    flatten(node.left,operator,out);
    flatten(node.right,operator,out);
  }else out.push(node);
  return out;
}

/**
 * @param {AstNode} node
 * @returns {bigint|null}
 */
function bigIntLiteral(node){
  if(node.type!=='Literal')return null;
  if(typeof node.value==='bigint')return node.value;
  if(typeof node.bigint==='string')return BigInt(node.bigint);
  return null;
}

/**
 * @param {AstNode} node
 * @returns {number|null}
 */
function integerLiteral(node){
  return node.type==='Literal'&&typeof node.value==='number'&&Number.isInteger(node.value)?
    node.value:null;
}

/**
 * @param {AstNode} node
 * @returns {AstNode|null}
 */
function unwrapUint64(node){
  if(node.type!=='CallExpression'||node.arguments.length!==2)return null;
  const callee=node.callee;
  if(callee.type!=='MemberExpression'||callee.computed||
      callee.object.type!=='Identifier'||callee.object.name!=='BigInt'||
      callee.property.type!=='Identifier'||callee.property.name!=='asUintN')return null;
  if(integerLiteral(node.arguments[0])!==64)return null;
  return node.arguments[1];
}

/**
 * @param {AstNode} node
 * @returns {bigint[]|null}
 */
function polynomial(node){
  const expression=unwrapUint64(node);
  if(!expression)return null;
  const terms=flatten(expression,'^');
  if(terms.length!==2)return null;
  let constant=null;
  let multiplier=null;
  for(const term of terms){
    const literal=bigIntLiteral(term);
    if(literal!==null){
      constant=literal;
      continue;
    }
    if(term.type!=='BinaryExpression'||term.operator!=='*')return null;
    const left=bigIntLiteral(term.left);
    const right=bigIntLiteral(term.right);
    if(left!==null)multiplier=left;
    else if(right!==null)multiplier=right;
    else return null;
  }
  return constant!==null&&multiplier!==null?[constant,multiplier]:null;
}

/**
 * @param {AstNode} node
 * @returns {number[]|null}
 */
function xorShifts(node){
  const expression=unwrapUint64(node);
  if(!expression)return null;
  const terms=flatten(expression,'^');
  const shifted=terms.filter(term=>term.type==='BinaryExpression'&&term.operator==='>>');
  if(shifted.length!==terms.length-1||shifted.length===0)return null;
  /** @type {number[]} */
  const shifts=[];
  for(const term of shifted){
    const amount=bigIntLiteral(term.right);
    if(amount===null||amount<1n||amount>63n)return null;
    shifts.push(Number(amount));
  }
  return shifts;
}

/**
 * @param {AstNode} node
 * @returns {number[]|null}
 */
function cyclicShifts(node){
  const terms=flatten(node,'^');
  if(terms.length<3||terms.length%2===0)return null;
  /** @type {string|null} */
  let helper=null;
  /** @type {number[]} */
  const shifts=[];
  for(const term of terms){
    if(term.type!=='CallExpression'||term.arguments.length!==2||
        term.callee.type!=='Identifier')return null;
    if(helper===null)helper=term.callee.name;
    else if(helper!==term.callee.name)return null;
    const amount=bigIntLiteral(term.arguments[1]);
    if(amount===null||amount<1n||amount>63n)return null;
    shifts.push(Number(amount));
  }
  return shifts;
}

/**
 * @param {string} source
 * @returns {{rounds:number,coefficients:bigint[],xorShifts:number[],cyclicShifts:number[],target:bigint}}
 */
function recover(source){
  const ast=parse(source,'commonjs');
  /** @type {AstNode|null} */
  let loop=null;
  /** @type {bigint|null} */
  let target=null;

  walk(ast,node=>{
    if(!loop&&node.type==='ForStatement')loop=node;
    if(node.type==='ReturnStatement'&&node.argument?.type==='BinaryExpression'&&
        ['===','=='].includes(node.argument.operator)){
      const left=bigIntLiteral(node.argument.left);
      const right=bigIntLiteral(node.argument.right);
      if(left!==null)target=left;
      if(right!==null)target=right;
    }
  });
  if(!loop||target===null)throw new Error('author-style loop or public target not found');

  const test=loop.test;
  if(!test||test.type!=='BinaryExpression'||test.operator!=='<')
    throw new Error('round bound not found');
  const rounds=integerLiteral(test.right);
  if(rounds===null||rounds<1)throw new Error('literal round count not found');

  const body=loop.body;
  /** @type {AstNode[]} */
  const assignments=[];
  walk(body,node=>{
    if(node.type==='AssignmentExpression'&&node.operator==='=')assignments.push(node.right);
  });

  /** @type {bigint[]|null} */
  let coefficients=null;
  /** @type {number[]|null} */
  let rightShifts=null;
  /** @type {number[]|null} */
  let rotations=null;
  for(const right of assignments){
    coefficients??=polynomial(right);
    rightShifts??=xorShifts(right);
    rotations??=cyclicShifts(right);
  }
  if(!coefficients||!rightShifts||!rotations)
    throw new Error('round parameters not structurally recoverable');

  return {rounds,coefficients,xorShifts:rightShifts,cyclicShifts:rotations,target};
}

const source=[
  "'use strict';",
  "function rol64(x,s){",
  "  x=BigInt.asUintN(64,x);",
  "  return BigInt.asUintN(64,(x<<s)|(x>>(64n-s)));",
  "}",
  "module.exports=function protectedSlash(c){",
  "  let x=BigInt.asUintN(64,BigInt(c));",
  "  for(let i=0;i<48;i++){",
  "    x=BigInt.asUintN(64,8099674395506127609n^(8077374509611717913n*x));",
  "    x=BigInt.asUintN(64,x^(x>>22n));",
  "    x=rol64(x,3n)^rol64(x,20n)^rol64(x,30n)^rol64(x,32n)^rol64(x,29n);",
  "  }",
  "  return x===14887200154472500695n;",
  "};"
].join('\n');

const minified=transformSync(source,{
  loader:'js',
  format:'cjs',
  target:'es2022',
  minify:true,
  legalComments:'none'
}).code;
const recovered=recover(minified);
const round={
  coefficients:recovered.coefficients,
  xorShifts:recovered.xorShifts,
  cyclicShifts:recovered.cyclicShifts
};
const input=inverseChain(recovered.target,Array.from({length:recovered.rounds},()=>round));

assert.equal(recovered.rounds,48);
assert.deepEqual(recovered.coefficients,[
  8099674395506127609n,
  8077374509611717913n
]);
assert.deepEqual(recovered.xorShifts,[22]);
assert.deepEqual(recovered.cyclicShifts,[3,20,30,32,29]);
assert.equal(recovered.target,14887200154472500695n);
assert.equal(input,47n);

console.log(JSON.stringify({
  minifiedBytes:Buffer.byteLength(minified),
  rounds:recovered.rounds,
  coefficients:recovered.coefficients.map(String),
  xorShifts:recovered.xorShifts,
  cyclicShifts:recovered.cyclicShifts,
  target:'0x'+recovered.target.toString(16).padStart(16,'0'),
  recoveredInput:Number(input),
  recoveredCharacter:String.fromCharCode(Number(input))
},null,2));
