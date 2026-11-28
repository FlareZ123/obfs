'use strict';

const {walk}=require('./ast');
const {isReadOnlyOwnedLiteral}=require('./sco-private-child-readonly-literal');

/**
 * Conservative per-client module-state admission for each server-private
 * ESM child, used by both standalone selective SCO and selected graph builds.
 *
 * Browser clients ordinarily instantiate independent module function objects
 * and lexical cells; SCO relocates a child to one long-lived Node instance.
 * A direct `next()` can still mutate an exported function's own fields, a
 * module-level let/var, a const-owned record/array or a RegExp's lastIndex.
 *
 * Decline top-level mutable cells and known shared literal/constructor owners.
 * The deliberate positive exception is an unexported literal scalar table
 * proved to have only static own-property reads, no mutation or escape.
 * For named functions and classes, allow declaration names and direct calls
 * but refuse unproved value references, reflection and member-state access.
 * Shadowed identifiers are overapproximated rather than assumed safe.
 * This is a bounded syntactic gate, NOT a cross-realm semantic proof for
 * dynamic initializers, higher-order code, external hosts or private sources
 * not provided for auditing.
 *
 * @param {string} filename
 * @param {import('./ast').AstNode} ast
 * @returns {void}
 */
/**
 * Identify mutable literal owners even when JavaScript expression syntax
 * wraps the value. This is a refusal predicate, not a general value solver:
 * unknown functions and dynamically resolved constructors are unproved.
 *
 * @param {import('./ast').AstNode|null|undefined} value
 * @param {number} [depth]
 * @returns {boolean}
 */
function carriesSharedLiteralObject(value,depth=0){
  if(!value)return false;
  if(depth>16)return true;
  switch(value.type){
    case 'ObjectExpression':
    case 'ArrayExpression':
      return true;
    case 'Literal':
      return value.regex!==undefined;
    case 'NewExpression':
      return value.callee.type==='Identifier'&&
        ['Object','Array','RegExp','Map','Set','WeakMap','WeakSet','Date'].includes(value.callee.name);
    case 'CallExpression':
      return value.callee.type==='Identifier'&&
        ['Object','Array','RegExp'].includes(value.callee.name);
    case 'SequenceExpression':
      return value.expressions.length>0&&
        carriesSharedLiteralObject(value.expressions[value.expressions.length-1],depth+1);
    case 'ConditionalExpression':
    case 'LogicalExpression':
      return carriesSharedLiteralObject(value.consequent??value.left,depth+1)||
        carriesSharedLiteralObject(value.alternate??value.right,depth+1);
    case 'AssignmentExpression':
    case 'AwaitExpression':
      return carriesSharedLiteralObject(value.right??value.argument,depth+1);
    default:
      return false;
  }
}

/**
 * A module-level constant is not automatically a constant VALUE. An
 * unreviewed factory call, `new`, imported value, await or member read can
 * allocate a retained object whose state is shared after SCO relocation.
 * Permit only a bounded grammar with statically primitive operands here;
 * arrow/function objects and provably nonescaping scalar tables are handled
 * separately. This rule applies only when private source bytes were supplied.
 *
 * @param {import('./ast').AstNode|null|undefined} value
 * @param {number} [depth]
 * @returns {boolean}
 */
function provenPrimitiveInitializer(value,depth=0){
  if(!value||depth>16)return false;
  switch(value.type){
    case 'Literal':
      // A BigInt may throw under unary +, mixed numeric operations, zero
      // division or negative exponentiation. Non-finite numeric literals do
      // not belong to this JSON-facing scalar proof either.
      return value.regex===undefined&&typeof value.value!=='bigint'&&
        (typeof value.value!=='number'||Number.isFinite(value.value));
    case 'TemplateLiteral':
      return value.expressions.every(item=>provenPrimitiveInitializer(item,depth+1));
    case 'UnaryExpression':
      return ['+','-','!','~','void','typeof'].includes(value.operator)&&
        provenPrimitiveInitializer(value.argument,depth+1);
    case 'BinaryExpression':
      // With primitive RHS, `in` and `instanceof` can throw during
      // original browser module initialization. Do not relocate that failure
      // to the trusted server's loading phase.
      return !['in','instanceof'].includes(value.operator)&&
        provenPrimitiveInitializer(value.left,depth+1)&&
        provenPrimitiveInitializer(value.right,depth+1);
    case 'LogicalExpression':
      return provenPrimitiveInitializer(value.left,depth+1)&&
        provenPrimitiveInitializer(value.right,depth+1);
    case 'ConditionalExpression':
      return provenPrimitiveInitializer(value.test,depth+1)&&
        provenPrimitiveInitializer(value.consequent,depth+1)&&
        provenPrimitiveInitializer(value.alternate,depth+1);
    case 'SequenceExpression':
      return value.expressions.length>0&&
        value.expressions.every(item=>provenPrimitiveInitializer(item,depth+1));
    default:
      return false;
  }
}

