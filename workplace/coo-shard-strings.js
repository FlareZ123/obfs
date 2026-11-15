'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource} = require('../src/ast');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */
/** @typedef {{seed:string,names:string[]}} ShardOptions */
/** @typedef {{files:ModuleFile[],sharded:number,codeUnits:number,declined:number}} ShardResult */

/**
 * This is an explicitly opt-in, experimental COO multi-file transform.
 * Every emitted share is public, so this is circuit/layout diversification,
 * not key secrecy. The caller is responsible for a closed ESM file set,
 * generated-name collisions, and external source observers.
 *
 * @param {string} filename
 * @returns {string}
 */
function safeModulePath(filename) {
  if(typeof filename!=='string' || !filename.endsWith('.mjs') ||
      path.posix.isAbsolute(filename) || filename.includes('\\') ||
      /[<>:"|?*\x00-\x1f]/u.test(filename) ||
      filename.split('/').some(segment=>!segment || segment==='.' || segment==='..' ||
        /[. ]$/u.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) ||
      path.posix.normalize(filename)!==filename) {
    throw new TypeError('Expected a canonical relative .mjs filename');
  }
  return filename;
}

/** @param {number} a @param {number} b @returns {number} */
function gcd(a,b) {
  while(b!==0) [a,b]=[b,a%b];
  return a;
}

/** @param {string} value @returns {Buffer} */
function digest(value) {
  return createHash('sha256').update(value).digest();
}

/**
 * Transform only named, top-level const string initializers. The original
 * module keeps the same exports, declarations, and reference expressions.
 * A randomized coprime permutation distributes UTF-16 code units across
 * public payload/key ESM files; a third module reconstructs them once when
 * the original const declaration evaluates.
 *
 * Source observations in the supplied module suspend the transform. External
 * observers, mutable global intrinsics, module-loader timing, and runtime
 * mutation cannot be proven safe in this one-file experiment.
 *
 * @param {ModuleFile} input
 * @param {ShardOptions} options
 * @returns {ShardResult}
 */
function shardTopLevelStrings(input,options) {
  if(!input || typeof input.code!=='string' || input.sourceType!=='module' ||
      !options || typeof options.seed!=='string' || !options.seed ||
      !Array.isArray(options.names) || !options.names.length ||
      options.names.some(name=>typeof name!=='string' || !/^[$A-Z_a-z][$\w]*$/u.test(name))) {
    throw new TypeError('Expected an ESM input, a nonempty seed, and named string const bindings');
  }
  const filename=safeModulePath(input.path);
  const ast=parse(input.code,'module');
  const chosen=new Set(options.names);
  const candidates=[];
  /** @type {Set<string>} */
  const usedNames=new Set();
  walk(ast,node=>{
    if(node.type==='Identifier')usedNames.add(node.name);
  });
  if(!observesFunctionSource(ast)) {
    for(const statement of /** @type {AstNode[]} */ (ast.body)) {
      const declaration=statement.type==='ExportNamedDeclaration' && !statement.source?
        statement.declaration:statement;
      if(declaration?.type!=='VariableDeclaration' || declaration.kind!=='const')continue;
      for(const item of declaration.declarations) {
        if(item.id.type==='Identifier' && chosen.has(item.id.name) &&
            item.init?.type==='Literal' && typeof item.init.value==='string' &&
            item.init.value.length>0) {
          candidates.push({name:item.id.name,start:item.init.start,end:item.init.end,
            value:/** @type {string} */ (item.init.value)});
        }
      }
    }
  }
  if(!candidates.length) {
    return {files:[{path:filename,code:input.code,sourceType:'module'}],
      sharded:0,codeUnits:0,declined:chosen.size};
  }
  const head=digest(options.seed+'\0'+filename+'\0'+input.code).toString('hex').slice(0,14);
  const basename=path.posix.basename(filename,'.mjs');
  const stem=basename+'.obfs31.'+head;
  const directory=path.posix.dirname(filename);
  /** @param {string} suffix @returns {string} */
  const location=suffix=>path.posix.join(directory,stem+'.'+suffix+'.mjs');
  const payloadFile=location('payload');
  const maskFile=location('mask');
  const decoderFile=location('decode');
  let alias='__obfs31_'+head;
  while(usedNames.has(alias))alias+='_';
  const count=candidates.reduce((sum,item)=>sum+item.value.length,0);
  const config=digest(options.seed+'\0permutation\0'+filename+'\0'+input.code);
  let step=Math.max(1,config.readUInt16BE(0)%count);
  while(gcd(step,count)!==1)step++;
  const shift=config.readUInt16BE(2)%count;
  const odd=config.readUInt16BE(4)|1;
  const salt=config.readUInt16BE(6);
  /** @type {number[]} */
  const payload=Array(count).fill(0);
  /** @type {number[]} */
  const mask=Array(count).fill(0);
  /** @type {[number,number][]} */
  const offsets=[];
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  let cursor=0;
  for(let itemIndex=0;itemIndex<candidates.length;itemIndex++){
    const item=candidates[itemIndex];
    offsets.push([cursor,item.value.length]);
    for(let i=0;i<item.value.length;i++) {
      const at=cursor+i;
      const key=digest(options.seed+'\0mask\0'+head+'\0'+at).readUInt16BE(0);
      const index=(at*step+shift)%count;
      mask[index]=key;
      payload[index]=(item.value.charCodeAt(i)^key^((at*odd+salt)&65535))&65535;
    }
    edits.push({start:item.start,end:item.end,text:alias+'('+itemIndex+')'});
    cursor+=item.value.length;
  }
  let transformed=applyEdits(input.code,edits);
  const importLine='import {d as '+alias+'} from '+JSON.stringify('./'+path.posix.basename(decoderFile))+';\n';
  // ESM import declarations are hoisted, so the line can be prepended after
  // an optional hashbang while preserving standard directive-prologue code.
  if(transformed.startsWith('#!')) {
    const end=transformed.indexOf('\n');
    transformed=transformed.slice(0,end+1)+importLine+transformed.slice(end+1);
  } else transformed=importLine+transformed;
  parse(transformed,'module');
  const payloadCode='export const a='+JSON.stringify(payload)+';\n';
  const maskCode='export const b='+JSON.stringify(mask)+';\n';
  const decoderCode=[
    'import {a} from '+JSON.stringify('./'+path.posix.basename(payloadFile))+';',
    'import {b} from '+JSON.stringify('./'+path.posix.basename(maskFile))+';',
    'const m='+JSON.stringify(offsets)+';',
    'const p='+step+',q='+shift+',o='+odd+',s='+salt+';',
    'export function d(index){',
    '  const range=m[index];',
    '  let result="";',
    '  for(let i=0;i<range[1];i++){',
    '    const at=range[0]+i;',
    '    const where=(at*p+q)%a.length;',
    '    result+=String.fromCharCode((a[where]^b[where]^((at*o+s)&65535))&65535);',
    '  }',
    '  return result;',
    '}',
    ''
  ].join('\n');
  /** @type {ModuleFile[]} */
  const files=[
    {path:filename,code:transformed,sourceType:'module'},
    {path:payloadFile,code:payloadCode,sourceType:'module'},
    {path:maskFile,code:maskCode,sourceType:'module'},
    {path:decoderFile,code:decoderCode,sourceType:'module'}
  ];
  for(const file of files)parse(file.code,'module');
  return {files,sharded:candidates.length,codeUnits:count,
    declined:chosen.size-new Set(candidates.map(item=>item.name)).size};
}

module.exports={shardTopLevelStrings};
