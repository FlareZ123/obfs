'use strict';

const {createHash}=require('node:crypto');
const {MIMEType,TextDecoder}=require('node:util');
const {safePath}=require('./core');
const {createPathInventory,registerFilePath}=require('./portable-paths');
const {assertNoSourceMapDisclosure}=require('./source-maps');

/** @typedef {'module'|'script'|'commonjs'|'asset'} SourceType */
/** @typedef {{path:string,sourceType:SourceType,code:string|Buffer}} PublishedFile */
/** @typedef {{path:string,sha256:string,contentType:string}} ReviewedResponse */
/** @typedef {{path:string,sourceType:SourceType,bytes:Buffer,sha256:string,contentType:string,mediaType:MIMEType}} Snapshot */

/**
 * Recognized JavaScript MIME type essences from the WHATWG MIME Sniffing Standard.
 * The standard retains these historical aliases for browser compatibility.
 */
const JAVASCRIPT_MIME=new Set([
  'application/ecmascript','application/javascript','application/x-ecmascript',
  'application/x-javascript','text/ecmascript','text/javascript',
  'text/javascript1.0','text/javascript1.1','text/javascript1.2',
  'text/javascript1.3','text/javascript1.4','text/javascript1.5',
  'text/jscript','text/livescript','text/x-ecmascript','text/x-javascript'
]);

/** Strict scanner for executable UTF-8 response bytes. */
const UTF8_DECODER=new TextDecoder('utf-8',{fatal:true});

/** Recognized opaque MIME types under a required nosniff response. */
const OPAQUE_MIME=new Set([
  'application/octet-stream','application/json','text/plain',
  'image/png','image/jpeg','image/gif','image/webp',
  'font/woff','font/woff2'
]);

/**
 * Select the existing source-admission parser from the *declared* HTTP MIME.
 * The suffix is synthetic only for validation; URLs and byte comparisons use
 * the original declared path unchanged.
 *
 * @param {Snapshot} file
 * @returns {void}
 */
function auditByDeliveredMime(file) {
  const essence=file.mediaType.essence;
  const charset=file.mediaType.params.get('charset')?.toLowerCase();
  const scriptOrText=JAVASCRIPT_MIME.has(essence)||
    essence==='text/html'||essence==='text/css';
  const xml=essence==='application/xml'||essence==='text/xml'||
    essence==='application/xhtml+xml'||essence==='image/svg+xml';
  // Never silently replace malformed source bytes before checking the code
  // that the browser or Node will consume. Byte-exact approval alone does not
  // establish the parser's UTF-8 interpretation of those bytes.
  if(scriptOrText||xml) {
    try { UTF8_DECODER.decode(file.bytes); }
    catch {
      throw new TypeError('Executable response is not valid UTF-8: '+file.path);
    }
  }
  // Classic-script decoding can fall back to the embedding document's
  // encoding; HTML/CSS have their own sniffing and @charset mechanisms.
  // Require a real UTF-8 header before trusting our UTF-8 source scanners.
  if(scriptOrText&&charset!=='utf-8') {
    throw new TypeError('Executable text response requires explicit UTF-8 charset: '+file.path);
  }
  // The XML grammar can self-declare UTF-8 without a HTTP charset, but a
  // conflicting HTTP charset invalidates a scanner based on UTF-8 bytes.
  if(xml&&charset!==null&&charset!==undefined&&charset!=='utf-8') {
    throw new TypeError('Executable XML response declares non-UTF-8 charset: '+file.path);
  }
  if(file.sourceType!=='asset') {
    if(!JAVASCRIPT_MIME.has(essence)) {
      throw new TypeError('Published JavaScript requires JavaScript MIME: '+file.path);
    }
    assertNoSourceMapDisclosure({
      path:file.path,sourceType:file.sourceType,code:file.bytes.toString('utf8')
    });
    return;
  }
  if(JAVASCRIPT_MIME.has(essence)) {
    throw new TypeError('Opaque asset is delivered as executable JavaScript: '+file.path);
  }
  if(essence==='application/pdf') {
    throw new TypeError('Executable-capable PDF MIME requires independent review: '+file.path);
  }
  let extension;
  if(essence==='text/html') extension='.html';
  else if(essence==='image/svg+xml') extension='.svg';
  else if(essence==='application/xhtml+xml'||
      essence==='application/xml'||essence==='text/xml') extension='.xml';
  else if(essence==='text/css') extension='.css';
  else if(OPAQUE_MIME.has(essence)) extension='';
  else throw new TypeError('Unsupported public asset MIME: '+essence+' for '+file.path);

  // Preserve original-extension source-map/archive refusals before selecting
  // a stricter declared MIME parser for an otherwise opaque filename.
  assertNoSourceMapDisclosure({
    path:file.path,sourceType:'asset',code:file.bytes
  });
  if(extension) {
    assertNoSourceMapDisclosure({
      path:file.path+extension,sourceType:'asset',code:file.bytes
    });
  }
}

/**
 * Check a proposed distribution against an independently approved exact-byte
 * MIME/route manifest and the HTTP response a deployment presently serves.
 *
 * This is a post-build staging audit: the hosting origin and manifest must be
 * controlled by the publisher. A later proxy/routing change, a hostile server,
 * browser extensions, and dynamically loaded resources are outside its proof.
 *
 * Delivered bodies are compared after HTTP content decoding, so ordinary gzip
 * transfer encoding can preserve the approved resource digest.
 *
 * @param {string} origin HTTP(S) origin with a root pathname
 * @param {PublishedFile[]} files All published output files
 * @param {ReviewedResponse[]} approved Separately reviewed response contract
 * @returns {Promise<{verified:number,sourceFiles:number,assets:number}>}
 */
