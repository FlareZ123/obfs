'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const acorn = require('acorn');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */
/** @typedef {{seed:string,functionName:string,closedWorld:true}} PiggybackOptions */
/** @typedef {{files:ModuleFile[],transformed:boolean,reason:string,codeUnits:number}} PiggybackResult */

/** @param {string} code @returns {import('acorn').Node & {body:any[]}} */
function parse(code) {
  return /** @type {import('acorn').Node & {body:any[]}} */ (
    acorn.parse(code,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true}));
}

/** @param {string} filename @returns {string} */
function filenameOf(filename) {
  if(typeof filename!=='string' || !filename.endsWith('.mjs') ||
      !filename || filename.includes('\\') || path.posix.isAbsolute(filename) ||
      /[<>:"|?*\x00-\x1f]/u.test(filename) ||
      filename.split('/').some(segment=>!segment || segment==='.' || segment==='..' ||
        /[. ]$/u.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) ||
      path.posix.normalize(filename)!==filename) {
    throw new TypeError('Expected canonical relative .mjs file paths');
  }
  return filename;
}

/** @param {string} value @returns {Buffer} */
function hash(value) {return createHash('sha256').update(value).digest();}

/** @param {number} a @param {number} b @returns {number} */
function gcd(a,b) {while(b!==0)[a,b]=[b,a%b];return a;}

/** @param {any} root @param {(node:any)=>void} visit */
function walk(root,visit) {
  visit(root);
  for(const value of Object.values(root)) {
    if(Array.isArray(value))for(const child of value) {
      if(child && typeof child==='object' && typeof child.type==='string')walk(child,visit);
    }
    else if(value && typeof value==='object' && typeof value.type==='string')walk(value,visit);
  }
}

/**
 * Conservative local check. Arbitrary consumers and other modules may still
 * observe the function source; closedWorld is an explicit caller assertion.
 * @param {any} root
 * @param {string} name
 * @returns {boolean}
 */
function hasKnownObserver(root,name) {
  let observed=false;
  walk(root,node=>{
    if(node.type==='WithStatement' ||
       node.type==='CallExpression' && node.callee.type==='Identifier' &&
        ['eval','Function'].includes(node.callee.name))observed=true;
    if(node.type==='CallExpression' && node.arguments.some(
      /** @param {any} arg */ arg=>arg.type==='Identifier'&&arg.name===name) &&
       node.callee.type==='Identifier' && ['String','RegExp','Symbol','Error'].includes(node.callee.name))observed=true;
    if(node.type==='MemberExpression' && node.object.type==='Identifier' &&
       node.object.name===name && (node.computed ||
       ['toString','toLocaleString'].includes(node.property.name)))observed=true;
  });
  return observed;
}

/**
 * Put one UTF-16 string-returning function's payload into its existing ESM
 * consumer, and the matching numeric mask into an existing, already imported
 * leaf module. No file or import edge is added. Runtime decoding is lazy and
 * memoized; both shares are public and recoverable from the distributed graph.
 *
 * The caller must prove a closed world without namespace/export enumeration,
 * no external function source observation, no early cyclic call, and no
 * monkeypatch of String.fromCharCode. This experiment does not infer those
 * properties from arbitrary JavaScript. Accepting these conditions is required.
 *
 * @param {{consumer:ModuleFile,donor:ModuleFile}} input
 * @param {PiggybackOptions} options
 * @returns {PiggybackResult}
 */
function piggybackShards(input,options) {
  if(!input?.consumer || !input?.donor || typeof options?.seed!=='string' ||
      !options.seed || typeof options.functionName!=='string' ||
      !/^[$A-Z_a-z][$\w]*$/u.test(options.functionName) || options.closedWorld!==true) {
    throw new TypeError('Expected two ESM files, seed, function name and closedWorld:true');
  }
  const consumer=input.consumer,donor=input.donor;
  const consumerPath=filenameOf(consumer.path),donorPath=filenameOf(donor.path);
  if(consumerPath===donorPath || consumer.sourceType!=='module' || donor.sourceType!=='module' ||
      typeof consumer.code!=='string' || typeof donor.code!=='string') {
    throw new TypeError('Expected two distinct ESM source files');
  }
  const refuse=/** @param {string} reason @returns {PiggybackResult} */ reason=>({
    files:[{...consumer},{...donor}],transformed:false,reason,codeUnits:0
  });
  const a=parse(consumer.code),b=parse(donor.code);
  // The donor is a leaf to exclude directly induced module cycles. Externally
  // sourced graph cycles remain a caller precondition.
  if(b.body.some(statement=>['ImportDeclaration','ExportAllDeclaration'].includes(statement.type) ||
      statement.type==='ExportNamedDeclaration' && statement.source)) {
    return refuse('Donor is not a static ESM leaf');
  }
  const existingImport=a.body.find(statement=>statement.type==='ImportDeclaration' &&
    typeof statement.source.value==='string' && statement.source.value.startsWith('.') &&
    path.posix.normalize(path.posix.join(path.posix.dirname(consumerPath),
      statement.source.value))===donorPath);
  if(!existingImport)return refuse('Consumer does not already import donor');
  let candidate;
  let matches=0;
  for(const statement of a.body) {
    const fn=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
    if(fn?.type!=='FunctionDeclaration' || fn.id?.name!==options.functionName)continue;
    matches++;
    if(fn.async || fn.generator || fn.params.length || fn.body.body.length!==1)continue;
    const ret=fn.body.body[0];
    if(ret.type==='ReturnStatement' && ret.argument?.type==='Literal' &&
        typeof ret.argument.value==='string' && ret.argument.value.length>0 &&
        ret.argument.value.length<=4096)candidate=ret.argument;
  }
  if(matches!==1 || !candidate || hasKnownObserver(a,options.functionName)) {
    return refuse('Function body or source-observation proof declined');
  }
  const names=new Set();
  let shadowsString=false;
  for(const root of [a,b])walk(root,node=>{
    if(node.type==='Identifier')names.add(node.name);
    const declared=[];
    if(node.type==='VariableDeclarator')declared.push(node.id);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) {
      if(node.id)declared.push(node.id);
      declared.push(...node.params);
    }
    if(node.type==='ClassDeclaration'||node.type==='ClassExpression')declared.push(node.id);
    if(node.type==='ImportSpecifier'||node.type==='ImportDefaultSpecifier'||
       node.type==='ImportNamespaceSpecifier')declared.push(node.local);
    if(node.type==='CatchClause')declared.push(node.param);
    // A conservative nested-pattern scan recognizes destructured bindings.
    for(const pattern of declared)if(pattern)walk(pattern,item=>{
      if(item.type==='Identifier'&&item.name==='String')shadowsString=true;
    });
  });
  if(shadowsString)return refuse('String is shadowed in the supplied modules');
  const base=hash(options.seed+'\0'+consumerPath+'\0'+donorPath+'\0'+
      consumer.code.replace(/\r\n/g,'\n')).toString('hex');
  let suffix=base.slice(0,12),index=0;
  /** @returns {string[]} */
  const generated=()=>['mask','payload','decode','cached'].map(part=>'_pb_'+suffix+'_'+part);
  while(generated().some(name=>names.has(name) ||
      consumer.code.includes(name) || donor.code.includes(name))) {
    index++;
    suffix=hash(base+':'+index).toString('hex').slice(0,12);
  }
  const [maskName,payloadName,decodeName,cacheName]=generated();
  const string=/** @type {string} */(candidate.value);
  const n=string.length;
  const setup=hash(options.seed+'\0layout\0'+base);
  let stride=(setup.readUInt16BE(0)%n)||1;
  while(gcd(stride,n)!==1)stride++;
  const shift=setup.readUInt16BE(2)%n;
  const odd=setup.readUInt16BE(4)|1;
  const salt=setup.readUInt16BE(6);
  /** @type {number[]} */
  const mask=Array(n).fill(0),payload=Array(n).fill(0);
  for(let i=0;i<n;i++) {
    const key=hash(options.seed+'\0key\0'+base+'\0'+i).readUInt16BE(0);
    const at=(i*stride+shift)%n;
    mask[at]=key;
    payload[at]=(string.charCodeAt(i)^key^((i*odd+salt)&65535))&65535;
  }
  const importSpecifier=path.posix.relative(path.posix.dirname(consumerPath),donorPath);
  const importPath=importSpecifier.startsWith('.')?importSpecifier:'./'+importSpecifier;
  const newImport='import {'+maskName+'} from '+JSON.stringify(importPath)+';\n';
  // Insert immediately after the existing import so dependency evaluation
  // order is unchanged. The insertion and literal rewrite use original offsets.
  const replacement=cacheName+'===void 0?('+cacheName+'='+decodeName+'()):'+cacheName;
  const edits=[{start:candidate.start,end:candidate.end,text:replacement},
    {start:existingImport.end,end:existingImport.end,text:'\n'+newImport}]
    .sort((left,right)=>right.start-left.start);
  let consumerCode=consumer.code;
  for(const edit of edits)consumerCode=consumerCode.slice(0,edit.start)+
    edit.text+consumerCode.slice(edit.end);
  consumerCode+='\nconst '+payloadName+'='+JSON.stringify(payload)+';\n'+
    'let '+cacheName+';\n'+
    'function '+decodeName+'(){const units=[];for(let i=0;i<'+n+';i++){'+
    'const at=(i*'+stride+'+'+shift+')%'+n+';units[i]=('+payloadName+'[at]^'+
    maskName+'[at]^((i*'+odd+'+'+salt+')&65535))&65535;}'+
    'return String.fromCharCode(...units);}\n';
  const donorCode=donor.code+'\nexport const '+maskName+'='+JSON.stringify(mask)+';\n';
  parse(consumerCode);
  parse(donorCode);
  return {files:[{path:consumerPath,code:consumerCode,sourceType:'module'},
    {path:donorPath,code:donorCode,sourceType:'module'}],transformed:true,
    reason:'existing-edge lazy two-file sharding',codeUnits:n};
}

module.exports={piggybackShards};
