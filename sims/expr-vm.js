'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('../src/ast');

/** @typedef {'module'|'commonjs'} ModuleType */
/** @typedef {{code:string,functions:number,instructions:number,declined:number}} VmResult */
/** @typedef {{op:string,arg?:number|string|boolean|null}} Instruction */

const binaryOperators=new Set([
  '+','-','*','/','%','**','|','&','^','<<','>>','>>>',
  '==','===','!=','!==','<','<=','>','>='
]);
const unaryOperators=new Set(['+','-','!','~','typeof','void']);

/**
 * Compile a deliberately bounded, side-effect-order-preserving expression
 * subset into postfix instructions. Reading plain formal parameters is free
 * of property-getter effects; each JavaScript operator is executed natively by
 * the interpreter after evaluating its own left and right operands.
 *
 * Excludes calls, properties, dynamic branches, writes, object literals,
 * await/yield, contextual this/super and all non-formal identifiers.
 *
 * @param {import('../src/ast').AstNode} expression
 * @param {ReadonlyMap<string,number>} params
 * @param {Instruction[]} output
 * @returns {boolean}
 */
function compileExpression(expression,params,output) {
  if(expression.type==='Identifier') {
    const index=params.get(expression.name);
    if(index===undefined)return false;
    output.push({op:'param',arg:index});
    return true;
  }
  if(expression.type==='Literal' && expression.regex===undefined &&
      expression.bigint===undefined &&
      (expression.value===null || ['number','string','boolean'].includes(typeof expression.value))) {
    output.push({op:'literal',arg:expression.value});
    return true;
  }
  if(expression.type==='UnaryExpression' && expression.prefix &&
      unaryOperators.has(expression.operator)) {
    if(!compileExpression(expression.argument,params,output))return false;
    output.push({op:'unary:'+expression.operator});
    return true;
  }
  if(expression.type==='BinaryExpression'&&binaryOperators.has(expression.operator)) {
    if(!compileExpression(expression.left,params,output) ||
       !compileExpression(expression.right,params,output))return false;
    output.push({op:'binary:'+expression.operator});
    return true;
  }
  return false;
}

/**
 * Create a numeric instruction code for every operation, with a deterministic
 * collision-free remap for this source and seed. The interpreter exposes
 * the semantics, so this is only syntactic diversity, not encryption.
 * @param {string} seed
 * @param {string[]} operationNames
 * @returns {Map<string,number>}
 */
function assignOpcodes(seed,operationNames) {
  const used=new Set();
  const codes=new Map();
  for(const name of operationNames) {
    let id=createHash('sha256').update(seed+'/'+name).digest().readUInt32BE(0);
    while(used.has(id))id=(id+1)>>>0;
    used.add(id);
    codes.set(name,id);
  }
  return codes;
}

/**
 * Generate a declaration-scoped VM interpreter. It is intentionally
 * module-private, so it never adds a classic-script global binding.
 * A first-call bytecode cache avoids rebuilding nested instruction arrays
 * on every invocation; native indexed stacks avoid overridable Array methods.
 * @param {string} helper
 * @param {Map<string,number>} codes
 * @param {(number|string|boolean|null)[][][]} programs
 * @returns {string}
 */
function interpreterSource(helper,codes,programs) {
  const cases=[];
  for(const [name,id] of codes) {
    if(name==='param'){
      cases.push('case '+id+':stack[sp++]=args[inst[1]];break;');
    }else if(name==='literal'){
      cases.push('case '+id+':stack[sp++]=inst[1];break;');
    }else if(name.startsWith('binary:')){
      const op=name.slice('binary:'.length);
      cases.push('case '+id+':{const b=stack[--sp];const a=stack[--sp];stack[sp++]=a '+op+' b;break;}');
    }else if(name.startsWith('unary:')){
      const op=name.slice('unary:'.length);
      cases.push('case '+id+':{const a=stack[--sp];stack[sp++]='+op+
        (op==='typeof'||op==='void'?' ':'')+'a;break;}');
    }
  }
  // The hoisted var and function declaration can be used before their textual
  // occurrence. Lazy cache initialization preserves early function calls.
  return '\nvar '+helper+'Cache;function '+helper+'(index,args){const programs='+
    helper+'Cache||('+helper+'Cache='+JSON.stringify(programs)+');const program=programs[index];'+
    'const stack=[];let sp=0;for(let pc=0;pc<program.length;pc++){const inst=program[pc];switch(inst[0]){'+
    cases.join('')+'}}return stack[sp-1];}\n';
}

