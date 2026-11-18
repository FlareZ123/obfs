'use strict';

/**
 * Detect nested CSS data-URL stylesheets by traversing parsed import-rule
 * nodes. A token spelled like an import in a custom-property declaration is
 * inert; treating every at-keyword in the source as a rule rejects otherwise
 * valid assets. Quoted strings, escaped names and URLs are parsed as CSS.
 *
 * Malformed or opaque import-rule preludes are conservatively refused.
 * This is a source-publication check, not a full confidentiality proof.
 *
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function hasCssDataImport(code) {
  // Keep JavaScript-only compiles independent of CSS parser initialization.
  const cssTree=require('css-tree');
  const source=Buffer.isBuffer(code)
    ?new TextDecoder('utf-8',{fatal:true}).decode(code):code;
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
    // WHATWG URL parsing drops tab/newline anywhere in a URL. CSS-tree has
    // already decoded escapes in the URL and quoted-string token values.
    const normalized=first.value.replace(/[\t\r\n]/gu,'').trimStart().toLowerCase();
    if(normalized.startsWith('data:'))unaudited=true;
  });
  return unaudited;
}

module.exports={hasCssDataImport};
