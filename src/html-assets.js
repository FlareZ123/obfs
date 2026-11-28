'use strict';

const {parse}=require('parse5');
const {createHash}=require('node:crypto');
const {SaxesParser}=require('saxes');
const {portableKeys}=require('./portable-paths');
const xhtmlNamespace='http://www.w3.org/1999/xhtml';
const svgNamespace='http://www.w3.org/2000/svg';
const SMIL_ANIMATION_ELEMENTS=new Set(['animate','set','animatecolor','animatemotion','animatetransform']);

/**
 * SVG SMIL animation can synthesize an event-handler attribute even when the
 * original XML/HTML contains no attribute whose *name* starts with "on".
 * Namespace-qualified spellings are conservatively refused too; SVG event
 * handler attributes are not a safe target for unreviewed opaque assets.
 *
 * @param {string} elementName
 * @param {string|undefined} attributeName
 * @returns {boolean}
 */
function smilTargetsExecutableAttribute(elementName,attributeName) {
  if(!SMIL_ANIMATION_ELEMENTS.has(elementName.toLowerCase())||typeof attributeName!=='string')return false;
  const target=attributeName.trim().toLowerCase().split(':').at(-1);
  return !!target&&(/^on[a-z]/u.test(target)||target==='srcdoc');
}


/**
 * XHTML uses XML syntax and permits namespace-qualified HTML script elements.
 * An HTML parser cannot prove the absence of such elements. Check XML
 * well-formedness, namespace identity, CDATA and attribute values directly.
 * The audit remains conservative about source-bearing XML instructions.
 * @param {string} xml
 * @returns {string|null}
 */
function findInlineXhtmlSource(xml) {
  const parser=new SaxesParser({xmlns:true});
  /** @type {string|null} */
  let issue=null;
  let scriptDepth=0;
  let styleDepth=0;
  let stylesheet='';
  parser.on('xmldecl',declaration=>{
    if(declaration.encoding&&!/^utf-?8$/iu.test(declaration.encoding))
      issue??='non-UTF-8 XML declaration';
  });
  parser.on('doctype',declaration=>{
    if(declaration.trim().toLowerCase()!=='html')issue??='DTD declaration';
  });
  parser.on('processinginstruction',instruction=>{
    if(instruction.target.toLowerCase()==='xml-stylesheet')
      issue??='XML stylesheet processing instruction';
  });
  parser.on('opentag',tag=>{
    const isHtml=tag.uri===xhtmlNamespace;
    const isExecutable=isHtml||tag.uri===svgNamespace;
    const name=tag.local.toLowerCase();
    if(scriptDepth)issue??='nested markup inside script';
    if(styleDepth)issue??='nested markup inside style element';
    if(isExecutable&&name==='script')scriptDepth++;
    if(isExecutable&&name==='style'){styleDepth++;stylesheet='';}
    if(!isExecutable)return;
    const attributes=Object.values(tag.attributes);
    if(tag.uri===svgNamespace&&smilTargetsExecutableAttribute(name,
      attributes.find(attribute=>attribute.local.toLowerCase()==='attributename')?.value)) {
      issue??='SVG animation targets executable attribute';
    }
    /** @param {string} key @returns {string|undefined} */
    const attr=key=>attributes.find(item=>item.uri===''&&item.local.toLowerCase()===key)?.value;
    for(const attribute of attributes) {
      const key=attribute.local.toLowerCase();
      if(key==='srcdoc')issue??='embedded iframe source';
      if(/^on[a-z]/u.test(key))issue??='inline event handler';
      const animationValues=key==='values'&&
        ['animate','animatemotion','animatetransform'].includes(name);
      if(animationValues?
          attribute.value.split(';').some(isEmbeddedExecutableUrl):
          ['src','href','action','formaction','xlink:href','data','poster',
            'from','to','by','values'].includes(key)&&
            isEmbeddedExecutableUrl(attribute.value))issue??='embedded executable URL';
      if(name==='script'&&['src','href'].includes(key)&&isDataUrl(attribute.value))
        issue??='embedded script data URL';
    }
    if(!isHtml)return;
    if(name==='link'&&/(?:^|\s)stylesheet(?:\s|$)/iu.test(attr('rel')??'')&&
        attr('href')&&isDataUrl(/** @type {string} */(attr('href'))))
      issue??='embedded stylesheet data URL';
    if(name==='meta'&&attr('http-equiv')?.trim().toLowerCase()==='refresh'&&
        attr('content')&&isEmbeddedRefreshUrl(/** @type {string} */(attr('content'))))
      issue??='embedded executable refresh URL';
  });
  /** @param {string} value */
  function observeText(value) {
    if(scriptDepth&&/\S/u.test(value))issue??='inline script source';
    if(styleDepth)stylesheet+=value;
  }
  parser.on('text',observeText);
  parser.on('cdata',observeText);
  parser.on('closetag',tag=>{
    const name=tag.local.toLowerCase();
    const executable=tag.uri===xhtmlNamespace||tag.uri===svgNamespace;
    if(executable&&name==='script')scriptDepth--;
    if(executable&&name==='style') {
      if(hasCssSourceMapDirective(stylesheet))issue??='inline CSS source-map directive';
      if(hasCssDataImport(stylesheet))issue??='embedded stylesheet data import';
      styleDepth--;
      stylesheet='';
    }
  });
  parser.on('error',error=>{throw new TypeError('Malformed XHTML XML: '+error.message);});
  parser.write(xml).close();
  return issue;
}

