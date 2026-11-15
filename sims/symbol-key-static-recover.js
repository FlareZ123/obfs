'use strict';

const {parse,walk,applyEdits}=require('../src/ast');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * Independent source-only recovery against the experimental private Symbol
 * backend. Inputs are public transformed JS, not source, seed, or symbol map.
 *
 * The recovery replaces each private, unregistered Symbol with a distinct
 * ordinary string key. This reconstructs executable field dataflow for the
 * supported private-object contract; it does not claim reflective equivalence.
 *
 * @param {string} code
 * @param {'commonjs'|'module'} kind
 * @returns {{code:string,keys:number}}
 */
function recoverSymbolKeys(code,kind) {
  const ast=parse(code,kind);
  /** @type {Map<string,string>} */
  const mapping=new Map();
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  const used=new Set();
  walk(ast,node=>{
    if(node.type==='Literal'&&typeof node.value==='string')used.add(node.value);
  });
  for(const statement of ast.body) {
    if(statement.type!=='VariableDeclaration'||statement.kind!=='const'||
       statement.declarations.length!==1)continue;
    const declaration=statement.declarations[0];
    if(declaration.id.type!=='Identifier'||declaration.init?.type!=='CallExpression'||
       declaration.init.callee.type!=='Identifier'||
       declaration.init.callee.name!=='Symbol'||declaration.init.arguments.length)continue;
    let index=mapping.size;
    let replacement='_recovered_symbol_'+index;
    while(used.has(replacement))replacement='_recovered_symbol_'+(++index);
    used.add(replacement);
    mapping.set(declaration.id.name,replacement);
    edits.push({start:statement.start,end:statement.end,text:''});
  }
  if(!mapping.size)return {code,keys:0};
  let unknown=false;
  walk(ast,(node,parent,key)=>{
    if(node.type!=='Identifier'||!mapping.has(node.name))return;
    if(parent?.type==='VariableDeclarator'&&key==='id')return;
    if(parent?.type==='MemberExpression'&&key==='property'&&parent.computed ||
       parent?.type==='Property'&&key==='key'&&parent.computed) {
      edits.push({start:node.start,end:node.end,
        text:JSON.stringify(mapping.get(node.name))});
    } else unknown=true;
  });
  if(unknown)throw new TypeError('Symbol escapes outside static computed access');
  return {code:applyEdits(code,edits),keys:mapping.size};
}
module.exports={recoverSymbolKeys};
