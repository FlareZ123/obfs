'use strict';

const path = require('node:path');
const {createHash} = require('node:crypto');
const {walk,applyEdits,parse} = require('./ast');
const {collectBindings,proveLocalObject,staticName} = require('./properties');

/** @typedef {import('./core').SourceFile} SourceFile */
/** @typedef {import('./ast').AstNode} AstNode */

/**
 * Resolve a local ESM specifier only when it names an input file exactly.
 * @param {string} from
 * @param {string} specifier
 * @returns {string|null}
 */
function resolveImport(from,specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const normalized=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  return normalized.startsWith('../') || normalized==='..' ? null : normalized;
}

/**
 * Across an explicit closed-world set of ESM modules, rename properties of
 * direct named exported const-object literals and all proven import aliases.
 * Reject reexports, reflection, dynamic import and unproven uses rather than
 * speculating about the complete JavaScript object graph.
 * @param {SourceFile[]} files
 * @param {string} seed
 * @returns {{files:SourceFile[],objects:number,properties:number}}
 */
function renameCrossFileProperties(files,seed) {
  /** @type {Map<string,{file:SourceFile,ast:AstNode,bindings:Map<string,number>}>} */
  const modules=new Map();
  for(const file of files) {
    if (file.sourceType==='module' && typeof file.code==='string') {
      const ast=parse(file.code,'module');
      modules.set(file.path,{file,ast,bindings:collectBindings(ast)});
    }
  }
  /** @type {Map<string,import('./ast').Edit[]>} */
  const allEdits = new Map();
  /** @param {string} file @param {import('./ast').Edit} edit */
  function add(file,edit) {
    if (!allEdits.has(file)) allEdits.set(file,[]);
    allEdits.get(file).push(edit);
  }
  let objects=0;
  let properties=0;
  for(const [exporterName,exporter] of modules) {
    for(const declaration of exporter.ast.body) {
      if (declaration.type !== 'ExportNamedDeclaration' || declaration.source ||
          declaration.declaration?.type !== 'VariableDeclaration' || declaration.declaration.kind!=='const') continue;
      for(const decl of declaration.declaration.declarations) {
        if (decl.id.type!=='Identifier' || decl.init?.type!=='ObjectExpression' ||
            exporter.bindings.get(decl.id.name)!==1) continue;
        const props=decl.init.properties;
        if (!props.length || props.some(p => p.type!=='Property' || p.computed || p.method || p.shorthand ||
              p.kind!=='init' || p.value.type!=='Literal' || !staticName(p.key) ||
              ['__proto__','constructor','prototype'].includes(staticName(p.key)))) continue;
        const names=props.map(p=>staticName(p.key));
        if (new Set(names).size!==names.length) continue;
        const exportName=decl.id.name;
        const users=[{file:exporterName,proof:proveLocalObject(exporter.ast,exportName,exporter.bindings)}];
        let failed=!users[0].proof;
        for(const [importerName,importer] of modules) {
          if (failed) break;
          /** @type {string[]} */
          const importedAliases=[];
          for(const statement of importer.ast.body) {
            if (statement.type==='ImportDeclaration' && resolveImport(importerName,statement.source.value)===exporterName) {
              for(const spec of statement.specifiers) {
                if (spec.type==='ImportNamespaceSpecifier') {failed=true;break;}
                if (spec.type==='ImportSpecifier' && (spec.imported.name ?? spec.imported.value)===exportName) importedAliases.push(spec.local.name);
              }
            }
            if ((statement.type==='ExportAllDeclaration'||(statement.type==='ExportNamedDeclaration'&&statement.source)) &&
                resolveImport(importerName,statement.source.value)===exporterName) failed=true;
          }
          if (failed) break;
          let hasDynamic=false;
          walk(importer.ast,node=>{if(node.type==='ImportExpression')hasDynamic=true;});
          if (hasDynamic) {failed=true;break;}
          for(const alias of importedAliases) {
            if(importer.bindings.get(alias)!==1) {failed=true;break;}
            const proof=proveLocalObject(importer.ast,alias,importer.bindings);
            if(!proof) {failed=true;break;}
            users.push({file:importerName,proof});
          }
        }
        if (failed) continue;
        // Prevent externally exposed exports of the same object via an export specifier.
        let reexported=false;
        walk(exporter.ast,(node,parent)=>{
          if(node.type==='ExportSpecifier' && node.local.name===exportName) reexported=true;
        });
        if(reexported) continue;
        const mapping=new Map();
        for(const prop of props) {
          const old=staticName(prop.key);
          const token=createHash('sha256').update(`${seed}/${exporterName}/${exportName}/${old}`).digest('hex').slice(0,12);
          mapping.set(old,`_p${token}`);
        }
        // The export binding name is unchanged; its public object shape is
        // changed only when callers opted into closed-world semantics.
        for(const prop of props) add(exporterName,{start:prop.key.start,end:prop.key.end,text:JSON.stringify(mapping.get(staticName(prop.key)))});
        for(const user of users) {
          for(const member of user.proof.members) {
            const old=member.computed ? member.property.value : staticName(member.property);
            if(mapping.has(old)) add(user.file,{start:member.property.start,end:member.property.end,
              text:member.computed ? JSON.stringify(mapping.get(old)) : mapping.get(old)});
          }
        }
        objects++;
        properties+=mapping.size;
      }
    }
  }
  return {files:files.map(f => ({...f,code:allEdits.has(f.path)?applyEdits(f.code,allEdits.get(f.path)):f.code})),objects,properties};
}

module.exports={renameCrossFileProperties};
