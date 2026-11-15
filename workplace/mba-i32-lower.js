'use strict';

const {createHash} = require('node:crypto');
const {parse, walk, applyEdits, observesFunctionSource} = require('../src/ast');

/** @typedef {'script'|'commonjs'|'module'} SourceType */
/** @typedef {{seed:string,names:string[],sourceType?:SourceType,maxRewrites?:number}} MbaOptions */
/** @typedef {{code:string,functions:number,rewrites:number,declined:number}} MbaResult */
/** @typedef {{start:number,end:number,operator:string,left:string,right:string}} Candidate */

const BITWISE_ROOTS = new Set(['^','&','|','<<','>>','>>>']);
const SUPPORTED_BINARY = new Set(['+','-','^','&','|','<<','>>','>>>']);
const MIXABLE = new Set(['+','-','^','&','|']);

/**
 * Prove a side-effect-free integer-expression grammar. This proves syntax,
 * not the external contract that each formal argument is a primitive Int32.
 * Every chain terminates in a bitwise operator, ensuring the root observes
 * modulo-2^32 results instead of overflowing native Number arithmetic.
 *
 * @param {import('../src/ast').AstNode} node
 * @param {ReadonlySet<string>} params
 * @returns {boolean}
 */
function isInt32Expression(node,params) {
  if(node.type==='Identifier')return params.has(node.name);
  if(node.type==='Literal')return typeof node.value==='number' &&
    Number.isInteger(node.value) && node.value>=-2147483648 && node.value<=2147483647;
  if(node.type==='UnaryExpression' && node.prefix && ['-','+','~'].includes(node.operator)) {
    return isInt32Expression(node.argument,params);
  }
  return node.type==='BinaryExpression' && SUPPORTED_BINARY.has(node.operator) &&
    isInt32Expression(node.left,params) && isInt32Expression(node.right,params);
}

/**
 * Generate several equivalent mixed Boolean-arithmetic identities over Z/(2^32).
 * The caller must supply primitive Int32 arguments and a bitwise-rooted pure
 * expression. Identifiers are safe to read more than once under this contract.
 * Mask constants are public; this is not encryption or tamper resistance.
 *
 * @param {string} operator
 * @param {string} a
 * @param {string} b
 * @param {number} variant
 * @param {number} mask
 * @returns {string}
 */
function mixed(operator,a,b,variant,mask) {
  const A='('+a+')';
  const B='('+b+')';
  switch(operator) {
    case '+':
      if(variant===0)return `((${A}|${B})+(${A}&${B}))`;
      if(variant===1)return `((${A}^${B})+((${A}&${B})<<1))`;
      return `((${A}&${B})-(~${A}&~${B})-1)`;
    case '-':
      if(variant===0)return `(${A}+~${B}+1)`;
      if(variant===1)return `((${A}^~${B})+((${A}&~${B})<<1)+1)`;
      return `((${A}|~${B})+(${A}&~${B})+1)`;
    case '^':
      if(variant===0)return `((${A}|${B})&~(${A}&${B}))`;
      if(variant===1)return `((${A}&~${B})|(~${A}&${B}))`;
      return `((${A}^${mask})^(${B}^${mask}))`;
    case '&':
      if(variant===0)return `((${A}|${B})^(${A}^${B}))`;
      if(variant===1)return `~(~${A}|~${B})`;
      return `((${A}^${B})^(${A}|${B}))`;
    case '|':
      if(variant===0)return `((${A}^${B})|(${A}&${B}))`;
      if(variant===1)return `~(~${A}&~${B})`;
      return `((${A}^${B})^(${A}&${B}))`;
    default:throw new TypeError('Not a supported mixed Boolean-arithmetic operation');
  }
}

/**
 * Only mix leaf operands: this avoids repeating nested expression evaluation,
 * protects the evaluation-order proof, and limits generated code size.
 * @param {import('../src/ast').AstNode} node
 * @returns {boolean}
 */
function isLeaf(node) {
  return node.type==='Identifier' || node.type==='Literal' && typeof node.value==='number';
}

