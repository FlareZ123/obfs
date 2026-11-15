'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('../src/ast');

/** @typedef {'script'|'commonjs'|'module'} SourceType */
/** @typedef {{seed:string,names:string[],sourceType?:SourceType}} LayerOptions */
/** @typedef {{code:string,functions:number,rewrites:number,declined:number}} LayerResult */
/** @typedef {import('../src/ast').AstNode} AstNode */

const ALLOWED=new Set(['+','-','^','&','|','<<','>>','>>>']);
const ROOTS=new Set(['^','&','|','<<','>>','>>>']);

/** @param {AstNode} node @param {ReadonlySet<string>} formal @returns {boolean} */
function pureInt32(node,formal){
  if(node.type==='Identifier')return formal.has(node.name);
  if(node.type==='Literal')return typeof node.value==='number'&&Number.isInteger(node.value)&&
    node.value>=-2147483648&&node.value<=2147483647;
  if(node.type==='UnaryExpression'&&node.prefix&&['+','-','~'].includes(node.operator))
    return pureInt32(node.argument,formal);
  return node.type==='BinaryExpression'&&ALLOWED.has(node.operator)&&
    pureInt32(node.left,formal)&&pureInt32(node.right,formal);
}

/** @param {AstNode} node @returns {boolean} */
function primitiveLeaf(node){return node.type==='Identifier'||
  node.type==='Literal'&&typeof node.value==='number';}

/**
 * Independent second-stage identity for a pure Int32 XOR. The two mask
 * expressions are algebraically identical but syntactically distinct:
 * (a & b) === ~(~a | ~b) on 32-bit bitvectors.
 * Thus (a ^ (m1 ^ k)) ^ (b ^ (m2 ^ k)) === a ^ b.
 * No calls, VM, closures or external intrinsic dependencies are introduced.
 * @param {string} left
 * @param {string} right
 * @param {number} key
 * @returns {string}
 */
function layerXor(left,right,key){
  const a='('+left+')',b='('+right+')';
  return '(('+a+'^(('+a+'&'+b+')^'+key+'))^('+b+'^((~(~'+a+'|~'+b+'))^'+key+')))';
}

/**
 * Opt-in experiment selecting exactly one leaf XOR per named function.
 * The external integrator must prove primitive signed Int32 arguments and
 * absence of external source observers. The pass cannot prove either claim.
 * @param {string} source
 * @param {LayerOptions} options
 * @returns {LayerResult}
 */
function layerXorFunctions(source,options){
  if(typeof source!=='string'||!options||typeof options.seed!=='string'||!options.seed||
      !Array.isArray(options.names)||options.names.some(name=>typeof name!=='string'))
    throw new TypeError('Expected source, seed and selected function names');
  const sourceType=options.sourceType??'script';
  if(!['script','commonjs','module'].includes(sourceType))throw new TypeError('Unsupported module type');
  const selected=new Set(options.names);
  if(selected.size===0)return {code:source,functions:0,rewrites:0,declined:0};
  const ast=parse(source,sourceType);
  let dynamic=false;
  walk(ast,node=>{
    if(node.type==='WithStatement'||node.type==='CallExpression'&&
        node.callee.type==='Identifier'&&node.callee.name==='eval')dynamic=true;
  });
  if(dynamic||observesFunctionSource(ast))return {code:source,functions:0,rewrites:0,declined:selected.size};
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  let declined=0;
  let functions=0;
  for(const statement of /** @type {AstNode[]} */ (ast.body)){
    const fn=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(fn.type!=='FunctionDeclaration'||!fn.id||!selected.has(fn.id.name))continue;
    const names=fn.params.map((/** @type {AstNode} */ node)=>node.name);
    const formal=new Set(names);
    const body=fn.body.body;
    const expr=body.length===1&&body[0].type==='ReturnStatement'?body[0].argument:null;
    if(fn.async||fn.generator||fn.params.some((/** @type {AstNode} */ node)=>node.type!=='Identifier')||
        formal.size!==names.length||!expr||expr.type!=='BinaryExpression'||
        !ROOTS.has(expr.operator)||!pureInt32(expr,formal)){
      declined++;
      continue;
    }
    /** @type {AstNode[]} */
    const eligible=[];
    walk(expr,node=>{
      if(node.type==='BinaryExpression'&&node.operator==='^'&&
          primitiveLeaf(node.left)&&primitiveLeaf(node.right))eligible.push(node);
    });
    if(!eligible.length){declined++;continue;}
    const canonical=source.replace(/\r\n/g,'\n');
    const digest=createHash('sha256').update(options.seed+'\0'+fn.id.name+'\0'+canonical).digest();
    const node=eligible[digest[0]%eligible.length];
    const key=digest.readInt32LE(1);
    const replacement=layerXor(source.slice(node.left.start,node.left.end),
      source.slice(node.right.start,node.right.end),key);
    edits.push({start:node.start,end:node.end,text:replacement});
    functions++;
  }
  if(!edits.length)return {code:source,functions:0,rewrites:0,declined};
  const code=applyEdits(source,edits);
  parse(code,sourceType);
  return {code,functions,rewrites:edits.length,declined};
}

module.exports={layerXorFunctions};
