'use strict';

const {walk,staticString}=require('./ast');

/**
 * Owned primitive table literals can be relocated without sharing observable
 * state only when no code can obtain or mutate the table object itself.
 * This bounded positive admission proves local static member READS, not
 * arbitrary dynamic ESM object flows. A simple record or array is allocated
 * once on the server but all admitted observations are primitive values.
 *
 * @param {import('./ast').AstNode} value
 * @returns {boolean}
 */
function primitiveLiteral(value){
  if(value.type!=='Literal'||value.regex!==undefined)return false;
  const data=value.value;
  // Selective SCO's wire contract is JSON, so admitting non-finite numbers
  // or BigInt by this *additional* table-ownership proof would overstate its
  // applicability. They may be handled elsewhere only with an explicit
  // application-specific transport contract.
  return data===null||typeof data==='string'||typeof data==='boolean'||
    typeof data==='number'&&Number.isFinite(data);
}

/**
 * Return the own scalar keys of an inert record/array literal. This
 * intentionally declines getters, spreads, dynamic keys and nonprimitive
 * values. __proto__ has special object-literal setter semantics.
 *
 * @param {import('./ast').AstNode|null|undefined} init
 * @returns {Set<string>|null}
 */
function literalScalarKeys(init){
  if(!init)return null;
  /** @type {Set<string>} */
  const keys=new Set();
  if(init.type==='ObjectExpression'){
    for(const property of init.properties){
      if(property.type!=='Property'||property.kind!=='init'||
         property.computed||property.method||property.shorthand||
         !primitiveLiteral(property.value))return null;
      const name=property.key.type==='Identifier'?property.key.name:
        property.key.type==='Literal'&&
          ['string','number'].includes(typeof property.key.value)?
          String(property.key.value):null;
      if(name===null||name==='__proto__')return null;
      keys.add(name);
    }
    return keys;
  }
  if(init.type==='ArrayExpression'){
    for(let index=0;index<init.elements.length;index++){
      const item=init.elements[index];
      if(!item||!primitiveLiteral(item))return null;
      keys.add(String(index));
    }
    keys.add('length');
    return keys;
  }
  return null;
}

/**
 * Detect any enclosing assignment/update/delete role on the full AST path.
 * Checking only the immediate parent of `table.n` misses destructuring:
 * `({n:table.n} = value)` and `for ({n:table.n} of values)` write through
 * ObjectPattern/Property nodes before reaching the actual assignment.
 * The path is intentionally overapproximated: a read nested inside a
 * destructuring target's computed key may also be declined.
 *
 * @param {import('./ast').AstNode[]} ancestors
 * @returns {boolean}
 */
function insideAssignmentTarget(ancestors){
  for(let index=0;index+1<ancestors.length;index++){
    const outer=ancestors[index];
    const inner=ancestors[index+1];
    if((outer.type==='AssignmentExpression'||
        outer.type==='ForOfStatement'||outer.type==='ForInStatement')&&
        outer.left===inner||
       outer.type==='UpdateExpression'&&outer.argument===inner||
       outer.type==='UnaryExpression'&&outer.operator==='delete'&&
         outer.argument===inner){
      return true;
    }
  }
  return false;
}

/**
 * Prove a single module-unique const table has no escapes, writes or dynamic
 * property reads. Import/reexport of this binding in another child is
 * examined separately by the conservative private-import identity scanner.
 *
 * @param {import('./ast').AstNode} ast
 * @param {string} name
 * @param {import('./ast').AstNode|null|undefined} init
 * @returns {boolean}
 */
function isReadOnlyOwnedLiteral(ast,name,init){
  const keys=literalScalarKeys(init);
  if(!keys)return false;
  let safe=true;
  walk(ast,(node,parent,key,ancestors)=>{
    if(!safe||node.type!=='Identifier'||node.name!==name)return;
    if(parent?.type==='VariableDeclarator'&&key==='id'&&parent.init===init)return;
    // Static labels are not references to the owning lexical object.
    if(parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||
       parent?.type==='Property'&&key==='key'&&!parent.computed&&!parent.shorthand){
      return;
    }
    if(parent?.type!=='MemberExpression'||key!=='object'){
      safe=false;
      return;
    }
    const member=parent.computed?
      staticString(parent.property)??(
        parent.property.type==='Literal'&&
        typeof parent.property.value==='number'&&
        Number.isInteger(parent.property.value)&&parent.property.value>=0?
          String(parent.property.value):null):
      parent.property.type==='Identifier'?parent.property.name:null;
    if(member===null||!keys.has(member)){
      safe=false;
      return;
    }
    if(insideAssignmentTarget(ancestors)){
      safe=false;
      return;
    }
    const consumer=ancestors.length>1?ancestors[ancestors.length-2]:null;
    if(consumer&&(
      consumer.type==='AssignmentExpression'&&consumer.left===parent||
      consumer.type==='UpdateExpression'&&consumer.argument===parent||
      consumer.type==='UnaryExpression'&&consumer.operator==='delete'&&
        consumer.argument===parent||
      consumer.type==='MemberExpression'&&consumer.object===parent||
      (consumer.type==='CallExpression'||consumer.type==='NewExpression')&&
        consumer.callee===parent||
      consumer.type==='TaggedTemplateExpression'&&consumer.tag===parent||
      consumer.type==='ChainExpression')){
      safe=false;
    }
  });
  return safe;
}

module.exports={isReadOnlyOwnedLiteral};
