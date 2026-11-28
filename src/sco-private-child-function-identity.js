'use strict';

const {walk}=require('./ast');

/**
 * Conservative own-function-state admission for each server-private ESM child.
 *
 * Browser clients ordinarily instantiate independent module function objects,
 * whereas SCO relocates a child module to one long-lived Node instance. A
 * shared function can carry user-visible own properties (or be handed to a
 * reflective consumer) even when callers invoke it only as `next()`.
 *
 * Review module-level function declarations and const function expressions
 * by their lexical names. Permit direct calls and declaration names; decline
 * every other unproved reference, including computed reads, self-mutation,
 * aliases, reflection, exports as a value and higher-order carriers. Shadowed
 * identifiers are intentionally overapproximated rather than treated as safe.
 * This is syntactic admission, not proof that other module state is immutable.
 *
 * @param {string} filename
 * @param {import('./ast').AstNode} ast
 * @returns {void}
 */
function assertNoSharedChildFunctionIdentity(filename,ast){
  /** @type {Set<string>} */
  const functions=new Set();
  for(const statement of ast.body){
    const declaration=statement.type==='ExportNamedDeclaration'&&
      statement.declaration&&!statement.source?statement.declaration:
      statement.type==='ExportDefaultDeclaration'&&
      statement.declaration?statement.declaration:statement;
    // Each independently loaded browser ESM graph allocates its own module
    // lexical cells. A server-resident child is instead instantiated once:
    // even an apparently direct function call can increment one shared
    // top-level let/var across distinct callers. Refuse mutable declarations
    // rather than assume the initializer is never reassigned.
    if(declaration.type==='VariableDeclaration'&&declaration.kind!=='const'){
      throw new TypeError(
        'Selected SCO private dependency has unproved shared module lexical state: '+filename);
    }
    if(declaration.type==='VariableDeclaration'&&declaration.kind==='const'){
      for(const item of declaration.declarations){
        // A const binding freezes only the binding, not its record, array or
        // RegExp object. These literal objects can accumulate per-client state
        // through a retained closure even when all calls are syntactically
        // direct. Keep dynamic/nonliteral initializers as separately
        // unproved; this guard closes explicit object/array/regexp literals.
        const value=item.init;
        if(value&&(
          value.type==='ObjectExpression'||value.type==='ArrayExpression'||
          value.type==='Literal'&&value.regex!==undefined)){
          throw new TypeError(
            'Selected SCO private dependency has unproved shared module object state: '+filename);
        }
      }
    }
    if((declaration.type==='FunctionDeclaration'||
        declaration.type==='ClassDeclaration')&&
       declaration.id?.type==='Identifier'){
      functions.add(declaration.id.name);
    }else if(declaration.type==='VariableDeclaration'&&
             declaration.kind==='const'){
      for(const item of declaration.declarations){
        if(item.id.type!=='Identifier'||!item.init||
           !['FunctionExpression','ArrowFunctionExpression','ClassExpression'].includes(item.init.type)){
          continue;
        }
        functions.add(item.id.name);
        // A named expression has its own recursive self-binding, distinct
        // from the exported const. It can mutate that same shared function.
        if(item.init.id?.type==='Identifier')functions.add(item.init.id.name);
      }
    }
  }
  if(!functions.size)return;
  walk(ast,(node,parent,key)=>{
    if(node.type!=='Identifier'||!functions.has(node.name))return;
    if((parent?.type==='FunctionDeclaration'||
        parent?.type==='FunctionExpression'||
        parent?.type==='ClassDeclaration'||
        parent?.type==='ClassExpression')&&key==='id'||
       parent?.type==='VariableDeclarator'&&key==='id'||
       parent?.type==='CallExpression'&&key==='callee'||
       parent?.type==='MemberExpression'&&key==='property'&&!parent.computed||
       parent?.type==='Property'&&key==='key'&&!parent.computed&&!parent.shorthand){
      return;
    }
    throw new TypeError(
      'Selected SCO private dependency escapes a shared function identity: '+filename);
  });
}

module.exports={assertNoSharedChildFunctionIdentity};
