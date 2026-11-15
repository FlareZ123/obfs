'use strict';

const path=require('node:path');
const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('../src/ast');
const {safePath}=require('../src/core');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */
/** @typedef {{files:ModuleFile[],functions:number,declined:number,helperCalls:number}} ShardResult */

/** @type {ReadonlySet<string>} */
const BITWISE=new Set(['&','|','^','<<','>>','>>>']);

/**
 * Prove syntactic side-effect freedom for a primitive signed-Int32 input.
 * Nonprimitive coercion is forbidden by the external caller contract.
 * @param {AstNode} node
 * @param {string} parameter
 * @param {number} depth
 * @returns {boolean}
 */
function pureBits(node,parameter,depth=0) {
  if(depth>16)return false;
  if(node.type==='Identifier')return node.name===parameter;
  if(node.type==='Literal')return typeof node.value==='number' &&
    Number.isInteger(node.value)&&node.value>=-2147483648&&node.value<=2147483647;
  if(node.type==='UnaryExpression'&&node.prefix&&node.operator==='~') {
    return pureBits(node.argument,parameter,depth+1);
  }
  if(node.type==='UnaryExpression'&&node.prefix&&node.operator==='-'&&
      node.argument.type==='Literal'&&typeof node.argument.value==='number'&&
      Number.isInteger(node.argument.value)) {
    const value=-node.argument.value;
    return value>=-2147483648&&value<=2147483647;
  }
  return node.type==='BinaryExpression'&&BITWISE.has(node.operator)&&
    pureBits(node.left,parameter,depth+1)&&pureBits(node.right,parameter,depth+1);
}

/** @param {AstNode} node @returns {boolean} */
function nontrivial(node) {
  return node.type==='BinaryExpression'||node.type==='UnaryExpression';
}

/**
 * Split selected strict bitvector ESM functions across two inert sibling
 * modules, preserving the original export and one-parameter signature.
 *
 * All outputs remain public: this is an experimental layout transform, not
 * an access-control or source-confidentiality boundary. The caller must prove
 * primitive signed Int32 Number arguments, a closed published module set,
 * absence of outside source/stack observers and absence of loader side effects.
 *
 * @param {ModuleFile} file
 * @param {{names:string[],seed:string,reservedPaths?:string[],topology?:'split'|'paired'}} options
 * @returns {ShardResult}
 */
function shardNativeBitvectorModule(file,options) {
  if(!file||typeof file.code!=='string'||typeof file.path!=='string'||
      file.sourceType!=='module'||!file.path.endsWith('.mjs')||
      !options||typeof options.seed!=='string'||!options.seed||
      !Array.isArray(options.names)||options.names.some(name=>typeof name!=='string'||!name)||
      new Set(options.names).size!==options.names.length||
      options.topology!==undefined&&!['split','paired'].includes(options.topology)||
      options.reservedPaths!==undefined&&(!Array.isArray(options.reservedPaths)||
        options.reservedPaths.some(name=>typeof name!=='string'))) {
    throw new TypeError('Expected .mjs module, seed and unique selected names');
  }
  const filename=safePath(file.path);
  const ast=parse(file.code,'module');
  /** @type {Set<string>} */
  const used=new Set();
  walk(ast,node=>{if(node.type==='Identifier')used.add(node.name);});
  if(observesFunctionSource(ast)||used.has('eval')) {
    return {files:[file],functions:0,declined:options.names.length,helperCalls:0};
  }
  const reserved=new Set([filename,...(options.reservedPaths??[]).map(safePath)]);
  const topology=options.topology??'split';
  /** @type {Map<string,AstNode[]>} */
  const functions=new Map();
  for(const stmt of ast.body) {
    const fn=stmt.type==='ExportNamedDeclaration'?stmt.declaration:null;
    if(fn?.type==='FunctionDeclaration'&&fn.id?.type==='Identifier') {
      const found=functions.get(fn.id.name)??[];
      found.push(fn);
      functions.set(fn.id.name,found);
    }
  }
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  /** @type {string[]} */
  const imports=[];
  /** @type {ModuleFile[]} */
  const shards=[];
  let declined=0;
  for(const name of options.names) {
    const matches=functions.get(name);
    if(!matches||matches.length!==1) {declined++;continue;}
    const fn=matches[0];
    const expression=fn.body.body[0]?.argument;
    const param=fn.params[0];
    if(fn.async||fn.generator||fn.params.length!==1||param?.type!=='Identifier'||
      fn.body.body.length!==1||fn.body.body[0]?.type!=='ReturnStatement'||
      expression?.type!=='BinaryExpression'||!BITWISE.has(expression.operator)||
      !nontrivial(expression.left)||!nontrivial(expression.right)||
      !pureBits(expression,param.name)) {declined++;continue;}
    const hash=createHash('sha256').update(options.seed+'\0'+filename+'\0'+name).digest('hex');
    /** @type {string[]} */
    const helpers=[];
    /** @type {string[]} */
    const paths=[];
    for(let side=0;side<2;side++) {
      let nonce=0;
      let helper='',target='';
      do {
        const digest=createHash('sha256').update(hash+'\0'+side+'\0'+nonce).digest('hex').slice(0,16);
        helper='_ns'+digest;
        target=filename.slice(0,-4)+'.'+digest+'.mjs';
        nonce++;
      } while(used.has(helper)||file.code.includes(helper)||reserved.has(target));
      used.add(helper);
      reserved.add(target);
      helpers.push(helper);
      paths.push(target);
    }
    const subexpressions=[
      file.code.slice(expression.left.start,expression.left.end),
      file.code.slice(expression.right.start,expression.right.end)
    ];
    if(topology==='paired') {
      const target=paths[0];
      shards.push({path:target,sourceType:'module',
        code:helpers.map((helper,side)=>
          'export function '+helper+'('+param.name+'){return '+subexpressions[side]+';}\n').join('')});
      const rel=path.posix.relative(path.posix.dirname(filename),target);
      imports.push('import {'+helpers.join(',')+'} from '+
        JSON.stringify(rel.startsWith('.')?rel:'./'+rel)+';');
    } else {
      for(let side=0;side<2;side++) {
        const helper=helpers[side];
        shards.push({path:paths[side],sourceType:'module',
          code:'export function '+helper+'('+param.name+'){return '+subexpressions[side]+';}\n'});
        const rel=path.posix.relative(path.posix.dirname(filename),paths[side]);
        imports.push('import {'+helper+'} from '+JSON.stringify(rel.startsWith('.')?rel:'./'+rel)+';');
      }
    }
    edits.push({start:fn.body.start,end:fn.body.end,
      text:'{return '+helpers[0]+'('+param.name+')'+expression.operator+
        helpers[1]+'('+param.name+');}'});
  }
  if(!shards.length)return {files:[file],functions:0,declined,helperCalls:0};
  const transformed=applyEdits(file.code,edits);
  // Hashbang must remain byte zero, and directive prologues may carry
  // host/toolchain meaning such as "use client" in supported deployments.
  let offset=0;
  if(file.code.startsWith('#!')) {
    const end=file.code.indexOf('\n');
    offset=end<0?file.code.length:end+1;
  }
  for(const statement of ast.body) {
    if(statement.type==='ExpressionStatement'&&statement.directive)offset=statement.end;
    else break;
  }
  const code=transformed.slice(0,offset)+(offset?'\n':'')+imports.join('\n')+
    '\n'+transformed.slice(offset);
  parse(code,'module');
  return {files:[{path:filename,code,sourceType:'module'},...shards],
    functions:edits.length,declined,helperCalls:edits.length*2};
}

module.exports={shardNativeBitvectorModule};
