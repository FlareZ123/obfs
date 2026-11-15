'use strict';

const acorn=require('acorn');

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
    acorn.parse(file.code,{
      ecmaVersion:'latest',sourceType:type==='commonjs'?'script':type,
      allowReturnOutsideFunction:type==='commonjs',allowHashBang:true,
      onToken:tokens
    });
    /** @type {Edit[]} */
    const edits=[];
    for(const token of tokens) {
      if(token.type!==acorn.tokTypes.name && token.type!==acorn.tokTypes.string)continue;
      const value=token.value;
      if(typeof value!=='string')continue;
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
