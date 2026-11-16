'use strict';

const fs=require('node:fs');
const path=require('node:path');
const acorn=require('acorn');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * Evaluate only the arithmetic AST grammar emitted by the affine compiler.
 * It does not execute the distributed function or load the original source.
 * @param {AstNode} node
 * @param {Map<string,number>} environment
 * @returns {number}
 */
function evaluate(node,environment) {
  if(node.type==='Literal'&&typeof node.value==='number')return node.value;
  if(node.type==='Identifier'&&environment.has(node.name)) {
    return /** @type {number} */ (environment.get(node.name));
  }
  if(node.type==='UnaryExpression'&&node.argument) {
    const argument=evaluate(node.argument,environment);
    if(node.operator==='-')return -argument;
    if(node.operator==='+')return +argument;
  }
  if(node.type==='BinaryExpression') {
    const left=evaluate(node.left,environment);
    const right=evaluate(node.right,environment);
    switch(node.operator) {
      case '+': return left+right;
      case '-': return left-right;
      case '*': return left*right;
      case '|': return left|right;
      case '&': return left&right;
      case '^': return left^right;
      case '>>': return left>>right;
      case '<<': return left<<right;
    }
  }
  throw new TypeError('Unexpected source grammar '+node.type);
}

/**
 * Interpret a generated straight-line case without invoking JavaScript
 * contained in that case. Preserve lexical scope for nested case blocks.
 * @param {AstNode} statement
 * @param {Map<string,number>} environment
 * @returns {{returned:boolean,value:number}}
 */
function interpret(statement,environment) {
  if(statement.type==='BlockStatement') {
    const local=new Map(environment);
    for(const child of statement.body) {
      const result=interpret(child,local);
      if(result.returned)return result;
    }
    return {returned:false,value:0};
  }
  if(statement.type==='VariableDeclaration') {
    for(const entry of statement.declarations) {
      if(entry.id.type!=='Identifier'||!entry.init)throw new TypeError('Opaque declaration');
      environment.set(entry.id.name,evaluate(entry.init,environment));
    }
    return {returned:false,value:0};
  }
  if(statement.type==='ReturnStatement'&&statement.argument) {
    return {returned:true,value:evaluate(statement.argument,environment)};
  }
  throw new TypeError('Unexpected statement '+statement.type);
}

/**
 * Recover an equivalent one-parameter Int32 function from the distributed
 * polyvariant output using an offline AST walk. All observed cases must agree
 * on the same integer-additive mapping, and each case is checked at two
 * different inputs from its own congruence class.
 *
 * @param {string} code
 * @param {string} name
 * @param {'script'|'module'} [sourceType]
 * @returns {{cases:number,offset:number,source:string}}
 */
function recover(code,name='guardedTotal',sourceType='script') {
  const tree=/** @type {AstNode} */ (acorn.parse(code,{
    ecmaVersion:'latest',sourceType
  }));
  const fn=tree.body.map(statement=>statement.type==='ExportNamedDeclaration'?
    statement.declaration:statement).find(statement=>statement?.type==='FunctionDeclaration'&&
    statement.id?.name===name);
  if(!fn)throw new TypeError('Target not found');
  const statements=fn.body.body;
  if(statements.length!==2||statements[0].type!=='VariableDeclaration'||
     statements[1].type!=='SwitchStatement')throw new TypeError('Unexpected function shape');
  const binding=statements[0].declarations[0];
  if(binding.id.type!=='Identifier'||!binding.init||
     fn.params[0]?.type!=='Identifier')throw new TypeError('Unexpected input normalization');
  const cases=statements[1].cases.filter(entry=>entry.test);
  if(!cases.length||![2,4,8].includes(cases.length))throw new TypeError('Unexpected variant count');
  /** @type {Set<number>} */
  const offsets=new Set();
  for(const branch of cases) {
    if(branch.test?.type!=='Literal'||typeof branch.test.value!=='number'||
       !Number.isInteger(branch.test.value)||
       branch.test.value<0||branch.test.value>=cases.length||
       branch.consequent.length!==1)throw new TypeError('Unexpected branch');
    for(const input of [branch.test.value,branch.test.value+cases.length]) {
      const environment=new Map([[fn.params[0].name,input]]);
      const normalized=evaluate(binding.init,environment);
      if((normalized&(cases.length-1))!==branch.test.value)throw new TypeError('Wrong case');
      environment.set(binding.id.name,normalized);
      const output=interpret(branch.consequent[0],environment);
      if(!output.returned)throw new TypeError('Missing result');
      offsets.add((output.value-normalized)|0);
    }
  }
  if(offsets.size!==1)throw new TypeError('Unsupported non-affine variant family');
  const offset=/** @type {number} */ (offsets.values().next().value);
  return {cases:cases.length,offset,
    source:'function '+name+'(input){return (((input|0)+('+offset+'))|0)}'};
}

if(require.main===module) {
  const filename=path.join(__dirname,'../examples/polyvariant-affine/obfuscated.cjs');
  const attack=recover(fs.readFileSync(filename,'utf8'));
  process.stdout.write(JSON.stringify(attack,null,2)+'\n');
}

module.exports={recover};
