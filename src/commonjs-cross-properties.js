'use strict';

const path=require('node:path');
const {createHash}=require('node:crypto');
const {parse,walk,applyEdits,staticString}=require('./ast');
const {
  collectBindings,proveLocalObject,patternPropertyEdits,
  inOperatorPropertyEdits,ownPropertyName
}=require('./properties');

/** @typedef {import('./core').SourceFile & {sourceType:import('./core').SourceType}} SourceFile */
/** @typedef {import('./ast').AstNode} AstNode */
/**
 * @typedef {{
 *   file:SourceFile,
 *   ast:AstNode,
 *   bindings:Map<string,number>,
 *   parents:WeakMap<AstNode,AstNode>
 * }} ParsedCommonJs
 */
/** @typedef {{module:ParsedCommonJs,call:AstNode}} RequireSite */

/**
 * Identifier tokens used as noncomputed property names, labels, or binding
 * declarations are not runtime references. Everything else is conservatively
 * treated as a reference by the loader-closure scan.
 *
 * @param {AstNode} node
 * @param {AstNode|null} parent
 * @param {string|null} key
 * @returns {boolean}
 */
function isNonReferenceIdentifier(node,parent,key) {
  if(parent?.type==='Property'&&key==='key'&&!parent.computed)return true;
  if(parent?.type==='MemberExpression'&&key==='property'&&!parent.computed)return true;
  if((parent?.type==='MethodDefinition'||parent?.type==='PropertyDefinition')&&
     key==='key'&&!parent.computed)return true;
  if(parent?.type==='VariableDeclarator'&&key==='id')return true;
  if((parent?.type==='FunctionDeclaration'||parent?.type==='FunctionExpression')&&
     key==='id')return true;
  if((parent?.type==='FunctionDeclaration'||parent?.type==='FunctionExpression'||
      parent?.type==='ArrowFunctionExpression')&&key==='params')return true;
  if((parent?.type==='ClassDeclaration'||parent?.type==='ClassExpression')&&key==='id')return true;
  if(parent?.type==='CatchClause'&&key==='param')return true;
  if((parent?.type==='ImportSpecifier'||parent?.type==='ImportDefaultSpecifier'||
      parent?.type==='ImportNamespaceSpecifier')&&key==='local')return true;
  if(parent?.type==='LabeledStatement'&&key==='label')return true;
  if((parent?.type==='BreakStatement'||parent?.type==='ContinueStatement')&&key==='label')return true;
  return false;
}

/**
 * Resolve only explicit, supplied relative .cjs files. Extension probing,
 * package exports, bare specifiers, URL-like suffixes and unresolved paths
 * are deliberately outside this first closed-world proof.
 *
 * @param {string} from
 * @param {string} specifier
 * @param {ReadonlySet<string>} known
 * @returns {string|null}
 */
