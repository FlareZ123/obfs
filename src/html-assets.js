'use strict';

const {parse}=require('parse5');

/**
 * @typedef {{
 *   tagName?:string,
 *   attrs?:{name:string,value:string}[],
 *   childNodes?:HtmlNode[],
 *   content?:HtmlNode,
 *   value?:string
 * }} HtmlNode
 */

/**
 * A browser strips ASCII tab/newline and surrounding spaces from many URL
 * contexts, and the HTML parser has already decoded character references.
 * Fail closed on a subset of URL-bearing attributes that can embed program
 * text in a document distributed without JavaScript transformation.
 * @param {string} raw
 * @returns {boolean}
 */
function isEmbeddedExecutableUrl(raw) {
  const value=raw.replace(/[\x00-\x20]/gu,'').toLowerCase();
  return value.startsWith('javascript:') ||
    /^data:(?:text\/html|(?:text|application)\/(?:javascript|ecmascript)|image\/svg\+xml)(?:[;,]|$)/u.test(value);
}

/**
 * Identify executable JavaScript embedded in browser-parsed HTML.
 * External script references are allowed because their targets must be
 * transformed and published separately. The original HTML is left untouched.
 *
 * This is an explicit, bounded source-distribution audit. It cannot establish
 * full absence of plaintext JS in arbitrary text, JSON or CSS values.
 * @param {string} html
 * @returns {string|null} First recognized disclosure category, if any.
 */
function findInlineHtmlSource(html) {
  const root=/** @type {HtmlNode} */ (/** @type {unknown} */ (parse(html)));
  /** @type {string|null} */
  let issue=null;
  /** @param {HtmlNode} node @returns {void} */
  function visit(node) {
    if(issue)return;
    const attrs=node.attrs??[];
    for(const {name,value} of attrs) {
      const lower=name.toLowerCase();
      if(/^on[a-z]/u.test(lower)) {issue='inline event handler';return;}
      if(lower==='srcdoc') {issue='embedded iframe source';return;}
      if(['src','href','action','formaction','xlink:href','data','poster'].includes(lower) &&
          isEmbeddedExecutableUrl(value)) {issue='embedded executable URL';return;}
      if(node.tagName==='script' && lower==='src' &&
          /^\s*data:/iu.test(value)) {issue='embedded script data URL';return;}
    }
    if(node.tagName==='script' &&
        node.childNodes?.some(child=>typeof child.value==='string' && /\S/u.test(child.value))) {
      issue='inline script source';
      return;
    }
    for(const child of node.childNodes??[])visit(child);
    if(node.content)visit(node.content);
  }
  visit(root);
  return issue;
}

/**
 * Audit HTML assets before their bytes are copied to an output directory
 * or offered by SCO. A detected inline execution path is rejected rather
 * than silently stripped, which could change program behavior.
 * @param {string} path
 * @param {string|Buffer} code
 * @returns {void}
 */
function assertNoInlineHtmlSource(path,code) {
  if(!/\.html?$/iu.test(path))return;
  const issue=findInlineHtmlSource(Buffer.isBuffer(code)?code.toString('utf8'):code);
  if(issue)throw new TypeError('HTML asset contains '+issue+': '+path);
}

module.exports={findInlineHtmlSource,isEmbeddedExecutableUrl,assertNoInlineHtmlSource};
