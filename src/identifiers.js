'use strict';

const {createHash} = require('node:crypto');
const {walk,applyEdits,observesFunctionSource,sourceSpelledErrorOperand} = require('./ast');
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
  if(observesFunctionSource(ast)) return {code:source,bindings:0};
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
  // V8 can embed the original binding spelling in TypeError messages such as
  // "callable is not a function" or "items is not iterable". Catching those
  // errors makes a lexical-only rename observably incorrect. Protect direct
  // callee/tag and iteration-source roots rather than disabling every rename.
  /** @type {Set<string>} */
  const errorSpellingNames=new Set();
  // The identity of a const binding initialized directly to an object literal
  // cannot become nullish. Object-pattern destructuring TypeErrors that name
  // their RHS source arise from null/undefined, so this narrowly proven class
  // can retain identifier mangling without sacrificing the error contract.
  /** @type {Set<string>} */
  const knownNonNullObjects=new Set();
  walk(ast,(node,parent)=>{
    if(node.type==='VariableDeclarator' && node.id.type==='Identifier' &&
        node.init?.type==='ObjectExpression' && parent?.type==='VariableDeclaration' &&
        parent.kind==='const' && counts.get(node.id.name)===1) {
      knownNonNullObjects.add(node.id.name);
    }
  });
  /**
   * V8 may spell an entire callee/iterable expression into a TypeError,
   * including computed keys and subexpressions: e.g.
   * "table[index] is not a function" or
   * "(0 , callback) is not a function". Protect all referenced lexical
   * names inside the operand. Examining only a member's root loses those
   * names even when the generated executable value remains identical.
   * @param {AstNode|null|undefined} expression
   */
  function markErrorRoot(expression) {
    if(!expression)return;
    walk(expression,(node,parent,key)=>{
      if(node.type!=='Identifier')return;
      if(node===expression || classifyIdentifier(node,parent,key)==='reference') {
        errorSpellingNames.add(node.name);
      }
    });
  }
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function derivesBindingName(expression) {
    return Boolean(expression && (expression.type==='ArrowFunctionExpression' ||
      expression.type==='FunctionExpression' && !expression.id ||
      expression.type==='ClassExpression' && !expression.id));
  }
  let dynamic=false;
  walk(ast,(node,parent,key,ancestors)=>{
    if (node.type==='Identifier') identifiers.push({node,parent,key,ancestors});
    const errorOperand=sourceSpelledErrorOperand(node);
    // Object spread accepts nullish sources and does not perform iteration.
    // Keep the existing proven-non-null object-pattern optimization too.
    const sourceSpellingProvenInert=
      node.type==='SpreadElement' && parent?.type==='ObjectExpression' ||
      node.type==='VariableDeclarator' && node.id.type==='ObjectPattern' &&
        node.init?.type==='Identifier' && knownNonNullObjects.has(node.init.name) ||
      node.type==='AssignmentExpression' && node.left.type==='ObjectPattern' &&
        node.right.type==='Identifier' && knownNonNullObjects.has(node.right.name);
    if(errorOperand && !sourceSpellingProvenInert)markErrorRoot(errorOperand);
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
        else if (param.type==='AssignmentPattern' && param.left.type==='Identifier') {
          candidates.push({identifier:param.left,name:param.left.name,scope:node});
        }
      }
    }
  });
  if (dynamic) return {code:source,bindings:0};

  // Native Function.prototype.toString exposes every local identifier in a
  // publicly exported function's body, not just its name or parameter count.
  // Rewriting a parameter inside a public wrapper otherwise changes its
  // externally observable source while preserving its numeric output.
  // This is intentionally a bounded direct-export grammar, not a claim that
  // all indirect exports or runtime-generated callable aliases are proved.
  /** @type {Set<AstNode>} */
  const publicCallables=new Set();
  /** @type {Set<string>} */
  const exportedFunctionNames=new Set();
  /** @type {string[]} */
  const pendingExportedNames=[];
  /** @param {string} name @returns {void} */
  function markExportedName(name){
    if(exportedFunctionNames.has(name))return;
    exportedFunctionNames.add(name);
    pendingExportedNames.push(name);
  }
  /** @param {AstNode|null|undefined} expression @returns {void} */
  function markExportedValue(expression){
    if(!expression)return;
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(expression.type)){
      publicCallables.add(expression);
      return;
    }
    if(expression.type==='Identifier'){
      markExportedName(expression.name);
      return;
    }
    if(expression.type==='ObjectExpression'){
      for(const prop of expression.properties){
        if(prop.type==='Property'&&prop.value)markExportedValue(prop.value);
        // Object spread can publish arbitrary functions through dynamic
        // exports. This narrow analyzer does not infer their source.
      }
    }
  }
  /** @param {AstNode} node @returns {boolean} */
  function isModuleExports(node){
    return node.type==='MemberExpression'&&!node.computed&&
      node.object.type==='Identifier'&&node.object.name==='module'&&
      node.property.type==='Identifier'&&node.property.name==='exports';
  }
  /** @param {AstNode} node @returns {boolean} */
  function isCommonJsExportTarget(node){
    if(node.type==='Identifier')return node.name==='exports';
    if(isModuleExports(node))return true;
    return node.type==='MemberExpression'&&
      (isModuleExports(node.object)||node.object.type==='Identifier'&&
        node.object.name==='exports');
  }
  walk(ast,node=>{
    if(node.type==='ExportNamedDeclaration'&&!node.source){
      const decl=node.declaration;
      if(decl?.type==='FunctionDeclaration')markExportedValue(decl);
      if(decl?.type==='VariableDeclaration'){
        for(const entry of decl.declarations)markExportedValue(entry.init);
      }
      for(const spec of node.specifiers??[]){
        if(spec.type==='ExportSpecifier'&&spec.local.type==='Identifier')
          markExportedName(spec.local.name);
      }
    }
    if(node.type==='ExportDefaultDeclaration')markExportedValue(node.declaration);
    if(node.type==='AssignmentExpression'&&node.operator==='='&&
       isCommonJsExportTarget(node.left))markExportedValue(node.right);
  });
  // An exported function can flow through several immutable top-level
  // aliases, including objects that hold the callable as a data-property
  // value. Resolve the finite exact name graph as a work queue, not a
  // source-order-sensitive single AST walk.
  if(pendingExportedNames.length) {
    /** @type {Map<string,AstNode>} */
    const topLevelValues=new Map();
    for(const statement of ast.body) {
      const declaration=statement.type==='ExportNamedDeclaration'?
        statement.declaration:statement;
      if(declaration?.type==='FunctionDeclaration'&&
         declaration.id?.type==='Identifier') {
        topLevelValues.set(declaration.id.name,declaration);
      }else if(declaration?.type==='VariableDeclaration'){
        for(const item of declaration.declarations) {
          if(item.id.type==='Identifier'&&item.init)
            topLevelValues.set(item.id.name,item.init);
        }
      }
    }
    for(let at=0;at<pendingExportedNames.length;at++){
      const value=topLevelValues.get(pendingExportedNames[at]);
      if(value)markExportedValue(value);
    }
  }
  // Opaque exports can expose callables through mutation, spread,
  // assigning object fields, or runtime value replacement. The name worklist
  // above only reasons about immutable literal aliases. When these dynamic
  // carriers coexist with a syntactic export, we have no complete source
  // visibility proof. Decline identifier rewriting for that file rather than
  // preserve numerics at the cost of an observable native function source.
  let hasExportSyntax=false;
  let hasOpaqueExportFlow=false;
  walk(ast,(node,parent)=>{
    if(['ExportNamedDeclaration','ExportDefaultDeclaration',
      'ExportAllDeclaration'].includes(node.type))hasExportSyntax=true;
    if(node.type==='AssignmentExpression'){
      if(isCommonJsExportTarget(node.left))hasExportSyntax=true;
      else hasOpaqueExportFlow=true;
    }
    if(node.type==='UpdateExpression')hasOpaqueExportFlow=true;
    if(node.type==='VariableDeclaration'&&node.kind!=='const')
      hasOpaqueExportFlow=true;
    if(node.type==='SpreadElement'&&parent?.type==='ObjectExpression')
      hasOpaqueExportFlow=true;
    if(node.type==='CallExpression'&&
       node.callee.type==='MemberExpression'&&
       node.callee.object.type==='Identifier'&&
       node.callee.object.name==='Object'&&
       (node.callee.computed ? node.callee.property.type==='Literal'&&
         node.callee.property.value==='assign':
         node.callee.property.type==='Identifier'&&
         node.callee.property.name==='assign'))
      hasOpaqueExportFlow=true;
  });
  if(hasExportSyntax&&hasOpaqueExportFlow)return {code:source,bindings:0};

  /** @param {AstNode} identifier @returns {boolean} */
  function isPublicSourceIdentifier(identifier) {
    for(const callable of publicCallables){
      if(callable.start<=identifier.start&&identifier.end<=callable.end)return true;
    }
    return false;
  }

  /** @type {import('./ast').Edit[]} */
  const edits=[];
  // A free identifier can be captured by a newly introduced local binding,
  // even if it is spelled with Unicode escapes and absent from source regexes.
  const used=new Set([...counts.keys(),...identifiers.map(item=>item.node.name)]);
  let bindings=0;
  for(const candidate of candidates) {
    const {name,scope,identifier}=candidate;
    if (counts.get(name)!==1 || inferredNames.has(name) || errorSpellingNames.has(name) ||
        isPublicSourceIdentifier(identifier) ||
        ['arguments','eval','require','module','exports','globalThis','window'].includes(name)) continue;
    // TDZ ReferenceError messages expose the original binding spelling.
    // Until a control-flow dominance proof exists, reject a candidate when a
    // reference occurs lexically before the declaration or in its initializer.
    if (identifiers.some(item=>item.node!==identifier && item.node.name===name &&
        classifyIdentifier(item.node,item.parent,item.key)!=='ignore' &&
        (item.node.start < identifier.start || item.ancestors.some(ancestor=>
          (ancestor.type==='VariableDeclarator' && ancestor.id===identifier &&
            ancestor.init && ancestor.init.start<=item.node.start &&
            item.node.end<=ancestor.init.end ||
          ancestor.type==='AssignmentPattern' && ancestor.left===identifier &&
            ancestor.right && ancestor.right.start<=item.node.start &&
            item.node.end<=ancestor.right.end))))) continue;
    // A captured lexical binding can be read by a hoisted closure before
    // its initializer executes, even if the reference is textually later.
    // A thrown ReferenceError then names the binding, so changing its
    // spelling would change observable error.message. Without a
    // cross-function dominance proof, retain closure-captured let/const names.
    if ((scope.type==='BlockStatement'||scope.type==='Program') &&
        identifiers.some(item=>{
          if(item.node===identifier||item.node.name!==name||
             classifyIdentifier(item.node,item.parent,item.key)==='ignore')return false;
          const at=item.ancestors.indexOf(scope);
          return at!==-1 && item.ancestors.slice(at+1).some(ancestor=>
            /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(ancestor.type));
        })) continue;
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
          // Shorthand __proto__ creates an ordinary own data property, while
          // a noncomputed colon property invokes the object-literal prototype
          // setter. Keep the original data-property semantics after expansion.
          const keyText=name==='__proto__'?
            '['+JSON.stringify(name)+']' : JSON.stringify(name);
          local.push({start:item.node.start,end:item.node.end,text:`${keyText}:${replacement}`});
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
