'use strict';

const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,observesFunctionSource}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {{kind:'next',code:string,next:number}|{kind:'test',code:string,yes:number,no:number}|{kind:'return',code:string}|{kind:'throw',code:string}} FlowBlock */
/** @typedef {{code:string,functions:number,blocks:number,declined:number}} StatementFlowResult */

/**
 * Turn a restricted function body into a native-JavaScript control-flow graph.
 * Var declarations, expressions, if/else, returns and throws are movable.
 * Whole loops, switches and try/catch/finally statements may stay intact as
 * atomic blocks: their nested lexical scopes, labels and abrupt completion
 * behavior remain inside the original syntax. No outside lexical declaration,
 * direct eval or unproved control transfer is moved. Function-scoped var
 * declarations retain their original hoisting across switch cases.
 * Every condition and statement is evaluated in its original execution order.
 *
 * @param {AstNode[]} statements
 * @param {number} next
 * @param {FlowBlock[]} blocks
 * @param {string} source
 * @param {number} depth
 * @returns {number|null}
 */
function buildFlow(statements,next,blocks,source,depth=0) {
  if(depth>32||blocks.length>256)return null;
  for(let i=statements.length-1;i>=0;i--){
    const statement=statements[i];
    if(statement.type==='EmptyStatement')continue;
    if(statement.type==='BlockStatement'){
      const start=buildFlow(statement.body,next,blocks,source,depth+1);
      if(start===null)return null;
      next=start;
      continue;
    }
    if(statement.type==='IfStatement'){
      const yes=buildFlow(
        statement.consequent.type==='BlockStatement'?statement.consequent.body:[statement.consequent],
        next,blocks,source,depth+1);
      if(yes===null)return null;
      const no=statement.alternate ? buildFlow(
        statement.alternate.type==='BlockStatement'?statement.alternate.body:[statement.alternate],
        next,blocks,source,depth+1) : next;
      if(no===null)return null;
      if(blocks.length>=256)return null;
      const index=blocks.length;
      blocks.push({kind:'test',code:source.slice(statement.test.start,statement.test.end),yes,no});
      next=index;
      continue;
    }
    // Loops, nested switches and exception handlers remain native as a single
    // statement. Their own break/continue targets, block bindings and finally
    // unwinding keep their original syntax and evaluation scope.
    const atomic=new Set(['ForStatement','ForInStatement','ForOfStatement',
      'WhileStatement','DoWhileStatement','SwitchStatement','TryStatement',
      'LabeledStatement']);
    if(!['ExpressionStatement','VariableDeclaration','ReturnStatement','ThrowStatement'].includes(statement.type)&&
       !atomic.has(statement.type))return null;
    if(statement.type==='VariableDeclaration'&&statement.kind!=='var')return null;
    if(statement.type==='ExpressionStatement'&&statement.directive)return null;
    if(blocks.length>=256)return null;
    const index=blocks.length;
    const code=source.slice(statement.start,statement.end);
    if(statement.type==='ReturnStatement')blocks.push({kind:'return',code});
    else if(statement.type==='ThrowStatement')blocks.push({kind:'throw',code});
    else blocks.push({kind:'next',code,next});
    next=index;
  }
  return next;
}

/**
 * Emit shuffled case bodies with per-build randomized state identifiers.
 * Public state constants and native conditions are intentionally not secret;
 * this is a control-flow hiding experiment, not an authorization boundary.
 * @param {FlowBlock[]} blocks
 * @param {number} entry
 * @param {string[]} directives
 * @param {string} name
 * @param {string} seed
 * @param {Set<string>} used
 * @returns {string}
 */
