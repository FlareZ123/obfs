'use strict';

const {parse,walk,applyEdits} = require('../src/ast');

/** @typedef {'script'|'module'|'commonjs'} SourceType */
/** @typedef {{path:string,code:string,sourceType?:SourceType}} File */
/** @typedef {{path:string,code:string,sourceType?:SourceType}} OutputFile */

/**
 * A minimal static adversary that replaces the prototype's deterministic
 * hash-looking names with neutral sequential labels. It cannot reconstruct
 * erased original spellings, and intentionally makes no scope/type proof.
 * Succeeds on compiler-proven private bindings and property accesses.
 *
 * @param {File[]} input
 * @returns {{files:OutputFile[],properties:number,variables:number}}
 */
function neutralizeHashedNames(input) {
  /** @type {Map<string,string>} */
  const properties=new Map();
  /** @type {Map<string,string>} */
  const variables=new Map();
  /** @type {OutputFile[]} */
  const files=[];

  /** @param {string} name @returns {string|null} */
  function label(name) {
    if(/^_p[a-f0-9]{10}$/.test(name)) {
      if(!properties.has(name)) properties.set(name,`reconstructedProperty_${properties.size}`);
      return properties.get(name)??null;
    }
    if(/^_v[a-f0-9]{12}$/.test(name)) {
      if(!variables.has(name)) variables.set(name,`reconstructedLocal_${variables.size}`);
      return variables.get(name)??null;
    }
    return null;
  }

  for(const file of input) {
    const type=file.sourceType??(file.path.endsWith('.mjs')?'module':
      file.path.endsWith('.cjs')?'commonjs':'script');
    const ast=parse(file.code,type);
    /** @type {import('../src/ast').Edit[]} */
    const edits=[];
    walk(ast,node=>{
      if(node.type==='Identifier') {
        const replacement=label(node.name);
        if(replacement!==null) edits.push({start:node.start,end:node.end,text:replacement});
      } else if(node.type==='Literal'&&typeof node.value==='string') {
        const replacement=label(node.value);
        if(replacement!==null) edits.push({start:node.start,end:node.end,
          text:JSON.stringify(replacement)});
      }
    });
    files.push({...file,code:applyEdits(file.code,edits)});
  }
  return {files,properties:properties.size,variables:variables.size};
}

module.exports={neutralizeHashedNames};
