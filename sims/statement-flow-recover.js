'use strict';

const {parse}=require('../src/ast');

/** @typedef {import('../src/ast').AstNode} AstNode */

/**
 * Recover ordinary if/else source from the public control-flow dispatcher.
 * No seed or compiler internals are supplied. This demonstration targets the
 * known experimental emitter and is independent of its randomized labels.
 * @param {string} source
 * @param {string} functionName
 * @param {'commonjs'|'module'} [sourceType]
 * @returns {{code:string,blocks:number}}
 */
function recoverStatementFlow(source,functionName,sourceType='commonjs'){
  const ast=parse(source,sourceType);
  const wrapper=ast.body.find((/** @type {AstNode} */ stmt)=>
    (stmt.type==='FunctionDeclaration'&&stmt.id?.name===functionName)||
    (stmt.type==='ExportNamedDeclaration'&&stmt.declaration?.type==='FunctionDeclaration'&&
      stmt.declaration.id?.name===functionName));
  const fn=wrapper?.type==='ExportNamedDeclaration'?wrapper.declaration:wrapper;
  if(!fn||fn.type!=='FunctionDeclaration')throw new TypeError('Public function not found');
  const forLoop=fn.body.body.find((/** @type {AstNode} */ stmt)=>stmt.type==='ForStatement'&&stmt.body.type==='BlockStatement');
  if(!forLoop||forLoop.body.body.length!==1||forLoop.body.body[0].type!=='SwitchStatement'){
    throw new TypeError('No native switch dispatcher found');
  }
  const sw=forLoop.body.body[0];
  if(sw.discriminant.type!=='Identifier')throw new TypeError('Unknown dispatcher');
  const state=sw.discriminant.name;
  const initialize=fn.body.body.find((/** @type {AstNode} */ stmt)=>stmt.type==='VariableDeclaration'&&
    stmt.declarations.some((/** @type {AstNode} */ d)=>d.id.type==='Identifier'&&d.id.name===state));
  if(!initialize)throw new TypeError('No entry state found');
  const entry=initialize.declarations.find((/** @type {AstNode} */ d)=>d.id.name===state)?.init;
  if(entry?.type!=='Literal'||typeof entry.value!=='number')throw new TypeError('Invalid entry');
  /** @type {Map<number,{kind:string,code:string,yes?:number,no?:number,next?:number,prefix?:string}>} */
  const blocks=new Map();
  for(const item of sw.cases){
    if(item.test?.type!=='Literal'||typeof item.test.value!=='number')continue;
    if(item.consequent.length===1&&item.consequent[0].type==='ReturnStatement'){
      blocks.set(item.test.value,{kind:'exit',code:'return;'});continue;
    }
    const inner=item.consequent[0];
    if(inner?.type!=='BlockStatement')throw new TypeError('Unsupported case form');
    // The emitter adds semicolons after complete source statements; remove
    // parsed empty statements before locating a terminal return or jump.
    const statements=inner.body.filter((/** @type {AstNode} */ stmt)=>stmt.type!=='EmptyStatement');
    /** @param {AstNode} node @returns {string} */
    const statementCode=node=>{const text=source.slice(node.start,node.end);return /;\s*$/u.test(text)?text:text+';';};
    const penultimate=statements[statements.length-2];
    const terminator=statements[statements.length-1];
    if(terminator?.type==='ReturnStatement'||terminator?.type==='ThrowStatement'){
      blocks.set(item.test.value,{kind:'terminal',code:statements.map(statementCode).join('\n')});
      continue;
    }
    if(terminator?.type!=='BreakStatement'||penultimate?.type!=='ExpressionStatement'||
       penultimate.expression.type!=='AssignmentExpression'||
       penultimate.expression.left.name!==state)throw new TypeError('Unsupported case transition');
    const value=penultimate.expression.right;
    if(value.type==='ConditionalExpression'){
      if(value.consequent.type!=='Literal'||value.alternate.type!=='Literal')throw new TypeError('Unknown test state');
      blocks.set(item.test.value,{kind:'test',code:source.slice(value.test.start,value.test.end),
        prefix:statements.slice(0,-2).map(statementCode).join('\n'),
        yes:value.consequent.value,no:value.alternate.value});
    }else if(value.type==='Literal'){
      blocks.set(item.test.value,{kind:'next',code:statements.slice(0,-2).map((/** @type {AstNode} */ stmt)=>
        statementCode(stmt)).join('\n'),next:value.value});
    }else throw new TypeError('Unsupported transition');
  }
  /** @param {number} stateId @param {number} depth @returns {string} */
  function visit(stateId,depth){
    if(depth>512)throw new TypeError('Unbounded or cyclic CFG');
    const block=blocks.get(stateId);
    if(!block)throw new TypeError('Unrecognized state');
    if(block.kind==='exit'||block.kind==='terminal')return block.code;
    if(block.kind==='next')return block.code+'\n'+visit(/** @type {number} */(block.next),depth+1);
    return (block.prefix?block.prefix+'\n':'')+'if('+block.code+'){' +
      visit(/** @type {number} */(block.yes),depth+1) +
      '}else{' + visit(/** @type {number} */(block.no),depth+1) + '}';
  }
  const params=fn.params.map((/** @type {AstNode} */ param)=>source.slice(param.start,param.end)).join(',');
  const directives=fn.body.body.filter((/** @type {AstNode} */ stmt)=>stmt.directive).map((/** @type {AstNode} */ stmt)=>
    source.slice(stmt.start,stmt.end)+';').join('');
  const code=(wrapper.type==='ExportNamedDeclaration'?'export ':'')+'function '+functionName+
    '('+params+'){'+directives+visit(entry.value,0)+'}';
  parse(code,sourceType);
  return {code,blocks:blocks.size};
}

module.exports={recoverStatementFlow};
