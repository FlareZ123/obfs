'use strict';

const acorn=require('acorn');

/** @typedef {{a:number,b:number}} Affine */

/**
 * Independent, seedless static reconstruction of the emitted affine backend.
 * Its only input is public JavaScript source. It does not import the compiler,
 * use its hash derivation, execute the protected function, or need a key.
 * @param {string} source
 * @param {string} name
 * @returns {{multiplier:number,offset:number}}
 */
function recoverAffine(source,name) {
  const ast=/** @type {import('../src/ast').AstNode} */ (acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'}));
  const fn=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);
  if(!fn||fn.params.length!==1||fn.params[0].type!=='Identifier') {
    throw new TypeError('Function declaration not found');
  }
  const parameter=fn.params[0].name;
  /** @type {Map<string,Affine>} */
  const known=new Map([[parameter,{a:1,b:0}]]);
  /** @param {import('acorn').Node & {[key:string]:any}} node @returns {Affine} */
  function evaluate(node) {
    if(node.type==='Literal'&&typeof node.value==='number')return {a:0,b:node.value|0};
    if(node.type==='Identifier') {
      const value=known.get(node.name);
      if(!value)throw new TypeError('Unresolved affine identifier '+node.name);
      return value;
    }
    if(node.type==='UnaryExpression'&&node.operator==='-') {
      const x=evaluate(node.argument);
      return {a:(-x.a)|0,b:(-x.b)|0};
    }
    if(node.type!=='BinaryExpression')throw new TypeError('Unsupported expression '+node.type);
    const x=evaluate(node.left),y=evaluate(node.right);
    if(node.operator==='|') {
      if(y.a!==0||y.b!==0)throw new TypeError('Nonzero bitwise operand');
      return x;
    }
    if(node.operator==='+')return {a:(x.a+y.a)|0,b:(x.b+y.b)|0};
    if(node.operator==='-')return {a:(x.a-y.a)|0,b:(x.b-y.b)|0};
    if(node.operator==='*') {
      if(x.a!==0&&y.a!==0)throw new TypeError('Nonaffine product');
      return {a:(Math.imul(x.a,y.b)+Math.imul(x.b,y.a))|0,
        b:Math.imul(x.b,y.b)|0};
    }
    throw new TypeError('Unsupported operator '+node.operator);
  }
  for(const stmt of fn.body.body) {
    if(stmt.type==='VariableDeclaration'&&stmt.kind==='const') {
      for(const d of stmt.declarations) {
        if(d.id.type!=='Identifier'||!d.init)throw new TypeError('Unsupported declaration');
        known.set(d.id.name,evaluate(d.init));
      }
    } else if(stmt.type==='ReturnStatement'&&stmt.argument) {
      const result=evaluate(stmt.argument);
      return {multiplier:result.a,offset:result.b};
    } else throw new TypeError('Unsupported function statement');
  }
  throw new TypeError('No return statement');
}

module.exports={recoverAffine};