function emitFlow(blocks,entry,directives,name,seed,used){
  const hash=/** @param {string} label @returns {Buffer} */ label=>
    createHash('sha256').update(seed).update('\0').update(name).update('\0').update(label).digest();
  let collision=0;
  let state;
  do{state='_sf_'+hash('local/'+collision++).subarray(0,8).toString('hex');}
  while(used.has(state));
  used.add(state);
  /** @type {number[]} */
  const ids=[];
  const taken=new Set();
  for(let i=0;i<blocks.length+1;i++){
    let suffix=0;
    let id=hash('state/'+i+'/'+suffix).readUInt32LE(0);
    while(taken.has(id))id=hash('state/'+i+'/'+(++suffix)).readUInt32LE(0);
    taken.add(id);
    ids.push(id);
  }
  const exit=ids[blocks.length];
  /** @param {number} index @returns {number} */
  const destination=index=>index===-1?exit:ids[index];
  const shuffled=blocks.map((block,index)=>({block,index})).sort((a,b)=>
    hash('order/'+a.index).readUInt32LE(0)-hash('order/'+b.index).readUInt32LE(0));
  let body='{'+directives.join('')+'let '+state+'='+destination(entry)+';for(;;){switch('+state+'){';
  for(const {block,index} of shuffled){
    body+='case '+ids[index]+':{';
    if(block.kind==='test')body+=state+'=(('+block.code+')?'+destination(block.yes)+':'+destination(block.no)+');break;';
    else if(block.kind==='next')body+=block.code+';'+state+'='+destination(block.next)+';break;';
    else body+=block.code+';';
    body+='}';
  }
  return body+'case '+exit+':return;default:throw Error("Invalid control-flow state");}}}';
}

/**
 * Opt-in flattened native-JavaScript control flow for top-level functions
 * containing ordinary multi-statement if/else trees. The transformation
 * preserves tested observable values, side effects and coercion order; it
 * changes function source text, stack positions and JIT profile. Callers must
 * prove that those differences are unobserved and profile the 2.5x budget.
 *
 * @param {string} source
 * @param {'module'|'commonjs'} sourceType
 * @param {{seed:string,names:string[]}} options
 * @returns {StatementFlowResult}
 */
function flattenStatementFlow(source,sourceType,options){
  if(typeof source!=='string'||!['module','commonjs'].includes(sourceType)||
     !options||typeof options.seed!=='string'||!options.seed||
     !Array.isArray(options.names)||options.names.some(name=>typeof name!=='string')){
    throw new TypeError('Expected source, module type, seed and explicit function names');
  }
  const targets=new Set(options.names);
  if(!targets.size)return {code:source,functions:0,blocks:0,declined:0};
  const ast=parse(source,sourceType);
  const used=new Set();
  let unsafe=false;
  walk(ast,node=>{
    if(node.type==='Identifier'){
      used.add(node.name);
      if(node.name==='eval')unsafe=true;
    }
    if(node.type==='WithStatement')unsafe=true;
  });
  if(unsafe||observesFunctionSource(ast))return {
    code:source,functions:0,blocks:0,declined:targets.size
  };
  /** @type {Map<string,AstNode[]>} */
  const candidates=new Map();
  for(const statement of ast.body){
    const fn=statement.type==='ExportNamedDeclaration'&&statement.declaration?
      statement.declaration:statement;
    if(fn.type!=='FunctionDeclaration'||!fn.id||!targets.has(fn.id.name))continue;
    const previous=candidates.get(fn.id.name)??[];
    previous.push(fn);
    candidates.set(fn.id.name,previous);
  }
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  let functions=0,blocksCount=0,declined=0;
  for(const name of targets){
    const matching=candidates.get(name);
    if(!matching||matching.length!==1){declined++;continue;}
    const fn=matching[0];
    if(fn.async||fn.generator){declined++;continue;}
    /** @type {string[]} */
    const directives=[];
    let first=0;
    while(first<fn.body.body.length&&fn.body.body[first].directive){
      const stmt=fn.body.body[first++];
      directives.push(source.slice(stmt.start,stmt.end)+';');
    }
    /** @type {FlowBlock[]} */
    const blocks=[];
    const entry=buildFlow(fn.body.body.slice(first),-1,blocks,source);
    // Control-flow flattening of straight-line code does not justify overhead.
    if(entry===null||!blocks.some(block=>block.kind==='test')||blocks.length<4){declined++;continue;}
    const code=emitFlow(blocks,entry,directives,name,options.seed,used);
    edits.push({start:fn.body.start,end:fn.body.end,text:code});
    functions++;
    blocksCount+=blocks.length;
  }
  if(!functions)return {code:source,functions:0,blocks:0,declined};
  const code=applyEdits(source,edits);
  parse(code,sourceType);
  return {code,functions,blocks:blocksCount,declined};
}

module.exports={flattenStatementFlow};
