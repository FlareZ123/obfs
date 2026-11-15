'use strict';

/**
 * CSS supports block-comment source-map annotations. Inspect actual comments
 * while skipping quoted CSS strings, so a declaration containing the literal
 * text "/*# sourceMappingURL=..." is not falsely classified as a directive.
 * Refuse malformed UTF-8 or NUL-containing CSS rather than silently missing
 * an annotation encoded differently from its declared asset type.
 *
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function hasCssSourceMapDirective(code) {
  const source=Buffer.isBuffer(code)
    ? new TextDecoder('utf-8',{fatal:true}).decode(code) : code;
  if(source.includes('\0'))throw new TypeError('CSS asset contains NUL bytes');
  for(let index=0;index<source.length;) {
    const current=source[index];
    if(current==='"' || current==="'") {
      const quote=current;
      index++;
      while(index<source.length) {
        const c=source[index++];
        if(c==='\\')index++;
        else if(c===quote || c==='\n'||c==='\r'||c==='\f')break;
      }
      continue;
    }
    if(current==='/' && source[index+1]==='*') {
      const end=source.indexOf('*/',index+2);
      if(end<0)return false;
      const comment=source.slice(index+2,end);
      if(/^\s*[@#]\s*sourceMappingURL\s*=/u.test(comment))return true;
      index=end+2;
      continue;
    }
    index++;
  }
  return false;
}

module.exports={hasCssSourceMapDirective};
