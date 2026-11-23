'use strict';

const {walk,staticString}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */
/** @type {WeakMap<AstNode,{parents:WeakMap<AstNode,AstNode>,calls:Map<string,AstNode[]>}>} */
const inventoryCache=new WeakMap();

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
 * Local const records containing only inert primitive data can be read
 * without invoking a getter, proxy trap, setter or conversion callback.
 * @typedef {Map<string,Set<string>>} LocalRecordFields
 */

/**
 * @param {AstNode} node
 * @param {boolean} computed
 * @returns {string|null}
 */
function staticallyKnownKey(node,computed) {
  if(computed)return staticString(node);
  if(node.type==='Identifier')return node.name;
  if(node.type==='Literal'&&(typeof node.value==='string'||typeof node.value==='number'))
    return String(node.value);
  return null;
}

/**
 * A restricted callback-free *primitive-valued* expression evaluator.
 * Ordinary parameters have opaque type: typeof, void, !, conditional tests
 * and strict-identity comparisons are safe on them, but arithmetic is not.
 *
 * @param {AstNode} expression
 * @param {Set<string>} primitives
 * @param {Set<AstNode>} ownPrimitiveMembers
 * @param {number} [depth]
 * @param {LocalRecordFields} [localRecords]
 * @param {Set<string>} [opaqueParameters]
 * @returns {boolean}
 */
function purePrimitive(expression,primitives,ownPrimitiveMembers,depth=0,
  localRecords=new Map(),opaqueParameters=new Set()) {
  if(depth>64)return false;
  if(primitiveLiteral(expression))return true;
  if(expression.type==='Identifier')return primitives.has(expression.name);
  if(expression.type==='MemberExpression'){
    if(expression.optional)return false;
    if(ownPrimitiveMembers.has(expression))return true;
    const receiver=expression.object;
    const field=staticallyKnownKey(expression.property,expression.computed);
    return receiver.type==='Identifier'&&field!==null&&
      (localRecords.get(receiver.name)?.has(field)??false);
  }
  /** @param {AstNode} child @returns {boolean} */
  const pure=child=>purePrimitive(child,primitives,ownPrimitiveMembers,
    depth+1,localRecords,opaqueParameters);
  /** @param {AstNode} child @returns {boolean} */
  const noCallbackValue=child=>pure(child)||
    child.type==='Identifier'&&opaqueParameters.has(child.name);
  if(expression.type==='UnaryExpression'){
    if(['!','void','typeof'].includes(expression.operator))
      return noCallbackValue(expression.argument);
    return ['+','-','~'].includes(expression.operator)&&pure(expression.argument);
  }
  if(expression.type==='BinaryExpression'){
    if(['===','!=='].includes(expression.operator))
      return noCallbackValue(expression.left)&&noCallbackValue(expression.right);
    return arithmeticOperators.has(expression.operator)&&
      pure(expression.left)&&pure(expression.right);
  }
  if(expression.type==='LogicalExpression')
    return ['&&','||','??'].includes(expression.operator)&&
      pure(expression.left)&&pure(expression.right);
  if(expression.type==='ConditionalExpression')
    return noCallbackValue(expression.test)&&
      pure(expression.consequent)&&pure(expression.alternate);
  if(expression.type==='SequenceExpression')
    return expression.expressions.length>0&&
      expression.expressions.every((/** @type {AstNode} */ part)=>pure(part));
  if(expression.type==='TemplateLiteral')
    return expression.expressions.every((/** @type {AstNode} */ part)=>pure(part));
  return false;
}

/**
 * @param {AstNode} literal
 * @param {Set<string>} primitives
 * @param {Set<AstNode>} ownPrimitiveMembers
 * @param {LocalRecordFields} records
 * @param {Set<string>} opaqueParameters
 * @returns {Set<string>|null}
 */
function inertRecordFields(literal,primitives,ownPrimitiveMembers,records,opaqueParameters) {
  if(literal.type!=='ObjectExpression')return null;
  /** @type {Set<string>} */
  const fields=new Set();
  for(const property of literal.properties){
    if(property.type!=='Property'||property.kind!=='init'||property.method||
       property.computed&&staticString(property.key)===null)return null;
    const name=staticallyKnownKey(property.key,property.computed);
    if(name===null||['__proto__','prototype','constructor'].includes(name)||
       fields.has(name)||!purePrimitive(property.value,primitives,ownPrimitiveMembers,
         0,records,opaqueParameters))return null;
    fields.add(name);
  }
  return fields;
}

/**
 * A returned inert data array is safe once the caller has unwound, provided
 * all its elements are callback-free primitives. It is never admitted as a
 * primitive input to subsequent arithmetic.
 *
 * @param {AstNode} expression
 * @param {Set<string>} primitives
 * @param {Set<AstNode>} ownPrimitiveMembers
 * @param {LocalRecordFields} records
 * @param {Set<string>} opaqueParameters
 * @returns {boolean}
 */