async function verifyPublishedDeployment(origin,files,approved) {
  if(typeof origin!=='string')throw new TypeError('Deployment origin must be a URL string');
  const base=new URL(origin);
  if(!['http:','https:'].includes(base.protocol)||base.pathname!=='/'||
      base.search||base.hash||base.username||base.password) {
    throw new TypeError('Deployment origin must be a bare HTTP(S) root URL');
  }
  if(base.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(base.hostname)) {
    throw new TypeError('Deployment verification requires HTTPS or loopback HTTP');
  }
  if(!Array.isArray(files)||!Array.isArray(approved)) {
    throw new TypeError('Deployment files and approved MIME records must be arrays');
  }

  /** @type {Map<string,{path:string,sha256:string,contentType:string,mediaType:MIMEType}>} */
  const expected=new Map();
  const manifestLength=approved.length;
  for(let i=0;i<manifestLength;i++){
    const entry=approved[i];
    if(!entry||typeof entry!=='object')throw new TypeError('Invalid response contract entry');
    const path=safePath(entry.path);
    const sha256=entry.sha256;
    const contentType=entry.contentType;
    if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/u.test(sha256)||
        typeof contentType!=='string') {
      throw new TypeError('Reviewed response requires SHA-256 and contentType: '+path);
    }
    const mediaType=new MIMEType(contentType);
    const identity=path.toLowerCase();
    if(expected.has(identity))throw new TypeError('Duplicate reviewed response: '+path);
    expected.set(identity,{path,sha256,contentType:String(mediaType),mediaType});
  }

  const paths=createPathInventory();
  /** @type {Snapshot[]} */
  const snapshot=[];
  const fileLength=files.length;
  for(let i=0;i<fileLength;i++){
    const file=files[i];
    if(!file||typeof file!=='object')throw new TypeError('Invalid published file');
    const path=safePath(file.path);
    registerFilePath(paths,path);
    const sourceType=file.sourceType;
    if(!['module','script','commonjs','asset'].includes(sourceType)) {
      throw new TypeError('Invalid published sourceType: '+path);
    }
    const original=file.code;
    // Buffer.from(string) silently replaces raw unpaired UTF-16 surrogates.
    // Reject that change of source identity before hashing/publishing bytes.
    if(typeof original==='string'&&/[\uD800-\uDFFF]/u.test(original)) {
      throw new TypeError('Published text contains a raw unpaired surrogate: '+path);
    }
    if(typeof original!=='string'&&!Buffer.isBuffer(original)) {
      throw new TypeError('Published file must have byte or string content: '+path);
    }
    const bytes=Buffer.from(original);
    const entry=expected.get(path.toLowerCase());
    if(!entry||entry.path!==path) {
      throw new TypeError('Missing exact reviewed response contract: '+path);
    }
    const digest=createHash('sha256').update(bytes).digest('hex');
    if(digest!==entry.sha256) {
      throw new TypeError('Local publication differs from reviewed digest: '+path);
    }
    snapshot.push({
      path,sourceType:/** @type {SourceType} */(sourceType),bytes,
      sha256:entry.sha256,contentType:entry.contentType,mediaType:entry.mediaType
    });
  }
  if(snapshot.length!==expected.size) {
    throw new TypeError('Reviewed deployment has missing published file paths');
  }

  // Complete input checks before a network request or a success report.
  for(const file of snapshot) auditByDeliveredMime(file);

  let sourceFiles=0,assets=0;
  for(const file of snapshot) {
    const encoded=file.path.split('/').map(encodeURIComponent).join('/');
    const route=new URL(encoded,base);
    const response=await fetch(route,{
      redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    if(response.status!==200) {
      throw new TypeError('Deployment route did not return HTTP 200: '+file.path);
    }
    // A staged generic fetch cannot prove a browser's script/navigation
    // representation when the host advertises header-dependent variants.
    // Compression variants are safe only because we hash decoded content.
    const vary=response.headers.get('vary');
    if(vary&&vary.split(',').some(token=>
      token.trim().toLowerCase()!=='accept-encoding')) {
      throw new TypeError('Deployment response varies by request context: '+file.path);
    }
    const delivered=response.headers.get('content-type');
    if(!delivered||String(new MIMEType(delivered))!==file.contentType) {
      throw new TypeError('Deployment Content-Type differs from review: '+file.path);
    }
    if(response.headers.get('x-content-type-options')?.trim().toLowerCase()!=='nosniff') {
      throw new TypeError('Deployment route lacks nosniff: '+file.path);
    }
    const body=response.body;
    if(!body)throw new TypeError('Deployment response has no body: '+file.path);
    const reader=body.getReader();
    const checksum=createHash('sha256');
    let length=0;
    while(true) {
      const part=await reader.read();
      if(part.done)break;
      length+=part.value.byteLength;
      if(length>file.bytes.length) {
        await reader.cancel();
        throw new TypeError('Deployment resource exceeds approved length: '+file.path);
      }
      checksum.update(part.value);
    }
    if(length!==file.bytes.length||checksum.digest('hex')!==file.sha256) {
      throw new TypeError('Deployment bytes differ from reviewed publication: '+file.path);
    }
    if(file.sourceType==='asset')assets++;
    else sourceFiles++;
  }
  return {verified:snapshot.length,sourceFiles,assets};
}

module.exports={verifyPublishedDeployment};
