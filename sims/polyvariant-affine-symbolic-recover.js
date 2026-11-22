'use strict';

const acorn=require('acorn');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{factor:number,offset:number,bound:number}} Affine */

/**
 * A finite source-only symbolic algebra for the narrow affine emitter.
 * All accepted Number intermediates are provably exact IEEE-754 integers.
 * Reductions modulo 2^32 happen only through the emitted |0 operations.
 *
 * @param {AstNode} node
 * @param {Map<string,Affine>} environment
 * @param {number} [depth]
 * @returns {Affine}
 */
function algebra(node,environment,depth=0){
  if(depth>128)throw new TypeError('Symbolic arithmetic depth exceeded');
  if(node.type==='Literal'&&typeof node.value==='number'&&
     Number.isSafeInteger(node.value)){
    return {factor:0,offset:node.value|0,bound:Math.abs(node.value)};
  }
  if(node.type==='Identifier'){
    const learned=environment.get(node.name);
    if(learned)return learned;
    throw new TypeError('Unknown symbolic register');
  }
  if(node.type==='UnaryExpression'&&(node.operator==='+'||node.operator==='-')){
    const value=algebra(node.argument,environment,depth+1);
    if(node.operator==='+')return value;
    return {factor:(-value.factor)|0,offset:(-value.offset)|0,bound:value.bound};
  }
  if(node.type==='BinaryExpression'&&node.operator==='|'){
    if(node.right.type!=='Literal'||node.right.value!==0)
      throw new TypeError('Only explicit ToInt32 normalization is admissible');
    const value=algebra(node.left,environment,depth+1);
    return {factor:value.factor,offset:value.offset,bound:2147483648};
  }
  if(node.type==='BinaryExpression'&&
     (node.operator==='+'||node.operator==='-')){
    const left=algebra(node.left,environment,depth+1);
    const right=algebra(node.right,environment,depth+1);
    const bound=left.bound+right.bound;
    if(!Number.isSafeInteger(bound))
      throw new TypeError('Potential inexact Number addition');
    const sign=node.operator==='+'?1:-1;
    return {factor:(left.factor+sign*right.factor)|0,
      offset:(left.offset+sign*right.offset)|0,bound};
  }
  if(node.type==='BinaryExpression'&&node.operator==='*'){
    const left=algebra(node.left,environment,depth+1);
    const right=algebra(node.right,environment,depth+1);
    if(left.factor!==0&&right.factor!==0)
      throw new TypeError('Variable-dependent multiplication');
    const bound=left.bound*right.bound;
    if(!Number.isSafeInteger(bound))
      throw new TypeError('Potential inexact Number multiplication');
    if(left.factor===0&&right.factor===0)
      return {factor:0,offset:Math.imul(left.offset,right.offset),bound};
    const variable=left.factor!==0?left:right;
    const constant=left.factor===0?left:right;
    return {factor:Math.imul(variable.factor,constant.offset),
      offset:Math.imul(variable.offset,constant.offset),bound};
  }
  throw new TypeError('Unsupported symbolic expression '+node.type);
}

/**
 * Interpret a pure generated block without executing distributed JavaScript.
 * @param {AstNode} statement
 * @param {Map<string,Affine>} environment
 * @returns {Affine|null}
 */
function block(statement,environment){
  if(statement.type==='BlockStatement'){
    const local=new Map(environment);
    for(const child of statement.body){
      const value=block(child,local);
      if(value!==null)return value;
    }
    return null;
  }
  if(statement.type==='VariableDeclaration'&&statement.kind==='const'&&
     statement.declarations.length===1){
    const declaration=statement.declarations[0];
    if(declaration.id.type!=='Identifier'||!declaration.init)
      throw new TypeError('Unknown register declaration');
    if(environment.has(declaration.id.name))
      throw new TypeError('Duplicate symbolic register');
    environment.set(declaration.id.name,algebra(declaration.init,environment));
    return null;
  }
  if(statement.type==='ReturnStatement'&&statement.argument){
    const value=statement.argument;
    if(value.type!=='BinaryExpression'||value.operator!=='|'||
       value.right.type!=='Literal'||value.right.value!==0)
      throw new TypeError('Missing final ToInt32');
    return algebra(value,environment);
  }
  throw new TypeError('Unexpected generated statement '+statement.type);
}

/**
 * Recognize the compiler's exact case-domain restoration:
 *   (((normalized >> log2(paths)) << log2(paths)) | label)
 * This equals normalized only on the corresponding switch branch.
 *
 * @param {AstNode} node
 * @param {string} normalizedName
 * @param {number} shift
 * @param {number} label
 * @returns {void}
 */
