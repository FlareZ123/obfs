'use strict';

const path=require('node:path');
const {parse,walk,applyEdits,observesFunctionSource,observesDistributedSource}=require('../src/ast');
const {safePath}=require('../src/core');

/** @typedef {import('../src/ast').AstNode} AstNode */
/** @typedef {{path:string,code:string,sourceType:'module'}} EsmFile */
/** @typedef {{entryOnlyReviewed:boolean}} CollapsePolicy */

/**
 * Experimental compiler front end for a narrow, reviewer-approved ESM package:
 * one private, side-effect-free leaf whose exported const/function bindings
 * are exclusively imported by one entry. Output is one entry module.
 *
 * This is deliberately not a general ESM bundler. Exact URL/source-location,
 * import.meta, Error.stack, host-induced source inspection, and external import
 * of the private file are outside the caller-reviewed entry-only contract.
 * Ambiguous module graphs or lexical collisions are rejected up front.
 *
 * @param {EsmFile} leaf
 * @param {EsmFile} entry
 * @param {CollapsePolicy} policy
 * @returns {EsmFile}
 */
function collapsePrivateLeaf(leaf,entry,policy){
  if(!policy||policy.entryOnlyReviewed!==true)
    throw new TypeError('Entry-only public module contract must be independently reviewed');
  if(leaf.sourceType!=='module'||entry.sourceType!=='module'||
     typeof leaf.code!=='string'||typeof entry.code!=='string')
    throw new TypeError('Expected two reviewed text ESM sources');
  if(safePath(leaf.path)!==leaf.path||safePath(entry.path)!==entry.path||
     !leaf.path.endsWith('.mjs')||!entry.path.endsWith('.mjs')||
     leaf.path===entry.path)
    throw new TypeError('Expected distinct .mjs paths');

  const leafAst=parse(leaf.code,'module');
  const entryAst=parse(entry.code,'module');
  if(observesFunctionSource(leafAst)||observesFunctionSource(entryAst)||
     observesDistributedSource(leafAst)||observesDistributedSource(entryAst))
    throw new TypeError('Local module graph may observe executable source');
  const imports=entryAst.body.filter((/** @type {AstNode} */ node)=>node.type==='ImportDeclaration');
  if(imports.length!==1)throw new TypeError('Expected exactly one direct ESM import');
  const imp=imports[0];
  const specifier=imp.source?.value;
  if(typeof specifier!=='string'||!/^\.\/[a-zA-Z0-9_./-]+\.mjs$/u.test(specifier))
    throw new TypeError('Private leaf specifier must be a canonical relative .mjs');
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(entry.path),specifier));
  if(resolved!==leaf.path)throw new TypeError('Private import must resolve to the supplied leaf');
  if(!imp.specifiers.length||imp.specifiers.some((/** @type {AstNode} */ spec)=>
    spec.type!=='ImportSpecifier'||spec.local?.type!=='Identifier'||
    spec.imported?.type!=='Identifier'||spec.local.name!==spec.imported.name))
    throw new TypeError('Only unaliased named imports are supported');

  /** @type {Set<string>} */
  const importsByName=new Set(imp.specifiers.map((/** @type {AstNode} */ spec)=>spec.local.name));
  /** @type {Set<string>} */
  const leafDecls=new Set();
  /** @type {Map<string,Set<string>>} */
  const numericOwners=new Map();
  /** @type {AstNode[]} */
  const readerDeclarations=[];
  /** @type {{start:number,end:number,text:string}[]} */
  const prefixEdits=[];
  for(const node of leafAst.body){
    if(node.type==='EmptyStatement')continue;
    if(node.type!=='ExportNamedDeclaration'||!node.declaration||
       node.specifiers.length||node.source)
      throw new TypeError('Private module may only contain direct exported declarations');
    const decl=node.declaration;
    if(decl.type==='VariableDeclaration') {
      if(decl.kind!=='const'||decl.declarations.some((/** @type {AstNode} */ item)=>
        item.id?.type!=='Identifier'||item.init?.type!=='ObjectExpression'||
        item.init.properties.some((/** @type {AstNode} */ property)=>
          property.type!=='Property'||property.computed||property.method||
          property.kind!=='init'||property.key?.type!=='Identifier'||
          property.key.name==='__proto__'||property.value?.type!=='Literal'||
          typeof property.value.value!=='number'||!Number.isFinite(property.value.value))))
        throw new TypeError('Private state must be const primitive-only object records');
      for(const d of decl.declarations){
        leafDecls.add(d.id.name);
        numericOwners.set(d.id.name,new Set(d.init.properties.map((/** @type {AstNode} */ p)=>p.key.name)));
      }
    }else if(decl.type==='FunctionDeclaration'){
      if(!decl.id||decl.async||decl.generator)
        throw new TypeError('Only synchronous named private readers are supported');
      leafDecls.add(decl.id.name);
      readerDeclarations.push(decl);
    }else throw new TypeError('Unsupported private declaration');
    prefixEdits.push({start:node.start,end:decl.start,text:''});
  }
  if(leafDecls.size===0||!Array.from(importsByName).every(name=>leafDecls.has(name)))
    throw new TypeError('Every entry import must be defined by the private leaf');
  // Private readers have intentionally tiny, provably side-effect-free bodies.
  // This excludes native callbacks, exceptions, stack/source reads and writes,
  // which are impossible to preserve under general module-file relocation.
  /** @param {AstNode|null|undefined} expression @returns {boolean} */
  function pureNumericExpression(expression){
    if(!expression)return false;
    if(expression.type==='Literal')return typeof expression.value==='number'&&Number.isFinite(expression.value);
    if(expression.type==='BinaryExpression')return ['+','-','*','/','%','**'].includes(expression.operator)&&
      pureNumericExpression(expression.left)&&pureNumericExpression(expression.right);
    if(expression.type==='MemberExpression'&&!expression.computed&&
       expression.object.type==='Identifier'&&expression.property.type==='Identifier')
      return numericOwners.get(expression.object.name)?.has(expression.property.name)===true;
    return false;
  }
  if(!readerDeclarations.length||readerDeclarations.some(fn=>
    fn.params.length!==0||fn.body?.body?.length!==1||
    fn.body.body[0].type!=='ReturnStatement'||
    !pureNumericExpression(fn.body.body[0].argument)))
    throw new TypeError('Only pure zero-argument numeric private readers are supported');

  // Reject private module meta, dynamic imports, and hidden module loaders.
  let unusual=false;
  walk(leafAst,node=>{
    if(['ImportExpression','MetaProperty','AwaitExpression','WithStatement'].includes(node.type)||
       node.type==='Identifier'&&['eval','Function','AsyncFunction'].includes(node.name))
      unusual=true;
  });
  if(unusual)throw new TypeError('Private module uses unsupported dynamic scope/loader');
  // Even a free intrinsic like Math can change meaning when the entry's
  // separate lexical environment is merged into the private module.
  /** @type {Set<string>} */
  const entryBindings=new Set();
  /** @param {AstNode} declaration */
  function trackTopLevel(declaration){
    if(declaration.type==='VariableDeclaration'){
      for(const item of declaration.declarations){
        if(item.id.type!=='Identifier')throw new TypeError('Destructuring entry declarations require separate proof');
        entryBindings.add(item.id.name);
      }
    }else if(['FunctionDeclaration','ClassDeclaration'].includes(declaration.type)){
      if(!declaration.id)throw new TypeError('Anonymous top-level entry declaration unsupported');
      entryBindings.add(declaration.id.name);
    }
  }
  for(const node of entryAst.body){
    if(node.type==='ImportDeclaration'&&node!==imp||
       ['ExportAllDeclaration','ExportDefaultDeclaration'].includes(node.type))
      throw new TypeError('Entry module graph is not a single reviewed leaf');
    if(node.type==='ExportNamedDeclaration'){
      if(node.source||node.specifiers.length||!node.declaration)
        throw new TypeError('Entry public reexports are not reviewed');
      trackTopLevel(node.declaration);
    }else if(['VariableDeclaration','FunctionDeclaration','ClassDeclaration'].includes(node.type))
      trackTopLevel(node);
  }
  // ESM imports are immutable live aliases. Their function declarations
  // become mutable locals after collapse, so reject any possible write to
  // an imported binding rather than trying to reconstruct ESM namespace
  // assignment semantics in the inlined lexical environment.
  let importWrite=false;
  /** @param {AstNode|null|undefined} target */
  function touchesImport(target){
    if(!target)return false;
    if(target.type==='Identifier')return importsByName.has(target.name);
    if(['ObjectPattern','ArrayPattern','AssignmentPattern','RestElement'].includes(target.type)){
      let found=false;
      walk(target,node=>{if(node.type==='Identifier'&&importsByName.has(node.name))found=true;});
      return found;
    }
    return false;
  }
  walk(entryAst,node=>{
    if(node.type==='AssignmentExpression'&&touchesImport(node.left)||
       node.type==='UpdateExpression'&&touchesImport(node.argument)||
       ['ForOfStatement','ForInStatement'].includes(node.type)&&touchesImport(node.left))
      importWrite=true;
  });
  if(importWrite)throw new TypeError('Entry may not reassign imported live binding');

  /** @type {Set<string>} */
  const leafIdentifiers=new Set();
  walk(leafAst,node=>{if(node.type==='Identifier')leafIdentifiers.add(node.name);});
  for(const name of entryBindings){
    if(leafIdentifiers.has(name))
      throw new TypeError('Entry binding could capture private lexical name: '+name);
  }
  // An unresolved entry reference must not silently acquire a binding from
  // the collapsed leaf. Only the explicitly imported names are admissible.
  /** @type {Set<string>} */
  const entryIdentifiers=new Set();
  walk(entryAst,node=>{if(node.type==='Identifier')entryIdentifiers.add(node.name);});
  for(const name of leafDecls){
    if(!importsByName.has(name)&&entryIdentifiers.has(name))
      throw new TypeError('Entry free reference may acquire private binding: '+name);
  }
  let unexpectedLoader=false;
  walk(entryAst,node=>{
    if(['ImportExpression','MetaProperty','WithStatement'].includes(node.type)||
       node.type==='Identifier'&&node.name==='eval')
      unexpectedLoader=true;
  });
  if(unexpectedLoader)throw new TypeError('Entry has unsupported dynamic scope, import or source URL');
  const privateBody=applyEdits(leaf.code,prefixEdits);
  const entryBody=applyEdits(entry.code,[{start:imp.start,end:imp.end,text:''}]);
  const combined=privateBody+'\n'+entryBody;
  parse(combined,'module');
  return {path:entry.path,code:combined,sourceType:'module'};
}

module.exports={collapsePrivateLeaf};