const {TextDecoder}=require('node:util');
const {hasCssSourceMapDirective}=require('./css-source-maps');
const {hasCssDataImport}=require('./css-data-imports');

const utf8=new TextDecoder('utf-8',{fatal:true});

/**
 * @typedef {{
 *   tagName?:string,
 *   namespaceURI?:string,
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
    // XML media types can contain HTML-namespace script elements. These
    // explicit browser-document types must not ship as opaque data URLs.
    /^data:(?:text\/html|(?:text|application)\/(?:javascript|ecmascript|xml)|application\/xhtml\+xml|image\/svg\+xml)(?:[;,]|$)/u.test(value);
}

/**
 * Browser URL schemes ignore embedded ASCII control/space characters in the
 * recognized URL contexts. Test the normalized scheme before accepting
 * data URLs in script and stylesheet links.
 * @param {string} raw
 * @returns {boolean}
 */
function isDataUrl(raw) {
  return raw.replace(/[\x00-\x20]/gu,'').toLowerCase().startsWith('data:');
}

/**
 * @param {unknown} value
 * @returns {value is Record<string,unknown>}
 */
function isImportMapRecord(value) {
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

/**
 * Import maps may name web modules, but embedded data: JavaScript would
 * disclose source inside an otherwise opaque HTML file. Require safe web
 * URL spellings, leaving unproven protocols outside this admission contract.
 * @param {string} address
 * @returns {boolean}
 */
function isWebModuleAddress(address) {
  // Raw executable syntax in URL path/query/fragment can publish
  // untransformed JavaScript inside this otherwise admitted JSON asset.
  if(!/^(?:\.\.?\/|\/|https?:\/\/)/iu.test(address)||
     /[\x00-\x20\x7f]/u.test(address)||
     /[()\[\]{};`\\<>]/u.test(address))return false;
  try {
    const url=new URL(address,'https://obfs.invalid/');
    return url.protocol==='http:'||url.protocol==='https:';
  }catch(error){return false;}
}

/** @param {unknown} value @returns {boolean} */
function isImportMapSpecifiers(value) {
  return isImportMapRecord(value)&&Object.entries(value).every(([name,address])=>
    /^[A-Za-z0-9@._~\/$%+#?:-]+$/u.test(name)&&
    !/^(?:data|javascript|blob):/iu.test(name)&&
    (address===null||typeof address==='string'&&isWebModuleAddress(address)));
}

/**
 * Admit only real SHA-256/384/512 digest tokens, never arbitrary source
 * strings in an integrity metadata value.
 * @param {string} metadata
 * @returns {boolean}
 */
function isImportMapIntegrityMetadata(metadata) {
  return metadata.trim().split(/\s+/u).every(token=>{
    const match=/^(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+={0,2})$/iu.exec(token);
    if(!match)return false;
    const encoded=match[2].replace(/-/gu,'+').replace(/_/gu,'/').replace(/=+$/u,'');
    const binary=Buffer.from(encoded,'base64');
    const size=match[1].toLowerCase()==='sha256'?32:
      match[1].toLowerCase()==='sha384'?48:64;
    return binary.length===size&&
      binary.toString('base64').replace(/=+$/u,'')===encoded;
  });
}

/**
 * Import-map JSON is configuration rather than executable inline script.
 * Only a safe, explicit URL-only subset can pass the source audit; all
 * other inline scripts retain their original fail-closed behavior.
 * XHTML import-map syntax remains unsupported by this HTML-only parser.
 * @param {HtmlNode} node
 * @returns {{integrity?:Record<string,string>}|null}
 */
function safeHtmlImportMap(node) {
  if(node.tagName!=='script')return null;
  const attrs=node.attrs??[];
  const type=attrs.find(attr=>attr.name==='type')?.value.trim().toLowerCase();
  if(type!=='importmap'||attrs.some(attr=>attr.name==='src'))return null;
  const contents=(node.childNodes??[]).map(child=>child.value??'').join('');
  /** @type {unknown} */
  let parsed;
  try{parsed=JSON.parse(contents);}
  catch(error){return null;}
  if(!isImportMapRecord(parsed)||Object.keys(parsed).some(key=>
    !['imports','scopes','integrity'].includes(key)))return null;
  if(parsed.imports!==undefined&&!isImportMapSpecifiers(parsed.imports))return null;
  if(parsed.scopes!==undefined&&
      (!isImportMapRecord(parsed.scopes)||Object.entries(parsed.scopes)
        .some(([scope,imports])=>!isWebModuleAddress(scope)||
          !isImportMapSpecifiers(imports))))return null;
  if(parsed.integrity!==undefined&&
      (!isImportMapRecord(parsed.integrity)||Object.entries(parsed.integrity)
        .some(([url,metadata])=>!isWebModuleAddress(url)||
          typeof metadata!=='string'||!isImportMapIntegrityMetadata(metadata))))return null;
  return {integrity:/** @type {Record<string,string>|undefined} */(parsed.integrity)};
}

/**
 * Detect a refresh redirect that embeds executable markup or a script URL.
 * The HTML parser has already decoded character references in the content
 * attribute. Ordinary refresh targets remain accepted.
 * @param {string} content
 * @returns {boolean}
 */
function isEmbeddedRefreshUrl(content) {
  const match=/(?:^|;)\s*url\s*=\s*(.*)$/iu.exec(content);
  if(!match)return false;
  let target=match[1].trim();
  if(target.startsWith('"')||target.startsWith("'"))target=target.slice(1);
  return isEmbeddedExecutableUrl(target);
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
    if(node.namespaceURI===svgNamespace&&SMIL_ANIMATION_ELEMENTS.has((node.tagName??'').toLowerCase())) {
      if(smilTargetsExecutableAttribute(node.tagName??'',
        attrs.find(attr=>attr.name.toLowerCase()==='attributename')?.value)) {
        issue='SVG animation targets executable attribute';return;
      }
      // HTML parsing does not use the separate SVG/XML scanners. Animation
      // values may synthesize javascript: URLs despite no original href.
      for(const attr of attrs) {
        const key=attr.name.toLowerCase();
        if(['from','to','by','values'].includes(key)&&
          (key==='values'?attr.value.split(';'):[attr.value]).some(isEmbeddedExecutableUrl)) {
          issue='SVG animation embeds executable URL';return;
        }
      }
    }
    for(const {name,value} of attrs) {
      const lower=name.toLowerCase();
      if(/^on[a-z]/u.test(lower)) {issue='inline event handler';return;}
      if(lower==='srcdoc') {issue='embedded iframe source';return;}
      if(['src','href','action','formaction','xlink:href','data','poster'].includes(lower) &&
          isEmbeddedExecutableUrl(value)) {issue='embedded executable URL';return;}
      if(node.tagName==='script' && lower==='src' &&
          isDataUrl(value)) {issue='embedded script data URL';return;}
    }
    // A data: stylesheet is itself an opaque CSS asset inside HTML. Without
    // recursively auditing those bytes, it can carry a sourceMappingURL map
    // and untransformed sourcesContent past the ordinary .css preflight.
    if(node.tagName==='link') {
      const rel=attrs.find(attr=>attr.name==='rel')?.value;
      const href=attrs.find(attr=>attr.name==='href')?.value;
      if(rel && /(?:^|\s)stylesheet(?:\s|$)/iu.test(rel) &&
          href && isDataUrl(href)) {
        issue='embedded stylesheet data URL';
        return;
      }
    }
    if(node.tagName==='style') {
      const css=(node.childNodes??[]).map(child=>child.value??'').join('');
      if(hasCssSourceMapDirective(css)) {
        issue='inline CSS source-map directive';
        return;
      }
      if(hasCssDataImport(css)) {
        issue='embedded stylesheet data import';
        return;
      }
    }
    if(node.tagName==='script' &&
        node.childNodes?.some(child=>typeof child.value==='string' && /\S/u.test(child.value)) &&
        safeHtmlImportMap(node)===null) {
      issue='inline script source';
      return;
    }
    if(node.tagName==='meta') {
      const pragma=attrs.find(attr=>attr.name==='http-equiv')?.value.trim().toLowerCase();
      const content=attrs.find(attr=>attr.name==='content')?.value;
      if(pragma==='refresh' && content && isEmbeddedRefreshUrl(content)) {
        issue='embedded executable refresh URL';
        return;
      }
    }
    for(const child of node.childNodes??[])visit(child);
    if(node.content)visit(node.content);
  }
  visit(root);
  return issue;
}

/**
 * Decode browser-executable markup only after verifying its byte encoding.
 * Reject malformed UTF-8 and NUL code units, which can conceal UTF-16 markup
 * from a UTF-8-only parser before the browser applies a different charset.
 * @param {string} path
 * @param {string|Buffer} code
 * @param {'HTML'|'SVG'} kind
 * @returns {string}
 */
function decodeMarkup(path,code,kind) {
  /** @type {string} */
  let markup;
  try {
    markup=Buffer.isBuffer(code)?utf8.decode(code):code;
  } catch (error) {
    throw new TypeError(kind+' asset is not valid UTF-8: '+path);
  }
  if(markup.includes(String.fromCharCode(0)))throw new TypeError(kind+' asset contains NUL code units: '+path);
  return markup;
}

/**
 * XML declarations can occur in opaque assets served with executable XML or
 * HTML media types. This is a deliberately narrow content signature: XML
 * declarations are optional, and deployment headers remain outside the proof.
 * @param {string|Buffer} code
 * @returns {boolean}
 */
function hasXmlDeclaration(code) {
  const prefix=Buffer.isBuffer(code)?code.subarray(0,24).toString('utf8'):code.slice(0,24);
  return /^\uFEFF?<\?xml(?:[ \t\r\n]|\?>)/u.test(prefix);
}

/**
 * Audit HTML and XHTML assets before their bytes are copied to an output directory
 * or offered by SCO. A detected inline execution path is rejected rather
 * than silently stripped, which could change program behavior.
 * @param {string} path
 * @param {string|Buffer} code
 * @returns {void}
 */
function assertNoInlineHtmlSource(path,code) {
  // The dedicated SVG preflight owns SVG parsing and its diagnostic contract.
  if(/\.svg$/iu.test(path))return;
  const namedXml=/\.(?:xhtml|xht|xml)$/iu.test(path);
  const namedHtml=/\.html?$/iu.test(path);
  const signedXml=hasXmlDeclaration(code);
  const scanXml=namedXml||signedXml&&!namedHtml;
  const scanHtml=namedHtml||signedXml&&!namedXml;
  if(!scanXml&&!scanHtml)return;
  const html=decodeMarkup(path,code,'HTML');
  const issue=(scanXml?findInlineXhtmlSource(html):null)||
    (scanHtml?findInlineHtmlSource(html):null);
  if(issue)throw new TypeError('HTML asset contains '+issue+': '+path);
}

/**
 * Declared HTML, XHTML and XML documents can pin fetched JavaScript response bytes using SRI. Changing
 * the JS bytes while leaving the HTML unchanged makes that script fail its
 * browser integrity check, even when all JS expression results are identical.
 *
 * The HTML asset paths and JavaScript inventory are the reviewed publication
 * group. An exact portable URL target path, a supplied SCO route prefix,
 * or the original-source SRI digest on a root-relative/absolute script URL,
 * including a relative address resolved through an explicit absolute HTML base,
 * can conservatively pin source bytes. Deployment origins and CDN mounts
 * cannot always be inferred at compile time, so an exact digest match may
 * veto a transform even when the URL points to an unrelated identical file.
 *
 * @typedef {{path:string,sourceType:string,code:string|Buffer}} IntegrityFile
 * @param {IntegrityFile[]} files
 * @param {string} [routePrefix] Exact SCO mount prefix when available.
 * @returns {boolean}
 */
function hasPinnedLocalJavaScriptIntegrity(files,routePrefix='') {
  // The SCO HTTP route prefix is a public URL namespace, not part of the
  // file inventory. Resolve both declared paths and mounted route paths.
  const mountedPrefix=routePrefix.startsWith('/')?routePrefix.slice(1):routePrefix;
  const javascriptPaths=new Set(files.filter(file=>file.sourceType!=='asset')
    .map(file=>file.path));
  if(!javascriptPaths.size)return false;
  // URLs may be mounted, rewritten or CDN-aliased independently of the
  // compiler's declared paths. A matching SRI digest is an exact commitment
  // to the original JavaScript bytes even when URL provenance is unknown.
  const originalDigests=new Set();
  for(const file of files) {
    if(file.sourceType==='asset')continue;
    for(const algorithm of ['sha256','sha384','sha512']) {
      originalDigests.add(algorithm+'-'+createHash(algorithm)
        .update(file.code).digest('base64').replace(/=+$/u,''));
    }
  }
  /** @param {string} metadata @returns {boolean} */
  function matchesOriginalDigest(metadata) {
    // SRI metadata contains whitespace-separated hashes; syntax reserves
    // an optional ?options suffix. Exact digest comparison avoids relying
    // on a deployment path that the offline compiler cannot observe.
    return metadata.trim().split(/\s+/u).some(token=>{
      const expression=token.split('?',1)[0];
      const separator=expression.indexOf('-');
      if(separator<0)return false;
      // Algorithm labels are ASCII case-insensitive. The digest alphabet
      // can use base64url characters and optional '=' padding. Preserve
      // base64 letter case while mapping its two URL-safe spellings.
      const digest=expression.slice(separator+1);
      if(!/^[A-Za-z0-9+/_-]+={0,2}$/u.test(digest))return false;
      const canonical=digest.replace(/-/gu,'+').replace(/_/gu,'/')
        .replace(/=+$/u,'');
      return originalDigests.has(expression.slice(0,separator).toLowerCase()+
        '-'+canonical);
    });
  }
  /**
   * A rooted or absolute web URL may use a deployment prefix not declared in
   * this offline source tree. Ordinary relative references retain the
   * compiler's precise path proof when no explicit root/absolute HTML base
   * is active. An unrelated ./other.js with intentionally reused metadata
   * must not suppress positive rewrite yield in that ordinary relative case.
   * @param {string} address
   * @returns {boolean}
   */
  function hasUnknownMount(address) {
    const value=address.trimStart();
    return value.startsWith('/')||/^https?:/iu.test(value);
  }
  // The output tree already treats NFC- and case-equivalent paths as one
  // portable filename identity. An SRI URL may resolve to the same file on a
  // case-insensitive/normalizing host even when its raw spelling differs.
  /** @type {Set<string>} */
  const distributedKeys=new Set();
  for(const filename of javascriptPaths) {
    for(const path of mountedPrefix?[filename,mountedPrefix+filename]:[filename]) {
      for(const key of portableKeys(path))distributedKeys.add(key);
    }
  }
  /** @param {string} candidate @returns {boolean} */
  function matchesDistributedScript(candidate) {
    // A Windows-style filesystem-backed route may discard trailing ASCII
    // dots or spaces from each segment after decoding the request pathname.
    // Test both spellings, since other hosts may preserve them exactly.
    const win32Candidate=candidate.split('/')
      .map(segment=>segment.replace(/[. ]+$/u,'')).join('/');
    return [candidate,win32Candidate].some(path=>
      portableKeys(path).some(key=>distributedKeys.has(key)));
  }

  /**
   * Encode every declared document-path segment as a URL path component.
   * A source filename containing # or % is not a URL fragment or escape;
   * the browser requests those bytes with URL percent encoding.
   * @param {string} filename
   * @returns {URL}
   */
  function documentUrl(filename) {
    return new URL('/'+filename.split('/').map(encodeURIComponent).join('/'),
      'https://obfs.invalid/');
  }

  /**
   * The URL parser applies ./ and ../ resolution and strips query/fragment.
   * Decode path escapes once, after URL resolution, against the declared
   * normalized file inventory. Unknown/unsupported targets are ignored.
   * @param {string} href
   * @param {URL} base
   * @returns {string|null}
   */
  function targetPath(href,base) {
    try {
      const url=new URL(href,base);
      if(url.protocol!=='http:'&&url.protocol!=='https:')return null;
      // SCO may preserve percent-encoded mount path bytes. Recognize an
      // exact raw distributed pathname before checking decoded aliases.
      const encodedPath=url.pathname.slice(1);
      if(matchesDistributedScript(encodedPath))return encodedPath;
      const pathname=decodeURIComponent(url.pathname);
      if(!pathname.startsWith('/')||pathname.includes('\\'))return null;
      return pathname.slice(1);
    }catch(error){return null;}
  }


  /**
   * XML-namespaced elements may be written as <h:script>, which HTML parsing
   * reads as a different tag. Resolve recognized script/link SRI with an XML
   * namespace parser. XML base affects only a descendant pinned element or
   * an actual HTML base; URL candidates include all declared base tags.
   * @param {string} xml
   * @param {string} filename
   * @returns {boolean}
   */
  function pinnedXhtml(xml,filename) {
    const parser=new SaxesParser({xmlns:true});
    /** @type {string[]} */
    const pinnedUrls=[];
    /** @type {string[]} */
    const declaredBases=[];
    /** @type {boolean[]} */
    const xmlBaseStack=[];
    let activeXmlBase=0;
    let ambiguousBase=false;
    let xmlBaseAffectsPin=false;
    let pinnedDigest=false;
    let relativeDigest=false;
    parser.on('opentag',tag=>{
      const attributes=Object.values(tag.attributes);
      const localXmlBase=attributes.some(attr=>
        attr.uri==='http://www.w3.org/XML/1998/namespace'&&attr.local==='base');
      xmlBaseStack.push(localXmlBase);
      if(localXmlBase)activeXmlBase++;
      if(tag.uri!==xhtmlNamespace)return;
      const name=tag.local.toLowerCase();
      /** @param {string} key @returns {string|undefined} */
      const attr=key=>attributes.find(item=>item.uri===''&&item.local.toLowerCase()===key)?.value;
      if(name==='base'&&attr('href')!==undefined) {
        declaredBases.push(/** @type {string} */(attr('href')));
        if(activeXmlBase)ambiguousBase=true;
      }
      const integrity=attr('integrity');
      if(!integrity?.trim())return;
      const rel=(attr('rel')??'').toLowerCase().split(/\s+/u);
      const linked=name==='link'&&(rel.includes('modulepreload')||
        rel.includes('preload')&&(attr('as')??'').toLowerCase()==='script');
      const address=name==='script'?attr('src'):linked?attr('href'):null;
      if(address) {
        pinnedUrls.push(address);
        if(matchesOriginalDigest(integrity)){
          if(hasUnknownMount(address))pinnedDigest=true;
          else relativeDigest=true;
        }
        if(activeXmlBase)xmlBaseAffectsPin=true;
      }
    });
    parser.on('closetag',()=>{
      if(xmlBaseStack.pop())activeXmlBase--;
    });
    parser.on('error',error=>{throw new TypeError('Malformed XHTML XML: '+error.message);});
    parser.write(xml).close();
    if(pinnedDigest||relativeDigest&&declaredBases.some(hasUnknownMount))
      return true;
    if(!pinnedUrls.length)return false;
    // XML base changes URI resolution only for its own element/subtree.
    // A base tag with that feature needs a separate XML URI proof.
    if(xmlBaseAffectsPin||ambiguousBase)return true;
    const documentBase=documentUrl(filename);
    /** @type {URL[]} */
    const bases=[documentBase];
    // All candidate <base href> elements, including those inside an inert
    // template, are considered. A later live base must never be hidden by an
    // earlier inert one that the XML parser cannot classify without a DOM.
    for(const href of declaredBases) {
      try {bases.push(new URL(href,documentBase));}
      catch(error){/* An invalid base cannot add a resolvable local URL. */}
    }
    for(const address of pinnedUrls) {
      for(const candidateBase of bases) {
        const target=targetPath(address,candidateBase);
        if(target!==null&&matchesDistributedScript(target))
          return true;
      }
    }
    return false;
  }

  for(const file of files) {
    if(file.sourceType!=='asset'||/\.svg$/iu.test(file.path))continue;
    const namedXml=/\.(?:xhtml|xht|xml)$/iu.test(file.path);
    const namedHtml=/\.html?$/iu.test(file.path);
    const signedXml=hasXmlDeclaration(file.code);
    const scanXml=namedXml||signedXml&&!namedHtml;
    const scanHtml=namedHtml||signedXml&&!namedXml;
    if(!scanXml&&!scanHtml)continue;
    const html=decodeMarkup(file.path,file.code,'HTML');
    if(scanXml&&pinnedXhtml(html,file.path))return true;
    if(!scanHtml)continue;
    const root=/** @type {HtmlNode} */(/** @type {unknown} */(parse(html)));
    /** @type {string|null} */
    let baseHref=null;
    /** @param {HtmlNode} node */
    function findBase(node){
      if(baseHref!==null)return;
      // A foreign SVG/MathML <base> is not an HTMLBaseElement and
      // cannot establish the document's first active HTML base URL.
      if(node.tagName==='base'&&node.namespaceURI===xhtmlNamespace){
        const href=node.attrs?.find(attr=>attr.name==='href')?.value;
        if(href!==undefined){baseHref=href;return;}
      }
      for(const child of node.childNodes??[])findBase(child);
      // Template content belongs to a DocumentFragment, never to the
      // currently executing document's base URL tree.
    }
    findBase(root);
    const documentBase=documentUrl(file.path);
    /** @type {URL} */
    let base=documentBase;
    if(baseHref!==null){
      try{base=new URL(baseHref,documentBase);}
      catch(error){base=documentBase;}
    }
    let observed=false;
    /** @param {HtmlNode} node */
    function visit(node){
      if(observed)return;
      const map=safeHtmlImportMap(node);
      if(map?.integrity){
        for(const [address,metadata] of Object.entries(map.integrity)){
          if((hasUnknownMount(address)||
              baseHref!==null&&hasUnknownMount(baseHref))&&
              matchesOriginalDigest(metadata)){
            observed=true;return;
          }
          for(const candidateBase of [documentBase,base]){
            const target=targetPath(address,candidateBase);
            if(target!==null&&matchesDistributedScript(target)){
              observed=true;return;
            }
          }
        }
      }
      const attrs=node.attrs??[];
      const integrity=attrs.find(attr=>attr.name==='integrity')?.value;
      if(integrity?.trim()){
        const src=attrs.find(attr=>attr.name==='src')?.value;
        const href=attrs.find(attr=>attr.name==='href')?.value;
        const rel=attrs.find(attr=>attr.name==='rel')?.value??'';
        const as=attrs.find(attr=>attr.name==='as')?.value??'';
        const relation=rel.toLowerCase().split(/\s+/u);
        const linked=node.tagName==='link' &&
          (relation.includes('modulepreload')||
           relation.includes('preload') && as.toLowerCase()==='script');
        const address=node.tagName==='script'?src:linked?href:null;
        if(address){
          if((hasUnknownMount(address)||
              baseHref!==null&&hasUnknownMount(baseHref)) &&
              matchesOriginalDigest(integrity)){
            observed=true;return;
          }
          // The parser may already have started fetching a script before a
          // later <base> takes effect. Also consider the document fallback
          // rather than assuming a static base was active at fetch time.
          for(const candidateBase of [documentBase,base]){
            const target=targetPath(address,candidateBase);
            if(target!==null&&matchesDistributedScript(target)){
              observed=true;return;
            }
          }
        }
      }
      for(const child of node.childNodes??[])visit(child);
      if(node.content)visit(node.content);
    }
    visit(root);
    if(observed)return true;
  }
  return false;
}

module.exports={findInlineHtmlSource,isEmbeddedExecutableUrl,isEmbeddedRefreshUrl,assertNoInlineHtmlSource,decodeMarkup,hasPinnedLocalJavaScriptIntegrity,smilTargetsExecutableAttribute};