function resolveCommonJsRequire(from,specifier,known) {
  if((!specifier.startsWith('./')&&!specifier.startsWith('../'))||
     !specifier.endsWith('.cjs')||/[?#%\\\\]/u.test(specifier))return null;
  const target=path.posix.normalize(
    path.posix.join(path.posix.dirname(from),specifier));
  if(target==='..'||target.startsWith('../')||path.posix.isAbsolute(target)||
     !known.has(target))return null;
  return target;
}

/**
 * Parse a supplied CommonJS module and retain its AST parent links.
 *
 * @param {SourceFile} file
 * @returns {ParsedCommonJs}
 */
function parseCommonJs(file) {
  const ast=parse(/** @type {string} */(file.code),'commonjs');
  const parents=new WeakMap();
  walk(ast,(node,parent)=>{
    if(parent)parents.set(node,parent);
  });
  return {file,ast,bindings:collectBindings(ast),parents};
}

/**
 * Require every loader reference in the supplied group to be a direct,
 * one-argument literal require of another supplied .cjs file. Aliased,
 * shadowed, computed, builtin, package, dynamic-import and alternate Node
 * loader paths fail closed. This is intentionally stricter than Node's full
 * resolver so an untracked consumer cannot silently retain an old key.
 *
 * @param {Map<string,ParsedCommonJs>} modules
 * @returns {Map<string,RequireSite[]>|null}
 */
function collectClosedRequireSites(modules) {
  const known=new Set(modules.keys());
  /** @type {Map<string,RequireSite[]>} */
  const sites=new Map();
  for(const [filename,module] of modules) {
    if(module.bindings.has('require')||module.bindings.has('module')||
       module.bindings.has('exports'))return null;
    let unsafe=false;
    walk(module.ast,(node,parent,key)=>{
      if(unsafe)return;
      if(node.type==='WithStatement'||node.type==='ImportExpression') {
        unsafe=true;
        return;
      }
      if(node.type!=='Identifier'||isNonReferenceIdentifier(node,parent,key))return;
      if(node.name==='require') {
        if(parent?.type!=='CallExpression'||parent.callee!==node||
           parent.optional||parent.arguments.length!==1) {
          unsafe=true;
          return;
        }
        const specifier=staticString(parent.arguments[0]);
        const target=specifier===null?null:
          resolveCommonJsRequire(filename,specifier,known);
        if(target===null) {
          unsafe=true;
          return;
        }
        const list=sites.get(target)??[];
        list.push({module,call:parent});
        sites.set(target,list);
        return;
      }
      if(['process','global','globalThis','arguments','eval','Function','exports'].includes(node.name)) {
        unsafe=true;
        return;
      }
      if(node.name==='module') {
        const ordinaryExports=parent?.type==='MemberExpression'&&
          parent.object===node&&!parent.computed&&
          parent.property.type==='Identifier'&&parent.property.name==='exports';
        if(!ordinaryExports)unsafe=true;
      }
    });
    if(unsafe)return null;
  }
  return sites;
}

/**
 * Accept one top-level module.exports assignment whose entire right-hand side
 * is an inert object literal. No aliases, getters, computed keys, accessors,
 * spreads, duplicate names, magic prototype keys or other executable
 * statements are admitted in the producer.
 *
 * @param {ParsedCommonJs} module
 * @returns {{properties:AstNode[]}|null}
 */
function literalModuleExports(module) {
  if(module.bindings.has('module')||module.bindings.has('exports'))return null;
  const statements=module.ast.body.filter(statement=>
    !(statement.type==='ExpressionStatement'&&statement.directive));
  if(statements.length!==1)return null;
  const statement=statements[0];
  if(statement.type!=='ExpressionStatement'||
     statement.expression.type!=='AssignmentExpression')return null;
  const assignment=statement.expression;
  const left=assignment.left;
  if(assignment.operator!=='='||left.type!=='MemberExpression'||
     left.computed||left.object.type!=='Identifier'||left.object.name!=='module'||
     left.property.type!=='Identifier'||left.property.name!=='exports'||
     assignment.right.type!=='ObjectExpression')return null;
  const properties=assignment.right.properties;
  if(!properties.length)return null;
  const names=new Set();
  for(const property of properties) {
    if(property.type!=='Property'||property.kind!=='init'||
       property.method||property.shorthand||property.computed)return null;
    const name=ownPropertyName(property);
    if(name===null||['__proto__','constructor','prototype'].includes(name)||
       names.has(name))return null;
    names.add(name);
    const value=property.value;
    if(value.type!=='Literal'||
       !(value.value===null||
         ['string','number','boolean','bigint'].includes(typeof value.value)))return null;
  }
  return {properties};
}

/**
 * Closed-world CommonJS cross-file property renaming.
 *
 * This deliberately narrow lane handles only all-CommonJS groups with direct
 * literal require('./file.cjs') edges and a producer whose sole executable
 * statement is module.exports=<inert object literal>. Every supplied require
 * edge must resolve inside the group; every consumer must bind the result to
 * a const identifier and pass proveLocalObject. Unknown loaders, dynamic
 * imports, public escapes, reflection and non-own keys retain original names.
 *
 * @param {SourceFile[]} files
 * @param {string} seed
 * @returns {{files:SourceFile[],objects:number,properties:number}}
 */
function renameCommonJsCrossFileProperties(files,seed) {
  /** @type {Map<string,ParsedCommonJs>} */
  const modules=new Map();
  for(const file of files) {
    if(file.sourceType==='asset')continue;
    if(file.sourceType!=='commonjs'||typeof file.code!=='string')
      return {files,objects:0,properties:0};
    modules.set(file.path,parseCommonJs(file));
  }
  if(modules.size<2)return {files,objects:0,properties:0};
  const requireSites=collectClosedRequireSites(modules);
  if(!requireSites)return {files,objects:0,properties:0};

  /** @type {Map<string,import('./ast').Edit[]>} */
  const allEdits=new Map();
  /** @param {string} filename @param {import('./ast').Edit} edit */
  function add(filename,edit) {
    const list=allEdits.get(filename)??[];
    list.push(edit);
    allEdits.set(filename,list);
  }
  let objects=0;
  let properties=0;
  for(const [exporterName,exporter] of modules) {
    const exported=literalModuleExports(exporter);
    if(!exported)continue;
    const sites=requireSites.get(exporterName)??[];
    if(!sites.length)continue;
    const ownNames=new Set(exported.properties.map(ownPropertyName));
    /** @type {{module:ParsedCommonJs,source:string,proof:NonNullable<ReturnType<typeof proveLocalObject>>}[]} */
    const users=[];
    let failed=false;
    let positiveUses=0;
    for(const site of sites) {
      const importer=site.module;
      const parent=importer.parents.get(site.call);
      if(parent?.type==='ExpressionStatement'&&parent.expression===site.call)continue;
      if(parent?.type!=='VariableDeclarator'||parent.init!==site.call||
         parent.id.type!=='Identifier') {
        failed=true;
        break;
      }
      const declaration=importer.parents.get(parent);
      if(declaration?.type!=='VariableDeclaration'||declaration.kind!=='const'||
         importer.bindings.get(parent.id.name)!==1) {
        failed=true;
        break;
      }
      const proof=proveLocalObject(importer.ast,parent.id.name,importer.bindings);
      if(!proof) {
        failed=true;
        break;
      }
      if(proof.members.some(member=>{
        const name=proof.memberNames.get(member);
        return typeof name!=='string'||!ownNames.has(name);
      })||
         proof.patterns.some(property=>
           !ownNames.has(proof.patternNames.get(property)??ownPropertyName(property)))||
         proof.inChecks.some(check=>!ownNames.has(check.left.value))||
         proof.reflections.length) {
        failed=true;
        break;
      }
      positiveUses+=proof.members.length+proof.patterns.length+proof.inChecks.length;
      users.push({module:importer,source:/** @type {string} */(importer.file.code),proof});
    }
    if(failed||positiveUses===0)continue;

    const mapping=new Map();
    for(const property of exported.properties) {
      const old=ownPropertyName(property);
      const token=createHash('sha256').update(
        seed+'/'+exporterName+'/'+old).digest('hex').slice(0,12);
      mapping.set(old,'_p'+token);
    }
    if(new Set(mapping.values()).size!==mapping.size)continue;

    /** @type {Map<string,import('./ast').Edit[]>} */
    const candidateEdits=new Map();
    /** @param {string} filename @param {import('./ast').Edit} edit */
    function stage(filename,edit) {
      const list=candidateEdits.get(filename)??[];
      list.push(edit);
      candidateEdits.set(filename,list);
    }
    for(const property of exported.properties) {
      const old=ownPropertyName(property);
      stage(exporterName,{
        start:property.key.start,end:property.key.end,
        text:JSON.stringify(mapping.get(old))
      });
    }
    for(const user of users) {
      for(const member of user.proof.members) {
        const old=user.proof.memberNames.get(member);
        if(old!==undefined&&mapping.has(old))stage(user.module.file.path,{
          start:member.property.start,end:member.property.end,
          text:member.computed?JSON.stringify(mapping.get(old)):mapping.get(old)
        });
      }
      for(const edit of patternPropertyEdits(
        user.source,user.proof.patterns,mapping,user.proof.patternNames))
        stage(user.module.file.path,edit);
      for(const edit of inOperatorPropertyEdits(user.proof.inChecks,mapping))
        stage(user.module.file.path,edit);
    }
    for(const [filename,edits] of candidateEdits) {
      for(const edit of edits)add(filename,edit);
    }
    objects++;
    properties+=mapping.size;
  }

  return {
    files:files.map(file=>{
      const edits=allEdits.get(file.path);
      if(!edits)return file;
      if(typeof file.code!=='string')
        throw new TypeError('Cannot rewrite binary CommonJS module '+file.path);
      return {...file,code:applyEdits(file.code,edits)};
    }),
    objects,
    properties
  };
}

module.exports={renameCommonJsCrossFileProperties};
