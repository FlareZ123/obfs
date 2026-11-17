'use strict';

const acorn=require('acorn');
const walk=require('acorn-walk');

/** @typedef {{path:string,code:string,sourceType?:'module'|'commonjs'|'script'}} File */
/** @typedef {{start:number,end:number,text:string}} Edit */

/**
 * Independent source-only renaming attack. The attacker receives emitted JS
 * files and uses only published Acorn parser, walker and token APIs, not any obfuscator
 * AST analysis, seed, original files, private keys or runtime instrumentation.
 *
 * This normalizes public hash-looking property identifiers into readable
 * sequential labels. It does not recover erased original names or determine
 * whether an arbitrary identifier has a particular semantic meaning.
 *
 * @param {File[]} files
 * @returns {{files:File[],properties:number}}
 */
function normalizePublicFields(files) {
  /** @type {Map<string,string>} */
  const labels=new Map();
  const emitted=files.map(file=>{
    /** @type {(import('acorn').Token & {value?:unknown})[]} */
    const tokens=[];
    const ast=acorn.parse(file.code,{
      ecmaVersion:'latest',
      sourceType:file.sourceType??'module',
      onToken:tokens
    });
    // Data literals can accidentally resemble a generated private key.
    // Only change quoted keys in actual property syntax.  A public-only
    // attacker must preserve unrelated host strings and application data.
    /** @type {Set<number>} */
    const propertyStringOffsets=new Set();
    walk.simple(ast,{
      Property(node) {
        if(node.key.type==='Literal'&&typeof node.key.value==='string')
          propertyStringOffsets.add(node.key.start);
      },
      ObjectPattern(node) {
        for(const property of node.properties) {
          if(property.type==='Property'&&property.key.type==='Literal'&&
             typeof property.key.value==='string')
            propertyStringOffsets.add(property.key.start);
        }
      },
      MemberExpression(node) {
        if(node.computed&&node.property.type==='Literal'&&
           typeof node.property.value==='string')
          propertyStringOffsets.add(node.property.start);
      }
    });
    /** @type {Edit[]} */
    const edits=[];
    for(const token of tokens) {
      if(token.type.label!=='name'&&token.type.label!=='string')continue;
      if(typeof token.value!=='string'||
          !/^_p[0-9a-f]{10}(?:[0-9a-f]{2})?$/.test(token.value))continue;
      if(token.type.label==='string'&&!propertyStringOffsets.has(token.start))continue;
      let label=labels.get(token.value);
      if(label===undefined) {
        label='_publicField'+labels.size;
        labels.set(token.value,label);
      }
      edits.push({
        start:token.start,
        end:token.end,
        text:token.type.label==='string'?JSON.stringify(label):label
      });
    }
    let code=file.code;
    // Token offsets refer to the original source. Apply edits back-to-front.
    for(let i=edits.length-1;i>=0;i--) {
      const edit=edits[i];
      code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
    }
    return {...file,code};
  });
  return {files:emitted,properties:labels.size};
}

module.exports={normalizePublicFields};