function assertNoSharedChildFunctionIdentity(filename,ast){
  /** @type {Set<string>} */
  const functions=new Set();
  let unprovedClass=false;
  for(const statement of ast.body){
    const declaration=statement.type==='ExportNamedDeclaration'&&
      statement.declaration&&!statement.source?statement.declaration:
      statement.type==='ExportDefaultDeclaration'&&
      statement.declaration?statement.declaration:statement;
    // A for/if/block/try at module scope can hoist var or modify a
    // persistent object without a direct top-level VariableDeclaration.
    // The selected-graph compiler already declines such initializers.
    const allowedDeclaration=['FunctionDeclaration','ClassDeclaration',
      'VariableDeclaration'].includes(declaration.type);
    const allowedImportExport=statement.type==='ImportDeclaration'||
      statement.type==='ExportAllDeclaration'||
      statement.type==='ExportNamedDeclaration'&&!statement.declaration;
    const allowedDirective=statement.type==='ExpressionStatement'&&
      statement.expression.type==='Literal'&&
      typeof statement.expression.value==='string';
    const allowedDefaultPrimitive=statement.type==='ExportDefaultDeclaration'&&
      provenPrimitiveInitializer(statement.declaration);
    const allowedDefaultFunction=statement.type==='ExportDefaultDeclaration'&&
      ['FunctionExpression','ArrowFunctionExpression'].includes(declaration.type);
    if(!(allowedDeclaration||allowedImportExport||allowedDirective||
         allowedDefaultPrimitive||allowedDefaultFunction||
         statement.type==='EmptyStatement')){
      throw new TypeError(
        'Selected SCO private dependency has unproved module top-level effects: '+filename);
    }
    if(declaration.type==='ClassDeclaration')unprovedClass=true;
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
        // RegExp object. These values (and their identity-preserving syntax
        // wrappers) may accumulate state across direct private calls.
        // Unknown dynamic initializers remain outside this bounded proof.
        if(item.init?.type==='ClassExpression')unprovedClass=true;
        if(!item.init||provenPrimitiveInitializer(item.init)||
           item.init.type==='FunctionExpression'||
           item.init.type==='ArrowFunctionExpression'||
           item.id.type==='Identifier'&&
             statement.type!=='ExportNamedDeclaration'&&
             isReadOnlyOwnedLiteral(ast,item.id.name,item.init)){
          continue;
        }
        const reason=carriesSharedLiteralObject(item.init)?
          'unproved shared module object state':
          'unproved module initializer state';
        throw new TypeError(
          'Selected SCO private dependency has '+reason+': '+filename);
      }
    }
    // Parenthesized default expressions are FunctionExpression AST nodes,
    // not FunctionDeclaration. A named expression can mutate its shared
    // own fields through its internal self-binding.
    if(statement.type==='ExportDefaultDeclaration'&&
       declaration.type==='FunctionExpression'&&
       declaration.id?.type==='Identifier'){
      functions.add(declaration.id.name);
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
  if(functions.size)walk(ast,(node,parent,key)=>{
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
  // A class object is a mutable identity whose constructor/prototype/static
  // paths can persist across clients even without lexical self-reference.
  // Retain direct-call function coverage but decline unproved class owners.
  if(unprovedClass){
    throw new TypeError(
      'Selected SCO private dependency has unproved shared class identity: '+filename);
  }
}

module.exports={assertNoSharedChildFunctionIdentity};
