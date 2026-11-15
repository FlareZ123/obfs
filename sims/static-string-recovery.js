'use strict';

const {parse,walk,applyEdits} = require('../src/ast');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {'script'|'module'|'commonjs'} SourceType */

/**
 * Recognize the public XOR key in a compiler-produced top-level decoder.
 * This is static AST inspection and never executes the target source.
 * @param {AstNode} loop
 * @returns {number|null}
 */
function findXorKey(loop) {
  /** @type {Set<number>} */
  const keys=new Set();
  walk(loop,node=>{
    if(node.type!=='BinaryExpression'||node.operator!=='^')return;
    const value=node.right;
    const left=node.left;
    if(value?.type!=='Literal'||typeof value.value!=='number')return;
    if(left?.type!=='CallExpression'||left.callee?.type!=='MemberExpression')return;
    if(left.callee.property?.name!=='charCodeAt')return;
    keys.add(value.value);
  });
  return keys.size===1?[...keys][0]:null;
}

/**
 * Recover literal values from this prototype's recognized eager decoder.
 * A discovered table is modified only if every external reference is a
 * statically indexed element and its top-level XOR loop has one clear key.
 * The original decoder stays intact, preserving its runtime side effects.
 *
 * @param {string} source
 * @param {SourceType} sourceType
 * @returns {{code:string,literals:number,tables:number,diagnostics:string[]}}
 */
function recoverObfuscatedStrings(source,sourceType='script') {
  const ast=parse(source,sourceType);
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  /** @type {string[]} */
  const diagnostics=[];
  let tables=0;
  let literals=0;
  /** @type {AstNode[]} */
  const top=ast.body;
  for(let index=0;index+1<top.length;index++) {
    const statement=top[index],loop=top[index+1];
    if(statement.type!=='VariableDeclaration'||statement.kind!=='const'||
        statement.declarations.length!==1||loop.type!=='ForStatement')continue;
    const declaration=statement.declarations[0];
    if(declaration.id?.type!=='Identifier'||!/^_o[a-f0-9]{12}$/.test(declaration.id.name)||
        declaration.init?.type!=='ArrayExpression')continue;
    const name=declaration.id.name;
    /** @type {AstNode[]} */
    const entries=declaration.init.elements;
    if(!entries.length||entries.some(node=>node?.type!=='Literal'||typeof node.value!=='string'))continue;
    const key=findXorKey(loop);
    if(key===null)continue;
    const text=source.slice(loop.start,loop.end);
    if(!text.includes(`${name}[`)||!text.includes('String.fromCharCode'))continue;
    const decoded=entries.map(node=>{
      /** @type {string} */
      const encoded=node.value;
      let value='';
      for(let offset=0;offset<encoded.length;offset++) {
        value+=String.fromCharCode(encoded.charCodeAt(offset)^key);
      }
      return value;
    });
    /** @type {import('../src/ast').Edit[]} */
    const replacements=[];
    let unknownUsage=false;
    walk(ast,(node,parent,parentKey,ancestors)=>{
      if(node.type!=='Identifier'||node.name!==name) return;
      if(ancestors.includes(statement)||ancestors.includes(loop))return;
      if(parent?.type!=='MemberExpression'||parentKey!=='object'||!parent.computed||
          parent.property?.type!=='Literal'||!Number.isInteger(parent.property.value)||
          parent.property.value<0||parent.property.value>=decoded.length) {
        unknownUsage=true;
        return;
      }
      replacements.push({start:parent.start,end:parent.end,text:JSON.stringify(decoded[parent.property.value])});
    });
    if(unknownUsage) {
      diagnostics.push(`Decoder ${name} is used through an unsupported expression`);
      continue;
    }
    edits.push(...replacements);
    literals+=replacements.length;
    tables++;
    index++;
  }
  return {code:applyEdits(source,edits),literals,tables,diagnostics};
}

module.exports={recoverObfuscatedStrings};
