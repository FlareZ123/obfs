'use strict';

const {parse,walk}=require('./ast');

/**
 * Keep imported function-object state from crossing independent browser
 * module realms into one server-owned ESM singleton. Track named aliases and
 * bounded identity-preserving expressions, then refuse first-class sinks,
 * property reads, class carriers, and reflection when provenance is unproved.
 * The analysis deliberately overrejects some primitive imports. It cannot
 * prove arbitrary higher-order flows or transitive host effects.
 *
 * @param {string} filename
 * @param {string} source
 * @returns {void}
 */
function assertNoPrivateImportMemberState(filename,source){
  const ast=parse(source,'module');
  /** @type {Set<string>} */
  const imports=new Set();
  for(const statement of ast.body){
    if(statement.type!=='ImportDeclaration'||
       typeof statement.source?.value!=='string'||
       !(statement.source.value.startsWith('./')||
         statement.source.value.startsWith('../')))continue;
    for(const specifier of statement.specifiers){
      if(specifier.local?.type==='Identifier')imports.add(specifier.local.name);
    }
  }
  if(!imports.size)return;
  const aliases=new Set(imports);
  /**
   * An expression can preserve the identity of an imported function even
   * when its top-level AST node is not a bare identifier. Track such aliases
   * conservatively rather than letting shared function-object state escape.
   * @param {import('./ast').AstNode|null|undefined} expression
   * @returns {boolean}
   */
  function carriesAlias(expression){
    if(!expression)return false;
    switch(expression.type){
      case 'Identifier': return aliases.has(expression.name);
      case 'SequenceExpression':
        return expression.expressions.length>0&&
          carriesAlias(expression.expressions[expression.expressions.length-1]);
      case 'ConditionalExpression':
        return carriesAlias(expression.consequent)||
          carriesAlias(expression.alternate);
      case 'LogicalExpression':
        return carriesAlias(expression.left)||carriesAlias(expression.right);
      case 'AwaitExpression':
        return carriesAlias(expression.argument);
      case 'AssignmentExpression':
        return carriesAlias(expression.right);
      default: return false;
    }
  }
  let changed=true;
  while(changed){
    changed=false;
    walk(ast,node=>{
      if(node.type==='VariableDeclarator'&&carriesAlias(node.init)){
        if(node.id.type!=='Identifier'){
          throw new TypeError('Selected SCO private imported identity escapes through destructuring: '+filename);
        }
        if(!aliases.has(node.id.name)){aliases.add(node.id.name);changed=true;}
      }
      if(node.type==='AssignmentExpression'&&carriesAlias(node.right)){
        if(node.left.type!=='Identifier'){
          throw new TypeError('Selected SCO private imported identity escapes through assignment: '+filename);
        }
        if(!aliases.has(node.left.name)){aliases.add(node.left.name);changed=true;}
      }
    });
  }
  walk(ast,(node,parent,key)=>{
    if(node.type==='MemberExpression'&&carriesAlias(node.object)){
      throw new TypeError('Selected SCO private dependency exposes shared imported member state: '+filename);
    }
    // Reflection can inspect a shared imported function's own-key shape
    // without spelling an ordinary member access.
    if(node.type==='BinaryExpression'&&node.operator==='in'&&
       carriesAlias(node.right)||
       (node.type==='ForInStatement'||node.type==='ForOfStatement')&&
         carriesAlias(node.right)){
      throw new TypeError('Selected SCO private imported identity reaches reflective iteration: '+filename);
    }
    // Expression wrapping can preserve the same imported identity without
    // introducing a named alias. Decline unproved first-class sinks before
    // they are observable through shared server-side module state.
    if(node.type==='ReturnStatement'&&carriesAlias(node.argument)||
       node.type==='ArrowFunctionExpression'&&node.expression&&
         carriesAlias(node.body)||
       node.type==='YieldExpression'&&carriesAlias(node.argument)||
       node.type==='AssignmentPattern'&&carriesAlias(node.right)||
       node.type==='SpreadElement'&&carriesAlias(node.argument)||
       node.type==='Property'&&carriesAlias(node.value)||
       node.type==='PropertyDefinition'&&carriesAlias(node.value)||
       (node.type==='ClassDeclaration'||node.type==='ClassExpression')&&
         carriesAlias(node.superClass)||
       node.type==='ArrayExpression'&&node.elements.some(
         (/** @type {import('./ast').AstNode|null} */ item)=>carriesAlias(item))||
       (node.type==='CallExpression'||node.type==='NewExpression')&&
         node.arguments.some(
           (/** @type {import('./ast').AstNode} */ item)=>carriesAlias(item))){
      throw new TypeError('Selected SCO private imported identity escapes to unproved consumer: '+filename);
    }
    if(node.type!=='Identifier'||!aliases.has(node.name))return;
    if(parent?.type==='CallExpression'&&key==='arguments'||
       parent?.type==='NewExpression'&&key==='arguments'||
       parent?.type==='ReturnStatement'&&key==='argument'||
       parent?.type==='Property'&&key==='value'||
       parent?.type==='ArrayExpression'&&key==='elements'){
      throw new TypeError('Selected SCO private imported identity escapes to unproved consumer: '+filename);
    }
  });
}

module.exports={assertNoPrivateImportMemberState};
