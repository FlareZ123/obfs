'use strict';

const {SaxesParser}=require('saxes');
const {decodeMarkup,isEmbeddedExecutableUrl,isEmbeddedRefreshUrl}=require('./html-assets');

/**
 * Reject executable constructs in SVG served as ordinary static image assets.
 * Unlike HTML, SVG is XML; saxes follows XML well-formedness and namespace
 * rules. External references and non-executable image geometry are retained.
 *
 * @param {string} xml
 * @returns {string|null}
 */
function findInlineSvgSource(xml) {
  const parser=new SaxesParser({xmlns:true});
  /** @type {string|null} */
  let issue=null;
  parser.on('xmldecl',declaration=>{
    if(declaration.encoding && !/^utf-?8$/iu.test(declaration.encoding)) {
      issue='non-UTF-8 XML declaration';
    }
  });
  // DTD/entity processing can change the bytes seen by a browser's XML
  // parser. Refuse it rather than analyzing an incomplete entity expansion.
  parser.on('doctype',()=>{issue='DTD declaration';});
  parser.on('opentag',tag=>{
    const element=tag.local.toLowerCase();
    if(element==='script')issue='script element';
    const attrs=Object.values(tag.attributes);
    if(element==='meta') {
      const pragma=attrs.find(attr=>attr.local.toLowerCase()==='http-equiv')?.value.trim().toLowerCase();
      const content=attrs.find(attr=>attr.local.toLowerCase()==='content')?.value;
      if(pragma==='refresh' && content && isEmbeddedRefreshUrl(content)) {
        issue='embedded executable refresh URL';
      }
    }
    for(const attr of attrs) {
      const key=attr.local.toLowerCase();
      if(key==='srcdoc')issue='embedded iframe source';
      if(/^on[a-z]/u.test(key))issue='event handler';
      if(['href','src','data','action','formaction','from','to','by','values'].includes(key) &&
          isEmbeddedExecutableUrl(attr.value)) {
        issue='embedded executable URL';
      }
    }
  });
  // Surface malformed XML as a build refusal. Unwell-formed SVG behavior
  // differs across rendering contexts and cannot be safely certified here.
  parser.on('error',error=>{
    throw new TypeError('Malformed SVG XML: '+error.message);
  });
  parser.write(xml).close();
  return issue;
}

/**
 * @param {string} path
 * @param {string|Buffer} code
 * @returns {void}
 */
function assertNoInlineSvgSource(path,code) {
  if(!/\.svg$/iu.test(path))return;
  const issue=findInlineSvgSource(decodeMarkup(path,code,'SVG'));
  if(issue)throw new TypeError('SVG asset contains '+issue+': '+path);
}

module.exports={findInlineSvgSource,assertNoInlineSvgSource};
