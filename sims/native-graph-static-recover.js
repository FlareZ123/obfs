'use strict';

const acorn=require('acorn');

/** @typedef {{[key:string]:any,type:string}} Node */
/** @typedef {{name:string,parameter:string,expression:string,operations:number}} Recovery */

/**
 * Reverse an explicitly published straight-line expression register graph.
 * Attacker input consists solely of the transformed JavaScript. The algorithm
 * follows lexical def-use chains, so masked constants and identifier changes
 * across ordinary compiler passes do not prevent source reconstruction.
 *
 * This handles the project's current native graph emitter only; it is not a
 * general-purpose JavaScript deobfuscator and makes no source-integrity claim.
 * @param {string} code
 * @returns {Recovery}
 */
function recoverNativeGraph(code) {
  const ast=/** @type {Node} */ (acorn.parse(code,{
    ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true
  }));
  /** @type {Recovery[]} */
  const recovered=[];
  for(const statement of ast.body) {
    const helper=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(helper.type!=='FunctionDeclaration'||helper.id?.type!=='Identifier'||
       helper.params.length!==1||helper.params[0].type!=='Identifier')continue;
    const statements=helper.body.body;
    if(statements.length<5||statements[0].type!=='VariableDeclaration'||
       statements.at(-1).type!=='ReturnStatement')continue;
    const input=helper.params[0].name;
    const first=statements[0].declarations?.[0];
    if(first?.id.type!=='Identifier'||first.init?.type!=='Identifier'||
       first.init.name!==input)continue;

    /** @type {Map<string,string>} */
    const values=new Map([[first.id.name,'__ATTACK_PARAMETER__']]);
    let operations=0,valid=true;
    for(const declaration of statements.slice(1,-1)) {
      if(declaration.type!=='VariableDeclaration'||declaration.kind!=='const'||
         declaration.declarations.length!==1) {valid=false;break;}
      const item=declaration.declarations[0];
      if(item.id.type!=='Identifier'||item.init?.type!=='BinaryExpression') {valid=false;break;}
      const binary=item.init;
      let expression;
      if(binary.operator==='^'&&binary.left.type==='Literal'&&binary.right.type==='Literal'&&
         typeof binary.left.value==='number'&&typeof binary.right.value==='number') {
        expression=String(binary.left.value^binary.right.value);
      } else if(binary.left.type==='Identifier'&&binary.right.type==='Identifier'&&
                values.has(binary.left.name)&&values.has(binary.right.name)) {
        expression='('+values.get(binary.left.name)+binary.operator+
          values.get(binary.right.name)+')';
        operations++;
      } else {valid=false;break;}
      values.set(item.id.name,expression);
    }
    const terminal=statements.at(-1)?.argument;
    if(!valid||operations<2||terminal?.type!=='Identifier'||
       !values.has(terminal.name))continue;

    /** @type {{name:string,parameter:string}|null} */
    let wrapper=null;
    for(const declaration of ast.body) {
      const fn=declaration.type==='ExportNamedDeclaration'&&declaration.declaration?
        declaration.declaration:declaration;
      if(fn.type!=='FunctionDeclaration'||fn.id?.type!=='Identifier'||
         fn.params.length!==1||fn.params[0].type!=='Identifier'||fn.body.body.length!==1)continue;
      const ret=fn.body.body[0];
      const call=ret.type==='ReturnStatement'?ret.argument:null;
      if(call?.type!=='CallExpression'||call.callee.type!=='Identifier'||
         call.callee.name!==helper.id.name||call.arguments.length!==1||
         call.arguments[0].type!=='Identifier'||call.arguments[0].name!==fn.params[0].name)continue;
      if(wrapper){wrapper=null;break;}
      wrapper={name:fn.id.name,parameter:fn.params[0].name};
    }
    // An inline graph retains its original public function. Older prototypes
    // used an additional helper wrapper, which is still recognized above.
    wrapper??={name:helper.id.name,parameter:helper.params[0].name};
    const expression=/** @type {string} */ (values.get(terminal.name));
    recovered.push({...wrapper,
      expression:expression.replaceAll('__ATTACK_PARAMETER__',wrapper.parameter),operations});
  }
  if(recovered.length!==1)throw new TypeError('Expected one supported published native graph');
  return recovered[0];
}

module.exports={recoverNativeGraph};
