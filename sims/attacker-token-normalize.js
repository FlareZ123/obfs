'use strict';

const acorn=require('acorn');
const walk=require('acorn-walk');

/** @typedef {'script'|'module'|'commonjs'} SourceType */
/** @typedef {{path:string,code:string,sourceType?:SourceType}} File */
/** @typedef {{start:number,end:number,text:string}} Edit */

/**
 * An independent static attacker for obfs' hash-label surface. Receives only
 * distributed source files; it does not load the obfuscator's parser,
 * transformer, source maps or the original source. Acorn token positions
 * make comments, regular expressions and string quoting distinguishable.
 *
 * It deliberately does NOT recover erased private names or algorithms.
 * @param {File[]} files
 * @returns {{files:File[],properties:number,variables:number}}
 */
function normalizeDistributedFiles(files) {
  /** @type {Map<string,string>} */
  const fields=new Map();
  /** @type {Map<string,string>} */
  const locals=new Map();
  /** @type {File[]} */
  const output=[];

  /** @param {string} value @returns {string|null} */
  function replacement(value) {
    if(/^_p[a-f0-9]{10}(?:[a-f0-9]{2})?$/.test(value) ||
       /^_\$[a-f0-9]{14}$/.test(value)) {
      if(!fields.has(value))fields.set(value,'plainField'+fields.size);
      return fields.get(value)??null;
    }
    if(/^_v[a-f0-9]{12}$/.test(value)) {
      if(!locals.has(value))locals.set(value,'plainLocal'+locals.size);
      return locals.get(value)??null;
    }
    return null;
  }

  for(const file of files) {
    const type=file.sourceType??(file.path.endsWith('.mjs')?'module':
      file.path.endsWith('.cjs')?'commonjs':'script');
    /** @type {import('acorn').Token[]} */
    const tokens=[];
    const ast=acorn.parse(file.code,{
      ecmaVersion:'latest',sourceType:type==='commonjs'?'script':type,
      allowReturnOutsideFunction:type==='commonjs',allowHashBang:true,
      onToken:tokens
    });
    // A hash-shaped string can be program data. Rewrite only literal keys
    // used directly in the syntax of a property definition or member read.
    // This is a syntactic source-only attack, not a general dataflow proof.
    /** @type {Set<number>} */
    const keyStringStarts=new Set();
    walk.ancestor(ast,{
      Literal(node,_state,ancestors) {
        if(typeof node.value!=='string')return;
        const parent=ancestors[ancestors.length-2];
        if((parent?.type==='Property'&&parent.key===node)||
           (parent?.type==='MemberExpression'&&parent.computed&&parent.property===node)) {
          keyStringStarts.add(node.start);
        }
      }
    });
    /** @type {Edit[]} */
    const edits=[];
    for(const token of tokens) {
      if(token.type!==acorn.tokTypes.name && token.type!==acorn.tokTypes.string)continue;
      const value='value' in token ? token.value : undefined;
      if(typeof value!=='string')continue;
      if(token.type===acorn.tokTypes.string&&!keyStringStarts.has(token.start))continue;
      const next=replacement(value);
      if(next===null)continue;
      edits.push({start:token.start,end:token.end,
        text:token.type===acorn.tokTypes.string?JSON.stringify(next):next});
    }
    let code=file.code;
    for(const edit of edits.sort((a,b)=>b.start-a.start)) {
      code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
    }
    output.push({...file,code});
  }
  return {files:output,properties:fields.size,variables:locals.size};
}

module.exports={normalizeDistributedFiles};