/**
 * Experimental, explicitly selected MBA rewriting for pure Int32 functions.
 * It does not enter production obfuscation: formal Int32 types and external
 * observers cannot be established from the same source file alone.
 *
 * @param {string} source
 * @param {MbaOptions} options
 * @returns {MbaResult}
 */
function mixInt32Functions(source,options) {
  if(typeof source!=='string' || !options || typeof options.seed!=='string' ||
      options.seed.length===0 || !Array.isArray(options.names) ||
      options.names.some(name=>typeof name!=='string') ||
      options.maxRewrites!==undefined && (!Number.isInteger(options.maxRewrites) ||
      options.maxRewrites<1 || options.maxRewrites>16)) {
    throw new TypeError('Expected source, seed, selected function names and optional 1..16 rewrite bound');
  }
  const sourceType=options.sourceType??'script';
  if(!['script','commonjs','module'].includes(sourceType))throw new TypeError('Unsupported source type');
  const ast=parse(source,sourceType);
  const selected=new Set(options.names);
  if(!selected.size)return {code:source,functions:0,rewrites:0,declined:0};
  let dynamic=false;
  walk(ast,node=>{
    if(node.type==='WithStatement'||node.type==='CallExpression' &&
        node.callee.type==='Identifier' && node.callee.name==='eval')dynamic=true;
  });
  if(dynamic||observesFunctionSource(ast))return {
    code:source,functions:0,rewrites:0,declined:selected.size
  };
  /** @type {import('../src/ast').Edit[]} */
  const edits=[];
  let functions=0;
  let declined=0;
  const statements=/** @type {import('../src/ast').AstNode[]} */ (ast.body);
  for(const statement of statements) {
    const fn=statement.type==='ExportNamedDeclaration' && statement.declaration?
      statement.declaration:statement;
    if(fn.type!=='FunctionDeclaration'||!fn.id||!selected.has(fn.id.name))continue;
    const names=fn.params.map((/** @type {import('../src/ast').AstNode} */ p)=>p.name);
    const body=fn.body.body;
    const argument=body.length===1 && body[0].type==='ReturnStatement' ? body[0].argument : null;
    if(fn.async||fn.generator||fn.params.some((/** @type {import('../src/ast').AstNode} */ p)=>p.type!=='Identifier')||
        new Set(names).size!==names.length||!argument||
        argument.type!=='BinaryExpression'||!BITWISE_ROOTS.has(argument.operator)||
        !isInt32Expression(argument,new Set(names))) {
      declined++;
      continue;
    }
    /** @type {Candidate[]} */
    const candidates=[];
    walk(argument,node=>{
      if(node.type==='BinaryExpression'&&MIXABLE.has(node.operator)&&
          isLeaf(node.left)&&isLeaf(node.right)) {
        candidates.push({start:node.start,end:node.end,operator:node.operator,
          left:source.slice(node.left.start,node.left.end),
          right:source.slice(node.right.start,node.right.end)});
      }
    });
    if(!candidates.length){declined++;continue;}
    const digest=createHash('sha256').update(options.seed+'\0'+fn.id.name+'\0'+source).digest();
    const ranked=candidates.map((candidate,index)=>({candidate,index,
      rank:createHash('sha256').update(digest).update(String(index)).digest('hex')}))
      .sort((a,b)=>a.rank.localeCompare(b.rank));
    const limit=Math.min(options.maxRewrites??1,ranked.length);
    for(const {candidate,index} of ranked.slice(0,limit)) {
      const selection=createHash('sha256').update(digest).update('mix:'+index).digest();
      const variant=selection[0]%3;
      const mask=selection.readInt32LE(1);
      edits.push({start:candidate.start,end:candidate.end,
        text:mixed(candidate.operator,candidate.left,candidate.right,variant,mask)});
    }
    functions++;
  }
  if(!edits.length)return {code:source,functions:0,rewrites:0,declined};
  const code=applyEdits(source,edits);
  parse(code,sourceType);
  return {code,functions,rewrites:edits.length,declined};
}

module.exports={mixInt32Functions};
