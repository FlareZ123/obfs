'use strict';

/** @param {string} source @param {number} at @returns {{value:string,next:number}} */
function readEscape(source,at) {
  const hex=/^[0-9a-f]{1,6}/iu.exec(source.slice(at+1,at+7))?.[0];
  if(hex) {
    let next=at+1+hex.length;
    if(/[ \t\r\n\f]/u.test(source[next]??'')) {
      if(source[next]==='\r' && source[next+1]==='\n')next++;
      next++;
    }
    const point=Number.parseInt(hex,16);
    return {value:point===0 || point>0x10ffff ||
      point>=0xd800&&point<=0xdfff?'\uFFFD':String.fromCodePoint(point),next};
  }
  const char=source[at+1];
  if(char===undefined)return {value:'',next:at+1};
  if(char==='\r'||char==='\n'||char==='\f') {
    return {value:'',next:at+(char==='\r'&&source[at+2]==='\n'?3:2)};
  }
  return {value:char,next:at+2};
}

/** @param {string} source @param {number} at @returns {{value:string,next:number}} */
function readIdentifier(source,at) {
  let value='';let index=at;
  while(index<source.length) {
    const char=source[index];
    if(char==='\\') {
      const escaped=readEscape(source,index);
      value+=escaped.value;index=escaped.next;
    } else if(/[\w-]/u.test(char)||char.charCodeAt(0)>=0x80) {
      value+=char;index++;
    } else break;
  }
  return {value,next:index};
}

/** @param {string} source @param {number} at @returns {number} */
function skipTrivia(source,at) {
  let index=at;
  while(index<source.length) {
    if(/[ \t\r\n\f]/u.test(source[index])){index++;continue;}
    if(source[index]==='/' && source[index+1]==='*') {
      const end=source.indexOf('*/',index+2);
      index=end<0?source.length:end+2;continue;
    }
    break;
  }
  return index;
}

/** @param {string} source @param {number} at @returns {{value:string,next:number}|null} */
function readQuoted(source,at) {
  const quote=source[at];let value='';let index=at+1;
  while(index<source.length) {
    const char=source[index];
    if(char===quote)return {value,next:index+1};
    if(char==='\n'||char==='\r'||char==='\f')return null;
    if(char==='\\') {
      const escaped=readEscape(source,index);
      value+=escaped.value;index=escaped.next;
    } else {value+=char;index++;}
  }
  return null;
}

/** @param {string} source @param {number} at @returns {string|null} */
function readImportUrl(source,at) {
  let index=skipTrivia(source,at);
  if(source[index]==='"'||source[index]==="'")return readQuoted(source,index)?.value??null;
  const keyword=readIdentifier(source,index);
  if(keyword.value.toLowerCase()!=='url')return null;
  index=skipTrivia(source,keyword.next);
  if(source[index]!=='(')return null;
  index=skipTrivia(source,index+1);
  if(source[index]==='"'||source[index]==="'")return readQuoted(source,index)?.value??null;
  let url='';
  while(index<source.length) {
    const char=source[index];
    if(char===')')return url.trimEnd();
    if(/[ \t\r\n\f"'()]/u.test(char))return null;
    if(char==='\\') {
      const escaped=readEscape(source,index);
      url+=escaped.value;index=escaped.next;
    } else {url+=char;index++;}
  }
  return null;
}

/**
 * A CSS data: import may embed an entire untransformed stylesheet and its
 * inline source map, bypassing standalone CSS/source-map asset preflights.
 * Refuse the recognized nested URL without changing ordinary external imports.
 * This is a bounded publication guard, not a full audit of all CSS data values.
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function hasCssDataImport(code) {
  const source=Buffer.isBuffer(code)
    ?new TextDecoder('utf-8',{fatal:true}).decode(code):code;
  if(source.includes('\0'))throw new TypeError('CSS asset contains NUL bytes');
  for(let index=0;index<source.length;) {
    if(source[index]==='/'&&source[index+1]==='*') {
      index=skipTrivia(source,index);continue;
    }
    if(source[index]==='"'||source[index]==="'") {
      index=readQuoted(source,index)?.next??source.length;continue;
    }
    if(source[index]==='@') {
      const keyword=readIdentifier(source,index+1);
      if(keyword.value.toLowerCase()==='import') {
        const url=readImportUrl(source,keyword.next);
        if(url&&url.trimStart().toLowerCase().startsWith('data:'))return true;
      }
      index=Math.max(index+1,keyword.next);continue;
    }
    index++;
  }
  return false;
}

module.exports={hasCssDataImport};
