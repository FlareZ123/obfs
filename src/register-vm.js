'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('./ast');

/** @typedef {'module'|'commonjs'} SourceType */
/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {{operator:string,immediate:number}[]} Program */
/** @typedef {{code:string,functions:number,instructions:number,declined:number}} VmResult */

/**
 * Register-machine operators execute as native JavaScript compound operations
 * on a private local, preserving the original expression's coercion order.
 * The constrained byte literals make each instruction a fixed two-byte pair.
 */
const operators=/** @type {Readonly<Record<string,number>>} */ (Object.freeze({
  '+':1,'-':2,'*':3,'^':4,'&':5,'|':6,'<<':7,'>>':8,'>>>':9
}));

/**
 * Prove the single-register expression shape without reading getters, calling
 * unknown functions, assuming numeric parameter types, or moving side effects.
 * @param {AstNode} node
 * @param {string} parameter
 * @returns {Program|null}
 */
function compileChain(node,parameter) {
  if(node.type==='Identifier' && node.name===parameter)return [];
  if(node.type!=='BinaryExpression'||!Object.hasOwn(operators,node.operator))return null;
  const right=node.right;
  if(right.type!=='Literal'||typeof right.value!=='number'||
      !Number.isInteger(right.value)||right.value<0||right.value>255)return null;
  const prefix=compileChain(node.left,parameter);
  if(prefix===null)return null;
  return [...prefix,{operator:node.operator,immediate:right.value}];
}

/**
 * Build one declaration-scoped, lazily cached register-bytecode interpreter.
 * The helper's bytecode and opcode mapping are both visible to an attacker;
 * this is structure-hiding diversification, not a confidentiality boundary.
 * @param {string} helper
 * @param {Program} program
 * @param {Buffer} entropy
 * @returns {string}
 */
function interpreterSource(helper,program,entropy) {
  const rotation=entropy[0],key=entropy[1];
  /** @type {number[]} */
  const bytes=[];
  for(const item of program) {
    bytes.push((operators[item.operator]+rotation)&255,item.immediate^key);
  }
  bytes.push((255+rotation)&255);
  const cases=Object.entries(operators).map(([op,id])=>
    'case '+id+':value'+op+'=(bytes[pc++]^'+key+');break;').join('');
  const cache=helper+'Cache';
  // 'var' and a function declaration are hoisted. Calls occurring before the
  // textual declaration still initialize the bytecode exactly once.
  return '\nvar '+cache+';function '+helper+'(input){const bytes='+cache+
    '||('+cache+'='+JSON.stringify(bytes)+');let value=input,pc=0;for(;;){switch((bytes[pc++]-'+
    rotation+')&255){'+cases+'case 255:return value;default:throw new Error("Invalid VM instruction");}}}\n';
}

/**
 * Virtualize explicitly selected one-argument pure immediate chains. Declines
 * unsupported functions instead of approximating arbitrary JavaScript.
 *
 * The caller must establish that no external source/stack introspection
 * observes the changed function body, and measure the application's real
 * runtime under the 2.5x budget before distributing VM output.
 *
 * @param {string} source
 * @param {SourceType} sourceType
 * @param {{seed:string,names:string[]}} options
 * @returns {VmResult}
 */
function virtualizeRegisterChains(source,sourceType,options) {
  if(typeof source!=='string'||!['module','commonjs'].includes(sourceType)||
      !options||typeof options.seed!=='string'||!options.seed||
      !Array.isArray(options.names)||options.names.some(x=>typeof x!=='string')) {
    throw new TypeError('Expected source, module type, seed and explicit function names');
  }
  const targets=new Set(options.names);
  if(!targets.size)return {code:source,functions:0,instructions:0,declined:0};
  const ast=parse(source,sourceType);
  let dynamic=false;
  /** @type {Set<string>} */
  const used=new Set();
  walk(ast,node=>{
    if(node.type==='Identifier') {
      used.add(node.name);
      if(node.name==='eval')dynamic=true;
    }
    if(node.type==='WithStatement')dynamic=true;
  });
  if(dynamic||observesFunctionSource(ast))return {
    code:source,functions:0,instructions:0,declined:targets.size
  };
  /** @type {Map<string,AstNode[]>} */
  const candidates=new Map();
  for(const statement of ast.body) {
    const node=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(node.type!=='FunctionDeclaration'||!node.id||!targets.has(node.id.name))continue;
    const group=candidates.get(node.id.name)??[];
    group.push(node);
    candidates.set(node.id.name,group);
  }
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  /** @type {string[]} */
  const helpers=[];
  let accepted=0,instructions=0,declined=0;
  for(const name of targets) {
    const matches=candidates.get(name);
    if(!matches||matches.length!==1) {declined++;continue;}
    const fn=matches[0];
    const param=fn.params[0];
    const body=fn.body.body;
    if(fn.async||fn.generator||fn.params.length!==1||param?.type!=='Identifier'||
       param.name==='arguments'||body.length!==1||
       body[0].type!=='ReturnStatement'||!body[0].argument) {
      declined++;
      continue;
    }
    const program=compileChain(body[0].argument,param.name);
    if(!program||!program.length) {declined++;continue;}
    const entropy=createHash('sha256').update(options.seed).update('\0')
      .update(name).update('\0').update(source).digest();
    let helper='_rvm_'+entropy.subarray(2,10).toString('hex');
    for(let index=1;used.has(helper)||used.has(helper+'Cache');index++)helper='_rvm_'+
      createHash('sha256').update(options.seed+'/'+name+'/'+index).digest('hex').slice(0,16);
    used.add(helper);
    used.add(helper+'Cache');
    edits.push({start:body[0].argument.start,end:body[0].argument.end,text:helper+'('+param.name+')'});
    helpers.push(interpreterSource(helper,program,entropy));
    accepted++;
    instructions+=program.length;
  }
  if(!accepted)return {code:source,functions:0,instructions:0,declined};
  const code=applyEdits(source,edits)+helpers.join('');
  parse(code,sourceType);
  return {code,functions:accepted,instructions,declined};
}

module.exports={virtualizeRegisterChains};