/**
 * Experimental opt-in VM virtualization of expression-only declarations.
 * This prototype intentionally does NOT enter the production pipeline:
 * interpreter hot paths may violate the project's 2.5x runtime ceiling.
 *
 * A function must be explicitly selected by name, have only plain formal
 * parameters, consist of one return expression, and use the supported
 * expression subset. Source-observing and dynamic-scope files are declined.
 *
 * @param {string} source
 * @param {ModuleType} sourceType
 * @param {{seed:string,names:string[]}} options
 * @returns {VmResult}
 */
function virtualizeExpressionFunctions(source,sourceType,options) {
  if(typeof source!=='string'||!['module','commonjs'].includes(sourceType)||
      !options||typeof options.seed!=='string'||!options.seed||
      !Array.isArray(options.names)||options.names.some(name=>typeof name!=='string')) {
    throw new TypeError('Expected source, module type, seed and explicit target function names');
  }
  const selected=new Set(options.names);
  if(!selected.size)return {code:source,functions:0,instructions:0,declined:0};
  const ast=parse(source,sourceType);
  let dynamic=false;
  const allNames=new Set();
  walk(ast,node=>{
    if(node.type==='Identifier')allNames.add(node.name);
    if(node.type==='WithStatement' ||
        node.type==='CallExpression' && node.callee.type==='Identifier' && node.callee.name==='eval') dynamic=true;
  });
  if(observesFunctionSource(ast)||dynamic)return {
    code:source,functions:0,instructions:0,declined:selected.size
  };
  /** @type {{start:number,end:number,program:Instruction[],params:string[]}[]} */
  const accepted=[];
  let declined=0;
  const functions=/** @type {import('../src/ast').AstNode[]} */ (ast.body).map(statement=>
    statement.type==='ExportNamedDeclaration'&&statement.declaration ? statement.declaration : statement);
  for(const fn of functions) {
    if(fn.type!=='FunctionDeclaration'||!fn.id||!selected.has(fn.id.name))continue;
    const validParams=fn.params.every((/** @type {import('../src/ast').AstNode} */ p)=>p.type==='Identifier');
    const params=fn.params.map((/** @type {import('../src/ast').AstNode} */ p)=>p.name);
    const body=fn.body.body;
    if(fn.async||fn.generator||!validParams||new Set(params).size!==params.length||
       params.some((/** @type {string} */ name)=>name==='arguments'||name==='eval')||
       body.length!==1||body[0].type!=='ReturnStatement'||!body[0].argument) {
      declined++;
      continue;
    }
    /** @type {Instruction[]} */
    const program=[];
    const positions=new Map(params.map((/** @type {string} */ name,/** @type {number} */ i)=>[name,i]));
    if(!compileExpression(body[0].argument,positions,program)) {
      declined++;
      continue;
    }
    accepted.push({start:body[0].argument.start,end:body[0].argument.end,program,params});
  }
  if(!accepted.length)return {code:source,functions:0,instructions:0,declined};
  let helper='_vm_'+createHash('sha256').update(options.seed+'/'+source).digest('hex').slice(0,16);
  for(let index=1;allNames.has(helper)||allNames.has(helper+'Cache');index++)helper='_vm_'+
    createHash('sha256').update(options.seed+'/'+source+'/'+index).digest('hex').slice(0,16);
  const operations=[...new Set(accepted.flatMap(item=>item.program.map(inst=>inst.op)))].sort();
  const codes=assignOpcodes(options.seed+'/'+helper,operations);
  const compiledPrograms=accepted.map(item=>item.program.map(inst=>
    inst.arg===undefined ? [/** @type {number} */ (codes.get(inst.op))] :
      [/** @type {number} */ (codes.get(inst.op)),inst.arg]));
  const edits=accepted.map((item,index)=>({
    start:item.start,end:item.end,text:helper+'('+index+',arguments)'
  }));
  const transformed=applyEdits(source,edits)+interpreterSource(helper,codes,compiledPrograms);
  parse(transformed,sourceType);
  return {code:transformed,functions:accepted.length,
    instructions:accepted.reduce((n,item)=>n+item.program.length,0),declined};
}

module.exports={virtualizeExpressionFunctions};
