'use strict';

const acorn=require('acorn');

/** @typedef {{path:string,code:string,sourceType?:'module'|'commonjs'|'script'}} File */
/** @typedef {{start:number,end:number,text:string}} Edit */

/**
 * Independent source-only renaming attack. The attacker receives emitted JS
 * files and uses just the published Acorn tokenizer API, not any obfuscator
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
    acorn.parse(file.code,{
      ecmaVersion:'latest',
      sourceType:file.sourceType??'module',
      onToken:tokens
    });
    /** @type {Edit[]} */
    const edits=[];
    for(const token of tokens) {
      if(token.type.label!=='name'&&token.type.label!=='string')continue;
      if(typeof token.value!=='string'||
          !/^_p[0-9a-f]{10}(?:[0-9a-f]{2})?$/.test(token.value))continue;
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
