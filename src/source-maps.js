'use strict';

const acorn = require('acorn');
const {assertNoInlineHtmlSource}=require('./html-assets');
const {assertNoInlineSvgSource}=require('./svg-assets');

/**
 * Source-map artifacts can contain the unobfuscated program in sourcesContent,
 * and even maps without sourcesContent reveal original identifier spellings.
 * A source-map sidecar must never be copied into a protected output by default.
 * @param {string} filename
 * @returns {boolean}
 */
function isSourceMapAsset(filename) {
  return /\.map$/iu.test(filename);
}

/**
 * Executable or transpiler-input source files copied as opaque assets bypass
 * every JavaScript transformation and can publish the entire source text.
 * @param {string} filename
 * @returns {boolean}
 */
function isUntransformedSourceAsset(filename) {
  return /\.(?:[cm]?js|jsx|[cm]?ts|tsx|vue|svelte|astro|mdx|coffee|litcoffee)$/iu.test(filename);
}

/**
 * Recognize both //# and /*# sourceMappingURL directives from real JavaScript
 * comments. Parsing avoids false positives in string/regex/template
 * literals containing the same spelling. All known source-map URL forms,
 * including embedded data: URLs, are rejected without fetching remote URLs.
 * @param {string} source
 * @param {'script'|'module'|'commonjs'} [sourceType]
 * @returns {boolean}
 */
function hasSourceMapDirective(source,sourceType='module') {
  let detected = false;
  acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: sourceType === 'commonjs' ? 'script' : sourceType,
    allowReturnOutsideFunction: sourceType === 'commonjs',
    allowHashBang: true,
    onComment(_block, value) {
      if (/^\s*[#@]\s*sourceMappingURL\s*=/u.test(value)) detected = true;
    }
  });
  return detected;
}

/**
 * Refuse transformations whose output would disclose an original source map.
 * This is a preflight policy, not a claim of full source confidentiality:
 * arbitrary HTML/JSON assets can still contain source code.
 * @param {{path:string,code:string|Buffer,sourceType:'module'|'script'|'commonjs'|'asset'}} file
 * @returns {void}
 */
function assertNoSourceMapDisclosure(file) {
  if (file.sourceType === 'asset') {
    if (isSourceMapAsset(file.path)) {
      throw new TypeError('Source-map asset would disclose original source: ' + file.path);
    }
    if (isUntransformedSourceAsset(file.path)) {
      throw new TypeError('Untransformed source asset would disclose original code: ' + file.path);
    }
    assertNoInlineHtmlSource(file.path,file.code);
    assertNoInlineSvgSource(file.path,file.code);
    return;
  }
  if (typeof file.code === 'string' && hasSourceMapDirective(file.code,file.sourceType)) {
    throw new TypeError('Source-map directive would disclose original source: ' + file.path);
  }
}

module.exports = {isSourceMapAsset,isUntransformedSourceAsset,hasSourceMapDirective,assertNoSourceMapDisclosure};
