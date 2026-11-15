'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {{operator:string,immediate:number}[]} Steps */
/** @typedef {{index:number,type:'test'|'return',steps:Steps,yes?:number,no?:number}} Block */
/** @typedef {{code:string,functions:number,blocks:number,declined:number}} BranchBlockResult */

const OPERATORS=new Set(['+','-','*','^','&','|','<<','>>','>>>','%']);

/**
 * Recognize an expression with only one parameter and unsigned byte
 * immediates. Native compound operators retain JavaScript's ordinary
 * coercion order (including string concatenation and BigInt exceptions).
 * @param {AstNode} expression
 * @param {string} parameter
 * @returns {Steps|null}
 */
function compileSteps(expression,parameter) {
  if(expression.type==='Identifier'&&expression.name===parameter)return [];
  if(expression.type!=='BinaryExpression'||!OPERATORS.has(expression.operator))return null;
  const rhs=expression.right;
  if(rhs.type!=='Literal'||typeof rhs.value!=='number'||
      !Number.isInteger(rhs.value)||rhs.value<0||rhs.value>255)return null;
  const earlier=compileSteps(expression.left,parameter);
  return earlier===null?null:[...earlier,{operator:expression.operator,immediate:rhs.value}];
}

/**
 * Lower a return-only ternary expression to a small graph of native-operation
 * basic blocks. Each block starts from the original argument, which is
 * necessary when a test coerces an object before a selected branch does so.
 * No branch is evaluated speculatively.
 * @param {AstNode} expression
 * @param {string} parameter
 * @param {Block[]} blocks
 * @param {number} depth
 * @returns {number|null}
 */
function buildBlocks(expression,parameter,blocks,depth) {
  if(depth>16||blocks.length>=128)return null;
  const index=blocks.length;
  if(expression.type==='ConditionalExpression') {
    const test=compileSteps(expression.test,parameter);
    if(test===null)return null;
    const branch=/** @type {Block} */ ({index,type:'test',steps:test});
    blocks.push(branch);
    const yes=buildBlocks(expression.consequent,parameter,blocks,depth+1);
    const no=buildBlocks(expression.alternate,parameter,blocks,depth+1);
    if(yes===null||no===null)return null;
    branch.yes=yes;
    branch.no=no;
    return index;
  }
  const steps=compileSteps(expression,parameter);
  if(steps===null)return null;
  blocks.push({index,type:'return',steps});
  return index;
}

/**
 * Emit shuffled, random-identity basic blocks under one switch dispatcher.
 * Each arithmetic chain remains native JavaScript, avoiding per-operation
 * virtual-machine dispatch. The state IDs and byte masks are public and
 * reversible: this is an experimental structure-hiding transformation.
 * @param {Block[]} blocks
 * @param {string} parameter
 * @param {string} name
 * @param {string} seed
 * @param {Set<string>} reserved
 * @param {boolean} stateBlinding
 * @returns {string}
 */
function emitBlockBody(blocks,parameter,name,seed,reserved,stateBlinding) {
  const hash=/** @param {string} key @returns {Buffer} */ key=>
    createHash('sha256').update(seed).update('\0').update(name).update('\0').update(key).digest();
  /** @param {string} prefix @returns {string} */
  function fresh(prefix) {
    let result=prefix+hash(prefix).subarray(0,8).toString('hex');
    for(let n=1;reserved.has(result);n++)result=prefix+
      hash(prefix+'/'+n).subarray(0,8).toString('hex');
    reserved.add(result);
    return result;
  }
  const value=fresh('_bbv_');
  const state=fresh('_bbs_');
  /** @type {Set<number>} */
  const taken=new Set();
  const states=blocks.map(block=>{
    let nonce=0;
    let id=hash('state/'+block.index+'/'+nonce).readUInt32LE(0);
    while(taken.has(id))id=hash('state/'+block.index+'/'+(++nonce)).readUInt32LE(0);
    taken.add(id);
    return id;
  });
  const ordered=[...blocks].sort((a,b)=>
    hash('order/'+a.index).readUInt32LE(0)-hash('order/'+b.index).readUInt32LE(0));
  // A number-only state mask is a pure operation on an already evaluated
  // primitive value. Other JS values (including objects, BigInt and Symbol)
  // remain untouched so test evaluation acquires no extra coercion effects.
  const numericMask='(typeof '+value+'==="number"?('+value+'|0):0)';
  const dispatch=stateBlinding ? '(('+state+'^'+numericMask+')>>>0)' : state;
  let code='{let '+value+','+state+'='+states[0]+';for(;;){switch('+dispatch+'){';
  for(const block of ordered) {
    code+='case '+states[block.index]+':'+value+'='+parameter+';';
    for(let i=0;i<block.steps.length;i++) {
      const step=block.steps[i];
      const mask=hash('operand/'+block.index+'/'+i)[0];
      code+=value+step.operator+'=('+((step.immediate^mask)&255)+'^'+mask+');';
    }
    if(block.type==='return') {
      code+='return '+value+';';
    } else {
      const target='('+value+'?'+states[/** @type {number} */ (block.yes)]+
        ':'+states[/** @type {number} */ (block.no)]+')';
      code+=state+'='+(stateBlinding ? '(('+target+'^'+numericMask+')>>>0)' :
        target)+';break;';
    }
  }
  return code+'default:throw Error("Invalid basic-block state");}}}';
}

