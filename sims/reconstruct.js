'use strict';
const ts = require('typescript');

/**
 * Demonstrates how readily the baseline obfuscator's renamed properties can
 * be assigned neutral names using only the distributed obfuscated sources.
 * This is an adversarial evaluation tool, not a production deobfuscator.
 * @param {Record<string,string>} files
 * @returns {{files:Record<string,string>, renamed:number}}
 */
function reconstruct(files) {
  const pattern = /^_\$[a-f0-9]{14}$/;
  const entries = Object.entries(files);
  const seen = new Map();
  const parsed = entries.map(([name,source]) => [name,source,
    ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.getScriptKindFromFileName(name))]);
  /** @param {import('typescript').Node} node @param {(node: import('typescript').Node) => void} cb */
  function visit(node,cb){cb(node);ts.forEachChild(node,child=>visit(child,cb));}
  for(const [, ,source] of parsed) visit(source,node=>{
    if((ts.isIdentifier(node)||ts.isStringLiteral(node))&&pattern.test(node.text)&&!seen.has(node.text)){
      seen.set(node.text,'reconstructed_'+seen.size);
    }
  });
  const output={};
  for(const [name,content,source] of parsed){
    const edits=[];
    visit(source,node=>{
      if(!(ts.isIdentifier(node)||ts.isStringLiteral(node)))return;
      const replacement=seen.get(node.text);
      if(!replacement)return;
      edits.push({start:node.getStart(source),end:node.getEnd(),value:ts.isStringLiteral(node)?JSON.stringify(replacement):replacement});
    });
    let changed=content;
    for(const edit of edits.sort((a,b)=>b.start-a.start)){
      changed=changed.slice(0,edit.start)+edit.value+changed.slice(edit.end);
    }
    output[name]=changed;
  }
  return {files:output,renamed:seen.size};
}
module.exports={reconstruct};
