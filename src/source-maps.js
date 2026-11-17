'use strict';

const acorn = require('acorn');
const {TextDecoder}=require('node:util');
const {assertNoInlineHtmlSource}=require('./html-assets');
const {assertNoInlineSvgSource}=require('./svg-assets');
const {hasCssSourceMapDirective}=require('./css-source-maps');
const {hasCssDataImport}=require('./css-data-imports');

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
 * Recognize a UTF-16 JSON object prefix without decoding arbitrary binary
 * assets. ECMAScript leading whitespace, including repeated U+FEFF,
 * can precede the opening brace. A BOM is optional in either byte order.
 * @param {Buffer} bytes
 * @returns {'utf-16le'|'utf-16be'|null}
 */
function utf16JsonEncoding(bytes) {
  /**
   * @param {'utf-16le'|'utf-16be'} encoding
   * @param {number} start
   * @returns {boolean}
   */
  function startsObject(encoding,start){
    for(let index=start;index+1<bytes.length;index+=2){
      const value=encoding==='utf-16le'
        ?bytes[index]|(bytes[index+1]<<8)
        :(bytes[index]<<8)|bytes[index+1];
      if(value===0x7b)return true;
      if(String.fromCharCode(value).trimStart().length!==0)return false;
    }
    return false;
  }
  if(bytes[0]===0xff&&bytes[1]===0xfe)return startsObject('utf-16le',2)?'utf-16le':null;
  if(bytes[0]===0xfe&&bytes[1]===0xff)return startsObject('utf-16be',2)?'utf-16be':null;
  if(startsObject('utf-16le',0))return 'utf-16le';
  if(startsObject('utf-16be',0))return 'utf-16be';
  return null;
}

/**
 * Recognize a version-3 source map by its JSON structure even when the
 * filename is disguised as .json, .txt or an arbitrary opaque asset. JSON
 * object shape is screened before parsing to avoid decoding large images.
 * Indexed source maps may reference nested maps by URL or map object.
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function isSourceMapDocument(code) {
  /** @type {string} */
  let text;
  if (Buffer.isBuffer(code)) {
    const utf16=utf16JsonEncoding(code);
    if(utf16!==null) {
      // The WHATWG decoder removes an encoding BOM and leaves ordinary source
      // map JSON as text; only positively recognized JSON objects are refused.
      text=new TextDecoder(utf16).decode(code);
    }else{
      // A source-map JSON object may begin with any whitespace removed by
      // String#trimStart, including repeated UTF-8 BOMs and non-ASCII Unicode
      // spaces. Reject images quickly based on the possible first UTF-8 byte.
      const first=code[0];
      if(first!==0x7b&&first!==0x20&&!(first>=0x09&&first<=0x0d)&&
          first!==0xc2&&first!==0xe1&&first!==0xe2&&first!==0xe3&&first!==0xef){
        return false;
      }
      text=code.toString('utf8');
    }
  }else{
    text=code;
  }
  if(!text.trimStart().startsWith('{'))return false;
  /** @type {unknown} */
  let parsed;
  try {parsed=JSON.parse(text.trimStart());}
  catch(error){return false;}
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))return false;
  const map=/** @type {{version?:unknown,sources?:unknown,mappings?:unknown,sections?:unknown}} */ (parsed);
  if(map.version!==3)return false;
  if(Array.isArray(map.sources)&&typeof map.mappings==='string')return true;
  if(Array.isArray(map.sections))return map.sections.every(section=>
    Boolean(section && typeof section==='object' && !Array.isArray(section) &&
      ('url' in section || 'map' in section)));
  return false;
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
 * WebAssembly uses a named custom section for source-map URLs under ECMA-426.
 * Consult the host's binary decoder, rather than trusting the file extension
 * or searching arbitrary embedded bytes for a magic phrase.
 *
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function hasWasmSourceMapDirective(code) {
  if(!Buffer.isBuffer(code) || code.length<8 ||
      code[0]!==0 || code[1]!==0x61 || code[2]!==0x73 || code[3]!==0x6d) return false;
  const bytes=new Uint8Array(code.length);
  bytes.set(code);
  const module=new WebAssembly.Module(bytes);
  return WebAssembly.Module.customSections(module,'sourceMappingURL').length>0;
}