/**
 * Opt-in branch-level control-flow flattening for a single-argument function
 * with exactly one return statement containing at least one ternary. Declines
 * any unproved expression, effectful call, dynamic scope, source observer, or
 * unsupported syntax. The external caller is responsible for source-introspection
 * contracts, and for a per-application 2.5x hot-path performance gate.
 *
 * @param {string} source
 * @param {'module'|'commonjs'} sourceType
 * @param {{seed:string,names:string[],stateBlinding?:boolean}} options
 * @returns {BranchBlockResult}
 */
function flattenBranchBlocks(source,sourceType,options) {
  if(typeof source!=='string'||!['module','commonjs'].includes(sourceType)||
      !options||typeof options.seed!=='string'||!options.seed||
      !Array.isArray(options.names)||options.names.some(name=>typeof name!=='string')||
      options.stateBlinding!==undefined&&typeof options.stateBlinding!=='boolean') {
    throw new TypeError('Expected source, module type, seed and explicit function names');
  }
  const targets=new Set(options.names);
  if(!targets.size)return {code:source,functions:0,blocks:0,declined:0};
  const ast=parse(source,sourceType);
  /** @type {Set<string>} */
  const used=new Set();
  let dynamic=false;
  walk(ast,node=>{
    if(node.type==='Identifier') {
      used.add(node.name);
      if(node.name==='eval')dynamic=true;
    }
    if(node.type==='WithStatement')dynamic=true;
  });
  if(dynamic||observesFunctionSource(ast))return {
    code:source,functions:0,blocks:0,declined:targets.size
  };
  /** @type {Map<string,AstNode[]>} */
  const candidates=new Map();
  for(const statement of ast.body) {
    const fn=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(fn.type!=='FunctionDeclaration'||!fn.id||!targets.has(fn.id.name))continue;
    const group=candidates.get(fn.id.name)??[];
    group.push(fn);
    candidates.set(fn.id.name,group);
  }
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  let functions=0,blockCount=0,declined=0;
  for(const name of targets) {
    const matches=candidates.get(name);
    if(!matches||matches.length!==1) {declined++;continue;}
    const fn=matches[0];
    const statement=fn.body.body[0];
    const parameter=fn.params[0];
    if(fn.async||fn.generator||fn.params.length!==1||
       parameter?.type!=='Identifier'||parameter.name==='arguments'||
       fn.body.body.length!==1||statement?.type!=='ReturnStatement'||
       statement.argument?.type!=='ConditionalExpression') {
      declined++;
      continue;
    }
    /** @type {Block[]} */
    const blocks=[];
    if(buildBlocks(statement.argument,parameter.name,blocks,0)===null) {
      declined++;
      continue;
    }
    edits.push({start:fn.body.start,end:fn.body.end,
      text:emitBlockBody(blocks,parameter.name,name,options.seed,used,options.stateBlinding===true)});
    functions++;
    blockCount+=blocks.length;
  }
  if(!functions)return {code:source,functions:0,blocks:0,declined};
  const code=applyEdits(source,edits);
  parse(code,sourceType);
  return {code,functions,blocks:blockCount,declined};
}

module.exports={flattenBranchBlocks};
