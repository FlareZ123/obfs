'use strict';

const {walk}=require('./ast');

/** @typedef {import('./ast').AstNode} AstNode */
/** @typedef {{ast:AstNode,bindings:Map<string,number>}} ModuleInfo */
/** @typedef {{module:string,owner:string,reader:string,key:string}} ReaderProof */

/**
 * Prove a closed ESM graph's direct imported field reader returns a primitive.
 * The named reader must return one own primitive-literal field of an exported
 * object. Every reference to either capability must be a direct read call,
 * and every call in the group must be that read or a built-in console method.
 * This deliberately refuses arbitrary calls, mutations, dynamic loaders,
 * namespace imports and reexports rather than trusting unknown effects.
 *
 * @param {Map<string,ModuleInfo>} modules
 * @param {(filename:string,specifier:string)=>string|null} resolveImport
 * @returns {Map<string,Set<string>>} Exported variable names known primitive
 */
function proveDirectReaderPrimitives(modules,resolveImport) {
  /** @type {Map<string,ReaderProof[]>} */
  const providers=new Map();
  for(const [filename,info] of modules) {
    /** @type {Map<string,Map<string,boolean>>} */
    const owners=new Map();
    /** @type {Map<string,{key:string}>} */
    const readers=new Map();
    for(const statement of info.ast.body) {
      if(statement.type!=='ExportNamedDeclaration'||statement.source)continue;
      const declaration=statement.declaration;
      if(declaration?.type==='VariableDeclaration'&&declaration.kind==='const') {
        for(const entry of declaration.declarations) {
          if(entry.id.type!=='Identifier'||info.bindings.get(entry.id.name)!==1||
             entry.init?.type!=='ObjectExpression')continue;
          const names=new Map();
          let safe=true;
          for(const property of entry.init.properties) {
            if(property.type!=='Property'||property.kind!=='init'||property.computed||
               property.method||property.shorthand||property.key.type!=='Identifier'||
               property.value.type!=='Literal'||property.value.regex!==undefined||
               !['string','number','boolean','bigint'].includes(typeof property.value.value)&&
                 property.value.value!==null||
               ['__proto__','constructor','prototype'].includes(property.key.name)||
               names.has(property.key.name)) {safe=false;break;}
            names.set(property.key.name,true);
          }
          if(safe&&names.size)owners.set(entry.id.name,names);
        }
      }
      if(declaration?.type!=='FunctionDeclaration'||declaration.id?.type!=='Identifier'||
         info.bindings.get(declaration.id.name)!==1||declaration.async||
         declaration.generator||declaration.params.length!==1||
         declaration.params[0].type!=='Identifier'||declaration.body.body.length!==1)continue;
      const statementReturn=declaration.body.body[0];
      const returned=statementReturn.type==='ReturnStatement'?statementReturn.argument:null;
      if(returned?.type!=='MemberExpression'||returned.optional||
         returned.computed||returned.object.type!=='Identifier'||
         returned.object.name!==declaration.params[0].name||
         returned.property.type!=='Identifier')continue;
      readers.set(declaration.id.name,{key:returned.property.name});
    }
    /** @type {ReaderProof[]} */
    const pairs=[];
    for(const [owner,keys] of owners)for(const [reader,detail] of readers) {
      if(keys.has(detail.key))pairs.push({module:filename,owner,reader,key:detail.key});
    }
    if(pairs.length)providers.set(filename,pairs);
  }
  if(!providers.size)return new Map();

  // A cycle can observe an imported binding before initialization. Keep this
  // positive proof within an acyclic, fully declared static dependency graph.
  /** @type {Map<string,string[]>} */
  const edges=new Map();
  for(const [filename,info] of modules) {
    const outgoing=[];
    for(const statement of info.ast.body) {
      if(statement.type!=='ImportDeclaration')continue;
      if(statement.source?.type!=='Literal'||typeof statement.source.value!=='string'||
         !/^(?:\.\/|\.\.\/)/u.test(statement.source.value)||
         /[?#%\\]/u.test(statement.source.value))return new Map();
      const target=resolveImport(filename,statement.source.value);
      if(!target||!modules.has(target))return new Map();
      outgoing.push(target);
    }
    edges.set(filename,outgoing);
  }
  const visiting=new Set();
  const visited=new Set();
  /** @param {string} filename @returns {boolean} */
  function acyclic(filename) {
    if(visiting.has(filename))return false;
    if(visited.has(filename))return true;
    visiting.add(filename);
    for(const next of edges.get(filename)||[])if(!acyclic(next))return false;
    visiting.delete(filename);
    visited.add(filename);
    return true;
  }
  for(const name of modules.keys())if(!acyclic(name))return new Map();

  /** @type {Map<string,Map<string,ReaderProof[]>>} */
  const ownerImports=new Map();
  /** @type {Map<string,Map<string,ReaderProof[]>>} */
  const readerImports=new Map();
  for(const [filename,info] of modules) {
    /** @type {Map<string,ReaderProof[]>} */
    const owners=new Map();
    /** @type {Map<string,ReaderProof[]>} */
    const readers=new Map();
    for(const statement of info.ast.body) {
      if(statement.type==='ExportAllDeclaration'||
         statement.type==='ExportNamedDeclaration'&&statement.source)return new Map();
      if(statement.type!=='ImportDeclaration')continue;
      if(statement.source.type!=='Literal'||typeof statement.source.value!=='string'||
         !/^(?:\.\/|\.\.\/)/u.test(statement.source.value)||
         /[?#%\\]/u.test(statement.source.value))return new Map();
      const origin=resolveImport(filename,statement.source.value);
      if(!origin||!modules.has(origin))return new Map();
      for(const specifier of statement.specifiers) {
        if(specifier.type!=='ImportSpecifier') {
          if(providers.has(origin))return new Map();
          continue;
        }
        if(info.bindings.get(specifier.local.name)!==1)return new Map();
        const exposed=specifier.imported.name??specifier.imported.value;
        const pairs=providers.get(origin)||[];
        const own=pairs.filter(pair=>pair.owner===exposed);
        const read=pairs.filter(pair=>pair.reader===exposed);
        if(own.length)owners.set(specifier.local.name,own);
        if(read.length)readers.set(specifier.local.name,read);
      }
    }
    ownerImports.set(filename,owners);
    readerImports.set(filename,readers);
  }

  /**
   * @param {string} filename
   * @param {AstNode|null|undefined} call
   * @returns {ReaderProof|null}
   */
  function provenCall(filename,call) {
    if(call?.type!=='CallExpression'||call.optional||call.arguments.length!==1||
       call.callee.type!=='Identifier'||call.arguments[0].type!=='Identifier')return null;
    const readers=readerImports.get(filename)?.get(call.callee.name)||[];
    const owners=ownerImports.get(filename)?.get(call.arguments[0].name)||[];
    return readers.find(reader=>owners.some(owner=>
      owner.module===reader.module&&owner.owner===reader.owner&&
      owner.key===reader.key))||null;
  }
  // A verified owner must not escape to any other runtime call or assignment.
  // Likewise the reader binding must not be rebound or source-observed.
  for(const [filename,info] of modules) {
    let valid=true;
    walk(info.ast,(node,parent,key)=>{
      if(!valid)return;
      if(['AssignmentExpression','UpdateExpression','ImportExpression',
          'NewExpression','TaggedTemplateExpression','WithStatement','MetaProperty',
          'AwaitExpression','YieldExpression'].includes(node.type)||
         node.type==='UnaryExpression'&&node.operator==='delete') {valid=false;return;}
      if(node.type==='CallExpression') {
        const callee=node.callee;
        const consoleMethod=callee.type==='MemberExpression'&&!callee.computed&&
          callee.object.type==='Identifier'&&callee.object.name==='console'&&
          callee.property.type==='Identifier'&&
          ['log','info','warn','error','debug','dir','trace'].includes(callee.property.name);
        if(!consoleMethod&&!provenCall(filename,node))valid=false;
      }
      if(node.type!=='Identifier')return;
      if(parent?.type==='ImportSpecifier'&&['imported','local'].includes(key??''))return;
      const providersHere=providers.get(filename)||[];
      if(providersHere.some(pair=>pair.owner===node.name)&&
         parent?.type==='VariableDeclarator'&&key==='id')return;
      if(providersHere.some(pair=>pair.reader===node.name)&&
         parent?.type==='FunctionDeclaration'&&key==='id')return;
      if(ownerImports.get(filename)?.has(node.name)||
         providersHere.some(pair=>pair.owner===node.name)) {
        if(parent?.type!=='CallExpression'||key!=='arguments'||
           parent.arguments[0]!==node||!provenCall(filename,parent))valid=false;
      }
      if(readerImports.get(filename)?.has(node.name)||
         providersHere.some(pair=>pair.reader===node.name)) {
        if(parent?.type!=='CallExpression'||key!=='callee'||
           !provenCall(filename,parent))valid=false;
      }
    });
    if(!valid)return new Map();
  }
  /** @type {Map<string,Set<string>>} */
  const derived=new Map();
  for(const [filename,info] of modules) {
    const names=new Set();
    for(const statement of info.ast.body) {
      if(statement.type!=='ExportNamedDeclaration'||statement.source||
         statement.declaration?.type!=='VariableDeclaration'||
         statement.declaration.kind!=='const')continue;
      for(const entry of statement.declaration.declarations) {
        if(entry.id.type==='Identifier'&&info.bindings.get(entry.id.name)===1&&
           provenCall(filename,entry.init))names.add(entry.id.name);
      }
    }
    derived.set(filename,names);
  }
  return derived;
}

module.exports={proveDirectReaderPrimitives};