/**
 * An opaque archive can embed unmodified JavaScript or a source map, bypassing
 * every plaintext preflight. No archive decoder or manifest binding is part of
 * the public asset contract, so refuse recognized containers instead of
 * copying their unaudited payload bytes into a protected distribution.
 *
 * Magic bytes catch mislabeled gzip/ZIP/zstd/XZ/7z/bzip2 and ustar archives.
 * Brotli has no reliable universal signature, so its filename is checked.
 * This does not claim to detect all compressed or encoded source.
 * @param {string} filename
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function isUnauditedArchiveAsset(filename,code) {
  if(/\.(?:gz|br|zip|tar|tgz|7z|zst|xz|bz2)$/iu.test(filename))return true;
  if(!Buffer.isBuffer(code))return false;
  if(code.length>=2 && code[0]===0x1f && code[1]===0x8b)return true;
  if(code.length>=4 && code[0]===0x50 && code[1]===0x4b &&
     (code[2]===0x03&&code[3]===0x04 ||
      code[2]===0x05&&code[3]===0x06 ||
      code[2]===0x07&&code[3]===0x08))return true;
  if(code.length>=4 && code[0]===0x28 && code[1]===0xb5 &&
     code[2]===0x2f && code[3]===0xfd)return true;
  if(code.length>=6 && code[0]===0xfd && code[1]===0x37 &&
     code[2]===0x7a && code[3]===0x58 && code[4]===0x5a && code[5]===0x00)return true;
  if(code.length>=6 && code[0]===0x37 && code[1]===0x7a &&
     code[2]===0xbc && code[3]===0xaf && code[4]===0x27 && code[5]===0x1c)return true;
  if(code.length>=3 && code[0]===0x42 && code[1]===0x5a && code[2]===0x68)return true;
  if(code.length>=262 && code.toString('ascii',257,262)==='ustar')return true;
  return false;
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
    if (isUnauditedArchiveAsset(file.path,file.code)) {
      throw new TypeError('Compressed or archived asset cannot be audited for source disclosure: '+file.path);
    }
    if (isSourceMapAsset(file.path)) {
      throw new TypeError('Source-map asset would disclose original source: ' + file.path);
    }
    if (isUntransformedSourceAsset(file.path)) {
      throw new TypeError('Untransformed source asset would disclose original code: ' + file.path);
    }
    if (isSourceMapDocument(file.code)) {
      throw new TypeError('Source-map JSON payload would disclose original source: ' + file.path);
    }
    let wasmHasMap;
    try {
      wasmHasMap=hasWasmSourceMapDirective(file.code);
    } catch(error) {
      throw new TypeError('WebAssembly asset cannot be validated for source maps: '+file.path);
    }
    if(wasmHasMap) {
      throw new TypeError('WebAssembly source-map custom section would disclose original source: '+file.path);
    }
    if(/\.css$/iu.test(file.path)) {
      let hasMap;
      try {
        hasMap=hasCssSourceMapDirective(file.code);
      } catch(error) {
        throw new TypeError('CSS asset is not valid UTF-8 or contains NUL bytes: '+file.path);
      }
      if(hasMap) {
        throw new TypeError('CSS source-map directive would disclose original source: '+file.path);
      }
      if(hasCssDataImport(file.code)) {
        throw new TypeError('CSS data import would publish unaudited nested stylesheet: '+file.path);
      }
    }
    assertNoInlineHtmlSource(file.path,file.code);
    assertNoInlineSvgSource(file.path,file.code);
    return;
  }
  if (typeof file.code === 'string' && hasSourceMapDirective(file.code,file.sourceType)) {
    throw new TypeError('Source-map directive would disclose original source: ' + file.path);
  }
}

module.exports = {isSourceMapAsset,isUntransformedSourceAsset,isSourceMapDocument,hasSourceMapDirective,hasCssSourceMapDirective,hasWasmSourceMapDirective,assertNoSourceMapDisclosure};