function assertRestoration(node,normalizedName,shift,label){
  if(node.type!=='BinaryExpression'||node.operator!=='|'||
     node.right.type!=='Literal'||node.right.value!==label)
    throw new TypeError('Unexpected branch-domain reconstruction');
  const left=node.left;
  if(left.type!=='BinaryExpression'||left.operator!=='<<'||
     left.right.type!=='Literal'||left.right.value!==shift)
    throw new TypeError('Unexpected branch-domain shift');
  const inner=left.left;
  if(inner.type!=='BinaryExpression'||inner.operator!=='>>'||
     inner.left.type!=='Identifier'||inner.left.name!==normalizedName||
     inner.right.type!=='Literal'||inner.right.value!==shift)
    throw new TypeError('Unexpected branch-domain input');
}

/**
 * Recover the exact affine translation, or fail closed for unproved code.
 * The promised grammar is the non-compact native polyvariant emitter, with
 * pure case-local arithmetic and one original input ToInt32 before dispatch.
 * For the recognized grammar this is a symbolic proof, not sample fitting.
 *
 * @param {string} source
 * @param {string} name
 * @param {'module'|'commonjs'} [sourceType]
 * @returns {{cases:number,offset:number,source:string}}
 */
function recoverSymbolicAffine(source,name,sourceType='module'){
  const program=/** @type {AstNode} */(
    acorn.parse(source,{ecmaVersion:'latest',sourceType})
  );
  const candidates=program.body.map((/** @type {AstNode} */ statement)=>
    statement.type==='ExportNamedDeclaration'?statement.declaration:statement
  ).filter((/** @type {AstNode|null|undefined} */ node)=>
    node?.type==='FunctionDeclaration'&&node.id?.name===name);
  if(candidates.length!==1)throw new TypeError('Target must be a unique function');
  const fn=candidates[0];
  if(fn.async||fn.generator||fn.params.length!==1||
     fn.params[0].type!=='Identifier'||fn.body.body.length!==2)
    throw new TypeError('Unexpected callable shape');
  const input=fn.params[0].name;
  const first=fn.body.body[0],selector=fn.body.body[1];
  if(first.type!=='VariableDeclaration'||first.kind!=='const'||
     first.declarations.length!==1||selector.type!=='SwitchStatement')
    throw new TypeError('Unexpected polyvariant dispatcher');
  const declaration=first.declarations[0];
  if(declaration.id.type!=='Identifier'||!declaration.init||
     declaration.init.type!=='BinaryExpression'||
     declaration.init.operator!=='|'||
     declaration.init.left.type!=='Identifier'||
     declaration.init.left.name!==input||
     declaration.init.right.type!=='Literal'||
     declaration.init.right.value!==0)
    throw new TypeError('Input must be normalized exactly once');
  const normalized=declaration.id.name;
  const cases=selector.cases.filter((/** @type {AstNode} */ item)=>item.test);
  const count=cases.length;
  if(![2,4,8].includes(count)||selector.cases.length!==count+1)
    throw new TypeError('Unexpected variant topology');
  const shift=count===2?1:count===4?2:3;
  const select=selector.discriminant;
  if(select.type!=='BinaryExpression'||select.operator!=='&'||
     select.left.type!=='Identifier'||select.left.name!==normalized||
     select.right.type!=='Literal'||select.right.value!==count-1)
    throw new TypeError('Unexpected switch partition');
  const defaultCase=selector.cases.find((/** @type {AstNode} */ item)=>!item.test);
  if(!defaultCase||defaultCase.consequent.length!==1||
     defaultCase.consequent[0].type!=='ThrowStatement')
    throw new TypeError('Unproved default path');
  /** @type {Set<number>} */
  const labels=new Set();
  /** @type {Set<number>} */
  const offsets=new Set();
  for(const branch of cases){
    const label=branch.test?.value;
    if(typeof label!=='number'||!Number.isInteger(label)||
       label<0||label>=count||labels.has(label)||
       branch.consequent.length!==1)
      throw new TypeError('Unexpected case label');
    labels.add(label);
    const outer=branch.consequent[0];
    if(outer.type!=='BlockStatement'||outer.body.length!==2)
      throw new TypeError('Unexpected case body');
    const slot=outer.body[0],inner=outer.body[1];
    if(slot.type!=='VariableDeclaration'||slot.kind!=='const'||
       slot.declarations.length!==1||
       slot.declarations[0].id.type!=='Identifier'||
       !slot.declarations[0].init||inner.type!=='BlockStatement')
      throw new TypeError('Unproved branch-local state');
    assertRestoration(slot.declarations[0].init,normalized,shift,label);
    /** @type {Map<string,Affine>} */
    const environment=new Map([[normalized,{
      factor:1,offset:0,bound:2147483648
    }],[slot.declarations[0].id.name,{
      factor:1,offset:0,bound:2147483648
    }]]);
    const result=block(inner,environment);
    if(!result||result.factor!==1)
      throw new TypeError('Non-translation or missing return');
    offsets.add(result.offset);
  }
  if(labels.size!==count||offsets.size!==1)
    throw new TypeError('Cases disagree on a single translation');
  const offset=/** @type {number} */ (offsets.values().next().value);
  return {cases:count,offset,
    source:'function '+name+'(input){return (((input|0)+('+offset+'))|0)}'};
}

module.exports={recoverSymbolicAffine};
