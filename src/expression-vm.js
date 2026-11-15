'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {{operator:string,destination:number,left:number,right:number}} Instruction */
/** @typedef {{code:string,functions:number,instructions:number,declined:number}} GraphVmResult */

const OPERATORS=/** @type {Readonly<Record<string,number>>} */ (Object.freeze({
  '+':1,'-':2,'*':3,'/':4,'%':5,'^':6,'&':7,'|':8,'<<':9,'>>':10,'>>>':11
}));

/**
 * Compile a pure binary tree in JavaScript's left-to-right evaluation order.
 * Every register slot is created as an own data property before execution, so
 * inherited Array.prototype setters cannot intercept VM register writes.
 * @param {AstNode} node
 * @param {string} parameter
 * @param {(number|null)[]} initial
 * @param {Instruction[]} instructions
 * @param {number} depth
 * @returns {number|null}
 */
function compileGraph(node,parameter,initial,instructions,depth) {
  if(depth>16||initial.length>=200||instructions.length>=64)return null;
  if(node.type==='Identifier'&&node.name===parameter)return 0;
  if(node.type==='Literal'&&typeof node.value==='number'&&
      Number.isInteger(node.value)&&node.value>=0&&node.value<=255) {
    const register=initial.length;
    initial.push(node.value);
    return register;
  }
  if(node.type!=='BinaryExpression'||!Object.hasOwn(OPERATORS,node.operator))return null;
  const left=compileGraph(node.left,parameter,initial,instructions,depth+1);
  if(left===null)return null;
  const right=compileGraph(node.right,parameter,initial,instructions,depth+1);
  if(right===null||initial.length>=200||instructions.length>=64)return null;
  const destination=initial.length;
  initial.push(null);
  instructions.push({operator:node.operator,destination,left,right});
  return destination;
}

/**
 * Emit a seed-diversified register machine with an interleaved encrypted
 * instruction tape. Each opcode dispatch executes one original native JS
 * binary operator. All tapes and keys are publicly recoverable; this method
 * cannot keep program logic secret from a full-control adversary.
 * @param {string} helper
 * @param {(number|null)[]} initial
 * @param {Instruction[]} instructions
 * @param {number} result
 * @param {Buffer} entropy
 * @returns {string}
 */
function emitGraphHelper(helper,initial,instructions,result,entropy) {
  const rotation=entropy[0];
  const key=entropy[1];
  const literalKey=entropy[2];
  /** @type {number[]} */
  const tape=[];
  for(const step of instructions) {
    tape.push(((OPERATORS[step.operator]+rotation)&255)^key,
      step.destination^key,step.left^key,step.right^key);
  }
  tape.push(((255+rotation)&255)^key,result^key);
  const registers=initial.map((value,index)=>index===0?'input':
    value===null?'null':'('+((value^literalKey)&255)+'^'+literalKey+')');
  const cases=Object.entries(OPERATORS).map(([operator,opcode])=>
    'case '+opcode+':registers[dst]=registers[left]'+operator+'registers[right];break;').join('');
  const cache=helper+'Cache';
  return '\nvar '+cache+';function '+helper+'(input){const tape='+cache+
    '||('+cache+'='+JSON.stringify(tape)+');const registers=['+registers.join(',')+
    '];let pc=0;for(;;){const opcode=((tape[pc++]^'+key+')-'+rotation+
    ')&255;if(opcode===255)return registers[tape[pc++]^'+key+'];'+
    'const dst=tape[pc++]^'+key+',left=tape[pc++]^'+key+
    ',right=tape[pc++]^'+key+';switch(opcode){'+cases+
    'default:throw Error("Invalid expression VM instruction");}}}\n';
}

/**
 * Virtualize explicitly selected single-return expression trees while
 * retaining native JS binary-operator coercion, evaluation order and errors.
 * All leaves must be the one argument or integer literals in 0..255.
 * No property access, function call, assignments or effects are accepted.
 *
 * The caller must establish that no external source/stack inspector observes
 * changed text and must measure its own hot-loop overhead against 2.5x.
 *
 * @param {string} source
 * @param {'module'|'commonjs'} sourceType
 * @param {{seed:string,names:string[]}} options
 * @returns {GraphVmResult}
 */
function virtualizeExpressionGraphs(source,sourceType,options) {
  if(typeof source!=='string'||!['module','commonjs'].includes(sourceType)||
     !options||typeof options.seed!=='string'||!options.seed||
     !Array.isArray(options.names)||options.names.some(name=>typeof name!=='string')) {
    throw new TypeError('Expected source, module type, seed and explicit function names');
  }
  const targets=new Set(options.names);
  if(!targets.size)return {code:source,functions:0,instructions:0,declined:0};
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
  if(dynamic||observesFunctionSource(ast)) {
    return {code:source,functions:0,instructions:0,declined:targets.size};
  }
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
  let functions=0,instructions=0,declined=0;
  for(const name of targets) {
    const matches=candidates.get(name);
    if(!matches||matches.length!==1) {declined++;continue;}
    const fn=matches[0];
    const param=fn.params[0];
    const statements=fn.body.body;
    if(fn.async||fn.generator||fn.params.length!==1||param?.type!=='Identifier'||
       param.name==='arguments'||statements.length!==1||
       statements[0].type!=='ReturnStatement'||!statements[0].argument) {
      declined++;
      continue;
    }
    /** @type {(number|null)[]} */
    const initial=[null];
    /** @type {Instruction[]} */
    const program=[];
    const result=compileGraph(statements[0].argument,param.name,initial,program,0);
    if(result===null||program.length<2) {declined++;continue;}
    const entropy=createHash('sha256').update(options.seed).update('\0')
      .update(name).update('\0').update(source).digest();
    let helper='_egvm_'+entropy.subarray(3,11).toString('hex');
    for(let index=1;used.has(helper)||used.has(helper+'Cache');index++) {
      helper='_egvm_'+createHash('sha256').update(options.seed+'/'+name+'/'+index)
        .digest('hex').slice(0,16);
    }
    used.add(helper);
    used.add(helper+'Cache');
    edits.push({start:statements[0].argument.start,end:statements[0].argument.end,
      text:helper+'('+param.name+')'});
    helpers.push(emitGraphHelper(helper,initial,program,result,entropy));
    functions++;
    instructions+=program.length;
  }
  if(!functions)return {code:source,functions:0,instructions:0,declined};
  const code=applyEdits(source,edits)+helpers.join('');
  parse(code,sourceType);
  return {code,functions,instructions,declined};
}

module.exports={virtualizeExpressionGraphs};
