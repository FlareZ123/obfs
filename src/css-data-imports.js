'use strict';

const cssTree=require('css-tree');

/**
 * A data: URL in an @import rule is an additional stylesheet embedded within
 * otherwise audited CSS. Its source-map comments and contents are outside
 * the ordinary top-level CSS source-map scan. The preflight declines these
 * nested documents rather than approximating arbitrary recursive decoding.
 *
 * CSS-tree 3.x tokenizes/decodes quoted strings, URL tokens and CSS escaped
 * identifiers, avoiding comment and quoted-content regex ambiguities.
 * Malformed/opaque import preludes are also declined conservatively.
 *
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function hasUnauditedCssDataImport(code) {
  const source=Buffer.isBuffer(code)
    ? new TextDecoder('utf-8',{fatal:true}).decode(code) : code;
  if(source.includes('\0'))throw new TypeError('CSS asset contains NUL bytes');
  const ast=cssTree.parse(source);
  let unaudited=false;
  cssTree.walk(ast,node=>{
    if(node.type!=='Atrule' ||
        cssTree.ident.decode(node.name).toLowerCase()!=='import')return;
    if(node.prelude?.type!=='AtrulePrelude') {
      unaudited=true;
      return;
    }
    const first=node.prelude.children.first;
    if(!first || (first.type!=='Url' && first.type!=='String')) {
      unaudited=true;
      return;
    }
    const normalized=first.value.replace(/[\x00-\x20]/gu,'').toLowerCase();
    if(normalized.startsWith('data:'))unaudited=true;
  });
  return unaudited;
}

module.exports={hasUnauditedCssDataImport};
