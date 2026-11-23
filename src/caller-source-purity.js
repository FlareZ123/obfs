'use strict';

const {walk,staticString}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {{members:AstNode[],memberNames:Map<AstNode,string>,patterns:AstNode[],inChecks:AstNode[],reflections:{key:AstNode}[]}} OwnerProof */

const functionKinds=new Set([
  'FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'
]);
const arithmeticOperators=new Set([
  '+','-','*','/','%','**','<<','>>','>>>','&','|','^',
  '==','!=','===','!==','<','<=','>','>='
]);

/** @param {AstNode} expression @returns {boolean} */
function primitiveLiteral(expression) {
  return expression.type==='Literal' &&
    (expression.value===null||['number','string','boolean'].includes(typeof expression.value));
}

/**
 * A restricted, callback-free expression evaluator. Reject every member
 * read not in the already-proven primitive own-field set, and every call,
 * object conversion of unknown provenance, iteration, proxy, or await.
 * This is intentionally narrower than ordinary constant evaluation.
 *
 * @param {AstNode} expression
 * @param {Set<string>} primitives
 * @param {Set<AstNode>} ownPrimitiveMembers
 * @param {number} [depth]
 * @returns {boolean}
 */
function purePrimitive(expression,primitives,ownPrimitiveMembers,depth=0) {
  if(depth>64)return false;
  if(primitiveLiteral(expression))return true;
  if(expression.type==='Identifier')return primitives.has(expression.name);
  if(expression.type==='MemberExpression')
    return !expression.optional&&ownPrimitiveMembers.has(expression);
  if(expression.type==='UnaryExpression')
    return ['+','-','!','~','void','typeof'].includes(expression.operator)&&
      purePrimitive(expression.argument,primitives,ownPrimitiveMembers,depth+1);
  if(expression.type==='BinaryExpression')
    return arithmeticOperators.has(expression.operator)&&
      purePrimitive(expression.left,primitives,ownPrimitiveMembers,depth+1)&&
      purePrimitive(expression.right,primitives,ownPrimitiveMembers,depth+1);
  if(expression.type==='LogicalExpression')
    return ['&&','||','??'].includes(expression.operator)&&
      purePrimitive(expression.left,primitives,ownPrimitiveMembers,depth+1)&&
      purePrimitive(expression.right,primitives,ownPrimitiveMembers,depth+1);
  if(expression.type==='ConditionalExpression')
    return purePrimitive(expression.test,primitives,ownPrimitiveMembers,depth+1)&&
      purePrimitive(expression.consequent,primitives,ownPrimitiveMembers,depth+1)&&
      purePrimitive(expression.alternate,primitives,ownPrimitiveMembers,depth+1);
  if(expression.type==='SequenceExpression')
    return expression.expressions.length>0&&
      expression.expressions.every((/** @type {AstNode} */ part)=>
        purePrimitive(part,primitives,ownPrimitiveMembers,depth+1));
  if(expression.type==='TemplateLiteral')
    return expression.expressions.every((/** @type {AstNode} */ part)=>
      purePrimitive(part,primitives,ownPrimitiveMembers,depth+1));
  return false;
}

/**
 * A returned inert data collection is safe after the caller has unwound,
 * provided all values are callback-free primitives. This never blesses the
 * collection as a primitive input to subsequent arithmetic.
 * @param {AstNode} expression
 * @param {Set<string>} primitives
 * @param {Set<AstNode>} ownPrimitiveMembers
 * @returns {boolean}
 */
function pureReturn(expression,primitives,ownPrimitiveMembers) {
  if(purePrimitive(expression,primitives,ownPrimitiveMembers))return true;
  if(expression.type==='ArrayExpression')
    return expression.elements.every((/** @type {AstNode|null} */ item)=>
      item?.type!=='SpreadElement'&&item!==null&&
      purePrimitive(item,primitives,ownPrimitiveMembers));
  return false;
}

/**
 * A direct-call-only function may still expose its own original source to a
 * foreign sloppy callee via Function#caller. Prove non-reentrancy for a small
 * straight-line language over literals and already-proven primitive own data.
 * Parameter coercions are admitted only when *every* syntactic direct call
 * supplies a primitive-only argument expression.
 *
 * @param {AstNode} fn
 * @param {AstNode} literal
 * @param {Set<AstNode>} ownPrimitiveMembers
 * @param {WeakMap<AstNode,AstNode>} parents
 * @param {Map<string,AstNode[]>} calls
 * @returns {boolean}
 */
