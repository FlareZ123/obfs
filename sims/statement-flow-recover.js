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
  // A named ESM export may expose a local dispatcher under another public
  // name. Recover that local function solely from the delivered export map.
  // Reexports with a source module are out of this single-file attack scope.
  let localName=functionName;
  let exportClause='';
  if(sourceType==='module'){
    for(const statement of ast.body){
      if(statement.type!=='ExportNamedDeclaration'||statement.source||
         statement.declaration)continue;
      for(const specifier of statement.specifiers){
        if(specifier.type!=='ExportSpecifier'||
           specifier.local.type!=='Identifier')continue;
        const published=specifier.exported.name??specifier.exported.value;
        if(published!==functionName)continue;
        if(exportClause)throw new TypeError('Ambiguous public export');
        localName=specifier.local.name;
        exportClause='export {'+localName+' as '+
          source.slice(specifier.exported.start,specifier.exported.end)+'};';
      }
    }
  }
  const wrapper=ast.body.find((/** @type {AstNode} */ stmt)=>
    (stmt.type==='FunctionDeclaration'&&stmt.id?.name===localName)||
    (stmt.type==='ExportNamedDeclaration'&&stmt.declaration?.type==='FunctionDeclaration'&&
      stmt.declaration.id?.name===localName));
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
  // A shared suffix should appear once in recovered source. Naive recursion
  // duplicates it on both arms and grows exponentially across diamonds.
  const END=-1;
  /** @type {Map<number,Set<number>>} */
  const reachMemo=new Map();
  /** @param {number} id @returns {Set<number>} */
  function reachable(id){
    if(id===END)return new Set([END]);
    const cached=reachMemo.get(id);
    if(cached)return cached;
    const block=blocks.get(id);
    if(!block)throw new TypeError('Unrecognized state');
    const all=new Set([id]);
    reachMemo.set(id,all);
    if(block.kind==='next'){
      for(const next of reachable(/** @type {number} */(block.next)))all.add(next);
    }else if(block.kind==='test'){
      for(const next of reachable(/** @type {number} */(block.yes)))all.add(next);
      for(const next of reachable(/** @type {number} */(block.no)))all.add(next);
    }else all.add(END);
    return all;
  }
  /** @param {number} yes @param {number} no @returns {number} */
  function commonJoin(yes,no){
    const right=reachable(no);
    const shared=[...reachable(yes)].filter(id=>id!==END&&right.has(id));
    for(const candidate of shared){
      if(shared.every(id=>id===candidate||reachable(candidate).has(id)))
        return candidate;
    }
    return END;
  }
  /**
   * Stop each arm before its first shared successor. Early terminal blocks
   * still end the arm, preserving native return and throw behavior.
   * @param {number} start
   * @param {number} stop
   * @param {number} depth
   * @returns {string}
   */
  function visitUntil(start,stop,depth){
    let current=start;
    let output='';
    while(current!==stop){
      if(++depth>blocks.size*3+4)throw new TypeError('Unbounded or cyclic CFG');
      const block=blocks.get(current);
      if(!block)throw new TypeError('Unrecognized state');
      if(block.kind==='exit'||block.kind==='terminal'){
        output+=block.code;
        break;
      }
      if(block.kind==='next'){
        output+=block.code+'\n';
        current=/** @type {number} */(block.next);
        continue;
      }
      let join=commonJoin(/** @type {number} */(block.yes),
        /** @type {number} */(block.no));
      // An enclosing branch can already define the join. One inner arm
      // may return early while the other must stop at that outer boundary.
      if(stop!==END&&(join===END||!reachable(join).has(stop)))join=stop;
      output+=(block.prefix?block.prefix+'\n':'')+'if('+block.code+'){' +
        visitUntil(/** @type {number} */(block.yes),join,depth+1) +
        '}else{' + visitUntil(/** @type {number} */(block.no),join,depth+1) + '}';
      if(join===END)break;
      current=join;
    }
    return output;
  }
  const params=fn.params.map((/** @type {AstNode} */ param)=>source.slice(param.start,param.end)).join(',');
  const directives=fn.body.body.filter((/** @type {AstNode} */ stmt)=>stmt.directive).map((/** @type {AstNode} */ stmt)=>
    source.slice(stmt.start,stmt.end)+';').join('');
  const code=(wrapper.type==='ExportNamedDeclaration'?'export ':'')+'function '+localName+
    '('+params+'){'+directives+visitUntil(entry.value,END,0)+'}'+exportClause;
  parse(code,sourceType);
  return {code,blocks:blocks.size};
}

module.exports={recoverStatementFlow};
