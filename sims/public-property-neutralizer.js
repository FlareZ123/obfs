'use strict';

/**
 * Deliberately bounded *seedless* attacker for emitted private fields.
 *
 * Receives only the published file bytes, never an original source, build
 * seed, compiler AST, metadata, or runtime oracle. Static digests are
 * themselves the complete cross-file key linkage: rename each digest token
 * everywhere it occurs to the same unrelated, valid JS property spelling.
 *
 * The name substitution is not sound for arbitrary programs: hidden digest
 * strings may also be observable as data, dynamic names can be synthesized,
 * and the same token might serve unrelated roles. The calling regression uses
 * exactly validated static own-data-object owner graphs without these cases.
 *
 * @param {ReadonlyArray<{path:string,code:string,sourceType:string}>} delivered
 * @returns {{files:{path:string,code:string,sourceType:string}[],replacedTokens:number,renamedOccurrences:number,labels:string[]}}
 */
function neutralizePublishedProperties(delivered) {
  if(!Array.isArray(delivered)||delivered.length===0 ||
     delivered.some(file=>typeof file?.code!=='string'||
       typeof file.path!=='string'||typeof file.sourceType!=='string')){
    throw new TypeError('Expected public JavaScript source file group');
  }
  // The current compiler uses 10-hex local and 12-hex ESM token lengths.
  const tokens=[...new Set(delivered.flatMap(file=>
    file.code.match(/\b_p(?:[a-f0-9]{12}|[a-f0-9]{10})\b/gu)??[]))].sort();
  const allSource=delivered.map(file=>file.code).join('\n');
  const replacements=tokens.map((token,i)=>{
    const neutral='attackerField'+i;
    if(allSource.includes(neutral)){
      throw new TypeError('Neutral attacker field conflicts with published source');
    }
    return {token,neutral};
  });
  let renamedOccurrences=0;
  const files=delivered.map(file=>{
    let code=file.code;
    for(const {token,neutral} of replacements) {
      const occurrences=code.split(token).length-1;
      renamedOccurrences+=occurrences;
      code=code.replaceAll(token,neutral);
    }
    return {...file,code};
  });
  return {files,replacedTokens:tokens.length,renamedOccurrences,
    labels:replacements.map(item=>item.neutral)};
}

module.exports={neutralizePublishedProperties};