function pureCallable(fn,literal,ownPrimitiveMembers,parents,calls) {
  if(fn.async||fn.generator||fn.params.some((/** @type {AstNode} */ p)=>p.type!=='Identifier'))
    return false;
  /** @type {AstNode[]} */
  let sites=[];
  if(fn.type==='FunctionDeclaration'&&fn.id?.type==='Identifier'){
    sites=calls.get(fn.id.name)??[];
  } else {
    const parent=parents.get(fn);
    if(parent?.type==='VariableDeclarator'&&parent.id.type==='Identifier')
      sites=calls.get(parent.id.name)??[];
    else if(parent?.type==='CallExpression'&&parent.callee===fn)
      sites=[parent];
  }
  /** @type {Set<string>} */
  const primitives=new Set();
  for(let i=0;i<fn.params.length;i++){
    if(sites.length&&sites.every(call=>
      call.arguments[i]&&purePrimitive(call.arguments[i],new Set(),new Set())))
      primitives.add(fn.params[i].name);
  }
  /** @type {AstNode} */
  const body=fn.body;
  if(body.type!=='BlockStatement')
    return pureReturn(body,primitives,ownPrimitiveMembers);
  for(let i=0;i<body.body.length;i++){
    const statement=body.body[i];
    if(statement.type==='ExpressionStatement'&&statement.directive)continue;
    if(statement.type==='VariableDeclaration'&&statement.kind==='const'&&
       statement.declarations.length===1){
      const declaration=statement.declarations[0];
      if(declaration.id.type!=='Identifier'||!declaration.init)return false;
      if(declaration.init===literal)continue;
      if(!purePrimitive(declaration.init,primitives,ownPrimitiveMembers))return false;
      primitives.add(declaration.id.name);
      continue;
    }
    if(statement.type==='ReturnStatement'){
      return i===body.body.length-1&&
        (!statement.argument||pureReturn(statement.argument,primitives,ownPrimitiveMembers));
    }
    if(statement.type==='ExpressionStatement'&&
       purePrimitive(statement.expression,primitives,ownPrimitiveMembers))continue;
    return false;
  }
  return true;
}

/**
 * Strict functions cannot be exposed through a non-strict callee's
 * Function#caller chain in Node 22. ESM is strictly evaluated by language
 * semantics; a script and non-strict CommonJS wrapper are not.
 * @param {AstNode} fn
 * @param {AstNode} ast
 * @param {WeakMap<AstNode,AstNode>} parents
 * @returns {boolean}
 */
function strictCallable(fn,ast,parents) {
  if(ast.sourceType==='module')return true;
  /** @type {AstNode|undefined} */
  let current=fn;
  while(current){
    const statements=current.type==='Program'?current.body:
      functionKinds.has(current.type)&&current.body?.type==='BlockStatement'?
        current.body.body:null;
    if(statements?.some((/** @type {AstNode} */ statement)=>
      statement.type==='ExpressionStatement'&&statement.directive==='use strict'))
      return true;
    current=parents.get(current);
  }
  return false;
}

/**
 * Whether renaming this specific proven owner's own keys could change
 * observed sloppy-caller source, through code that executes synchronously
 * inside an affected function. This is a *conservative, bounded* source
 * contract test, not a whole-program security or semantic equivalence proof.
 *
 * @param {AstNode} ast
 * @param {AstNode} literal
 * @param {AstNode[]} properties
 * @param {OwnerProof} proof
 * @returns {boolean}
 */
function exposesSloppyCallerSource(ast,literal,properties,proof) {
  if(ast.sourceType==='module')return false;
  /** @type {WeakMap<AstNode,AstNode>} */
  const parents=new WeakMap();
  /** @type {Map<string,AstNode[]>} */
  const calls=new Map();
  walk(ast,(node,parent,key)=>{
    if(parent)parents.set(node,parent);
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'){
      const sites=calls.get(node.callee.name)??[];
      sites.push(node);
      calls.set(node.callee.name,sites);
    }
  });
  /** @type {Map<string,AstNode>} */
  const ownValues=new Map();
  for(const property of properties){
    const key=property.computed?staticString(property.key):
      property.key.type==='Identifier'?property.key.name:
      property.key.type==='Literal'&&typeof property.key.value==='string'?
        property.key.value:null;
    if(key!==null)ownValues.set(key,property.value);
  }
  /** @type {Set<AstNode>} */
  const primitiveOwnReads=new Set();
  for(const member of proof.members){
    const name=proof.memberNames.get(member);
    const value=name===undefined?undefined:ownValues.get(name);
    if(value&&purePrimitive(value,new Set(),new Set()))
      primitiveOwnReads.add(member);
  }
  /** @type {Set<AstNode>} */
  const affected=new Set([
    literal,...proof.members,...proof.patterns,
    ...proof.inChecks.map((/** @type {AstNode} */ check)=>check.left),
    ...proof.reflections.map(reflection=>reflection.key)
  ]);
  /** @type {Set<AstNode>} */
  const functions=new Set();
  for(const node of affected){
    let parent=parents.get(node);
    while(parent){
      if(functionKinds.has(parent.type))functions.add(parent);
      parent=parents.get(parent);
    }
  }
  for(const fn of functions){
    if(!strictCallable(fn,ast,parents)&&
       !pureCallable(fn,literal,primitiveOwnReads,parents,calls))
      return true;
  }
  return false;
}

module.exports={exposesSloppyCallerSource};