function pureReturn(expression,primitives,ownPrimitiveMembers,records,opaqueParameters) {
  if(purePrimitive(expression,primitives,ownPrimitiveMembers,
    0,records,opaqueParameters))return true;
  if(expression.type==='ArrayExpression')
    return expression.elements.every((/** @type {AstNode|null} */ item)=>
      item?.type!=='SpreadElement'&&item!==null&&
      purePrimitive(item,primitives,ownPrimitiveMembers,0,records,opaqueParameters));
  return false;
}

/**
 * A direct-call-only function may still expose its own original source to a
 * foreign sloppy callee through Function#caller. Prove non-reentrancy for a
 * small straight-line language of primitive operations, fresh local const
 * records, tracked primitive owner reads, and side-effect-free type tests.
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
  /** @type {Set<string>} */
  const opaqueParameters=new Set(fn.params.map((/** @type {AstNode} */ p)=>p.name));
  /** @type {LocalRecordFields} */
  const records=new Map();
  for(let i=0;i<fn.params.length;i++){
    if(sites.length&&sites.every(call=>call.arguments[i]&&
      purePrimitive(call.arguments[i],new Set(),new Set())))
      primitives.add(fn.params[i].name);
  }
  /** @type {AstNode} */
  const body=fn.body;
  if(body.type!=='BlockStatement')
    return pureReturn(body,primitives,ownPrimitiveMembers,records,opaqueParameters);
  for(let i=0;i<body.body.length;i++){
    const statement=body.body[i];
    if(statement.type==='ExpressionStatement'&&statement.directive)continue;
    if(statement.type==='VariableDeclaration'&&statement.kind==='const'&&
       statement.declarations.length===1){
      const declaration=statement.declarations[0];
      if(declaration.id.type!=='Identifier'||!declaration.init)return false;
      const fields=inertRecordFields(declaration.init,primitives,ownPrimitiveMembers,
        records,opaqueParameters);
      if(fields){
        records.set(declaration.id.name,fields);
        continue;
      }
      if(declaration.init.type==='Identifier'&&records.has(declaration.init.name)){
        records.set(declaration.id.name,/** @type {Set<string>} */ (records.get(declaration.init.name)));
        continue;
      }
      if(declaration.init===literal)continue;
      if(!purePrimitive(declaration.init,primitives,ownPrimitiveMembers,
        0,records,opaqueParameters))return false;
      primitives.add(declaration.id.name);
      continue;
    }
    if(statement.type==='ReturnStatement'){
      return i===body.body.length-1&&
        (!statement.argument||pureReturn(statement.argument,primitives,
          ownPrimitiveMembers,records,opaqueParameters));
    }
    if(statement.type==='ExpressionStatement'&&
       purePrimitive(statement.expression,primitives,ownPrimitiveMembers,
         0,records,opaqueParameters))continue;
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
 * Extract only primitive-valued, proven-own member reads. A successful
 * object ownership proof alone is insufficient: a nested object or array
 * value can reenter user code when coerced. Cross-owner callers may union
 * these independent facts to avoid overdeclining mixed private objects.
 *
 * @param {AstNode[]} properties
 * @param {OwnerProof} proof
 * @returns {Set<AstNode>}
 */
function inertPrimitiveMemberReads(properties,proof) {
  /** @type {Map<string,AstNode>} */
  const ownValues=new Map();
  for(const property of properties){
    const key=staticallyKnownKey(property.key,property.computed);
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
  return primitiveOwnReads;
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
 * @param {Set<AstNode>} [sharedPrimitiveReads]
 * @returns {boolean}
 */
function exposesSloppyCallerSource(ast,literal,properties,proof,sharedPrimitiveReads) {
  if(ast.sourceType==='module')return false;
  // Root-independent call and ancestry inventories are immutable for one
  // parsed AST. Reuse them across private owner candidates instead of
  // traversing the entire source for every property proof.
  let inventory=inventoryCache.get(ast);
  if(!inventory){
    /** @type {WeakMap<AstNode,AstNode>} */
    const parents=new WeakMap();
    /** @type {Map<string,AstNode[]>} */
    const calls=new Map();
    walk(ast,(node,parent)=>{
      if(parent)parents.set(node,parent);
      if(node.type==='CallExpression'&&node.callee.type==='Identifier'){
        const sites=calls.get(node.callee.name)??[];
        sites.push(node);
        calls.set(node.callee.name,sites);
      }
    });
    inventory={parents,calls};
    inventoryCache.set(ast,inventory);
  }
  const {parents,calls}=inventory;
  const primitiveOwnReads=sharedPrimitiveReads??
    inertPrimitiveMemberReads(properties,proof);
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

module.exports={exposesSloppyCallerSource,inertPrimitiveMemberReads};
