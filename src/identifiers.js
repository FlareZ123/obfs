'use strict';

const {createHash} = require('node:crypto');
const {walk,applyEdits} = require('./ast');
const {collectBindings} = require('./properties');

/** @typedef {import('./ast').AstNode} AstNode */

/**
 * The narrowed renamer only resolves bindings with a globally unique name,
 * and only when every reference is visibly enclosed by the correct lexical
 * scope. In particular, it refuses JS's dynamic scope forms (eval/with).
 * @param {AstNode} node
 * @param {AstNode|null} parent
 * @param {string|null} key
 * @returns {'reference'|'ignore'|'shorthand'|'ambiguous'}
 */
function classifyIdentifier(node,parent,key) {
  if (!parent) return 'ignore';
  if (parent.type==='Property') {
    if (parent.shorthand && !parent.computed) return 'shorthand';
    if (key==='key' && !parent.computed) return 'ignore';
  }
  if (parent.type==='MemberExpression' && key==='property' && !parent.computed) return 'ignore';
  if ((parent.type==='MethodDefinition'||parent.type==='PropertyDefinition') && key==='key' && !parent.computed) return 'ignore';
  if (/^(ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier)$/.test(parent.type)) return 'ignore';
  if (/^(ExportSpecifier|ExportDefaultDeclaration)$/.test(parent.type)) return 'ambiguous';
  if (parent.type==='MetaProperty' || parent.type==='LabeledStatement' && key==='label' ||
      /^(BreakStatement|ContinueStatement)$/.test(parent.type) && key==='label') return 'ignore';
  if (parent.type==='VariableDeclarator' && key==='id') return 'ignore';
  if (/^(FunctionDeclaration|FunctionExpression|ClassDeclaration|ClassExpression)$/.test(parent.type) && key==='id') return 'ignore';
  if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(parent.type) && key==='params') return 'ignore';
  if (parent.type==='CatchClause' && key==='param') return 'ignore';
  return 'reference';
}

/**
 * @param {string} source
 * @param {AstNode} ast
 * @param {{seed:string,sourceType:'script'|'module'|'commonjs'}} options
 * @returns {{code:string,bindings:number}}
 */
function renameLocalIdentifiers(source,ast,options) {
  const counts=collectBindings(ast);
  /** @type {{identifier:AstNode,name:string,scope:AstNode}[]} */
  const candidates=[];
  /** @type {{node:AstNode,parent:AstNode|null,key:string|null,ancestors:AstNode[]}[]} */
  const identifiers=[];
  // Anonymous function/arrow/class expressions receive the assignment target's
  // name through NamedEvaluation. Mangling that binding changes observable
  // .name even when every lexical reference is rewritten correctly.
  /** @type {Set<string>} */
  const inferredNames=new Set();
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function derivesBindingName(expression) {
    return Boolean(expression && (expression.type==='ArrowFunctionExpression' ||
      expression.type==='FunctionExpression' && !expression.id ||
      expression.type==='ClassExpression' && !expression.id));
  }
  let dynamic=false;
  walk(ast,(node,parent,key,ancestors)=>{
    if (node.type==='Identifier') identifiers.push({node,parent,key,ancestors});
    if (node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
        derivesBindingName(node.init)) inferredNames.add(node.id.name);
    if (node.type==='AssignmentExpression' && node.left.type==='Identifier' &&
        derivesBindingName(node.right)) inferredNames.add(node.left.name);
    // A destructuring default like [name = () => {}] also infers 'name'.
    if (node.type==='AssignmentPattern' && node.left.type==='Identifier' &&
        derivesBindingName(node.right)) inferredNames.add(node.left.name);
    if (node.type==='WithStatement' || node.type==='CallExpression' && node.callee.type==='Identifier' && node.callee.name==='eval') dynamic=true;
    if (node.type==='VariableDeclaration' && (node.kind==='const'||node.kind==='let') &&
        (parent?.type==='BlockStatement'||parent?.type==='Program') &&
        !ancestors.some(a=>/^Export/.test(a.type))) {
      const scope=parent;
      if (scope.type==='Program' && options.sourceType==='script') return;
      for(const dec of node.declarations) {
        if(dec.id.type==='Identifier') candidates.push({identifier:dec.id,name:dec.id.name,scope});
      }
    }
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
      for(const param of node.params) {
        if (param.type==='Identifier') candidates.push({identifier:param,name:param.name,scope:node});
      }
    }
  });
  if (dynamic) return {code:source,bindings:0};
  /** @type {import('./ast').Edit[]} */
  const edits=[];
  // A free identifier can be captured by a newly introduced local binding,
  // even if it is spelled with Unicode escapes and absent from source regexes.
  const used=new Set([...counts.keys(),...identifiers.map(item=>item.node.name)]);
  let bindings=0;
  for(const candidate of candidates) {
    const {name,scope,identifier}=candidate;
    if (counts.get(name)!==1 || inferredNames.has(name) ||
        ['arguments','eval','require','module','exports','globalThis','window'].includes(name)) continue;
    // TDZ ReferenceError messages expose the original binding spelling.
    // Until a control-flow dominance proof exists, reject a candidate when a
    // reference occurs lexically before the declaration or in its initializer.
    if (identifiers.some(item=>item.node!==identifier && item.node.name===name &&
        (item.node.start < identifier.start || item.ancestors.some(ancestor=>
          ancestor.type==='VariableDeclarator' && ancestor.id===identifier &&
          ancestor.init && ancestor.init.start<=item.node.start &&
          item.node.end<=ancestor.init.end)))) continue;
    /** @type {import('./ast').Edit[]} */
    const local=[];
    let safe=true;
    const checksum=createHash('sha256').update(`${options.seed}/${identifier.start}/${name}`).digest('hex');
    let replacement='';
    for(let n=0;n<12;n++) {
      const proposed=`_v${checksum.slice(n,n+12)}`;
      if (!used.has(proposed) && !new RegExp(`\\b${proposed}\\b`,'u').test(source)) {
        replacement=proposed;
        break;
      }
    }
    if (!replacement) continue;
    /** @type {Set<string>} */
    const shorthandSpans=new Set();
    for(const item of identifiers) {
      if(item.node.name!==name) continue;
      if (item.node===identifier) {
        local.push({start:identifier.start,end:identifier.end,text:replacement});
        continue;
      }
      const role=classifyIdentifier(item.node,item.parent,item.key);
      if(role==='ignore') continue;
      if(role==='ambiguous' || !item.ancestors.includes(scope) ||
          item.ancestors.some(a=>a.type==='ObjectPattern')) {safe=false;break;}
      if(role==='shorthand') {
        const parent=item.parent;
        if(parent?.type!=='Property' || !item.ancestors.some(a=>a.type==='ObjectExpression')) {safe=false;break;}
        const span=`${item.node.start}:${item.node.end}`;
        if(!shorthandSpans.has(span)) {
          local.push({start:item.node.start,end:item.node.end,text:`${JSON.stringify(name)}:${replacement}`});
          shorthandSpans.add(span);
        }
        continue;
      }
      local.push({start:item.node.start,end:item.node.end,text:replacement});
    }
    if(!safe) continue;
    used.add(replacement);
    bindings++;
    edits.push(...local);
  }
  return {code:applyEdits(source,edits),bindings};
}

module.exports={renameLocalIdentifiers};
