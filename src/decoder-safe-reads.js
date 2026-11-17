'use strict';

const {walk,staticString}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * A detached Reflect.get reference need not disable the string decoder if
 * every use is an immediate read of an explicitly owned primitive property
 * on a freshly constructed data-only object literal. Nothing returned by
 * those calls can be a mutable String or Array intrinsic.
 *
 * This deliberately accepts only a top-level const alias, rejects all other
 * references to its name (including escape, assignment and nested binding),
 * and rejects getters, spreads, dynamic/computed keys, calls and unknown values
 * in the receiver. The ordinary intrinsic and dynamic-code mutation scanner
 * remains responsible for the rest of the source graph.
 *
 * @param {AstNode} ast
 * @returns {Set<AstNode>} source AST MemberExpressions proven read-only
 */
function provenLocalReflectGetCaptures(ast) {
  /** @type {Map<string,{capture:AstNode,binding:AstNode,valid:boolean,calls:number}>} */
  const candidates=new Map();
  for(const statement of ast.body??[]) {
    if(statement.type!=='VariableDeclaration'||statement.kind!=='const')continue;
    for(const declaration of statement.declarations) {
      const initial=declaration.init;
      if(declaration.id.type!=='Identifier'||!initial ||
         initial.type!=='MemberExpression'||initial.optional ||
         initial.object.type!=='Identifier'||initial.object.name!=='Reflect' ||
         (initial.computed ? staticString(initial.property) :
           initial.property.type==='Identifier'?initial.property.name:null)!=='get')continue;
      const name=declaration.id.name;
      const previous=candidates.get(name);
      if(previous)previous.valid=false;
      else candidates.set(name,{capture:initial,binding:declaration.id,
        valid:true,calls:0});
    }
  }
  if(!candidates.size)return new Set();

  /**
   * @param {AstNode} call
   * @returns {boolean}
   */
  function ownsPrimitiveRead(call) {
    if(call.type!=='CallExpression'||call.optional||call.arguments.length!==2)return false;
    const [receiver,key]=call.arguments;
    if(receiver.type!=='ObjectExpression'||key.type!=='Literal' ||
       typeof key.value!=='string')return false;
    let containsOwnKey=false;
    for(const property of receiver.properties) {
      if(property.type!=='Property'||property.kind!=='init'||
         property.computed||property.method||
         property.value.type!=='Literal'||property.value.regex!==undefined||
         ![null,'string','number','boolean','bigint'].includes(
           property.value.value===null?null:typeof property.value.value))return false;
      const name=property.key.type==='Identifier'?property.key.name:
        property.key.type==='Literal'?String(property.key.value):null;
      if(name===null||name==='__proto__')return false;
      if(name===key.value)containsOwnKey=true;
    }
    return containsOwnKey;
  }
  walk(ast,(node,parent)=>{
    if(node.type!=='Identifier')return;
    const candidate=candidates.get(node.name);
    if(!candidate||!candidate.valid)return;
    if(node===candidate.binding ||
       parent===candidate.capture && parent.property===node)return;
    if(parent?.type==='CallExpression' && parent.callee===node &&
       ownsPrimitiveRead(parent)) {
      candidate.calls++;
      return;
    }
    candidate.valid=false;
  });

  /** @type {Set<AstNode>} */
  const proven=new Set();
  for(const candidate of candidates.values()) {
    if(candidate.valid && candidate.calls>0)proven.add(candidate.capture);
  }
  return proven;
}

module.exports={provenLocalReflectGetCaptures};
